-- Durcissement après analyse Supabase : pas d'énumération du bucket public,
-- une seule politique SELECT par rôle et aucun RPC SECURITY DEFINER superflu.

drop policy if exists aiac_public_media_select on storage.objects;
drop policy if exists aiac_public_media_update on storage.objects;

drop function if exists public.get_manageable_public_body_ids();

create index if not exists public_content_items_approved_by_idx
on public.public_content_items(approved_by) where approved_by is not null;

drop policy if exists public_content_items_public_read on public.public_content_items;
drop policy if exists public_content_items_managed_read on public.public_content_items;
create policy public_content_items_public_read on public.public_content_items for select to anon
using (status='published');
create policy public_content_items_authenticated_read on public.public_content_items for select to authenticated
using (status='published' or (select private.can_manage_public_content(body_id)));

drop policy if exists public_content_media_public_read on public.public_content_media;
drop policy if exists public_content_media_managed_read on public.public_content_media;
create policy public_content_media_public_read on public.public_content_media for select to anon
using (exists (
  select 1 from public.public_content_items i where i.id=content_id and i.status='published'
));
create policy public_content_media_authenticated_read on public.public_content_media for select to authenticated
using (exists (
  select 1 from public.public_content_items i
  where i.id=content_id and (i.status='published' or (select private.can_manage_public_content(i.body_id)))
));

drop policy if exists guestbook_entries_public_read on public.guestbook_entries;
drop policy if exists guestbook_entries_managed_read on public.guestbook_entries;
create policy guestbook_entries_public_read on public.guestbook_entries for select to anon
using (status='published');
create policy guestbook_entries_authenticated_read on public.guestbook_entries for select to authenticated
using (status='published' or (
  body_id is not null and (select private.can_manage_public_content(body_id))
) or (
  body_id is null and (select private.is_admin()) and (select private.has_aal2())
));

drop policy if exists governance_bodies_public_subsidiary_select on public.governance_bodies;
drop policy if exists governance_bodies_select on public.governance_bodies;
create policy governance_bodies_public_subsidiary_select on public.governance_bodies for select to anon
using (body_type='subsidiary_body' and status='active');
create policy governance_bodies_authenticated_select on public.governance_bodies for select to authenticated
using ((select private.is_staff()) or (body_type='subsidiary_body' and status='active'));
