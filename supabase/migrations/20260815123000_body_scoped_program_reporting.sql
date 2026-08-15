-- Unifie le portefeuille opérationnel autour de l'organe propriétaire.
-- L'organe est choisi au niveau du programme puis hérité par toute la chaîne.

alter table public.programs
  add column if not exists body_id uuid references public.governance_bodies(id) on delete restrict;

update public.programs
set body_id=(select id from public.governance_bodies where code='OS-04' and status='active' limit 1)
where code='PIE-DC-AIAC-EDU' and body_id is null;

update public.programs
set body_id=(select id from public.governance_bodies where code='CA' and status='active' limit 1)
where body_id is null;

do $$
begin
  if exists(select 1 from public.programs where body_id is null) then
    raise exception 'Chaque programme doit être rattaché à un organe AIAC actif';
  end if;
end;
$$;

alter table public.programs alter column body_id set not null;
create index if not exists programs_body_status_idx on public.programs(body_id,status,updated_at desc);

create or replace function private.can_manage_body_program(target_body uuid,uid uuid default auth.uid())
returns boolean
language sql stable security definer set search_path='' as $$
  select private.is_active_user(uid) and exists(
    select 1 from public.governance_bodies b
    where b.id=target_body and b.status='active'
  ) and (
    (private.is_admin(uid) and case when uid=auth.uid() then private.has_aal2() else true end)
    or exists(
      select 1 from public.position_assignments pa
      where pa.profile_id=uid and pa.body_id=target_body and pa.status='active'
        and pa.start_date<=current_date and (pa.end_date is null or pa.end_date>=current_date)
    )
    or exists(
      select 1 from public.workforce_assignments wa
      where wa.profile_id=uid and wa.body_id=target_body and wa.status='active'
        and wa.start_date<=current_date and (wa.end_date is null or wa.end_date>=current_date)
    )
    or exists(
      select 1 from public.institutional_members im
      join public.body_memberships bm on bm.member_id=im.id
      where im.profile_id=uid and im.status='active' and bm.body_id=target_body and bm.status='active'
        and bm.start_date<=current_date and (bm.end_date is null or bm.end_date>=current_date)
    )
  );
$$;

revoke all on function private.can_manage_body_program(uuid,uuid) from public,anon;
grant execute on function private.can_manage_body_program(uuid,uuid) to authenticated;

create or replace function private.can_manage_project(pid uuid,uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(
    select 1
    from public.projects pr
    join public.programs pg on pg.id=pr.program_id
    where pr.id=pid and (
      private.can_manage_body_program(pg.body_id,uid)
      or exists(
        select 1 from public.project_members pm
        join public.profiles pf on pf.id=pm.user_id
        where pm.project_id=pr.id and pm.user_id=uid and pm.member_role='lead'
          and pf.status='active' and pf.role in ('manager','admin','super_admin')
      )
    )
  );
$$;

create or replace function private.can_contribute_project(pid uuid,uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
  select private.can_use_operations(uid) and exists(
    select 1
    from public.projects pr
    join public.programs pg on pg.id=pr.program_id
    where pr.id=pid and (
      private.can_manage_body_program(pg.body_id,uid)
      or exists(
        select 1 from public.project_members pm
        join public.profiles pf on pf.id=pm.user_id
        where pm.project_id=pr.id and pm.user_id=uid and pm.member_role<>'viewer' and pf.status='active'
      )
    )
  );
$$;

create or replace function private.can_manage_activity(target_id uuid,uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(
    select 1
    from public.activities a
    join public.projects pr on pr.id=a.project_id
    join public.programs pg on pg.id=pr.program_id
    where a.id=target_id and (
      private.can_manage_body_program(pg.body_id,uid)
      or a.manager_id=uid or a.created_by=uid
      or private.can_manage_project(a.project_id,uid)
    )
  );
$$;

create or replace function private.can_view_activity_task(target_id uuid,uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
  select private.is_active_user(uid) and exists(
    select 1
    from public.activity_tasks t
    join public.activities a on a.id=t.activity_id
    join public.projects pr on pr.id=a.project_id
    join public.programs pg on pg.id=pr.program_id
    where t.id=target_id and (
      (private.is_admin(uid) and case when uid=auth.uid() then private.has_aal2() else true end)
      or t.assigned_to=uid or t.created_by=uid or a.manager_id=uid or a.created_by=uid
      or pg.manager_id=uid or private.is_project_member(pr.id,uid)
    )
  );
$$;

create or replace function private.can_manage_activity_task(target_id uuid,uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
  select private.is_active_user(uid) and exists(
    select 1
    from public.activity_tasks t
    join public.activities a on a.id=t.activity_id
    join public.projects pr on pr.id=a.project_id
    join public.programs pg on pg.id=pr.program_id
    where t.id=target_id and (
      private.can_manage_body_program(pg.body_id,uid)
      or a.manager_id=uid or a.created_by=uid or pg.manager_id=uid
      or private.can_manage_project(pr.id,uid)
    )
  );
$$;

create or replace function private.can_contribute_activity_task(target_id uuid,uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
  select private.is_active_user(uid) and exists(
    select 1
    from public.activity_tasks t
    join public.activities a on a.id=t.activity_id
    join public.projects pr on pr.id=a.project_id
    join public.programs pg on pg.id=pr.program_id
    where t.id=target_id and t.status in ('planned','active') and (
      t.assigned_to=uid or a.manager_id=uid or a.created_by=uid or pg.manager_id=uid
      or private.can_contribute_project(pr.id,uid)
      or (t.assigned_to is null and private.is_body_participant(pg.body_id,uid))
    )
  );
$$;

create or replace function private.can_review_task_report(target_id uuid,uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
  select private.is_active_user(uid) and exists(
    select 1
    from public.task_reports r
    join public.activity_tasks t on t.id=r.task_id
    join public.activities a on a.id=t.activity_id
    join public.projects pr on pr.id=a.project_id
    join public.programs pg on pg.id=pr.program_id
    where r.id=target_id and r.reporter_id<>uid and (
      (private.is_admin(uid) and case when uid=auth.uid() then private.has_aal2() else true end)
      or r.supervisor_id=uid or a.manager_id=uid or pg.manager_id=uid
      or exists(select 1 from public.project_members pm where pm.project_id=pr.id and pm.user_id=uid and pm.member_role='lead')
    )
  );
$$;

revoke all on function private.can_manage_project(uuid,uuid),private.can_contribute_project(uuid,uuid),private.can_manage_activity(uuid,uuid),private.can_view_activity_task(uuid,uuid),private.can_manage_activity_task(uuid,uuid),private.can_contribute_activity_task(uuid,uuid),private.can_review_task_report(uuid,uuid) from public,anon;
grant execute on function private.can_manage_project(uuid,uuid),private.can_contribute_project(uuid,uuid),private.can_manage_activity(uuid,uuid),private.can_view_activity_task(uuid,uuid),private.can_manage_activity_task(uuid,uuid),private.can_contribute_activity_task(uuid,uuid),private.can_review_task_report(uuid,uuid) to authenticated;

drop policy if exists programs_select on public.programs;
create policy programs_select on public.programs for select to authenticated using (
  (select private.is_body_participant(body_id))
);

drop policy if exists programs_insert on public.programs;
create policy programs_insert on public.programs for insert to authenticated with check (
  created_by=(select auth.uid()) and (select private.can_manage_body_program(body_id))
);

drop policy if exists programs_update on public.programs;
create policy programs_update on public.programs for update to authenticated
using ((select private.can_manage_body_program(body_id)))
with check ((select private.can_manage_body_program(body_id)));

drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select to authenticated using (
  (select private.can_use_operations()) and (
    (select private.is_project_member(id))
    or exists(select 1 from public.programs pg where pg.id=program_id and (select private.is_body_participant(pg.body_id)))
  )
);

drop policy if exists governance_bodies_authenticated_select on public.governance_bodies;
create policy governance_bodies_authenticated_select on public.governance_bodies for select to authenticated using (
  (select private.is_staff()) or body_type='subsidiary_body' or (select private.is_body_participant(id))
);

drop policy if exists project_members_select on public.project_members;
create policy project_members_select on public.project_members for select to authenticated using (
  (select private.is_project_member(project_id)) or (select private.can_manage_project(project_id))
);

drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects for insert to authenticated with check (
  created_by=(select auth.uid()) and exists(
    select 1 from public.programs pg where pg.id=program_id and (select private.can_manage_body_program(pg.body_id))
  )
);

drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects for update to authenticated
using ((select private.can_manage_project(id)))
with check ((select private.can_manage_project(id)));

drop policy if exists activities_select on public.activities;
create policy activities_select on public.activities for select to authenticated using (
  manager_id=(select auth.uid()) or created_by=(select auth.uid()) or (select private.is_project_member(project_id))
  or exists(
    select 1 from public.projects pr join public.programs pg on pg.id=pr.program_id
    where pr.id=project_id and (select private.is_body_participant(pg.body_id))
  )
);

drop policy if exists activities_insert on public.activities;
create policy activities_insert on public.activities for insert to authenticated with check (
  created_by=(select auth.uid()) and exists(
    select 1 from public.projects pr join public.programs pg on pg.id=pr.program_id
    where pr.id=project_id and pg.id=program_id
      and ((select private.can_manage_body_program(pg.body_id)) or (select private.can_contribute_project(pr.id)))
  )
);

drop policy if exists activities_update on public.activities;
create policy activities_update on public.activities for update to authenticated
using ((select private.can_manage_activity(id)))
with check ((select private.can_manage_activity(id)));

drop policy if exists activity_tasks_select_own on public.activity_tasks;
create policy activity_tasks_select_own on public.activity_tasks for select to authenticated using (
  created_by=(select auth.uid()) or assigned_to=(select auth.uid())
);

drop policy if exists task_reports_select_own on public.task_reports;
create policy task_reports_select_own on public.task_reports for select to authenticated using (
  reporter_id=(select auth.uid())
);

create or replace function private.resolve_task_report_context() returns trigger
language plpgsql security definer set search_path='' as $$
declare
  resolved_supervisor uuid;
  resolved_body uuid;
begin
  if new.reporter_id is null then new.reporter_id:=auth.uid(); end if;

  select pg.body_id into resolved_body
  from public.activity_tasks t
  join public.activities a on a.id=t.activity_id
  join public.projects pr on pr.id=a.project_id
  join public.programs pg on pg.id=pr.program_id
  where t.id=new.task_id;

  select wa.supervisor_id into resolved_supervisor
  from public.workforce_assignments wa
  where wa.profile_id=new.reporter_id and wa.body_id=resolved_body and wa.status='active'
    and wa.start_date<=current_date and (wa.end_date is null or wa.end_date>=current_date)
  order by wa.start_date desc limit 1;

  if resolved_supervisor is null then
    select spa.profile_id into resolved_supervisor
    from public.position_assignments pa
    left join public.position_assignments spa on spa.id=pa.supervisor_assignment_id and spa.status='active'
    where pa.profile_id=new.reporter_id and pa.body_id=resolved_body and pa.status='active'
      and pa.start_date<=current_date and (pa.end_date is null or pa.end_date>=current_date)
    order by pa.start_date desc limit 1;
  end if;

  if resolved_supervisor is null then
    select coalesce(
      case when a.manager_id<>new.reporter_id then a.manager_id end,
      case when pg.manager_id<>new.reporter_id then pg.manager_id end
    ) into resolved_supervisor
    from public.activity_tasks t
    join public.activities a on a.id=t.activity_id
    join public.projects pr on pr.id=a.project_id
    join public.programs pg on pg.id=pr.program_id
    where t.id=new.task_id;
  end if;

  new.supervisor_id:=resolved_supervisor;
  new.body_id:=resolved_body;
  return new;
end;
$$;

revoke all on function private.resolve_task_report_context() from public,anon,authenticated;
