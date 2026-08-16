create or replace function private.guard_program_cycle_integrity()
returns trigger language plpgsql security definer set search_path=''
as $$
declare dependent bigint;
begin
  if tg_table_name='programs' then
    if new.body_id is distinct from old.body_id then
      select count(*) into dependent from public.task_reports r join public.activity_tasks t on t.id=r.task_id join public.activities a on a.id=t.activity_id join public.projects p on p.id=a.project_id where p.program_id=old.id;
      if dependent>0 then raise exception 'Déplacement refusé : ce programme possède déjà % rapport(s) historiques.',dependent; end if;
    end if;
    if new.status='completed' and old.status is distinct from 'completed' and exists(select 1 from public.projects p where p.program_id=old.id and p.status not in ('completed','cancelled')) then
      raise exception 'Le programme ne peut pas être terminé tant que tous ses projets ne sont pas terminés ou annulés';
    end if;
  elsif tg_table_name='projects' then
    if new.program_id is distinct from old.program_id then
      select count(*) into dependent from public.task_reports r join public.activity_tasks t on t.id=r.task_id join public.activities a on a.id=t.activity_id where a.project_id=old.id;
      if dependent>0 then raise exception 'Déplacement refusé : ce projet possède déjà % rapport(s) historiques.',dependent; end if;
    end if;
    if new.status='completed' and old.status is distinct from 'completed' and exists(select 1 from public.activities a where a.project_id=old.id and a.status not in ('completed','cancelled')) then
      raise exception 'Le projet ne peut pas être terminé tant que toutes ses activités ne sont pas terminées ou annulées';
    end if;
  elsif tg_table_name='activities' then
    if new.project_id is distinct from old.project_id then
      select count(*) into dependent from public.task_reports r join public.activity_tasks t on t.id=r.task_id where t.activity_id=old.id;
      if dependent>0 then raise exception 'Déplacement refusé : cette activité possède déjà % rapport(s) historiques.',dependent; end if;
    end if;
    if new.status='completed' and old.status is distinct from 'completed' and exists(select 1 from public.activity_tasks t where t.activity_id=old.id and t.status not in ('completed','cancelled')) then
      raise exception 'L’activité ne peut pas être terminée tant que toutes ses tâches ne sont pas terminées ou annulées';
    end if;
  elsif tg_table_name='activity_tasks' then
    if new.activity_id is distinct from old.activity_id and exists(select 1 from public.task_reports r where r.task_id=old.id) then
      raise exception 'Déplacement refusé : cette tâche possède déjà un historique de rapport';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists programs_cycle_integrity on public.programs;
create trigger programs_cycle_integrity before update on public.programs for each row execute function private.guard_program_cycle_integrity();
drop trigger if exists projects_cycle_integrity on public.projects;
create trigger projects_cycle_integrity before update on public.projects for each row execute function private.guard_program_cycle_integrity();
drop trigger if exists activities_cycle_integrity on public.activities;
create trigger activities_cycle_integrity before update on public.activities for each row execute function private.guard_program_cycle_integrity();
drop trigger if exists activity_tasks_cycle_integrity on public.activity_tasks;
create trigger activity_tasks_cycle_integrity before update on public.activity_tasks for each row execute function private.guard_program_cycle_integrity();

create or replace function private.sync_project_program_to_activities()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if new.program_id is distinct from old.program_id then update public.activities set program_id=new.program_id where project_id=new.id; end if;
  return new;
end;
$$;
drop trigger if exists projects_sync_activity_program on public.projects;
create trigger projects_sync_activity_program after update of program_id on public.projects
for each row execute function private.sync_project_program_to_activities();
