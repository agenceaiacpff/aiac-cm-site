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
  task_id uuid, task_code text, task_title text, task_sequence_no integer,
  task_status text, task_due_date date, task_assigned_to uuid,
  task_requires_evidence boolean, task_requires_attendance boolean
)
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
    and (target_body_id is null or b.id=target_body_id)
    and (target_program_id is null or pg.id=target_program_id)
    and (target_project_id is null or pr.id=target_project_id)
    and (target_activity_id is null or a.id=target_activity_id)
    and (target_task_id is null or t.id=target_task_id)
  order by b.code,pg.code,pr.code,a.code,t.sequence_no,t.code;
$function$;

revoke all on function public.institutional_structure_dataset(uuid,uuid,uuid,uuid,uuid) from public;
grant execute on function public.institutional_structure_dataset(uuid,uuid,uuid,uuid,uuid) to authenticated;
