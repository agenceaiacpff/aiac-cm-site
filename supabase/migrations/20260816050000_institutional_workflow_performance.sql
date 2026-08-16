-- AIAC institutional workflow performance hardening
-- Keeps the existing access model while avoiding per-row RLS recursion when
-- counting tasks for the hierarchical programme reporting workspace.

create or replace function public.list_activity_task_counts()
returns table(activity_id uuid, task_count bigint)
language sql
stable
security definer
set search_path=''
as $function$
  with actor as materialized (
    select
      auth.uid() as uid,
      private.is_active_user(auth.uid()) as active,
      (private.is_admin(auth.uid()) and private.has_aal2()) as admin_ok,
      private.can_use_operations(auth.uid()) as operations_ok
  ),
  memberships as materialized (
    select distinct pm.project_id
    from public.project_members pm
    join public.profiles p on p.id=pm.user_id and p.status='active'
    cross join actor x
    where x.operations_ok and pm.user_id=x.uid
  )
  select t.activity_id, count(*)::bigint
  from public.activity_tasks t
  join public.activities a on a.id=t.activity_id
  join public.projects pr on pr.id=a.project_id
  join public.programs pg on pg.id=pr.program_id
  cross join actor x
  left join memberships m on m.project_id=pr.id
  where x.active and (
    x.admin_ok
    or t.assigned_to=x.uid
    or t.created_by=x.uid
    or a.manager_id=x.uid
    or a.created_by=x.uid
    or pg.manager_id=x.uid
    or m.project_id is not null
  )
  group by t.activity_id;
$function$;

revoke all on function public.list_activity_task_counts() from public;
grant execute on function public.list_activity_task_counts() to authenticated;

-- The UI navigates in this exact order: body -> programme -> project -> activity -> task.
create index if not exists programs_body_code_idx
  on public.programs(body_id, code);
create index if not exists projects_program_code_idx
  on public.projects(program_id, code);
create index if not exists activities_project_code_idx
  on public.activities(project_id, code);
create index if not exists activity_tasks_activity_sequence_idx
  on public.activity_tasks(activity_id, sequence_no, code);
create index if not exists activity_tasks_created_by_idx
  on public.activity_tasks(created_by);

-- Workflow foreign-key access paths used by validation/consolidation screens.
create index if not exists task_report_approvals_actor_idx
  on public.task_report_approvals(actor_id);
create index if not exists task_report_approvals_actor_body_idx
  on public.task_report_approvals(actor_body_id);
create index if not exists task_report_attendance_recorded_by_idx
  on public.task_report_attendance(recorded_by);
create index if not exists task_report_events_actor_idx
  on public.task_report_events(actor_id);
create index if not exists task_report_evidence_uploaded_by_idx
  on public.task_report_evidence(uploaded_by);
create index if not exists task_report_indicators_recorded_by_idx
  on public.task_report_indicator_values(recorded_by);
create index if not exists task_report_versions_submitted_by_idx
  on public.task_report_versions(submitted_by);
create index if not exists task_reports_approved_by_idx
  on public.task_reports(approved_by);
create index if not exists task_reports_published_by_idx
  on public.task_reports(published_by);
