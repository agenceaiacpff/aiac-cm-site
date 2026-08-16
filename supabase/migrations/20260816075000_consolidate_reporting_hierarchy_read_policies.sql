drop policy if exists programs_reporting_read on public.programs;
drop policy if exists programs_select on public.programs;
create policy programs_select
on public.programs
for select
to authenticated
using (private.is_active_approved_user());

drop policy if exists projects_reporting_read on public.projects;
drop policy if exists projects_select on public.projects;
create policy projects_select
on public.projects
for select
to authenticated
using (private.is_active_approved_user());

drop policy if exists activities_reporting_read on public.activities;
drop policy if exists activities_select on public.activities;
create policy activities_select
on public.activities
for select
to authenticated
using (private.is_active_approved_user());

drop policy if exists activity_tasks_reporting_read on public.activity_tasks;
drop policy if exists activity_tasks_select_own on public.activity_tasks;
drop policy if exists activity_tasks_select on public.activity_tasks;
create policy activity_tasks_select
on public.activity_tasks
for select
to authenticated
using (private.is_active_approved_user());
