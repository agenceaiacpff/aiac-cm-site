-- Corrige la portée hiérarchique des lectures/agrégations institutionnelles.
-- Un organe parent inclut désormais ses organes descendants (coordination, antenne, etc.).
-- Une portée NULL conserve le sens institutionnel « Tous ».

create or replace function public.institutional_reporting_programs(target_body_id uuid)
returns table(program_id uuid, program_code text, program_name text, program_status text)
language sql
stable
security definer
set search_path = ''
as $$
  select pg.id, pg.code, pg.name, pg.status
  from public.programs pg
  where private.is_active_approved_user(auth.uid())
    and (target_body_id is null or private.body_in_position_scope(target_body_id, pg.body_id))
    and pg.status <> 'cancelled'
  order by pg.code;
$$;

-- Catalogue de filtres : une même donnée est exposée dans son organe propriétaire
-- et dans chacun de ses parents institutionnels. Il alimente les sélecteurs « Tous »
-- sans modifier la propriété réelle des programmes/projets/activités.
create or replace function public.institutional_reporting_filter_catalog()
returns table(
  scope_body_id uuid,
  body_id uuid, body_code text, body_name text,
  program_id uuid, program_code text, program_name text, program_status text,
  project_id uuid, project_code text, project_name text, project_status text,
  activity_id uuid, activity_code text, activity_title text, activity_status text
)
language sql
stable
security definer
set search_path = ''
as $$
  with recursive body_scope as (
    select
      b.id as body_id,
      b.id as scope_body_id,
      b.parent_body_id,
      b.reporting_body_id,
      array[b.id]::uuid[] as visited
    from public.governance_bodies b
    where b.status = 'active'

    union all

    select
      s.body_id,
      p.id as scope_body_id,
      p.parent_body_id,
      p.reporting_body_id,
      s.visited || p.id
    from body_scope s
    join public.governance_bodies p
      on p.id = coalesce(s.parent_body_id, s.reporting_body_id)
    where p.status = 'active'
      and not (p.id = any(s.visited))
  )
  select distinct
    s.scope_body_id,
    b.id, b.code, b.name,
    pg.id, pg.code, pg.name, pg.status,
    pr.id, pr.code, pr.name, pr.status,
    a.id, a.code, a.title, a.status
  from body_scope s
  join public.governance_bodies b on b.id = s.body_id
  join public.programs pg on pg.body_id = b.id and pg.status <> 'cancelled'
  left join public.projects pr on pr.program_id = pg.id and pr.status <> 'cancelled'
  left join public.activities a on a.project_id = pr.id and a.status <> 'cancelled'
  where private.is_active_approved_user(auth.uid())
  order by s.scope_body_id, b.code, pg.code, pr.code nulls first, a.code nulls first;
$$;

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
    and (target_body_id is null or private.body_in_position_scope(target_body_id, b.id))
    and (target_program_id is null or pg.id=target_program_id)
    and (target_project_id is null or pr.id=target_project_id)
    and (target_activity_id is null or a.id=target_activity_id)
    and (target_task_id is null or t.id=target_task_id)
    and (period_from is null or coalesce(r.period_end,r.execution_date)>=period_from)
    and (period_to is null or coalesce(r.period_start,r.execution_date)<=period_to)
  order by b.code,pg.code,pr.code,a.code,t.sequence_no,r.execution_date,r.report_number;
$function$;

create or replace function public.institutional_report_scope_summary(
  target_body_id uuid default null,
  target_program_id uuid default null,
  target_project_id uuid default null,
  target_activity_id uuid default null,
  target_task_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  with scoped as (
    select b.id body_id,pg.id program_id,pr.id project_id,a.id activity_id,t.id task_id,t.status task_status
    from public.activity_tasks t
    join public.activities a on a.id=t.activity_id
    join public.projects pr on pr.id=a.project_id
    join public.programs pg on pg.id=pr.program_id
    join public.governance_bodies b on b.id=pg.body_id
    where private.is_active_approved_user(auth.uid())
      and (target_body_id is null or private.body_in_position_scope(target_body_id, b.id))
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
$function$;

create or replace function public.institutional_structure_dataset(
  target_body_id uuid default null,
  target_program_id uuid default null,
  target_project_id uuid default null,
  target_activity_id uuid default null,
  target_task_id uuid default null
)
returns table(
  body_id uuid, body_code text, body_name text,
  program_id uuid, program_code text, program_name text, program_status text,
  project_id uuid, project_code text, project_name text, project_status text,
  activity_id uuid, activity_code text, activity_title text, activity_status text,
  task_id uuid, task_code text, task_title text, task_sequence_no integer, task_status text,
  task_due_date date, task_assigned_to uuid, task_requires_evidence boolean, task_requires_attendance boolean
)
language sql
stable
security definer
set search_path to ''
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
  select
    b.id,b.code,b.name,
    pg.id,pg.code,pg.name,pg.status,
    pr.id,pr.code,pr.name,pr.status,
    a.id,a.code,a.title,a.status,
    t.id,t.code,t.title,t.sequence_no,t.status,t.due_date,t.assigned_to,
    t.requires_evidence,t.requires_attendance
  from public.activity_tasks t
  join public.activities a on a.id=t.activity_id
  join public.projects pr on pr.id=a.project_id
  join public.programs pg on pg.id=pr.program_id
  join public.governance_bodies b on b.id=pg.body_id
  cross join actor x
  left join memberships m on m.project_id=pr.id
  where x.active
    and (
      x.admin_ok
      or t.assigned_to=x.uid
      or t.created_by=x.uid
      or a.manager_id=x.uid
      or a.created_by=x.uid
      or pg.manager_id=x.uid
      or m.project_id is not null
    )
    and (target_body_id is null or private.body_in_position_scope(target_body_id, b.id))
    and (target_program_id is null or pg.id=target_program_id)
    and (target_project_id is null or pr.id=target_project_id)
    and (target_activity_id is null or a.id=target_activity_id)
    and (target_task_id is null or t.id=target_task_id)
  order by b.code,pg.code,pr.code,a.code,t.sequence_no,t.code;
$function$;

create or replace function public.my_institutional_task_dashboard(target_body_id uuid default null)
returns table(
  body_id uuid, body_code text, body_name text,
  program_id uuid, program_code text, program_name text,
  project_id uuid, project_code text, project_name text,
  activity_id uuid, activity_code text, activity_title text,
  task_id uuid, task_code text, task_title text, task_sequence_no integer,
  task_status text, due_date date,
  latest_report_id uuid, latest_report_number text, latest_report_status text, latest_report_updated_at timestamptz
)
language sql
stable
security definer
set search_path to ''
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
    and (target_body_id is null or private.body_in_position_scope(target_body_id, b.id))
  order by t.due_date asc nulls last,b.code,pg.code,pr.code,a.code,t.sequence_no,t.code;
$function$;

create or replace function public.institutional_staffing_catalog(
  target_body_id uuid default null,
  target_region text default null,
  target_status text default null,
  search_text text default null,
  max_rows integer default 500
)
returns table(
  slot_id uuid, slot_code text, position_code text, title text, role_key text,
  body_id uuid, body_code text, body_name text, body_type text, region text, locality text,
  project_id uuid, project_code text, project_name text,
  slot_status text, max_occupants integer, filled_count bigint,
  supervisor_slot_code text, technical_supervisor_slot_code text, source_basis text
)
language sql
stable
security definer
set search_path to ''
as $function$
 select s.id,s.slot_code,pd.code,pd.title,pd.role_key,b.id,b.code,b.name,b.body_type,b.region,b.locality,pr.id,pr.code,pr.name,s.status,s.max_occupants,
  (select count(*) from public.position_assignments pa where pa.slot_id=s.id and pa.status='active'),sup.slot_code,tech.slot_code,s.source_basis
 from public.position_slots s
 join public.position_definitions pd on pd.id=s.position_id
 join public.governance_bodies b on b.id=s.body_id
 left join public.projects pr on pr.id=s.project_id
 left join public.position_slots sup on sup.id=s.supervisor_slot_id
 left join public.position_slots tech on tech.id=s.technical_supervisor_slot_id
 where private.has_position_capability('staffing.view',auth.uid(),b.id,s.project_id)
   and (target_body_id is null or private.body_in_position_scope(target_body_id, b.id))
   and (target_region is null or lower(coalesce(b.region,''))=lower(target_region))
   and (target_status is null or s.status=target_status)
   and (search_text is null or concat_ws(' ',s.slot_code,pd.title,b.code,b.name,b.region,b.locality,pr.code,pr.name) ilike '%'||search_text||'%')
 order by b.code,pr.code nulls first,pd.title,s.slot_code
 limit least(greatest(max_rows,1),2000);
$function$;

create or replace function public.case_aggregate_metrics(
  target_body_id uuid default null,
  target_project_id uuid default null,
  target_activity_id uuid default null,
  target_task_id uuid default null,
  period_from date default null,
  period_to date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare uid uuid:=auth.uid(); bid uuid; result jsonb;
begin
 if uid is null then raise exception 'Authentification requise'; end if;
 if target_project_id is not null then
   select pg.body_id into bid
   from public.projects pr
   join public.programs pg on pg.id=pr.program_id
   where pr.id=target_project_id;
 else
   bid:=target_body_id;
 end if;
 if bid is not null and not private.has_position_capability('case.aggregate.read',uid,bid,target_project_id) then
   raise exception 'Accès aux agrégats non autorisé';
 end if;
 if bid is null and not exists(
   select 1
   from public.position_assignments pa
   join public.position_capabilities pc on pc.position_id=pa.position_id
   where pa.profile_id=uid and pa.status='active'
     and pc.capability_key='case.aggregate.read' and pc.scope_mode='institution'
 ) then
   raise exception 'Sélectionnez un périmètre autorisé';
 end if;
 select jsonb_build_object(
  'total',count(*),
  'open',count(*) filter(where c.status<>'closed'),
  'closed',count(*) filter(where c.status='closed'),
  'urgent',count(*) filter(where c.priority='urgent'),
  'by_type',coalesce((
    select jsonb_object_agg(case_type,n)
    from (
      select c2.case_type,count(*) n
      from public.case_files c2
      where c2.aggregate_reporting_allowed
        and (target_body_id is null or private.body_in_position_scope(target_body_id, c2.body_id))
        and (target_project_id is null or c2.project_id=target_project_id)
        and (target_activity_id is null or c2.activity_id=target_activity_id)
        and (target_task_id is null or c2.task_id=target_task_id)
        and (period_from is null or coalesce(c2.incident_date,c2.opened_at::date)>=period_from)
        and (period_to is null or coalesce(c2.incident_date,c2.opened_at::date)<=period_to)
      group by c2.case_type
    ) x
  ),'{}'::jsonb),
  'by_status',coalesce((
    select jsonb_object_agg(status,n)
    from (
      select c3.status,count(*) n
      from public.case_files c3
      where c3.aggregate_reporting_allowed
        and (target_body_id is null or private.body_in_position_scope(target_body_id, c3.body_id))
        and (target_project_id is null or c3.project_id=target_project_id)
        and (target_activity_id is null or c3.activity_id=target_activity_id)
        and (target_task_id is null or c3.task_id=target_task_id)
        and (period_from is null or coalesce(c3.incident_date,c3.opened_at::date)>=period_from)
        and (period_to is null or coalesce(c3.incident_date,c3.opened_at::date)<=period_to)
      group by c3.status
    ) y
  ),'{}'::jsonb)
 ) into result
 from public.case_files c
 where c.aggregate_reporting_allowed
   and (target_body_id is null or private.body_in_position_scope(target_body_id, c.body_id))
   and (target_project_id is null or c.project_id=target_project_id)
   and (target_activity_id is null or c.activity_id=target_activity_id)
   and (target_task_id is null or c.task_id=target_task_id)
   and (period_from is null or coalesce(c.incident_date,c.opened_at::date)>=period_from)
   and (period_to is null or coalesce(c.incident_date,c.opened_at::date)<=period_to);
 return result;
end $function$;

revoke all on function public.institutional_reporting_filter_catalog() from public, anon;
grant execute on function public.institutional_reporting_filter_catalog() to authenticated;

-- Les fonctions existantes conservent leurs droits et signatures ; on réaffirme
-- explicitement l'accès authentifié aux deux catalogues utilisés par les filtres.
revoke all on function public.institutional_reporting_programs(uuid) from public, anon;
grant execute on function public.institutional_reporting_programs(uuid) to authenticated;
