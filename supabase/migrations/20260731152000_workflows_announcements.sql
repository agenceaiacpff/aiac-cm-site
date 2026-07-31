-- Phase 3 : workflows complets, historique, annonces et gestion motivée des comptes.

create table public.request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type in ('comment','status_change','assignment','priority_change','project_change')),
  body text check (body is null or char_length(body) between 1 and 5000),
  from_value text,
  to_value text,
  created_at timestamptz not null default now(),
  check (event_type <> 'comment' or body is not null)
);

create table public.task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type in ('comment','status_change','assignment','priority_change','due_date_change','project_change')),
  body text check (body is null or char_length(body) between 1 and 5000),
  from_value text,
  to_value text,
  created_at timestamptz not null default now(),
  check (event_type <> 'comment' or body is not null)
);

create table public.account_status_history (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  old_status public.account_status not null,
  new_status public.account_status not null,
  reason text not null check (char_length(reason) between 5 and 1000),
  created_at timestamptz not null default now()
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 180),
  body text not null check (char_length(body) between 5 and 10000),
  audience text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft','published','archived')),
  published_at timestamptz,
  expires_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (audience <@ array['member','beneficiary','volunteer','staff','manager','partner','admin','super_admin']::text[]),
  check (expires_at is null or published_at is null or expires_at > published_at)
);

create table public.announcement_reads (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id,user_id)
);

create index request_events_request_idx on public.request_events(request_id,created_at desc);
create index request_events_actor_idx on public.request_events(actor_id,created_at desc);
create index task_events_task_idx on public.task_events(task_id,created_at desc);
create index task_events_actor_idx on public.task_events(actor_id,created_at desc);
create index account_status_history_profile_idx on public.account_status_history(profile_id,created_at desc);
create index account_status_history_actor_idx on public.account_status_history(actor_id,created_at desc);
create index announcements_status_idx on public.announcements(status,published_at desc,expires_at);
create index announcements_created_by_idx on public.announcements(created_by,created_at desc);
create index announcement_reads_user_idx on public.announcement_reads(user_id,read_at desc);

alter table public.request_events enable row level security;
alter table public.task_events enable row level security;
alter table public.account_status_history enable row level security;
alter table public.announcements enable row level security;
alter table public.announcement_reads enable row level security;

create or replace function private.can_access_request(target_id uuid,uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.requests r
    where r.id=target_id and (
      r.created_by=uid or r.assigned_to=uid
      or (private.is_admin(uid) and private.has_aal2())
      or (r.project_id is not null and private.is_project_member(r.project_id,uid))
    )
  );
$$;

create or replace function private.can_access_task(target_id uuid,uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.tasks t
    where t.id=target_id and (
      t.created_by=uid or t.assigned_to=uid
      or (private.is_admin(uid) and private.has_aal2())
      or (t.project_id is not null and private.is_project_member(t.project_id,uid))
    )
  );
$$;

revoke all on function private.can_access_request(uuid,uuid),private.can_access_task(uuid,uuid) from public,anon;
grant execute on function private.can_access_request(uuid,uuid),private.can_access_task(uuid,uuid) to authenticated;

create or replace function private.record_request_events() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status is distinct from old.status then
    insert into public.request_events(request_id,actor_id,event_type,from_value,to_value)
    values(new.id,auth.uid(),'status_change',old.status::text,new.status::text);
  end if;
  if new.assigned_to is distinct from old.assigned_to then
    insert into public.request_events(request_id,actor_id,event_type,from_value,to_value)
    values(new.id,auth.uid(),'assignment',old.assigned_to::text,new.assigned_to::text);
  end if;
  if new.priority is distinct from old.priority then
    insert into public.request_events(request_id,actor_id,event_type,from_value,to_value)
    values(new.id,auth.uid(),'priority_change',old.priority,new.priority);
  end if;
  if new.project_id is distinct from old.project_id then
    insert into public.request_events(request_id,actor_id,event_type,from_value,to_value)
    values(new.id,auth.uid(),'project_change',old.project_id::text,new.project_id::text);
  end if;
  return new;
end;
$$;
revoke all on function private.record_request_events() from public,anon,authenticated;
create trigger requests_record_events after update of status,assigned_to,priority,project_id on public.requests
for each row execute function private.record_request_events();

create or replace function private.record_task_events() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status is distinct from old.status then
    insert into public.task_events(task_id,actor_id,event_type,from_value,to_value)
    values(new.id,auth.uid(),'status_change',old.status::text,new.status::text);
  end if;
  if new.assigned_to is distinct from old.assigned_to then
    insert into public.task_events(task_id,actor_id,event_type,from_value,to_value)
    values(new.id,auth.uid(),'assignment',old.assigned_to::text,new.assigned_to::text);
  end if;
  if new.priority is distinct from old.priority then
    insert into public.task_events(task_id,actor_id,event_type,from_value,to_value)
    values(new.id,auth.uid(),'priority_change',old.priority,new.priority);
  end if;
  if new.due_at is distinct from old.due_at then
    insert into public.task_events(task_id,actor_id,event_type,from_value,to_value)
    values(new.id,auth.uid(),'due_date_change',old.due_at::text,new.due_at::text);
  end if;
  if new.project_id is distinct from old.project_id then
    insert into public.task_events(task_id,actor_id,event_type,from_value,to_value)
    values(new.id,auth.uid(),'project_change',old.project_id::text,new.project_id::text);
  end if;
  return new;
end;
$$;
revoke all on function private.record_task_events() from public,anon,authenticated;
create trigger tasks_record_events after update of status,assigned_to,priority,due_at,project_id on public.tasks
for each row execute function private.record_task_events();

create or replace function public.change_account_status(
  target_id uuid,
  new_status public.account_status,
  reason text
) returns void
language plpgsql security definer set search_path='' as $$
declare previous_status public.account_status;
begin
  if auth.uid() is null or not private.is_admin(auth.uid()) or not private.has_verified_mfa(auth.uid()) or not private.has_aal2() then
    raise exception 'Une session administrateur active avec authentification à deux facteurs est obligatoire';
  end if;
  if char_length(trim(reason)) < 5 then
    raise exception 'Le motif doit contenir au moins 5 caractères';
  end if;

  select p.status into previous_status from public.profiles p where p.id=target_id for update;
  if previous_status is null then raise exception 'Compte introuvable'; end if;
  if previous_status=new_status then raise exception 'Le compte possède déjà ce statut'; end if;

  update public.profiles set status=new_status where id=target_id;
  insert into public.account_status_history(profile_id,actor_id,old_status,new_status,reason)
  values(target_id,auth.uid(),previous_status,new_status,trim(reason));
end;
$$;
revoke all on function public.change_account_status(uuid,public.account_status,text) from public,anon;
grant execute on function public.change_account_status(uuid,public.account_status,text) to authenticated;

create or replace function private.publish_announcement() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status='published' and (tg_op='INSERT' or old.status is distinct from 'published') then
    if new.published_at is null then new.published_at=now(); end if;
  end if;
  return new;
end;
$$;
revoke all on function private.publish_announcement() from public,anon,authenticated;
create trigger announcements_prepare_publish before insert or update of status on public.announcements
for each row execute function private.publish_announcement();
create trigger announcements_touch before update on public.announcements
for each row execute function private.touch_updated_at();

create or replace function private.notify_announcement() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status='published' and (tg_op='INSERT' or old.status is distinct from 'published') then
    insert into public.notifications(user_id,title,body,href)
    select p.id,new.title,left(new.body,240),'/espace?tab=annonces'
    from public.profiles p
    where p.status='active' and (cardinality(new.audience)=0 or p.role::text=any(new.audience));
    perform private.write_audit('announcement.published','announcement',new.id,jsonb_build_object('audience',new.audience));
  end if;
  return new;
end;
$$;
revoke all on function private.notify_announcement() from public,anon,authenticated;
create trigger announcements_notify after insert or update of status on public.announcements
for each row execute function private.notify_announcement();

create policy request_events_select on public.request_events for select to authenticated
using ((select private.is_active_user()) and (select private.can_access_request(request_id)));
create policy request_events_comment_insert on public.request_events for insert to authenticated
with check (
  (select private.is_active_user()) and actor_id=(select auth.uid()) and event_type='comment'
  and (select private.can_access_request(request_id))
);

create policy task_events_select on public.task_events for select to authenticated
using ((select private.can_use_operations()) and (select private.can_access_task(task_id)));
create policy task_events_comment_insert on public.task_events for insert to authenticated
with check (
  (select private.can_use_operations()) and actor_id=(select auth.uid()) and event_type='comment'
  and (select private.can_access_task(task_id))
);

create policy account_status_history_select on public.account_status_history for select to authenticated
using ((select private.is_admin()) and (select private.has_aal2()));

create policy announcements_select on public.announcements for select to authenticated
using (
  (select private.is_active_user()) and (
    ((select private.is_admin()) and (select private.has_aal2()))
    or (
      status='published' and published_at<=now() and (expires_at is null or expires_at>now())
      and (cardinality(audience)=0 or exists(
        select 1 from public.profiles p where p.id=(select auth.uid()) and p.role::text=any(audience)
      ))
    )
  )
);
create policy announcements_insert on public.announcements for insert to authenticated
with check ((select private.is_admin()) and (select private.has_aal2()) and created_by=(select auth.uid()));
create policy announcements_update on public.announcements for update to authenticated
using ((select private.is_admin()) and (select private.has_aal2()))
with check ((select private.is_admin()) and (select private.has_aal2()));
create policy announcements_delete on public.announcements for delete to authenticated
using ((select private.is_super_admin()) and (select private.has_aal2()));

create policy announcement_reads_select on public.announcement_reads for select to authenticated
using (user_id=(select auth.uid()));
create policy announcement_reads_insert on public.announcement_reads for insert to authenticated
with check (user_id=(select auth.uid()) and exists(select 1 from public.announcements a where a.id=announcement_id));
create policy announcement_reads_update on public.announcement_reads for update to authenticated
using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));

revoke update on public.profiles from authenticated;
grant update(full_name,phone,organization,avatar_url,role) on public.profiles to authenticated;
grant select,insert on public.request_events,public.task_events to authenticated;
grant select on public.account_status_history to authenticated;
grant select,insert,update,delete on public.announcements to authenticated;
grant select,insert,update on public.announcement_reads to authenticated;

