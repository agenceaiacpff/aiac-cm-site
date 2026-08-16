create or replace function public.institutional_reporting_bodies()
returns table(body_id uuid, body_code text, body_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.code, b.name
  from public.governance_bodies b
  where private.is_active_approved_user(auth.uid())
    and b.status = 'active'
  order by case when b.code like 'OS-%' then 0 else 1 end, b.code;
$$;

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
    and pg.body_id = target_body_id
    and pg.status <> 'cancelled'
  order by pg.code;
$$;

create or replace function public.institutional_reporting_projects(target_program_id uuid)
returns table(project_id uuid, project_code text, project_name text, project_status text)
language sql
stable
security definer
set search_path = ''
as $$
  select pr.id, pr.code, pr.name, pr.status
  from public.projects pr
  where private.is_active_approved_user(auth.uid())
    and pr.program_id = target_program_id
    and pr.status <> 'cancelled'
  order by pr.code;
$$;

create or replace function public.institutional_reporting_activities(target_project_id uuid)
returns table(activity_id uuid, activity_code text, activity_title text, activity_status text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.code, a.title, a.status
  from public.activities a
  where private.is_active_approved_user(auth.uid())
    and a.project_id = target_project_id
    and a.status <> 'cancelled'
  order by a.code;
$$;

revoke all on function public.institutional_reporting_bodies() from public, anon;
revoke all on function public.institutional_reporting_programs(uuid) from public, anon;
revoke all on function public.institutional_reporting_projects(uuid) from public, anon;
revoke all on function public.institutional_reporting_activities(uuid) from public, anon;
grant execute on function public.institutional_reporting_bodies() to authenticated;
grant execute on function public.institutional_reporting_programs(uuid) to authenticated;
grant execute on function public.institutional_reporting_projects(uuid) to authenticated;
grant execute on function public.institutional_reporting_activities(uuid) to authenticated;
