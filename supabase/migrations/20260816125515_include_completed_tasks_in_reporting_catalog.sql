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
set search_path=''
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
    and t.status in ('planned','active','completed','cancelled')
  order by t.sequence_no, t.code;
$$;

revoke all on function public.institutional_reporting_tasks(uuid) from public, anon;
grant execute on function public.institutional_reporting_tasks(uuid) to authenticated;
