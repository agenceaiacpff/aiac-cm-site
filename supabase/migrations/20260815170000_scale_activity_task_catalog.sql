drop function if exists public.list_activity_task_counts();
create function public.list_activity_task_counts()
returns table(activity_id uuid, task_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select task.activity_id, count(*)::bigint
  from public.activity_tasks task
  group by task.activity_id;
$$;

revoke all on function public.list_activity_task_counts() from public, anon;
grant execute on function public.list_activity_task_counts() to authenticated;

alter table public.activity_tasks
  drop constraint if exists activity_tasks_title_check;

alter table public.activity_tasks
  add constraint activity_tasks_title_check
  check (char_length(title) between 3 and 500);

