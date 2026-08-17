create or replace function public.institutional_document_payload(target_document_id uuid,target_purpose text default 'view') returns jsonb
language plpgsql security definer set search_path='' as $$
declare b public.institutional_document_blobs%rowtype; d public.documents%rowtype;
begin
 select * into d from public.documents where id=target_document_id;
 if not found then raise exception 'Document introuvable'; end if;
 if target_purpose='download' then
   if not private.can_download_document(target_document_id) then raise exception 'Téléchargement non autorisé'; end if;
 else
   if not private.can_access_document(target_document_id) then raise exception 'Lecture non autorisée'; end if;
 end if;
 select * into b from public.institutional_document_blobs where document_id=target_document_id and octet_length(content)=size_bytes and size_bytes>0;
 if not found then return null; end if;
 insert into public.document_access_logs(document_id,user_id,action,details) values(target_document_id,auth.uid(),case when target_purpose='download' then 'download' else 'view' end,jsonb_build_object('source','institutional_blob'));
 return jsonb_build_object('file_name',b.file_name,'mime_type',b.mime_type,'size_bytes',b.size_bytes,'checksum_sha256',b.checksum_sha256,'content_base64',encode(b.content,'base64'));
end $$;

drop function if exists public.my_institutional_documents();
create function public.my_institutional_documents() returns table(
 id uuid,title text,file_name text,mime_type text,classification text,category text,resource_code text,required boolean,can_download boolean,secure_view_only boolean,source_reference text,physical_available boolean,preview_available boolean
) language sql stable security definer set search_path='' as $$
 select d.id,d.title,d.file_name,d.mime_type,d.classification,r.category,r.resource_code,coalesce(bool_or(l.required),false),private.can_download_document(d.id),d.secure_view_only,d.source_reference,
 (exists(select 1 from public.institutional_document_blobs b where b.document_id=d.id and octet_length(b.content)=b.size_bytes and b.size_bytes>0) or (d.file_url is not null and d.file_url not like 'institutional-db://%')),
 exists(select 1 from public.institutional_document_previews pv where pv.document_id=d.id and char_length(pv.html_content)>0)
 from public.documents d left join public.institutional_resource_catalog r on r.document_id=d.id
 left join public.institutional_resource_role_links l on l.resource_id=r.id and exists(
   select 1 from public.position_assignments pa join public.position_definitions pd on pd.id=pa.position_id
   where pa.profile_id=auth.uid() and pa.status='active' and pa.start_date<=current_date and (pa.end_date is null or pa.end_date>=current_date) and pd.role_key=l.role_key
 )
 where d.institutional_library and private.can_access_document(d.id)
 group by d.id,d.title,d.file_name,d.mime_type,d.classification,r.category,r.resource_code,d.secure_view_only,d.source_reference
 order by coalesce(r.category,'Documents'),d.title;
$$;
grant execute on function public.my_institutional_documents() to authenticated;

create or replace function public.set_institutional_document_preview(target_document_id uuid,target_html text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if not (private.is_super_admin(auth.uid()) and private.has_aal2()) then raise exception 'Super-administration AAL2 requise'; end if;
 if not exists(select 1 from public.documents where id=target_document_id and institutional_library) then raise exception 'Document institutionnel introuvable'; end if;
 insert into public.institutional_document_previews(document_id,html_content,updated_at) values(target_document_id,coalesce(target_html,''),now())
 on conflict(document_id) do update set html_content=excluded.html_content,updated_at=now();
 return true;
end $$;
grant execute on function public.set_institutional_document_preview(uuid,text) to authenticated;