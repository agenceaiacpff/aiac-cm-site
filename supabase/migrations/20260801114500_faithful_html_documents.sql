-- Distingue les fragments éditables des documents HTML complets rendus en iframe sandboxé.

alter table public.public_content_items
  drop constraint if exists public_content_items_content_format_check;

alter table public.public_content_items
  add constraint public_content_items_content_format_check
  check (content_format in ('plain','html','html_document'));

-- Les fichiers HTML déjà importés utilisent le nouveau moteur et retrouvent leurs images.
-- Une réimportation du fichier source reste nécessaire pour les styles supprimés auparavant.
update public.public_content_items
set content_format='html_document'
where source_mime_type in ('text/html','application/xhtml+xml')
  and content_format='html';
