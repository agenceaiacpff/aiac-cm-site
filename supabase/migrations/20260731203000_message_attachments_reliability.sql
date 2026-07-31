-- Fiabilise les pièces jointes de messagerie sans élargir l'accès aux documents.

-- Une fonction STABLE qui relit public.documents ne voit pas la ligne en cours
-- d'insertion dans INSERT ... RETURNING. Le propriétaire doit donc être autorisé
-- directement par la politique SELECT pour que PostgREST puisse retourner la ligne.
drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents for select to authenticated
using (
  owner_id=(select auth.uid())
  or (select private.can_access_document(id))
);

-- Un utilisateur ne peut référencer comme document ou version qu'un objet placé
-- dans son propre répertoire Storage.
drop policy if exists documents_insert on public.documents;
create policy documents_insert on public.documents for insert to authenticated
with check (
  (select private.is_active_user())
  and owner_id=(select auth.uid())
  and (storage.foldername(file_url))[1]=(select auth.uid())::text
  and (
    (select private.can_use_operations())
    or (conversation_id is not null and (select private.is_conversation_member(conversation_id)))
  )
  and (project_id is null or (select private.can_contribute_project(project_id)))
  and (case_id is null or (select private.can_access_case(case_id)))
  and (conversation_id is null or (select private.is_conversation_member(conversation_id)))
);

drop policy if exists document_versions_insert on public.document_versions;
create policy document_versions_insert on public.document_versions for insert to authenticated
with check (
  created_by=(select auth.uid())
  and (storage.foldername(storage_path))[1]=(select auth.uid())::text
  and (select private.can_upload_document_version(document_id))
);

-- Formats institutionnels, images, archives et médias courants. Les formats
-- exécutables ou actifs (HTML, JavaScript, SVG, etc.) restent volontairement exclus.
update storage.buckets
set allowed_mime_types=array[
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
  'application/rtf',
  'text/rtf',
  'text/plain',
  'text/csv',
  'text/markdown',
  'application/json',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/tiff',
  'image/heic',
  'image/heif',
  'application/zip',
  'application/x-zip-compressed',
  'application/vnd.rar',
  'application/x-rar-compressed',
  'application/x-7z-compressed',
  'application/x-tar',
  'application/gzip',
  'audio/mpeg',
  'audio/mp4',
  'audio/aac',
  'audio/wav',
  'audio/ogg',
  'audio/flac',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-matroska'
]::text[]
where id='aiac-documents';

-- Les quatre écritures de métadonnées sont atomiques : aucun message ne reste
-- désormais enregistré sans sa pièce jointe lorsque l'une des étapes échoue.
create or replace function public.send_message_with_attachment(
  p_conversation_id uuid,
  p_body text,
  p_storage_path text,
  p_file_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_classification text
) returns table(sent_message_id uuid,sent_document_id uuid)
language plpgsql
security invoker
set search_path=''
as $$
declare
  actor uuid=(select auth.uid());
  created_message uuid;
  created_document uuid;
  normalized_body text=nullif(btrim(p_body),'');
  accepted_mime_types constant text[]=array[
    'application/pdf','application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.oasis.opendocument.text',
    'application/vnd.oasis.opendocument.spreadsheet',
    'application/vnd.oasis.opendocument.presentation',
    'application/rtf','text/rtf','text/plain','text/csv','text/markdown','application/json',
    'image/jpeg','image/png','image/webp','image/gif','image/bmp','image/tiff','image/heic','image/heif',
    'application/zip','application/x-zip-compressed','application/vnd.rar','application/x-rar-compressed',
    'application/x-7z-compressed','application/x-tar','application/gzip',
    'audio/mpeg','audio/mp4','audio/aac','audio/wav','audio/ogg','audio/flac',
    'video/mp4','video/webm','video/quicktime','video/x-matroska'
  ]::text[];
begin
  if actor is null or not private.is_active_user(actor) then
    raise exception 'Compte actif requis';
  end if;
  if not private.is_conversation_member(p_conversation_id,actor) then
    raise exception 'Accès refusé à cette conversation';
  end if;
  if normalized_body is null and p_storage_path is null then
    raise exception 'Ajoutez un message ou une pièce jointe';
  end if;

  if p_storage_path is not null then
    if p_file_name is null or btrim(p_file_name)='' or p_mime_type is null or p_size_bytes is null then
      raise exception 'Métadonnées de pièce jointe incomplètes';
    end if;
    if p_size_bytes < 1 or p_size_bytes > 15728640 then
      raise exception 'La pièce jointe doit être comprise entre 1 octet et 15 Mo';
    end if;
    if not (p_mime_type=any(accepted_mime_types)) then
      raise exception 'Ce format de fichier n''est pas autorisé';
    end if;
    if (storage.foldername(p_storage_path))[1]<>actor::text then
      raise exception 'Chemin de stockage non autorisé';
    end if;
    if p_classification not in ('internal','confidential','restricted') then
      raise exception 'Classification documentaire invalide';
    end if;
  end if;

  insert into public.messages(conversation_id,sender_id,body)
  values(p_conversation_id,actor,coalesce(normalized_body,'Pièce jointe'))
  returning id into created_message;

  if p_storage_path is not null then
    insert into public.documents(
      owner_id,title,file_url,file_name,mime_type,size_bytes,
      visibility,classification,conversation_id,document_status
    ) values (
      actor,p_file_name,p_storage_path,p_file_name,p_mime_type,p_size_bytes,
      'explicit',p_classification,p_conversation_id,'draft'
    ) returning id into created_document;

    insert into public.document_versions(
      document_id,version_number,storage_path,file_name,mime_type,size_bytes,change_note,created_by
    ) values (
      created_document,1,p_storage_path,p_file_name,p_mime_type,p_size_bytes,
      'Pièce jointe au message',actor
    );

    insert into public.message_attachments(message_id,document_id,attached_by)
    values(created_message,created_document,actor);
  end if;

  return query select created_message,created_document;
end;
$$;

revoke all on function public.send_message_with_attachment(uuid,text,text,text,text,bigint,text) from public,anon;
grant execute on function public.send_message_with_attachment(uuid,text,text,text,text,bigint,text) to authenticated;
