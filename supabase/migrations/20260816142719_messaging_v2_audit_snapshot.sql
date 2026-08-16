-- AIAC Messaging V2 — cumulative audited state.
-- Rejouable et idempotent : consolide les protections, notifications,
-- recherche, réponses, accusés de lecture, administration MFA et pièces jointes.

alter table public.messages add column if not exists reply_to_id uuid references public.messages(id) on delete set null;
alter table public.messages add column if not exists edited_by uuid references public.profiles(id) on delete set null;
alter table public.messages add column if not exists deleted_at timestamptz;
alter table public.messages add column if not exists deleted_by uuid references public.profiles(id) on delete set null;
alter table public.messages add column if not exists deletion_reason text;
create index if not exists messages_conversation_created_idx on public.messages(conversation_id,created_at desc);
create index if not exists messages_reply_to_idx on public.messages(reply_to_id) where reply_to_id is not null;

create table if not exists public.message_pins(
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(message_id,user_id)
);
alter table public.message_pins enable row level security;

create table if not exists public.conversation_admin_access_log(
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete set null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check(action in ('opened','closed')),
  reason text not null,
  membership_added boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists conversation_admin_access_log_conversation_idx on public.conversation_admin_access_log(conversation_id,created_at desc);
alter table public.conversation_admin_access_log enable row level security;

create or replace function private.is_conversation_member(cid uuid,uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path=''
as $$
  select private.is_active_approved_user(uid)
    and exists(select 1 from public.conversation_members cm where cm.conversation_id=cid and cm.user_id=uid);
$$;

create or replace function private.can_manage_conversation(cid uuid,uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path=''
as $$
  select private.is_active_approved_user(uid)
    and exists(select 1 from public.conversation_members cm where cm.conversation_id=cid and cm.user_id=uid and cm.member_role='manager');
$$;

create or replace function private.can_send_conversation_message(cid uuid,uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path=''
as $$
  select private.is_active_approved_user(uid) and exists(
    select 1 from public.conversations c
    join public.conversation_members cm on cm.conversation_id=c.id and cm.user_id=uid
    where c.id=cid and c.status='active' and cm.member_role in ('manager','participant')
  );
$$;

create or replace function private.route_new_conversation() returns trigger
language plpgsql security definer set search_path=''
as $$
begin
  insert into public.conversation_members(conversation_id,user_id,member_role,added_by)
  select new.id,p.id,'manager',new.created_by from public.profiles p
  where p.id=new.created_by and p.status='active' and p.registration_state='approved'
  on conflict do nothing;

  if new.assigned_to is not null then
    insert into public.conversation_members(conversation_id,user_id,member_role,added_by)
    select new.id,p.id,'manager',new.created_by from public.profiles p
    where p.id=new.assigned_to and p.status='active' and p.registration_state='approved'
    on conflict do nothing;
  end if;

  insert into public.conversation_members(conversation_id,user_id,member_role,added_by)
  select new.id,r.assigned_to,'manager',new.created_by from public.requests r
  join public.profiles p on p.id=r.assigned_to and p.status='active' and p.registration_state='approved'
  where r.id=new.request_id and r.assigned_to is not null
  on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists conversations_route on public.conversations;
create trigger conversations_route after insert on public.conversations for each row execute function private.route_new_conversation();

create or replace function private.guard_message_reply() returns trigger
language plpgsql set search_path=''
as $$
declare parent_conversation uuid; parent_deleted timestamptz;
begin
  if new.reply_to_id is not null then
    select m.conversation_id,m.deleted_at into parent_conversation,parent_deleted from public.messages m where m.id=new.reply_to_id;
    if parent_conversation is null or parent_conversation<>new.conversation_id then raise exception 'Le message cité doit appartenir à la même conversation'; end if;
    if parent_deleted is not null then raise exception 'Impossible de répondre à un message supprimé'; end if;
    if new.reply_to_id=new.id then raise exception 'Un message ne peut pas se citer lui-même'; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists messages_reply_guard on public.messages;
create trigger messages_reply_guard before insert or update of reply_to_id,conversation_id on public.messages for each row execute function private.guard_message_reply();

create or replace function private.protect_conversation_fields() returns trigger
language plpgsql set search_path=''
as $$
begin
  if current_setting('aiac.messaging_admin',true)='on' then return new; end if;
  if new.id is distinct from old.id or new.created_by is distinct from old.created_by or new.request_id is distinct from old.request_id or new.created_at is distinct from old.created_at then
    raise exception 'Les champs d’identité de la conversation sont protégés';
  end if;
  if new.assigned_to is distinct from old.assigned_to and new.assigned_to is not null and not exists(
    select 1 from public.conversation_members cm join public.profiles p on p.id=cm.user_id
    where cm.conversation_id=old.id and cm.user_id=new.assigned_to and cm.member_role='manager' and p.status='active' and p.registration_state='approved'
  ) then raise exception 'Le responsable doit être un responsable actif de cette conversation'; end if;
  return new;
end;
$$;
drop trigger if exists conversations_field_guard on public.conversations;
create trigger conversations_field_guard before update on public.conversations for each row execute function private.protect_conversation_fields();

create or replace function private.protect_conversation_member_change() returns trigger
language plpgsql set search_path=''
as $$
declare creator_id uuid;
begin
  if current_setting('aiac.messaging_admin',true)='on' then return coalesce(new,old); end if;
  select c.created_by into creator_id from public.conversations c where c.id=coalesce(new.conversation_id,old.conversation_id);
  if tg_op='UPDATE' then
    if new.conversation_id is distinct from old.conversation_id or new.user_id is distinct from old.user_id then raise exception 'L’identité d’une participation ne peut pas être modifiée'; end if;
    if old.user_id=creator_id and new.member_role<>'manager' then raise exception 'Le créateur doit rester responsable de la conversation'; end if;
    return new;
  elsif tg_op='DELETE' then
    if old.user_id=creator_id then raise exception 'Le créateur ne peut pas être retiré de la conversation'; end if;
    return old;
  end if;
  return new;
end;
$$;
drop trigger if exists conversation_members_guard on public.conversation_members;
create trigger conversation_members_guard before update or delete on public.conversation_members for each row execute function private.protect_conversation_member_change();

create or replace function private.notify_new_message() returns trigger
language plpgsql security definer set search_path=''
as $$
declare c public.conversations%rowtype; sender_name text; safe_title text; safe_body text;
begin
  update public.conversations set updated_at=now() where id=new.conversation_id;
  select * into c from public.conversations where id=new.conversation_id;
  select coalesce(full_name,'Un participant') into sender_name from public.profiles where id=new.sender_id;
  safe_title:=case when c.sensitivity='standard' then c.title else 'Conversation confidentielle' end;
  safe_body:=sender_name||' a envoyé un nouveau message dans « '||safe_title||' ». Ouvrez la messagerie pour le consulter.';
  insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id)
  select cm.user_id,case when c.sensitivity='standard' then 'Nouveau message' else 'Nouveau message confidentiel' end,safe_body,
    '/espace?tab=messages&conversation='||new.conversation_id::text,'message','message',new.id
  from public.conversation_members cm where cm.conversation_id=new.conversation_id and cm.user_id<>new.sender_id;
  return new;
end;
$$;
drop trigger if exists messages_notify on public.messages;
create trigger messages_notify after insert on public.messages for each row execute function private.notify_new_message();

create or replace function private.notify_conversation_member_change() returns trigger
language plpgsql security definer set search_path=''
as $$
declare cid uuid:=coalesce(new.conversation_id,old.conversation_id); c public.conversations%rowtype; safe_name text; actor_name text;
begin
  select * into c from public.conversations where id=cid;
  safe_name:=case when c.sensitivity='standard' then c.title else 'une conversation confidentielle' end;
  if tg_op='INSERT' then
    if new.user_id is distinct from new.added_by then
      insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id)
      values(new.user_id,'Ajout à une conversation','Vous avez été ajouté à « '||safe_name||' » comme '||new.member_role||'.','/espace?tab=messages&conversation='||cid::text,'message_access','conversation',cid);
    end if;
    return new;
  elsif tg_op='UPDATE' and new.member_role is distinct from old.member_role then
    insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id)
    values(new.user_id,'Rôle de conversation modifié','Votre rôle dans « '||safe_name||' » est maintenant : '||new.member_role||'.','/espace?tab=messages&conversation='||cid::text,'message_access','conversation',cid);
    return new;
  elsif tg_op='DELETE' then
    if current_setting('aiac.messaging_admin',true)='on' then return old; end if;
    if old.user_id=auth.uid() then
      select coalesce(full_name,'Un participant') into actor_name from public.profiles where id=old.user_id;
      insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id)
      select cm.user_id,'Participant parti d’une conversation',actor_name||' a quitté « '||safe_name||' ».','/espace?tab=messages&conversation='||cid::text,'message_access','conversation',cid
      from public.conversation_members cm where cm.conversation_id=cid and cm.member_role='manager' and cm.user_id<>old.user_id;
    else
      insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id)
      values(old.user_id,'Accès à une conversation retiré','Votre accès à « '||safe_name||' » a été retiré.',null,'message_access',null,null);
    end if;
    return old;
  end if;
  return coalesce(new,old);
end;
$$;
drop trigger if exists conversation_members_notify on public.conversation_members;
create trigger conversation_members_notify after insert or update of member_role or delete on public.conversation_members for each row execute function private.notify_conversation_member_change();

create or replace function public.get_unread_message_counts()
returns table(conversation_id uuid,unread_count bigint)
language sql stable set search_path=''
as $$
  select m.conversation_id,count(*)::bigint from public.messages m
  where m.sender_id<>auth.uid() and m.deleted_at is null and private.is_conversation_member(m.conversation_id,auth.uid())
    and not exists(select 1 from public.message_reads r where r.message_id=m.id and r.user_id=auth.uid())
  group by m.conversation_id;
$$;

create or replace function public.mark_conversation_read(target_conversation uuid) returns void
language plpgsql set search_path=''
as $$
begin
  if not private.is_active_approved_user(auth.uid()) or not private.is_conversation_member(target_conversation) then raise exception 'Accès refusé à cette conversation'; end if;
  insert into public.message_reads(message_id,user_id,read_at)
  select m.id,auth.uid(),now() from public.messages m where m.conversation_id=target_conversation
  on conflict(message_id,user_id) do update set read_at=excluded.read_at;
  update public.notifications n set read_at=coalesce(n.read_at,now())
  where n.user_id=auth.uid() and n.read_at is null and ((n.entity_type='conversation' and n.entity_id=target_conversation) or (n.entity_type='message' and exists(select 1 from public.messages m where m.id=n.entity_id and m.conversation_id=target_conversation)));
end;
$$;

create or replace function public.mark_conversation_unread(target_conversation uuid) returns boolean
language plpgsql security definer set search_path=''
as $$
declare actor uuid:=auth.uid(); target_message uuid;
begin
  if actor is null or not private.is_conversation_member(target_conversation,actor) then raise exception 'Conversation inaccessible'; end if;
  select m.id into target_message from public.messages m where m.conversation_id=target_conversation and m.sender_id<>actor and m.deleted_at is null order by m.created_at desc limit 1;
  if target_message is null then return false; end if;
  delete from public.message_reads where message_id=target_message and user_id=actor;
  update public.notifications set read_at=null where user_id=actor and entity_type='message' and entity_id=target_message;
  return true;
end;
$$;

create or replace function public.create_conversation_v2(p_title text,p_recipient_id uuid,p_sensitivity text default 'standard',p_organization_unit_id uuid default null) returns public.conversations
language plpgsql security definer set search_path=''
as $$
declare actor uuid:=auth.uid(); result public.conversations%rowtype;
begin
  if actor is null or not private.is_active_approved_user(actor) then raise exception 'Compte actif et approuvé requis'; end if;
  if char_length(trim(coalesce(p_title,'')))<2 or char_length(trim(p_title))>180 then raise exception 'Objet de conversation invalide'; end if;
  if p_recipient_id is null or p_recipient_id=actor then raise exception 'Choisissez un autre destinataire'; end if;
  if not exists(select 1 from public.profiles p where p.id=p_recipient_id and p.status='active' and p.registration_state='approved' and p.role in ('member','volunteer','staff','manager','partner','admin','super_admin')) then raise exception 'Destinataire indisponible'; end if;
  if p_sensitivity not in ('standard','confidential','restricted','gbv_protection','hr','medical_psychosocial','whistleblowing') then raise exception 'Niveau de sensibilité invalide'; end if;
  if p_organization_unit_id is not null and not exists(select 1 from public.governance_bodies b where b.id=p_organization_unit_id and b.status='active') then raise exception 'Organe invalide'; end if;
  insert into public.conversations(title,created_by,assigned_to,sensitivity,organization_unit_id) values(trim(p_title),actor,p_recipient_id,p_sensitivity,p_organization_unit_id) returning * into result;
  perform private.write_audit('conversation.created','conversation',result.id,jsonb_build_object('recipient_id',p_recipient_id,'sensitivity',p_sensitivity,'organization_unit_id',p_organization_unit_id));
  return result;
end;
$$;

create or replace function public.search_conversation_messages(p_conversation_id uuid,p_search text,p_limit integer default 100)
returns table(id uuid,conversation_id uuid,sender_id uuid,sender_name text,body text,created_at timestamptz,edited_at timestamptz,edited_by uuid,deleted_at timestamptz,deleted_by uuid,deletion_reason text,reply_to_id uuid,reply_body text,reply_sender_name text)
language sql stable security definer set search_path=''
as $$
  select m.id,m.conversation_id,m.sender_id,coalesce(p.full_name,'Participant'),m.body,m.created_at,m.edited_at,m.edited_by,m.deleted_at,m.deleted_by,m.deletion_reason,m.reply_to_id,
    case when parent.deleted_at is null then left(parent.body,220) else 'Message supprimé' end,coalesce(pp.full_name,'Participant')
  from public.messages m join public.profiles p on p.id=m.sender_id
  left join public.messages parent on parent.id=m.reply_to_id left join public.profiles pp on pp.id=parent.sender_id
  where private.is_conversation_member(p_conversation_id,auth.uid()) and m.conversation_id=p_conversation_id
    and (trim(coalesce(p_search,''))='' or m.body ilike '%'||trim(p_search)||'%' or p.full_name ilike '%'||trim(p_search)||'%')
  order by m.created_at desc limit greatest(1,least(coalesce(p_limit,100),200));
$$;

create or replace function public.leave_conversation(p_conversation_id uuid) returns boolean
language plpgsql security definer set search_path=''
as $$
declare actor uuid:=auth.uid(); creator_id uuid;
begin
  if actor is null or not private.is_conversation_member(p_conversation_id,actor) then raise exception 'Conversation inaccessible'; end if;
  select created_by into creator_id from public.conversations where id=p_conversation_id;
  if actor=creator_id then raise exception 'Le créateur ne peut pas quitter sa propre conversation ; il peut l’archiver'; end if;
  delete from public.conversation_members where conversation_id=p_conversation_id and user_id=actor;
  return true;
end;
$$;

-- Les fonctions send_conversation_message_v2, edit_conversation_message,
-- delete_conversation_message, update_conversation_member_role,
-- update_conversation_settings, messaging_admin_catalog,
-- superadmin_open_conversation_access, superadmin_close_conversation_access,
-- superadmin_purge_message et superadmin_delete_conversation sont définies
-- par les migrations successives de la même série en production ; ce snapshot
-- conserve ci-dessous l'état final des politiques et autorisations qui les encadrent.

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated with check(sender_id=auth.uid() and private.can_send_conversation_message(conversation_id,auth.uid()));

drop policy if exists members_insert on public.conversation_members;
create policy members_insert on public.conversation_members for insert to authenticated with check(private.can_manage_conversation(conversation_id,auth.uid()) and exists(select 1 from public.profiles p where p.id=user_id and p.status='active' and p.registration_state='approved'));
drop policy if exists members_update on public.conversation_members;
create policy members_update on public.conversation_members for update to authenticated using(private.can_manage_conversation(conversation_id,auth.uid())) with check(private.can_manage_conversation(conversation_id,auth.uid()) and exists(select 1 from public.profiles p where p.id=user_id and p.status='active' and p.registration_state='approved'));
drop policy if exists members_delete on public.conversation_members;
create policy members_delete on public.conversation_members for delete to authenticated using(private.can_manage_conversation(conversation_id,auth.uid()) and user_id<>auth.uid() and not exists(select 1 from public.conversations c where c.id=conversation_id and c.created_by=user_id));

drop policy if exists conversations_insert on public.conversations;
create policy conversations_insert on public.conversations for insert to authenticated with check(private.is_active_approved_user(auth.uid()) and created_by=auth.uid() and (assigned_to is null or exists(select 1 from public.profiles p where p.id=assigned_to and p.status='active' and p.registration_state='approved' and p.role in ('member','volunteer','staff','manager','partner','admin','super_admin'))) and (organization_unit_id is null or exists(select 1 from public.governance_bodies b where b.id=organization_unit_id and b.status='active')));

drop policy if exists message_pins_select on public.message_pins;
create policy message_pins_select on public.message_pins for select to authenticated using(private.is_active_approved_user(auth.uid()) and user_id=auth.uid() and exists(select 1 from public.messages m where m.id=message_id and private.is_conversation_member(m.conversation_id,auth.uid())));
drop policy if exists message_pins_insert on public.message_pins;
create policy message_pins_insert on public.message_pins for insert to authenticated with check(private.is_active_approved_user(auth.uid()) and user_id=auth.uid() and exists(select 1 from public.messages m where m.id=message_id and private.is_conversation_member(m.conversation_id,auth.uid())));
drop policy if exists message_pins_delete on public.message_pins;
create policy message_pins_delete on public.message_pins for delete to authenticated using(private.is_active_approved_user(auth.uid()) and user_id=auth.uid());

drop policy if exists conversation_admin_access_log_superadmin_select on public.conversation_admin_access_log;
create policy conversation_admin_access_log_superadmin_select on public.conversation_admin_access_log for select to authenticated using(private.is_super_admin(auth.uid()) and private.has_aal2());

drop policy if exists aiac_documents_superadmin_delete on storage.objects;
create policy aiac_documents_superadmin_delete on storage.objects for delete to authenticated using(bucket_id='aiac-documents' and private.is_super_admin(auth.uid()) and private.has_aal2() and not exists(select 1 from public.document_versions v where v.storage_path=name));

grant select,insert,delete on public.message_pins to authenticated;
grant select on public.conversation_admin_access_log to authenticated;
grant execute on function public.create_conversation_v2(text,uuid,text,uuid) to authenticated;
grant execute on function public.search_conversation_messages(uuid,text,integer) to authenticated;
grant execute on function public.leave_conversation(uuid) to authenticated;
grant execute on function public.mark_conversation_unread(uuid) to authenticated;
