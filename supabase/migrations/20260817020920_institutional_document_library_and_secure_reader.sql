create table if not exists public.institutional_document_blobs(
  document_id uuid primary key references public.documents(id) on delete cascade,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  checksum_sha256 text,
  content bytea not null,
  imported_at timestamptz not null default now()
);
revoke all on public.institutional_document_blobs from anon,authenticated;

create table if not exists public.institutional_document_previews(
  document_id uuid primary key references public.documents(id) on delete cascade,
  html_content text not null,
  updated_at timestamptz not null default now()
);
revoke all on public.institutional_document_previews from anon,authenticated;

create table if not exists public.institutional_document_role_access(
  document_id uuid not null references public.documents(id) on delete cascade,
  role_key text not null,
  can_view boolean not null default true,
  can_download boolean not null default true,
  can_upload_version boolean not null default false,
  can_manage boolean not null default false,
  primary key(document_id,role_key)
);
alter table public.institutional_document_role_access enable row level security;
drop policy if exists institutional_document_role_access_read on public.institutional_document_role_access;
create policy institutional_document_role_access_read on public.institutional_document_role_access for select to authenticated
using(private.is_active_approved_user(auth.uid()));

alter table public.documents
  add column if not exists institutional_library boolean not null default false,
  add column if not exists download_policy text not null default 'standard',
  add column if not exists secure_view_only boolean not null default false,
  add column if not exists source_reference text;
do $$ begin
  alter table public.documents add constraint documents_download_policy_check check(download_policy in('standard','ca_only','none'));
exception when duplicate_object then null; end $$;

create or replace function private.has_active_position_role(target_role_key text,uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path=''
as $$ select exists(
 select 1 from public.position_assignments pa join public.position_definitions pd on pd.id=pa.position_id
 where pa.profile_id=uid and pa.status='active' and pa.start_date<=current_date and (pa.end_date is null or pa.end_date>=current_date) and pd.role_key=target_role_key
); $$;

create or replace function private.is_active_ca_member(uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path=''
as $$ select exists(
 select 1 from public.position_assignments pa join public.governance_bodies gb on gb.id=pa.body_id
 where pa.profile_id=uid and pa.status='active' and pa.start_date<=current_date and (pa.end_date is null or pa.end_date>=current_date)
 and (upper(gb.code)='CA' or lower(gb.name) like '%conseil d’administration%' or lower(gb.name) like '%conseil d''administration%')
); $$;

create or replace function private.can_access_document(target_id uuid,uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path=''
as $$
 select private.is_active_user(uid) and exists(
   select 1 from public.documents d where d.id=target_id and (
     d.owner_id=uid
     or exists(select 1 from public.document_access_grants g where g.document_id=d.id and g.user_id=uid and (g.expires_at is null or g.expires_at>now()))
     or exists(select 1 from public.institutional_document_role_access r join public.position_assignments pa on pa.profile_id=uid and pa.status='active' and pa.start_date<=current_date and (pa.end_date is null or pa.end_date>=current_date) join public.position_definitions pd on pd.id=pa.position_id and pd.role_key=r.role_key where r.document_id=d.id and r.can_view)
     or (d.institutional_library and d.secure_view_only and exists(select 1 from public.position_assignments pa where pa.profile_id=uid and pa.status='active' and pa.start_date<=current_date and (pa.end_date is null or pa.end_date>=current_date)))
     or (d.conversation_id is not null and private.is_conversation_member(d.conversation_id,uid))
     or (d.case_id is not null and private.can_access_case(d.case_id,uid))
     or (d.project_id is not null and private.is_project_member(d.project_id,uid))
     or (d.request_id is not null and private.can_access_request(d.request_id,uid))
     or (d.body_id is not null and d.classification in ('internal','confidential') and private.has_position_in_body(d.body_id,uid))
     or (d.classification='internal' and d.visibility='staff' and private.is_staff(uid))
   )
 );
$$;

create or replace function private.can_download_document(target_id uuid,uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path=''
as $$
 select private.can_access_document(target_id,uid) and exists(
  select 1 from public.documents d where d.id=target_id and (
   (d.download_policy='standard' and (
      d.owner_id=uid
      or exists(select 1 from public.document_access_grants g where g.document_id=d.id and g.user_id=uid and g.can_download and (g.expires_at is null or g.expires_at>now()))
      or exists(select 1 from public.institutional_document_role_access r join public.position_assignments pa on pa.profile_id=uid and pa.status='active' and pa.start_date<=current_date and (pa.end_date is null or pa.end_date>=current_date) join public.position_definitions pd on pd.id=pa.position_id and pd.role_key=r.role_key where r.document_id=d.id and r.can_download)
      or private.can_manage_document(d.id,uid)
   ))
   or (d.download_policy='ca_only' and private.is_active_ca_member(uid))
  )
 );
$$;

create or replace function public.document_access_capabilities(target_document_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.documents%rowtype;
begin
 if not private.can_access_document(target_document_id) then raise exception 'Document inaccessible'; end if;
 select * into d from public.documents where id=target_document_id;
 return jsonb_build_object('can_view',true,'can_download',private.can_download_document(target_document_id),'can_manage',private.can_manage_document(target_document_id),'secure_view_only',d.secure_view_only,'download_policy',d.download_policy,'institutional_library',d.institutional_library);
end $$;
grant execute on function public.document_access_capabilities(uuid) to authenticated;

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
 select * into b from public.institutional_document_blobs where document_id=target_document_id;
 if not found then return null; end if;
 insert into public.document_access_logs(document_id,user_id,action,details) values(target_document_id,auth.uid(),case when target_purpose='download' then 'download' else 'view' end,jsonb_build_object('source','institutional_blob'));
 return jsonb_build_object('file_name',b.file_name,'mime_type',b.mime_type,'size_bytes',b.size_bytes,'checksum_sha256',b.checksum_sha256,'content_base64',encode(b.content,'base64'));
end $$;
grant execute on function public.institutional_document_payload(uuid,text) to authenticated;

create or replace function public.institutional_document_secure_preview(target_document_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.documents%rowtype; h text; p public.profiles%rowtype;
begin
 if not private.can_access_document(target_document_id) then raise exception 'Lecture non autorisée'; end if;
 select * into d from public.documents where id=target_document_id;
 select html_content into h from public.institutional_document_previews where document_id=target_document_id;
 select * into p from public.profiles where id=auth.uid();
 insert into public.document_access_logs(document_id,user_id,action,details) values(target_document_id,auth.uid(),'view',jsonb_build_object('source','secure_preview'));
 return jsonb_build_object('id',d.id,'title',d.title,'file_name',d.file_name,'classification',d.classification,'html_content',coalesce(h,''),'can_download',private.can_download_document(target_document_id),'viewer_name',coalesce(p.full_name,p.email,'Utilisateur AIAC'),'secure_view_only',d.secure_view_only);
end $$;
grant execute on function public.institutional_document_secure_preview(uuid) to authenticated;

create or replace function public.my_institutional_documents() returns table(
 id uuid,title text,file_name text,mime_type text,classification text,category text,resource_code text,required boolean,can_download boolean,secure_view_only boolean,source_reference text
) language sql stable security definer set search_path='' as $$
 select d.id,d.title,d.file_name,d.mime_type,d.classification,r.category,r.resource_code,coalesce(l.required,false),private.can_download_document(d.id),d.secure_view_only,d.source_reference
 from public.documents d left join public.institutional_resource_catalog r on r.document_id=d.id
 left join public.institutional_resource_role_links l on l.resource_id=r.id and exists(
   select 1 from public.position_assignments pa join public.position_definitions pd on pd.id=pa.position_id
   where pa.profile_id=auth.uid() and pa.status='active' and pa.start_date<=current_date and (pa.end_date is null or pa.end_date>=current_date) and pd.role_key=l.role_key
 )
 where d.institutional_library and private.can_access_document(d.id)
 group by d.id,d.title,d.file_name,d.mime_type,d.classification,r.category,r.resource_code,l.required,d.secure_view_only,d.source_reference
 order by coalesce(r.category,'Documents'),d.title;
$$;
grant execute on function public.my_institutional_documents() to authenticated;