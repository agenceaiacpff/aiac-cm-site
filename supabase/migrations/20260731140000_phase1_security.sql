-- Phase 1 : séparation des rôles, cycle de vie des comptes, audit, messagerie privée et MFA.

alter table public.profiles alter column status set default 'pending';

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_created_at_idx on public.audit_logs(created_at desc);
create index audit_logs_actor_id_idx on public.audit_logs(actor_id,created_at desc);
alter table public.audit_logs enable row level security;

create or replace function private.is_active_user(uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.profiles p
    where p.id=uid and p.status='active'
  );
$$;

create or replace function private.is_super_admin(uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.profiles p
    where p.id=uid and p.status='active' and p.role='super_admin'
  );
$$;

create or replace function private.has_verified_mfa(uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from auth.mfa_factors f
    where f.user_id=uid and f.status='verified'
  );
$$;

create or replace function private.has_aal2() returns boolean
language sql stable set search_path='' as $$
  select coalesce(auth.jwt()->>'aal','aal1')='aal2';
$$;

revoke all on function private.is_active_user(uuid),private.is_super_admin(uuid),private.has_verified_mfa(uuid),private.has_aal2() from public,anon;
grant execute on function private.is_active_user(uuid),private.is_super_admin(uuid),private.has_verified_mfa(uuid),private.has_aal2() to authenticated;

create or replace function private.write_audit(
  action_name text,
  entity_name text,
  target_id uuid,
  payload jsonb default '{}'::jsonb
) returns void
language sql security definer set search_path='' as $$
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(auth.uid(),action_name,entity_name,target_id,coalesce(payload,'{}'::jsonb));
$$;
revoke all on function private.write_audit(text,text,uuid,jsonb) from public,anon,authenticated;

create or replace function private.protect_profile_privileges() returns trigger
language plpgsql security definer set search_path='' as $$
declare
  active_super_admins integer;
begin
  if new.role is not distinct from old.role and new.status is not distinct from old.status then
    return new;
  end if;

  -- Les opérations de maintenance exécutées par le rôle postgres n'ont pas de JWT.
  if auth.uid() is null then
    return new;
  end if;

  if not private.is_active_user(auth.uid()) then
    raise exception 'Votre compte n’est pas actif';
  end if;

  if old.role='super_admin' or new.role='super_admin' then
    if not private.is_super_admin(auth.uid()) then
      raise exception 'Seul un super-administrateur peut gérer les super-administrateurs';
    end if;
  elsif not private.is_admin(auth.uid()) then
    raise exception 'Seul un administrateur peut modifier une fonction ou un statut de compte';
  end if;

  if not private.has_verified_mfa(auth.uid()) or not private.has_aal2() then
    raise exception 'Une authentification à deux facteurs vérifiée est obligatoire pour cette opération';
  end if;

  if old.id=auth.uid() and old.role='super_admin'
     and (new.role is distinct from old.role or new.status is distinct from old.status) then
    raise exception 'Un super-administrateur ne peut pas réduire ou suspendre son propre accès';
  end if;

  if old.role='super_admin' and old.status='active'
     and (new.role<>'super_admin' or new.status<>'active') then
    select count(*) into active_super_admins
    from public.profiles p where p.role='super_admin' and p.status='active';
    if active_super_admins <= 1 then
      raise exception 'Le dernier super-administrateur actif ne peut pas être retiré ou suspendu';
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.audit_profile_privilege_change() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.role is distinct from old.role or new.status is distinct from old.status then
    perform private.write_audit(
      'profile.privileges_updated','profile',new.id,
      jsonb_build_object(
        'old_role',old.role,'new_role',new.role,
        'old_status',old.status,'new_status',new.status
      )
    );
  end if;
  return new;
end;
$$;
revoke all on function private.audit_profile_privilege_change() from public,anon,authenticated;

drop trigger if exists profiles_audit_privileges on public.profiles;
create trigger profiles_audit_privileges
after update on public.profiles for each row
execute function private.audit_profile_privilege_change();

create or replace function private.revoke_suspended_sessions() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status='suspended' and old.status is distinct from new.status then
    delete from auth.sessions where user_id=new.id;
  end if;
  return new;
end;
$$;
revoke all on function private.revoke_suspended_sessions() from public,anon,authenticated;

drop trigger if exists profiles_revoke_suspended_sessions on public.profiles;
create trigger profiles_revoke_suspended_sessions
after update of status on public.profiles for each row
execute function private.revoke_suspended_sessions();

create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.profiles(id,email,full_name,phone,organization,status)
  values(
    new.id,new.email,new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'phone',new.raw_user_meta_data->>'organization','pending'
  );

  insert into public.notifications(user_id,title,body,href)
  select p.id,'Nouveau compte à valider',coalesce(new.email,'Utilisateur sans adresse'),'/espace'
  from public.profiles p
  where p.status='active' and p.role in ('admin','super_admin');
  return new;
end;
$$;

create or replace function private.route_new_conversation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.conversation_members(conversation_id,user_id)
  values(new.id,new.created_by) on conflict do nothing;

  -- Un échange externe est routé vers les seuls super-administrateurs, pas vers tout le personnel.
  insert into public.conversation_members(conversation_id,user_id)
  select new.id,p.id from public.profiles p
  where p.status='active' and p.role='super_admin'
  on conflict do nothing;

  -- Une demande déjà affectée ajoute aussi son responsable désigné.
  insert into public.conversation_members(conversation_id,user_id)
  select new.id,r.assigned_to from public.requests r
  where r.id=new.request_id and r.assigned_to is not null
  on conflict do nothing;
  return new;
end;
$$;

create or replace function private.notify_new_request() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.notifications(user_id,title,body,href)
  select p.id,'Nouvelle demande',new.subject,'/espace'
  from public.profiles p
  where p.status='active' and p.role in ('admin','super_admin');
  return new;
end;
$$;

create or replace function private.audit_conversation_member_change() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' then
    perform private.write_audit(
      'conversation.member_added','conversation',new.conversation_id,
      jsonb_build_object('user_id',new.user_id)
    );
    return new;
  end if;
  perform private.write_audit(
    'conversation.member_removed','conversation',old.conversation_id,
    jsonb_build_object('user_id',old.user_id)
  );
  return old;
end;
$$;
revoke all on function private.audit_conversation_member_change() from public,anon,authenticated;

drop trigger if exists conversation_members_audit on public.conversation_members;
create trigger conversation_members_audit
after insert or delete on public.conversation_members for each row
execute function private.audit_conversation_member_change();

drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs for select to authenticated
using ((select private.is_super_admin()) and (select private.has_aal2()));

drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_update on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
using ((select auth.uid())=id or ((select private.is_active_user()) and (select private.is_staff())));
create policy profiles_update on public.profiles for update to authenticated
using ((select private.is_active_user()) and ((select auth.uid())=id or (select private.is_admin())))
with check ((select private.is_active_user()) and ((select auth.uid())=id or (select private.is_admin())));

drop policy if exists requests_select on public.requests;
drop policy if exists requests_insert on public.requests;
drop policy if exists requests_staff_update on public.requests;
create policy requests_select on public.requests for select to authenticated
using ((select private.is_active_user()) and (created_by=(select auth.uid()) or assigned_to=(select auth.uid()) or (select private.is_staff())));
create policy requests_insert on public.requests for insert to authenticated
with check ((select private.is_active_user()) and created_by=(select auth.uid()));
create policy requests_staff_update on public.requests for update to authenticated
using ((select private.is_active_user()) and (select private.is_staff()))
with check ((select private.is_active_user()) and (select private.is_staff()));

drop policy if exists conversations_select on public.conversations;
drop policy if exists conversations_insert on public.conversations;
drop policy if exists conversations_update on public.conversations;
create policy conversations_select on public.conversations for select to authenticated
using ((select private.is_active_user()) and (created_by=(select auth.uid()) or (select private.is_conversation_member(id))));
create policy conversations_insert on public.conversations for insert to authenticated
with check ((select private.is_active_user()) and created_by=(select auth.uid()));
create policy conversations_update on public.conversations for update to authenticated
using ((select private.is_active_user()) and (created_by=(select auth.uid()) or (select private.is_super_admin())))
with check ((select private.is_active_user()) and (created_by=(select auth.uid()) or (select private.is_super_admin())));

drop policy if exists members_select on public.conversation_members;
drop policy if exists members_insert on public.conversation_members;
drop policy if exists members_delete on public.conversation_members;
create policy members_select on public.conversation_members for select to authenticated
using ((select private.is_active_user()) and (select private.is_conversation_member(conversation_id)));
create policy members_insert on public.conversation_members for insert to authenticated
with check (
  (select private.is_active_user())
  and (select private.is_super_admin())
  and exists(select 1 from public.profiles p where p.id=user_id and p.status='active')
);
create policy members_delete on public.conversation_members for delete to authenticated
using ((select private.is_active_user()) and (select private.is_super_admin()) and user_id<>(select auth.uid()));

drop policy if exists messages_select on public.messages;
drop policy if exists messages_insert on public.messages;
create policy messages_select on public.messages for select to authenticated
using ((select private.is_active_user()) and (select private.is_conversation_member(conversation_id)));
create policy messages_insert on public.messages for insert to authenticated
with check (
  (select private.is_active_user()) and sender_id=(select auth.uid())
  and (select private.is_conversation_member(conversation_id))
);

drop policy if exists reads_select on public.message_reads;
drop policy if exists reads_insert on public.message_reads;
create policy reads_select on public.message_reads for select to authenticated
using (
  (select private.is_active_user())
  and (user_id=(select auth.uid()) or (select private.is_conversation_member((select m.conversation_id from public.messages m where m.id=message_id))))
);
create policy reads_insert on public.message_reads for insert to authenticated
with check ((select private.is_active_user()) and user_id=(select auth.uid()));

drop policy if exists notifications_select on public.notifications;
drop policy if exists notifications_update on public.notifications;
create policy notifications_select on public.notifications for select to authenticated
using ((select private.is_active_user()) and user_id=(select auth.uid()));
create policy notifications_update on public.notifications for update to authenticated
using ((select private.is_active_user()) and user_id=(select auth.uid()))
with check ((select private.is_active_user()) and user_id=(select auth.uid()));

drop policy if exists tasks_select on public.tasks;
drop policy if exists tasks_insert on public.tasks;
drop policy if exists tasks_update on public.tasks;
create policy tasks_select on public.tasks for select to authenticated
using ((select private.is_active_user()) and (created_by=(select auth.uid()) or assigned_to=(select auth.uid()) or (select private.is_staff())));
create policy tasks_insert on public.tasks for insert to authenticated
with check ((select private.is_active_user()) and (select private.is_staff()) and created_by=(select auth.uid()));
create policy tasks_update on public.tasks for update to authenticated
using ((select private.is_active_user()) and (assigned_to=(select auth.uid()) or (select private.is_staff())))
with check ((select private.is_active_user()) and (assigned_to=(select auth.uid()) or (select private.is_staff())));

drop policy if exists documents_select on public.documents;
drop policy if exists documents_insert on public.documents;
create policy documents_select on public.documents for select to authenticated
using (
  (select private.is_active_user()) and (
    owner_id=(select auth.uid()) or (select private.is_staff())
    or (visibility='request' and exists(select 1 from public.requests r where r.id=request_id and r.created_by=(select auth.uid())))
  )
);
create policy documents_insert on public.documents for insert to authenticated
with check ((select private.is_active_user()) and owner_id=(select auth.uid()));

revoke all on public.audit_logs from anon,authenticated;
grant select on public.audit_logs to authenticated;
