-- CMS public des organes subsidiaires et agrégation du site officiel AIAC.

create or replace function private.can_manage_public_content(target_body uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select (select private.is_active_user()) and (
    ((select private.is_admin()) and (select private.has_aal2()))
    or exists (
      select 1 from public.position_assignments pa
      where pa.profile_id=(select auth.uid()) and pa.body_id=target_body
        and pa.status='active' and pa.start_date<=current_date
        and (pa.end_date is null or pa.end_date>=current_date)
    )
    or exists (
      select 1 from public.workforce_assignments wa
      where wa.profile_id=(select auth.uid()) and wa.body_id=target_body
        and wa.status='active' and wa.start_date<=current_date
        and (wa.end_date is null or wa.end_date>=current_date)
    )
    or exists (
      select 1
      from public.institutional_members im
      join public.body_memberships bm on bm.member_id=im.id
      where im.profile_id=(select auth.uid()) and im.status='active'
        and bm.body_id=target_body and bm.status='active'
        and bm.start_date<=current_date
        and (bm.end_date is null or bm.end_date>=current_date)
    )
  );
$$;

revoke all on function private.can_manage_public_content(uuid) from public, anon, service_role;
grant execute on function private.can_manage_public_content(uuid) to authenticated;

create or replace function public.get_manageable_public_body_ids()
returns table(body_id uuid)
language sql
stable
security definer
set search_path=''
as $$
  select b.id
  from public.governance_bodies b
  where b.body_type='subsidiary_body' and b.status='active'
    and private.can_manage_public_content(b.id)
  order by b.code;
$$;

revoke all on function public.get_manageable_public_body_ids() from public, anon, service_role;
grant execute on function public.get_manageable_public_body_ids() to authenticated;

create table public.public_content_items (
  id uuid primary key default gen_random_uuid(),
  body_id uuid not null references public.governance_bodies(id) on delete restrict,
  content_type text not null check (content_type in ('project','report','agenda','gallery','video','announcement')),
  subtype text,
  title text not null check (char_length(btrim(title)) between 3 and 240),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  summary text not null check (char_length(btrim(summary)) between 10 and 1200),
  content text not null check (char_length(btrim(content)) between 10 and 50000),
  location text,
  activity_date date,
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'draft' check (status in ('draft','review','published','archived')),
  project_id uuid references public.projects(id) on delete set null,
  program_id uuid references public.programs(id) on delete set null,
  partnership_id uuid references public.partnerships(id) on delete set null,
  cover_image_path text,
  document_path text,
  external_url text,
  is_featured boolean not null default false,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  approved_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at>=starts_at),
  check (status<>'published' or published_at is not null)
);

create table public.public_content_media (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.public_content_items(id) on delete cascade,
  media_type text not null check (media_type in ('image','video','audio','document')),
  storage_path text,
  external_url text,
  title text,
  caption text,
  alt_text text,
  occurred_on date,
  sort_order integer not null default 0 check (sort_order>=0),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check ((storage_path is not null) <> (external_url is not null))
);

create table public.guestbook_entries (
  id uuid primary key default gen_random_uuid(),
  body_id uuid references public.governance_bodies(id) on delete restrict,
  author_name text not null check (char_length(btrim(author_name)) between 2 and 120),
  organization text,
  message text not null check (char_length(btrim(message)) between 10 and 2000),
  status text not null default 'pending' check (status in ('pending','published','rejected')),
  moderator_id uuid references auth.users(id) on delete set null,
  moderation_note text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status<>'published' or published_at is not null)
);

create index public_content_items_body_id_idx on public.public_content_items(body_id);
create index public_content_items_created_by_idx on public.public_content_items(created_by);
create index public_content_items_project_id_idx on public.public_content_items(project_id) where project_id is not null;
create index public_content_items_program_id_idx on public.public_content_items(program_id) where program_id is not null;
create index public_content_items_partnership_id_idx on public.public_content_items(partnership_id) where partnership_id is not null;
create index public_content_items_public_feed_idx on public.public_content_items(content_type,published_at desc,id desc) where status='published';
create index public_content_items_body_feed_idx on public.public_content_items(body_id,content_type,published_at desc,id desc) where status='published';
create index public_content_media_content_sort_idx on public.public_content_media(content_id,sort_order,id);
create index public_content_media_created_by_idx on public.public_content_media(created_by);
create index guestbook_entries_public_feed_idx on public.guestbook_entries(published_at desc,id desc) where status='published';
create index guestbook_entries_body_status_idx on public.guestbook_entries(body_id,status,created_at desc);
create index guestbook_entries_moderator_idx on public.guestbook_entries(moderator_id) where moderator_id is not null;

create or replace function private.prepare_public_content()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if new.status='published' and (tg_op='INSERT' or old.status is distinct from 'published') then
    new.published_at=coalesce(new.published_at,now());
    new.approved_by=(select auth.uid());
  elsif new.status<>'published' and tg_op='UPDATE' and old.status='published' then
    new.published_at=null;
    new.approved_by=null;
  end if;
  return new;
end;
$$;

create or replace function private.prepare_guestbook_entry()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if new.status='published' and (tg_op='INSERT' or old.status is distinct from 'published') then
    new.published_at=coalesce(new.published_at,now());
    new.moderator_id=(select auth.uid());
  elsif new.status<>'published' and tg_op='UPDATE' and old.status='published' then
    new.published_at=null;
    new.moderator_id=(select auth.uid());
  end if;
  return new;
end;
$$;

create trigger public_content_prepare before insert or update on public.public_content_items
for each row execute function private.prepare_public_content();
create trigger public_content_touch before update on public.public_content_items
for each row execute function private.touch_updated_at();
create trigger public_content_audit after insert or update or delete on public.public_content_items
for each row execute function private.audit_operational_change();
create trigger public_content_media_audit after insert or update or delete on public.public_content_media
for each row execute function private.audit_operational_change();
create trigger guestbook_prepare before insert or update on public.guestbook_entries
for each row execute function private.prepare_guestbook_entry();
create trigger guestbook_touch before update on public.guestbook_entries
for each row execute function private.touch_updated_at();
create trigger guestbook_audit after insert or update or delete on public.guestbook_entries
for each row execute function private.audit_operational_change();

alter table public.public_content_items enable row level security;
alter table public.public_content_media enable row level security;
alter table public.guestbook_entries enable row level security;

create policy public_content_items_public_read on public.public_content_items for select to anon, authenticated
using (status='published');
create policy public_content_items_managed_read on public.public_content_items for select to authenticated
using ((select private.can_manage_public_content(body_id)));
create policy public_content_items_insert on public.public_content_items for insert to authenticated
with check (created_by=(select auth.uid()) and (select private.can_manage_public_content(body_id)));
create policy public_content_items_update on public.public_content_items for update to authenticated
using ((select private.can_manage_public_content(body_id)))
with check ((select private.can_manage_public_content(body_id)));

create policy public_content_media_public_read on public.public_content_media for select to anon, authenticated
using (exists (
  select 1 from public.public_content_items i
  where i.id=content_id and i.status='published'
));
create policy public_content_media_managed_read on public.public_content_media for select to authenticated
using (exists (
  select 1 from public.public_content_items i
  where i.id=content_id and (select private.can_manage_public_content(i.body_id))
));
create policy public_content_media_insert on public.public_content_media for insert to authenticated
with check (created_by=(select auth.uid()) and exists (
  select 1 from public.public_content_items i where i.id=content_id and (select private.can_manage_public_content(i.body_id))
));
create policy public_content_media_update on public.public_content_media for update to authenticated
using (exists (
  select 1 from public.public_content_items i where i.id=content_id and (select private.can_manage_public_content(i.body_id))
)) with check (exists (
  select 1 from public.public_content_items i where i.id=content_id and (select private.can_manage_public_content(i.body_id))
));
create policy public_content_media_delete on public.public_content_media for delete to authenticated
using (exists (
  select 1 from public.public_content_items i where i.id=content_id and (select private.can_manage_public_content(i.body_id))
));

create policy guestbook_entries_public_read on public.guestbook_entries for select to anon, authenticated
using (status='published');
create policy guestbook_entries_managed_read on public.guestbook_entries for select to authenticated
using ((
  body_id is not null and (select private.can_manage_public_content(body_id))
) or (
  body_id is null and (select private.is_admin()) and (select private.has_aal2())
));
create policy guestbook_entries_submit on public.guestbook_entries for insert to anon, authenticated
with check (status='pending' and moderator_id is null and published_at is null);
create policy guestbook_entries_moderate on public.guestbook_entries for update to authenticated
using ((body_id is not null and (select private.can_manage_public_content(body_id))) or
  (body_id is null and (select private.is_admin()) and (select private.has_aal2())))
with check ((body_id is not null and (select private.can_manage_public_content(body_id))) or
  (body_id is null and (select private.is_admin()) and (select private.has_aal2())));

grant select on public.public_content_items, public.public_content_media, public.guestbook_entries to anon, authenticated;
grant insert on public.guestbook_entries to anon, authenticated;
grant insert,update on public.public_content_items to authenticated;
grant insert,update,delete on public.public_content_media to authenticated;
grant update on public.guestbook_entries to authenticated;

create policy governance_bodies_public_subsidiary_select on public.governance_bodies for select to anon, authenticated
using (body_type='subsidiary_body' and status='active');
grant select(id,code,name,description,body_type,status,subsidiary_code,region,locality) on public.governance_bodies to anon, authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values (
  'aiac-public-media','aiac-public-media',true,52428800,
  array[
    'image/jpeg','image/png','image/webp','image/gif','image/svg+xml',
    'application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'audio/mpeg','audio/mp4','audio/ogg','audio/wav',
    'video/mp4','video/webm','video/quicktime'
  ]::text[]
)
on conflict (id) do update set
  public=excluded.public,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

create or replace function private.can_manage_public_media(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare folder text;
begin
  folder=(storage.foldername(object_name))[1];
  if folder is null or folder !~ '^[0-9a-fA-F-]{36}$' then return false; end if;
  return private.can_manage_public_content(folder::uuid);
exception when invalid_text_representation then
  return false;
end;
$$;

revoke all on function private.can_manage_public_media(text) from public, anon, service_role;
grant execute on function private.can_manage_public_media(text) to authenticated;

create policy aiac_public_media_insert on storage.objects for insert to authenticated
with check (bucket_id='aiac-public-media' and (select private.can_manage_public_media(name)));
create policy aiac_public_media_select on storage.objects for select to anon, authenticated
using (bucket_id='aiac-public-media');
create policy aiac_public_media_update on storage.objects for update to authenticated
using (bucket_id='aiac-public-media' and (select private.can_manage_public_media(name)))
with check (bucket_id='aiac-public-media' and (select private.can_manage_public_media(name)));
create policy aiac_public_media_delete on storage.objects for delete to authenticated
using (bucket_id='aiac-public-media' and (select private.can_manage_public_media(name)));
