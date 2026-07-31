-- Durcissement des RPC du point 4 : droits de l'appelant et RLS explicites.

alter function public.change_account_status(uuid,public.account_status,text) security invoker;
alter function public.review_account_registration(uuid,text,text,uuid) security invoker;

create or replace function private.protect_profile_privileges() returns trigger
language plpgsql security definer set search_path='' as $$
declare active_super_admins integer;
begin
  if new.role is not distinct from old.role
     and new.status is not distinct from old.status
     and new.registration_state is not distinct from old.registration_state
     and new.validated_at is not distinct from old.validated_at
     and new.validated_by is not distinct from old.validated_by
     and new.rejection_reason is not distinct from old.rejection_reason then return new; end if;
  if auth.uid() is null then return new; end if;
  if not private.is_active_user(auth.uid()) then raise exception 'Votre compte n’est pas actif'; end if;
  if old.role='super_admin' or new.role='super_admin' then
    if not private.is_super_admin(auth.uid()) then raise exception 'Seul un super-administrateur peut gérer les super-administrateurs'; end if;
  elsif not private.is_admin(auth.uid()) then raise exception 'Seul un administrateur peut modifier un compte'; end if;
  if not private.has_verified_mfa(auth.uid()) or not private.has_aal2() then raise exception 'Une authentification à deux facteurs vérifiée est obligatoire pour cette opération'; end if;
  if old.id=auth.uid() and old.role='super_admin' and (new.role is distinct from old.role or new.status is distinct from old.status) then raise exception 'Un super-administrateur ne peut pas réduire ou suspendre son propre accès'; end if;
  if old.role='super_admin' and old.status='active' and (new.role<>'super_admin' or new.status<>'active') then
    select count(*) into active_super_admins from public.profiles p where p.role='super_admin' and p.status='active';
    if active_super_admins<=1 then raise exception 'Le dernier super-administrateur actif ne peut pas être retiré ou suspendu'; end if;
  end if;
  return new;
end;
$$;

drop policy if exists account_reviews_insert on public.account_reviews;
create policy account_reviews_insert on public.account_reviews for insert to authenticated
with check (reviewer_id=(select auth.uid()) and (select private.is_admin()) and (select private.has_aal2()));
grant insert on public.account_reviews to authenticated;
grant update(registration_state,validated_at,validated_by,rejection_reason) on public.profiles to authenticated;

create or replace function private.message_recipient_directory()
returns table(id uuid,full_name text,role text,body_name text,position_title text)
language sql stable security definer set search_path='' as $$
  select p.id,coalesce(p.full_name,'Compte AIAC'),p.role::text,b.name,pd.title
  from public.profiles p
  left join lateral (
    select pa.body_id,pa.position_id from public.position_assignments pa
    where pa.profile_id=p.id and pa.status='active' and (pa.end_date is null or pa.end_date>=current_date)
    order by pa.start_date desc limit 1
  ) pa on true
  left join public.governance_bodies b on b.id=pa.body_id
  left join public.position_definitions pd on pd.id=pa.position_id
  where private.is_active_user() and p.status='active' and p.role in ('staff','manager','admin','super_admin')
  order by coalesce(b.name,''),coalesce(pd.title,''),coalesce(p.full_name,'');
$$;
revoke all on function private.message_recipient_directory() from public,anon;
grant execute on function private.message_recipient_directory() to authenticated;

create or replace function public.list_message_recipients()
returns table(id uuid,full_name text,role text,body_name text,position_title text)
language sql stable security invoker set search_path='' as $$
  select * from private.message_recipient_directory();
$$;

drop policy if exists reads_update on public.message_reads;
create policy reads_update on public.message_reads for update to authenticated
using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
grant update on public.message_reads to authenticated;
alter function public.mark_conversation_read(uuid) security invoker;

drop policy if exists session_activity_insert on public.session_activity;
drop policy if exists session_activity_update on public.session_activity;
create policy session_activity_insert on public.session_activity for insert to authenticated
with check (user_id=(select auth.uid()));
create policy session_activity_update on public.session_activity for update to authenticated
using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
grant insert,update on public.session_activity to authenticated;
alter function public.record_session_activity(text,text,text) security invoker;
