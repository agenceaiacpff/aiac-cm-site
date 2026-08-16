create or replace function private.is_active_approved_user(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = uid
      and p.status = 'active'
      and p.registration_state = 'approved'
  );
$$;

create or replace function private.can_contribute_activity_task(target_id uuid, uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_approved_user(uid)
    and exists (
      select 1
      from public.activity_tasks t
      where t.id = target_id
        and t.status in ('planned', 'active')
    );
$$;

create or replace function public.list_activity_task_counts()
returns table(activity_id uuid, task_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select t.activity_id, count(*)::bigint
  from public.activity_tasks t
  where private.is_active_approved_user(auth.uid())
  group by t.activity_id
  order by t.activity_id;
$$;

create or replace function public.institutional_reporting_structure_catalog()
returns table(
  body_id uuid,
  body_code text,
  body_name text,
  program_id uuid,
  program_code text,
  program_name text,
  project_id uuid,
  project_code text,
  project_name text,
  activity_id uuid,
  activity_code text,
  activity_title text,
  activity_status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    b.id,
    b.code,
    b.name,
    pg.id,
    pg.code,
    pg.name,
    pr.id,
    pr.code,
    pr.name,
    a.id,
    a.code,
    a.title,
    a.status
  from public.governance_bodies b
  join public.programs pg on pg.body_id = b.id
  join public.projects pr on pr.program_id = pg.id
  join public.activities a on a.project_id = pr.id
  where private.is_active_approved_user(auth.uid())
    and b.status = 'active'
    and pg.status not in ('cancelled')
    and pr.status not in ('cancelled')
    and a.status not in ('cancelled')
  order by b.code, pg.code, pr.code, a.code;
$$;

create or replace function public.institutional_reporting_tasks(target_activity_id uuid)
returns table(
  task_id uuid,
  activity_id uuid,
  task_code text,
  task_title text,
  task_description text,
  expected_output text,
  task_sequence_no integer,
  assigned_to uuid,
  due_date date,
  requires_evidence boolean,
  requires_attendance boolean,
  task_status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    t.id,
    t.activity_id,
    t.code,
    t.title,
    t.description,
    t.expected_output,
    t.sequence_no,
    t.assigned_to,
    t.due_date,
    t.requires_evidence,
    t.requires_attendance,
    t.status
  from public.activity_tasks t
  where private.is_active_approved_user(auth.uid())
    and t.activity_id = target_activity_id
    and t.status in ('planned', 'active')
  order by t.sequence_no, t.code;
$$;

revoke all on function public.list_activity_task_counts() from public, anon;
revoke all on function public.institutional_reporting_structure_catalog() from public, anon;
revoke all on function public.institutional_reporting_tasks(uuid) from public, anon;
grant execute on function public.list_activity_task_counts() to authenticated;
grant execute on function public.institutional_reporting_structure_catalog() to authenticated;
grant execute on function public.institutional_reporting_tasks(uuid) to authenticated;
