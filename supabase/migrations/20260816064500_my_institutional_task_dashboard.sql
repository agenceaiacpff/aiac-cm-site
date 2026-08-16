create or replace function public.my_institutional_task_dashboard(
  target_body_id uuid default null
)
returns table(
  body_id uuid, body_code text, body_name text,
  program_id uuid, program_code text, program_name text,
  project_id uuid, project_code text, project_name text,
  activity_id uuid, activity_code text, activity_title text,
  task_id uuid, task_code text, task_title text, task_sequence_no integer,
  task_status text, due_date date,
  latest_report_id uuid, latest_report_number text, latest_report_status text,
  latest_report_updated_at timestamptz
)
language sql
stable
security definer
set search_path=''
as $function$
  select
    b.id,b.code,b.name,
    pg.id,pg.code,pg.name,
    pr.id,pr.code,pr.name,
    a.id,a.code,a.title,
    t.id,t.code,t.title,t.sequence_no,t.status,t.due_date,
    lr.id,lr.report_number,lr.status,lr.updated_at
  from public.activity_tasks t
  join public.activities a on a.id=t.activity_id
  join public.projects pr on pr.id=a.project_id
  join public.programs pg on pg.id=pr.program_id
  join public.governance_bodies b on b.id=pg.body_id
  left join lateral (
    select r.id,r.report_number,r.status,r.updated_at
    from public.task_reports r
    where r.task_id=t.id and r.reporter_id=auth.uid()
    order by r.updated_at desc
    limit 1
  ) lr on true
  where private.is_active_user(auth.uid())
    and t.assigned_to=auth.uid()
    and (target_body_id is null or b.id=target_body_id)
  order by t.due_date asc nulls last,b.code,pg.code,pr.code,a.code,t.sequence_no,t.code;
$function$;

revoke all on function public.my_institutional_task_dashboard(uuid) from public;
grant execute on function public.my_institutional_task_dashboard(uuid) to authenticated;
