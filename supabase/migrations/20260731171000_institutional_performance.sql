-- Index de couverture signalés par le conseiller de performance Supabase.
create index governance_bodies_created_by_idx on public.governance_bodies(created_by);
create index institutional_members_created_by_idx on public.institutional_members(created_by);
