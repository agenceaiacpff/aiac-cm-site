-- Compléments idempotents appliqués après la migration principale du point 4.

create or replace function public.list_message_recipients()
returns table(id uuid,full_name text,role text,body_name text,position_title text)
language sql stable security definer set search_path='' as $$
  select p.id,coalesce(p.full_name,'Compte AIAC'),p.role::text,b.name,pd.title
  from public.profiles p
  left join lateral (
    select pa.body_id,pa.position_id from public.position_assignments pa
    where pa.profile_id=p.id and pa.status='active'
      and (pa.end_date is null or pa.end_date>=current_date)
    order by pa.start_date desc limit 1
  ) pa on true
  left join public.governance_bodies b on b.id=pa.body_id
  left join public.position_definitions pd on pd.id=pa.position_id
  where private.is_active_user() and p.status='active'
    and p.role in ('staff','manager','admin','super_admin')
  order by coalesce(b.name,''),coalesce(pd.title,''),coalesce(p.full_name,'');
$$;
revoke all on function public.list_message_recipients() from public,anon;
grant execute on function public.list_message_recipients() to authenticated;

create table if not exists public.message_attachments (
  message_id uuid not null references public.messages(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete restrict,
  attached_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key(message_id,document_id)
);
alter table public.message_attachments enable row level security;
create policy message_attachments_select on public.message_attachments for select to authenticated
using (exists(select 1 from public.messages m where m.id=message_id and (select private.is_conversation_member(m.conversation_id))));
create policy message_attachments_insert on public.message_attachments for insert to authenticated
with check (
  attached_by=(select auth.uid())
  and exists(select 1 from public.messages m where m.id=message_id and m.sender_id=(select auth.uid()) and (select private.is_conversation_member(m.conversation_id)))
  and (select private.can_access_document(document_id))
);
grant select,insert on public.message_attachments to authenticated;

create or replace function public.mark_conversation_read(target_conversation uuid) returns void
language sql security definer set search_path='' as $$
  insert into public.message_reads(message_id,user_id,read_at)
  select m.id,auth.uid(),now() from public.messages m
  where m.conversation_id=target_conversation
    and private.is_conversation_member(target_conversation)
  on conflict(message_id,user_id) do update set read_at=excluded.read_at;
$$;
revoke all on function public.mark_conversation_read(uuid) from public,anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

create or replace function public.change_account_status(
  target_id uuid,new_status public.account_status,reason text
) returns void
language plpgsql security definer set search_path='' as $$
declare previous_status public.account_status;
begin
  if auth.uid() is null or not private.is_admin(auth.uid()) or not private.has_verified_mfa(auth.uid()) or not private.has_aal2() then
    raise exception 'Une session administrateur active avec authentification à deux facteurs est obligatoire';
  end if;
  if char_length(trim(reason)) < 5 then raise exception 'Le motif doit contenir au moins 5 caractères'; end if;
  select p.status into previous_status from public.profiles p where p.id=target_id for update;
  if previous_status is null then raise exception 'Compte introuvable'; end if;
  if previous_status=new_status then raise exception 'Le compte possède déjà ce statut'; end if;
  update public.profiles set status=new_status,
    registration_state=case when new_status='active' then 'approved' else registration_state end,
    validated_at=case when new_status='active' then coalesce(validated_at,now()) else validated_at end,
    validated_by=case when new_status='active' then coalesce(validated_by,auth.uid()) else validated_by end
  where id=target_id;
  insert into public.account_status_history(profile_id,actor_id,old_status,new_status,reason)
  values(target_id,auth.uid(),previous_status,new_status,trim(reason));
end;
$$;
revoke all on function public.change_account_status(uuid,public.account_status,text) from public,anon;
grant execute on function public.change_account_status(uuid,public.account_status,text) to authenticated;

create or replace function private.prepare_document_approval() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status is distinct from old.status and new.status<>'pending' then
    new.reviewed_at=now();
    update public.documents set document_status=case
      when new.status='approved' then 'approved'
      when new.status in ('rejected','changes_requested') then 'rejected'
      else document_status end,updated_at=now()
    where id=new.document_id;
    insert into public.document_access_logs(document_id,version_id,user_id,action,details)
    values(new.document_id,new.version_id,auth.uid(),case when new.status='approved' then 'approved' else 'rejected' end,
      jsonb_build_object('approval_id',new.id,'status',new.status));
  end if;
  return new;
end;
$$;
revoke all on function private.prepare_document_approval() from public,anon,authenticated;
drop trigger if exists document_approvals_prepare on public.document_approvals;
create trigger document_approvals_prepare before update of status on public.document_approvals
for each row execute function private.prepare_document_approval();

drop policy if exists documents_insert on public.documents;
create policy documents_insert on public.documents for insert to authenticated
with check (
  (select private.is_active_user()) and owner_id=(select auth.uid())
  and ((select private.can_use_operations()) or (conversation_id is not null and (select private.is_conversation_member(conversation_id))))
  and (project_id is null or (select private.can_contribute_project(project_id)))
  and (case_id is null or (select private.can_access_case(case_id)))
  and (conversation_id is null or (select private.is_conversation_member(conversation_id)))
);

drop policy if exists aiac_documents_insert on storage.objects;
drop policy if exists aiac_documents_update on storage.objects;
drop policy if exists aiac_documents_delete on storage.objects;
create policy aiac_documents_insert on storage.objects for insert to authenticated
with check (bucket_id='aiac-documents' and (select private.is_active_user()) and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy aiac_documents_update on storage.objects for update to authenticated
using (bucket_id='aiac-documents' and (storage.foldername(name))[1]=(select auth.uid())::text and not exists(select 1 from public.document_versions v where v.storage_path=name))
with check (bucket_id='aiac-documents' and (storage.foldername(name))[1]=(select auth.uid())::text and not exists(select 1 from public.document_versions v where v.storage_path=name));
create policy aiac_documents_delete on storage.objects for delete to authenticated
using (bucket_id='aiac-documents' and (storage.foldername(name))[1]=(select auth.uid())::text and not exists(select 1 from public.document_versions v where v.storage_path=name));

revoke insert,update,delete on public.document_access_logs from authenticated;
grant insert on public.document_access_logs to authenticated;
