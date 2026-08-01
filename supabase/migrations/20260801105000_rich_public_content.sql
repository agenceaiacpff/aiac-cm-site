-- Contenu éditorial riche importé depuis HTML ou Word.

alter table public.public_content_items
  add column content_format text not null default 'plain'
    check (content_format in ('plain','html')),
  add column source_file_name text,
  add column source_mime_type text,
  add column source_imported_at timestamptz;

alter table public.public_content_items
  drop constraint public_content_items_content_check;

alter table public.public_content_items
  add constraint public_content_items_content_check
  check (char_length(btrim(content)) between 10 and 5000000);
