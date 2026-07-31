-- Index de support des clés étrangères ajoutées pendant la phase 2.
create index projects_created_by_idx on public.projects(created_by);
create index project_members_added_by_idx on public.project_members(added_by) where added_by is not null;
create index beneficiaries_created_by_idx on public.beneficiaries(created_by);
