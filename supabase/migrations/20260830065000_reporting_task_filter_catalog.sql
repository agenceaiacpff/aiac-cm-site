create or replace function public.institutional_reporting_task_filter_catalog()
returns table(
  scope_body_id uuid,
  program_id uuid,
  project_id uuid,
  activity_id uuid,
  task_id uuid,
  task_code text,
  task_title text,
  task_sequence_no integer,
  task_status text
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
    pg.id,
    pr.id,
    a.id,
    t.id,
    t.code,
    t.title,
    t.sequence_no,
    t.status
  from body_scope s
  join public.programs pg on pg.body_id = s.body_id and pg.status <> 'cancelled'
  join public.projects pr on pr.program_id = pg.id and pr.status <> 'cancelled'
  join public.activities a on a.project_id = pr.id and a.status <> 'cancelled'
  join public.activity_tasks t on t.activity_id = a.id
  where private.is_active_approved_user(auth.uid())
    and t.status in ('planned','active','completed','cancelled')
  order by s.scope_body_id, pg.id, pr.id, a.id, t.sequence_no, t.code;
$$;

revoke all on function public.institutional_reporting_task_filter_catalog() from public, anon;
grant execute on function public.institutional_reporting_task_filter_catalog() to authenticated;
