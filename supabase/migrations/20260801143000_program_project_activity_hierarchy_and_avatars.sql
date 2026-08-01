-- Portefeuille AIAC : Programme -> Projet -> Activité, et photos de profil.
-- La CLI Supabase n'est pas installée dans l'environnement ; ce fichier suit
-- néanmoins le format de migration horodaté utilisé par le projet.

do $$
begin
  if exists (select 1 from public.projects where program_id is null) then
    raise exception 'Migration bloquée : des projets sans programme existent encore';
  end if;
  if exists (select 1 from public.activities where project_id is null) then
    raise exception 'Migration bloquée : des activités sans projet existent encore';
  end if;
end;
$$;

update public.activities activity
set program_id = project.program_id
from public.projects project
where activity.project_id = project.id
  and activity.program_id is distinct from project.program_id;

alter table public.projects drop constraint if exists projects_program_id_fkey;
alter table public.projects
  add constraint projects_program_id_fkey
  foreign key (program_id) references public.programs(id) on delete restrict;
alter table public.projects alter column program_id set not null;

alter table public.activities drop constraint if exists activities_project_id_fkey;
alter table public.activities drop constraint if exists activities_program_id_fkey;
alter table public.activities drop constraint if exists activities_check;
alter table public.activities
  add constraint activities_project_id_fkey
  foreign key (project_id) references public.projects(id) on delete restrict;
alter table public.activities
  add constraint activities_program_id_fkey
  foreign key (program_id) references public.programs(id) on delete restrict;
alter table public.activities alter column project_id set not null;
alter table public.activities alter column program_id set not null;

create or replace function private.sync_activity_program_from_project()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  parent_program_id uuid;
begin
  select program_id into parent_program_id
  from public.projects
  where id = new.project_id;

  if parent_program_id is null then
    raise exception 'Le projet sélectionné doit appartenir à un programme';
  end if;

  new.program_id := parent_program_id;
  return new;
end;
$$;

revoke all on function private.sync_activity_program_from_project() from public, anon, authenticated;

drop trigger if exists activities_sync_program_from_project on public.activities;
create trigger activities_sync_program_from_project
before insert or update of project_id, program_id on public.activities
for each row execute function private.sync_activity_program_from_project();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'aiac-avatars',
  'aiac-avatars',
  true,
  5242880,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatar_insert_own_folder" on storage.objects;
create policy "avatar_insert_own_folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'aiac-avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "avatar_select_own_folder" on storage.objects;
create policy "avatar_select_own_folder"
on storage.objects for select to authenticated
using (
  bucket_id = 'aiac-avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "avatar_update_own_folder" on storage.objects;
create policy "avatar_update_own_folder"
on storage.objects for update to authenticated
using (
  bucket_id = 'aiac-avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'aiac-avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "avatar_delete_own_folder" on storage.objects;
create policy "avatar_delete_own_folder"
on storage.objects for delete to authenticated
using (
  bucket_id = 'aiac-avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
