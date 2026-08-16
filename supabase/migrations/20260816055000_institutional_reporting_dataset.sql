create or replace function public.institutional_reporting_dataset(
  target_body_id uuid default null,
  target_program_id uuid default null,
  target_project_id uuid default null,
  target_activity_id uuid default null,
  target_task_id uuid default null,
  period_from date default null,
  period_to date default null,
  include_non_approved boolean default false
)
returns table(
  body_id uuid, body_code text, body_name text,
  program_id uuid, program_code text, program_name text,
  project_id uuid, project_code text, project_name text,
  activity_id uuid, activity_code text, activity_title text,
  task_id uuid, task_code text, task_title text, task_sequence_no integer,
  report_id uuid, report_number text, report_title text, report_status text,
  execution_date date, period_start date, period_end date,
  summary text, outcomes text, challenges text, recommendations text,
  women_count integer, men_count integer, girls_count integer, boys_count integer,
  disability_count integer, vulnerable_count integer, participant_total integer,
  indicators jsonb, approved_at timestamptz
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
    t.id,t.code,t.title,t.sequence_no,
    r.id,r.report_number,coalesce(r.title,r.report_number),r.status,
    r.execution_date,r.period_start,r.period_end,r.summary,r.outcomes,r.challenges,r.recommendations,
    r.women_count,r.men_count,r.girls_count,r.boys_count,r.disability_count,r.vulnerable_count,
    (coalesce(r.women_count,0)+coalesce(r.men_count,0)+coalesce(r.girls_count,0)+coalesce(r.boys_count,0))::integer,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'code',iv.indicator_code,'label',iv.indicator_label,'unit',iv.unit,
        'baseline',iv.baseline_value,'target',iv.target_value,'achieved',iv.achieved_value,
        'verification_source',iv.verification_source,'notes',iv.notes
      ) order by iv.indicator_code)
      from public.task_report_indicator_values iv
      where iv.report_id=r.id
    ),'[]'::jsonb),
    r.approved_at
  from public.task_reports r
  join public.activity_tasks t on t.id=r.task_id
  join public.activities a on a.id=t.activity_id
  join public.projects pr on pr.id=a.project_id
  join public.programs pg on pg.id=pr.program_id
  join public.governance_bodies b on b.id=pg.body_id
  where private.can_view_task_report(r.id,auth.uid())
    and (include_non_approved or r.status='approved')
    and (target_body_id is null or b.id=target_body_id)
    and (target_program_id is null or pg.id=target_program_id)
    and (target_project_id is null or pr.id=target_project_id)
    and (target_activity_id is null or a.id=target_activity_id)
    and (target_task_id is null or t.id=target_task_id)
    and (period_from is null or coalesce(r.period_end,r.execution_date)>=period_from)
    and (period_to is null or coalesce(r.period_start,r.execution_date)<=period_to)
  order by b.code,pg.code,pr.code,a.code,t.sequence_no,r.execution_date,r.report_number;
$function$;

revoke all on function public.institutional_reporting_dataset(uuid,uuid,uuid,uuid,uuid,date,date,boolean) from public;
grant execute on function public.institutional_reporting_dataset(uuid,uuid,uuid,uuid,uuid,date,date,boolean) to authenticated;
