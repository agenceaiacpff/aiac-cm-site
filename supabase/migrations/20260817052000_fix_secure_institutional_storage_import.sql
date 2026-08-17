create or replace function public.finalize_institutional_storage_import(
  target_file_name text,
  target_storage_path text,
  target_mime_type text,
  target_size_bytes bigint,
  target_checksum_sha256 text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  uid uuid := auth.uid();
  cat public.institutional_resource_catalog%rowtype;
  doc public.documents%rowtype;
  target_document_id uuid;
  target_folder_id uuid;
  was_created boolean := false;
  next_version integer;
  linked_roles integer := 0;
  expected_prefix text;
begin
  if uid is null or not (private.is_super_admin(uid) and private.has_aal2()) then
    raise exception 'Super-administration AAL2 requise';
  end if;

  if target_file_name is null or btrim(target_file_name)='' then
    raise exception 'Nom de fichier manquant';
  end if;
  if target_size_bytes is null or target_size_bytes < 1 or target_size_bytes > 15728640 then
    raise exception 'Taille de fichier invalide';
  end if;

  expected_prefix := uid::text || '/institutional-library/';
  if target_storage_path is null or left(target_storage_path,char_length(expected_prefix)) <> expected_prefix then
    raise exception 'Chemin de stockage institutionnel invalide';
  end if;

  if not exists(
    select 1 from storage.objects o
    where o.bucket_id='aiac-documents' and o.name=target_storage_path
  ) then
    raise exception 'Fichier physique introuvable dans le stockage';
  end if;

  select * into cat
  from public.institutional_resource_catalog r
  where r.source_file_name=target_file_name
  limit 1;

  if cat.id is not null and cat.document_id is not null then
    select * into doc from public.documents d where d.id=cat.document_id for update;
  end if;

  if doc.id is null then
    select * into doc
    from public.documents d
    where d.institutional_library=true and d.file_name=target_file_name
    order by d.created_at
    limit 1
    for update;
  end if;

  if doc.id is null then
    select f.id into target_folder_id
    from public.document_folders f
    where f.name='Référentiel institutionnel' and f.parent_id is null
    order by f.created_at
    limit 1;

    insert into public.documents(
      owner_id,title,file_url,file_name,mime_type,size_bytes,visibility,folder_id,
      classification,document_status,institutional_library,download_policy,
      secure_view_only,source_reference
    ) values (
      uid,
      regexp_replace(target_file_name,'\.[^.]+$',''),
      target_storage_path,
      target_file_name,
      target_mime_type,
      target_size_bytes,
      'explicit',
      target_folder_id,
      coalesce(cat.classification,'internal'),
      'approved',
      true,
      'standard',
      false,
      coalesce(cat.source_reference,'AIAC-BULK:' || target_file_name)
    ) returning * into doc;
    was_created := true;
  else
    update public.documents d
    set file_url=target_storage_path,
        file_name=target_file_name,
        mime_type=target_mime_type,
        size_bytes=target_size_bytes,
        classification=coalesce(cat.classification,d.classification),
        institutional_library=true,
        document_status='approved',
        source_reference=coalesce(cat.source_reference,d.source_reference)
    where d.id=doc.id
    returning * into doc;
  end if;

  target_document_id := doc.id;

  select coalesce(max(v.version_number),0)+1 into next_version
  from public.document_versions v
  where v.document_id=target_document_id;

  insert into public.document_versions(
    document_id,version_number,storage_path,file_name,mime_type,size_bytes,
    checksum_sha256,change_note,created_by
  ) values (
    target_document_id,next_version,target_storage_path,target_file_name,target_mime_type,
    target_size_bytes,target_checksum_sha256,
    case when was_created then 'Import institutionnel initial' else 'Synchronisation de la bibliothèque AIAC' end,
    uid
  );

  update public.documents d
  set document_status='approved',
      institutional_library=true,
      classification=coalesce(cat.classification,d.classification)
  where d.id=target_document_id;

  if cat.id is not null then
    update public.institutional_resource_catalog r
    set document_id=target_document_id,
        availability='available_in_platform'
    where r.id=cat.id;

    delete from public.institutional_document_role_access a
    where a.document_id=target_document_id;

    insert into public.institutional_document_role_access(
      document_id,role_key,can_view,can_download,can_upload_version,can_manage
    )
    select target_document_id,l.role_key,true,true,false,false
    from public.institutional_resource_role_links l
    where l.resource_id=cat.id
    on conflict(document_id,role_key) do update
      set can_view=excluded.can_view,
          can_download=excluded.can_download;

    get diagnostics linked_roles = row_count;
  end if;

  return jsonb_build_object(
    'document_id',target_document_id,
    'created',was_created,
    'version_number',next_version,
    'catalog_linked',(cat.id is not null),
    'role_count',linked_roles
  );
end;
$$;

revoke all on function public.finalize_institutional_storage_import(text,text,text,bigint,text) from public,anon;
grant execute on function public.finalize_institutional_storage_import(text,text,text,bigint,text) to authenticated;
