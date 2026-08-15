-- Un rapport de tâche approuvé clôt la tâche et propage la clôture vers le haut.
-- Un parent n'est clôturé que si tous ses enfants sont terminés ou annulés et
-- qu'au moins un enfant est effectivement terminé.

create or replace function private.finalize_program_hierarchy_from_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_activity_id uuid;
  target_project_id uuid;
  target_program_id uuid;
begin
  if new.status <> 'approved' or old.status = 'approved' then
    return new;
  end if;

  select t.activity_id, a.project_id, coalesce(a.program_id, p.program_id)
    into target_activity_id, target_project_id, target_program_id
  from public.activity_tasks t
  join public.activities a on a.id = t.activity_id
  left join public.projects p on p.id = a.project_id
  where t.id = new.task_id;

  update public.activity_tasks
  set status = 'completed'
  where id = new.task_id and status <> 'cancelled';

  if target_activity_id is not null
    and exists (
      select 1 from public.activity_tasks t
      where t.activity_id = target_activity_id and t.status = 'completed'
    )
    and not exists (
      select 1 from public.activity_tasks t
      where t.activity_id = target_activity_id
        and t.status not in ('completed', 'cancelled')
    )
  then
    update public.activities
    set status = 'completed'
    where id = target_activity_id and status <> 'cancelled';
  end if;

  if target_project_id is not null
    and exists (
      select 1 from public.activities a
      where a.project_id = target_project_id and a.status = 'completed'
    )
    and not exists (
      select 1 from public.activities a
      where a.project_id = target_project_id
        and a.status not in ('completed', 'cancelled')
    )
  then
    update public.projects
    set status = 'completed'
    where id = target_project_id and status <> 'cancelled';
  end if;

  if target_program_id is not null
    and exists (
      select 1 from public.projects p
      where p.program_id = target_program_id and p.status = 'completed'
    )
    and not exists (
      select 1 from public.projects p
      where p.program_id = target_program_id
        and p.status not in ('completed', 'cancelled')
    )
  then
    update public.programs
    set status = 'completed'
    where id = target_program_id and status <> 'cancelled';
  end if;

  return new;
end;
$$;

revoke all on function private.finalize_program_hierarchy_from_report() from public, anon, authenticated;

drop trigger if exists task_reports_finalize_hierarchy on public.task_reports;
create trigger task_reports_finalize_hierarchy
after update of status on public.task_reports
for each row
execute function private.finalize_program_hierarchy_from_report();
