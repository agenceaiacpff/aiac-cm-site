drop function if exists public.my_institutional_documents();
create function public.my_institutional_documents() returns table(
 id uuid,title text,file_name text,mime_type text,classification text,category text,resource_code text,required boolean,can_download boolean,secure_view_only boolean,source_reference text,physical_available boolean,preview_available boolean
) language sql stable security definer set search_path='' as $$
 select d.id,d.title,d.file_name,d.mime_type,d.classification,r.category,r.resource_code,coalesce(bool_or(l.required),false),private.can_download_document(d.id),d.secure_view_only,d.source_reference,
 (exists(select 1 from public.institutional_document_blobs b where b.document_id=d.id) or d.file_url not like 'institutional-db://%'),
 exists(select 1 from public.institutional_document_previews pv where pv.document_id=d.id)
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

create or replace function public.add_report_collaboration_comment(target_session_id uuid,target_body text) returns uuid
language plpgsql security definer set search_path='' as $$
declare cid uuid;
begin
 if not private.can_access_report_collaboration(target_session_id) then raise exception 'Session inaccessible'; end if;
 if char_length(btrim(coalesce(target_body,''))) not between 1 and 5000 then raise exception 'Commentaire invalide'; end if;
 insert into public.report_collaboration_comments(session_id,user_id,body) values(target_session_id,auth.uid(),btrim(target_body)) returning id into cid;
 return cid;
end $$;
grant execute on function public.add_report_collaboration_comment(uuid,text) to authenticated;

create or replace function public.review_report_collaboration_change(target_session_id uuid,target_change_id uuid,target_disposition text,target_restore boolean default false) returns boolean
language plpgsql security definer set search_path='' as $$
declare s public.report_collaboration_sessions%rowtype; ch public.report_collaboration_changes%rowtype; nr bigint;
begin
 select * into s from public.report_collaboration_sessions where id=target_session_id for update;
 if not found or s.owner_id<>auth.uid() then raise exception 'Seul l’auteur peut arbitrer les contributions'; end if;
 if target_disposition not in('accepted','rejected') then raise exception 'Décision invalide'; end if;
 select * into ch from public.report_collaboration_changes where id=target_change_id and session_id=s.id;
 if not found then raise exception 'Contribution introuvable'; end if;
 update public.report_collaboration_changes set disposition=target_disposition,reviewed_by=auth.uid(),reviewed_at=now() where id=ch.id;
 if target_restore and target_disposition='accepted' then
   nr:=s.revision+1;
   update public.report_collaboration_sessions set live_html=ch.content_html,revision=nr,updated_at=now() where id=s.id;
   insert into public.report_collaboration_changes(session_id,user_id,revision_before,revision_after,content_html,note,disposition,reviewed_by,reviewed_at)
   values(s.id,auth.uid(),s.revision,nr,ch.content_html,'Version retenue par l’auteur','accepted',auth.uid(),now());
 end if;
 return true;
end $$;
grant execute on function public.review_report_collaboration_change(uuid,uuid,text,boolean) to authenticated;

create or replace function public.remove_report_collaborator(target_session_id uuid,target_user_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare oid uuid;
begin
 select owner_id into oid from public.report_collaboration_sessions where id=target_session_id;
 if oid is distinct from auth.uid() then raise exception 'Seul l’auteur gère les collaborateurs'; end if;
 delete from public.report_collaborators where session_id=target_session_id and user_id=target_user_id;
 return true;
end $$;
grant execute on function public.remove_report_collaborator(uuid,uuid) to authenticated;

do $$ begin alter publication supabase_realtime add table public.report_collaboration_sessions; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.report_collaboration_changes; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.report_collaboration_comments; exception when duplicate_object then null; end $$;