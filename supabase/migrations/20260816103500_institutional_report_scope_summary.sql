create or replace function public.institutional_report_scope_summary(
  target_body_id uuid default null,
  target_program_id uuid default null,
  target_project_id uuid default null,
  target_activity_id uuid default null,
  target_task_id uuid default null
)
returns jsonb
language sql
stable security definer
set search_path=''
as $$
  with scoped as (
    select b.id body_id,pg.id program_id,pr.id project_id,a.id activity_id,t.id task_id,t.status task_status
    from public.activity_tasks t
    join public.activities a on a.id=t.activity_id
    join public.projects pr on pr.id=a.project_id
    join public.programs pg on pg.id=pr.program_id
    join public.governance_bodies b on b.id=pg.body_id
    where private.is_active_approved_user(auth.uid())
      and (target_body_id is null or b.id=target_body_id)
      and (target_program_id is null or pg.id=target_program_id)
      and (target_project_id is null or pr.id=target_project_id)
      and (target_activity_id is null or a.id=target_activity_id)
      and (target_task_id is null or t.id=target_task_id)
  )
  select jsonb_build_object(
    'program_count',count(distinct program_id),
    'project_count',count(distinct project_id),
    'activity_count',count(distinct activity_id),
    'task_count',count(distinct task_id),
    'planned_tasks',count(*) filter(where task_status='planned'),
    'active_tasks',count(*) filter(where task_status='active'),
    'completed_tasks',count(*) filter(where task_status='completed'),
    'cancelled_tasks',count(*) filter(where task_status='cancelled')
  ) from scoped;
$$;
revoke execute on function public.institutional_report_scope_summary(uuid,uuid,uuid,uuid,uuid) from public,anon;
grant execute on function public.institutional_report_scope_summary(uuid,uuid,uuid,uuid,uuid) to authenticated;
