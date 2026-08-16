drop policy if exists programs_reporting_read on public.programs;
create policy programs_reporting_read
on public.programs
for select
to authenticated
using (private.is_active_approved_user());

drop policy if exists projects_reporting_read on public.projects;
create policy projects_reporting_read
on public.projects
for select
to authenticated
using (private.is_active_approved_user());

drop policy if exists activities_reporting_read on public.activities;
create policy activities_reporting_read
on public.activities
for select
to authenticated
using (private.is_active_approved_user());

drop policy if exists activity_tasks_reporting_read on public.activity_tasks;
create policy activity_tasks_reporting_read
on public.activity_tasks
for select
to authenticated
using (private.is_active_approved_user());
