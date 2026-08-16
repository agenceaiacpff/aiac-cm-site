-- AIAC Messaging V2 — fonctions finales manquantes au snapshot cumulatif.

create or replace function public.send_conversation_message_v2(
 p_conversation_id uuid,p_body text default null,p_reply_to_id uuid default null,p_storage_path text default null,
 p_file_name text default null,p_mime_type text default null,p_size_bytes bigint default null,p_classification text default null
) returns table(sent_message_id uuid,sent_document_id uuid)
language plpgsql security definer set search_path=''
as $$
declare actor uuid:=auth.uid(); created_message uuid; created_document uuid; normalized_body text:=nullif(btrim(coalesce(p_body,'')),''); accepted_mime_types constant text[]=array[
'application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/vnd.oasis.opendocument.text','application/vnd.oasis.opendocument.spreadsheet','application/vnd.oasis.opendocument.presentation','application/rtf','text/rtf','text/plain','text/csv','text/markdown','application/json','image/jpeg','image/png','image/webp','image/gif','image/bmp','image/tiff','image/heic','image/heif','application/zip','application/x-zip-compressed','application/vnd.rar','application/x-rar-compressed','application/x-7z-compressed','application/x-tar','application/gzip','audio/mpeg','audio/mp4','audio/aac','audio/wav','audio/ogg','audio/flac','video/mp4','video/webm','video/quicktime','video/x-matroska']::text[];
begin
 if actor is null or not private.can_send_conversation_message(p_conversation_id,actor) then raise exception 'Vous ne pouvez pas envoyer de message dans cette conversation'; end if;
 if normalized_body is null and p_storage_path is null then raise exception 'Ajoutez un message ou une pièce jointe'; end if;
 if normalized_body is not null and char_length(normalized_body)>10000 then raise exception 'Message trop long'; end if;
 if p_reply_to_id is not null and not exists(select 1 from public.messages m where m.id=p_reply_to_id and m.conversation_id=p_conversation_id and m.deleted_at is null) then raise exception 'Message cité invalide'; end if;
 if p_storage_path is not null then
   if p_file_name is null or btrim(p_file_name)='' or p_mime_type is null or p_size_bytes is null then raise exception 'Métadonnées de pièce jointe incomplètes'; end if;
   if p_size_bytes<1 or p_size_bytes>15728640 then raise exception 'La pièce jointe doit être comprise entre 1 octet et 15 Mo'; end if;
   if not p_mime_type=any(accepted_mime_types) then raise exception 'Ce format de fichier n’est pas autorisé'; end if;
   if (storage.foldername(p_storage_path))[1]<>actor::text then raise exception 'Chemin de stockage non autorisé'; end if;
   if p_classification not in ('internal','confidential','restricted') then raise exception 'Classification documentaire invalide'; end if;
   if not exists(select 1 from storage.objects o where o.bucket_id='aiac-documents' and o.name=p_storage_path) then raise exception 'Le fichier téléversé est introuvable'; end if;
 end if;
 insert into public.messages(conversation_id,sender_id,body,reply_to_id) values(p_conversation_id,actor,coalesce(normalized_body,'Pièce jointe'),p_reply_to_id) returning id into created_message;
 if p_storage_path is not null then
   insert into public.documents(owner_id,title,file_url,file_name,mime_type,size_bytes,visibility,classification,conversation_id,document_status)
   values(actor,p_file_name,p_storage_path,p_file_name,p_mime_type,p_size_bytes,'explicit',p_classification,p_conversation_id,'draft') returning id into created_document;
   insert into public.document_versions(document_id,version_number,storage_path,file_name,mime_type,size_bytes,change_note,created_by)
   values(created_document,1,p_storage_path,p_file_name,p_mime_type,p_size_bytes,'Pièce jointe au message',actor);
   insert into public.message_attachments(message_id,document_id,attached_by) values(created_message,created_document,actor);
 end if;
 return query select created_message,created_document;
end;
$$;

create or replace function public.edit_conversation_message(p_message_id uuid,p_body text,p_reason text default null) returns public.messages
language plpgsql security definer set search_path=''
as $$
declare actor uuid:=auth.uid(); m public.messages%rowtype; admin_override boolean:=false; old_hash text;
begin
 if actor is null or not private.is_active_approved_user(actor) then raise exception 'Compte actif et approuvé requis'; end if;
 if char_length(trim(coalesce(p_body,'')))<1 or char_length(p_body)>10000 then raise exception 'Message invalide'; end if;
 select * into m from public.messages where id=p_message_id for update; if not found then raise exception 'Message introuvable'; end if;
 if not private.is_conversation_member(m.conversation_id,actor) then raise exception 'Ouvrez d’abord un accès autorisé à cette conversation'; end if;
 if m.deleted_at is not null then raise exception 'Un message supprimé ne peut plus être modifié'; end if;
 if m.sender_id=actor and m.created_at>=now()-interval '15 minutes' then null;
 elsif private.is_super_admin(actor) and private.has_aal2() then admin_override:=true; if char_length(trim(coalesce(p_reason,'')))<8 then raise exception 'Motif administratif obligatoire (8 caractères minimum)'; end if;
 else raise exception 'La modification par l’auteur est possible pendant 15 minutes'; end if;
 old_hash:=encode(digest(convert_to(m.body,'UTF8'),'sha256'),'hex');
 update public.messages set body=trim(p_body),edited_at=now(),edited_by=actor where id=m.id returning * into m;
 perform private.write_audit('message.edited','message',m.id,jsonb_build_object('conversation_id',m.conversation_id,'old_hash',old_hash,'new_hash',encode(digest(convert_to(m.body,'UTF8'),'sha256'),'hex'),'admin_override',admin_override,'reason',nullif(trim(coalesce(p_reason,'')),'')));
 return m;
end;
$$;

create or replace function public.delete_conversation_message(p_message_id uuid,p_reason text default null) returns public.messages
language plpgsql security definer set search_path=''
as $$
declare actor uuid:=auth.uid(); m public.messages%rowtype; admin_override boolean:=false; old_hash text;
begin
 if actor is null or not private.is_active_approved_user(actor) then raise exception 'Compte actif et approuvé requis'; end if;
 select * into m from public.messages where id=p_message_id for update; if not found then raise exception 'Message introuvable'; end if;
 if not private.is_conversation_member(m.conversation_id,actor) then raise exception 'Ouvrez d’abord un accès autorisé à cette conversation'; end if;
 if m.deleted_at is not null then return m; end if;
 if m.sender_id=actor and m.created_at>=now()-interval '15 minutes' then null;
 elsif private.is_super_admin(actor) and private.has_aal2() then admin_override:=true; if char_length(trim(coalesce(p_reason,'')))<8 then raise exception 'Motif administratif obligatoire (8 caractères minimum)'; end if;
 else raise exception 'La suppression par l’auteur est possible pendant 15 minutes'; end if;
 old_hash:=encode(digest(convert_to(m.body,'UTF8'),'sha256'),'hex');
 update public.messages set body='Message supprimé',deleted_at=now(),deleted_by=actor,deletion_reason=coalesce(nullif(trim(p_reason),''),case when admin_override then 'Suppression administrative' else 'Supprimé par son auteur' end),edited_at=now(),edited_by=actor where id=m.id returning * into m;
 update public.documents d set conversation_id=null,visibility='private',document_status='archived',archived_at=coalesce(archived_at,now()) where exists(select 1 from public.message_attachments ma where ma.message_id=m.id and ma.document_id=d.id);
 delete from public.notifications where entity_type='message' and entity_id=m.id;
 perform private.write_audit('message.deleted','message',m.id,jsonb_build_object('conversation_id',m.conversation_id,'old_hash',old_hash,'admin_override',admin_override,'reason',m.deletion_reason));
 return m;
end;
$$;

create or replace function public.update_conversation_member_role(p_conversation_id uuid,p_user_id uuid,p_member_role text) returns public.conversation_members
language plpgsql security definer set search_path=''
as $$
declare actor uuid:=auth.uid(); result public.conversation_members%rowtype; creator_id uuid;
begin
 if p_member_role not in ('manager','participant','observer') then raise exception 'Rôle de conversation invalide'; end if;
 if actor is null or not private.can_manage_conversation(p_conversation_id,actor) then raise exception 'Gestion de conversation non autorisée'; end if;
 select created_by into creator_id from public.conversations where id=p_conversation_id;
 if p_user_id=creator_id and p_member_role<>'manager' then raise exception 'Le créateur doit rester responsable'; end if;
 update public.conversation_members set member_role=p_member_role where conversation_id=p_conversation_id and user_id=p_user_id returning * into result;
 if not found then raise exception 'Participant introuvable'; end if;
 perform private.write_audit('conversation.member_role_changed','conversation',p_conversation_id,jsonb_build_object('user_id',p_user_id,'member_role',p_member_role));
 return result;
end;
$$;

create or replace function public.update_conversation_settings(p_conversation_id uuid,p_title text,p_sensitivity text,p_organization_unit_id uuid,p_assigned_to uuid) returns public.conversations
language plpgsql security definer set search_path=''
as $$
declare actor uuid:=auth.uid(); result public.conversations%rowtype;
begin
 if actor is null or not private.can_manage_conversation(p_conversation_id,actor) then raise exception 'Gestion de conversation non autorisée'; end if;
 if char_length(trim(coalesce(p_title,'')))<2 or char_length(trim(p_title))>180 then raise exception 'Titre invalide'; end if;
 if p_sensitivity not in ('standard','confidential','restricted','gbv_protection','hr','medical_psychosocial','whistleblowing') then raise exception 'Niveau de sensibilité invalide'; end if;
 if p_organization_unit_id is not null and not exists(select 1 from public.governance_bodies b where b.id=p_organization_unit_id and b.status='active') then raise exception 'Organe invalide'; end if;
 if p_assigned_to is not null and not exists(select 1 from public.conversation_members cm join public.profiles p on p.id=cm.user_id where cm.conversation_id=p_conversation_id and cm.user_id=p_assigned_to and cm.member_role='manager' and p.status='active' and p.registration_state='approved') then raise exception 'Le responsable principal doit être responsable de la conversation'; end if;
 perform set_config('aiac.messaging_admin','on',true);
 update public.conversations set title=trim(p_title),sensitivity=p_sensitivity,organization_unit_id=p_organization_unit_id,assigned_to=p_assigned_to where id=p_conversation_id returning * into result;
 perform private.write_audit('conversation.settings_updated','conversation',p_conversation_id,jsonb_build_object('title',result.title,'sensitivity',result.sensitivity,'organization_unit_id',result.organization_unit_id,'assigned_to',result.assigned_to));
 return result;
end;
$$;

create or replace function public.messaging_admin_catalog(p_search text default '',p_limit integer default 100)
returns table(id uuid,title text,sensitivity text,status text,organization_unit_id uuid,body_name text,created_by uuid,creator_name text,assigned_to uuid,assigned_name text,created_at timestamptz,updated_at timestamptz,member_count bigint,message_count bigint,last_message_at timestamptz)
language sql stable security definer set search_path=''
as $$
 select c.id,c.title,c.sensitivity,c.status,c.organization_unit_id,b.name,c.created_by,coalesce(pc.full_name,'Compte AIAC'),c.assigned_to,pa.full_name,c.created_at,c.updated_at,
   (select count(*) from public.conversation_members cm where cm.conversation_id=c.id),(select count(*) from public.messages m where m.conversation_id=c.id),(select max(m.created_at) from public.messages m where m.conversation_id=c.id)
 from public.conversations c left join public.governance_bodies b on b.id=c.organization_unit_id left join public.profiles pc on pc.id=c.created_by left join public.profiles pa on pa.id=c.assigned_to
 where private.is_super_admin(auth.uid()) and private.has_aal2() and (trim(coalesce(p_search,''))='' or c.title ilike '%'||trim(p_search)||'%' or coalesce(b.name,'') ilike '%'||trim(p_search)||'%' or coalesce(pc.full_name,'') ilike '%'||trim(p_search)||'%')
 order by c.updated_at desc limit greatest(1,least(coalesce(p_limit,100),200));
$$;

create or replace function public.superadmin_open_conversation_access(p_conversation_id uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare actor uuid:=auth.uid(); c public.conversations%rowtype; already_member boolean; added boolean:=false;
begin
 if actor is null or not private.is_super_admin(actor) or not private.has_aal2() then raise exception 'Super-administrateur avec MFA requis'; end if;
 if char_length(trim(coalesce(p_reason,'')))<8 then raise exception 'Motif administratif obligatoire (8 caractères minimum)'; end if;
 select * into c from public.conversations where id=p_conversation_id; if not found then raise exception 'Conversation introuvable'; end if;
 select exists(select 1 from public.conversation_members cm where cm.conversation_id=c.id and cm.user_id=actor) into already_member;
 if not already_member then perform set_config('aiac.messaging_admin','on',true); insert into public.conversation_members(conversation_id,user_id,member_role,added_by) values(c.id,actor,'manager',actor); added:=true; end if;
 insert into public.conversation_admin_access_log(conversation_id,actor_id,action,reason,membership_added) values(c.id,actor,'opened',trim(p_reason),added);
 perform private.write_audit('conversation.admin_access_opened','conversation',c.id,jsonb_build_object('reason',trim(p_reason),'membership_added',added));
 insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id)
 select distinct cm.user_id,'Accès administratif à une conversation','Un super-administrateur a ouvert un accès administratif journalisé à cette conversation. Motif : '||trim(p_reason),'/espace?tab=messages&conversation='||c.id::text,'message_admin','conversation',c.id
 from public.conversation_members cm where cm.conversation_id=c.id and cm.member_role='manager' and cm.user_id<>actor;
 return to_jsonb(c)||jsonb_build_object('membership_added',added);
end;
$$;

create or replace function public.superadmin_close_conversation_access(p_conversation_id uuid,p_reason text default 'Fin de l’intervention administrative') returns boolean
language plpgsql security definer set search_path=''
as $$
declare actor uuid:=auth.uid(); last_action text; should_remove boolean:=false;
begin
 if actor is null or not private.is_super_admin(actor) or not private.has_aal2() then raise exception 'Super-administrateur avec MFA requis'; end if;
 if char_length(trim(coalesce(p_reason,'')))<8 then raise exception 'Motif administratif obligatoire (8 caractères minimum)'; end if;
 select l.action,l.membership_added into last_action,should_remove from public.conversation_admin_access_log l where l.conversation_id=p_conversation_id and l.actor_id=actor order by l.created_at desc,l.id desc limit 1;
 if last_action='opened' and should_remove then perform set_config('aiac.messaging_admin','on',true); delete from public.conversation_members cm where cm.conversation_id=p_conversation_id and cm.user_id=actor; end if;
 insert into public.conversation_admin_access_log(conversation_id,actor_id,action,reason,membership_added) values(p_conversation_id,actor,'closed',trim(p_reason),false);
 perform private.write_audit('conversation.admin_access_closed','conversation',p_conversation_id,jsonb_build_object('reason',trim(p_reason),'membership_removed',(last_action='opened' and should_remove)));
 return true;
end;
$$;

create or replace function public.superadmin_purge_message(p_message_id uuid,p_confirmation text,p_reason text) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare actor uuid:=auth.uid(); m public.messages%rowtype; paths jsonb:='[]'::jsonb; docs uuid[]; snapshot jsonb;
begin
 if actor is null or not private.is_super_admin(actor) or not private.has_aal2() then raise exception 'Super-administrateur avec MFA requis'; end if;
 if trim(coalesce(p_confirmation,''))<>p_message_id::text then raise exception 'Confirmation incorrecte : saisissez l’identifiant complet du message'; end if;
 if char_length(trim(coalesce(p_reason,'')))<8 then raise exception 'Motif obligatoire (8 caractères minimum)'; end if;
 select * into m from public.messages where id=p_message_id for update; if not found then raise exception 'Message introuvable'; end if;
 if not private.is_conversation_member(m.conversation_id,actor) then raise exception 'Ouvrez d’abord un accès administratif journalisé à cette conversation'; end if;
 snapshot:=jsonb_build_object('id',m.id,'conversation_id',m.conversation_id,'sender_id',m.sender_id,'created_at',m.created_at,'body_hash',encode(digest(convert_to(m.body,'UTF8'),'sha256'),'hex'));
 select coalesce(array_agg(ma.document_id),'{}'::uuid[]) into docs from public.message_attachments ma where ma.message_id=m.id;
 select coalesce(jsonb_agg(v.storage_path),'[]'::jsonb) into paths from public.document_versions v join public.documents d on d.id=v.document_id where v.document_id=any(docs) and (d.conversation_id=m.conversation_id or (d.conversation_id is null and d.owner_id=m.sender_id and d.visibility='private' and d.document_status='archived'));
 delete from public.notifications where entity_type='message' and entity_id=m.id;
 delete from public.message_attachments where message_id=m.id;
 delete from public.document_access_logs where document_id=any(docs);
 delete from public.documents d where d.id=any(docs) and (d.conversation_id=m.conversation_id or (d.conversation_id is null and d.owner_id=m.sender_id and d.visibility='private' and d.document_status='archived'));
 delete from public.messages where id=m.id;
 perform private.write_audit('message.superadmin_purged','message',p_message_id,jsonb_build_object('snapshot',snapshot,'reason',trim(p_reason)));
 return jsonb_build_object('deleted',true,'message_id',p_message_id,'storage_paths',paths);
end;
$$;

create or replace function public.superadmin_delete_conversation(p_conversation_id uuid,p_confirmation text,p_reason text) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare actor uuid:=auth.uid(); c public.conversations%rowtype; docs uuid[]; paths jsonb:='[]'::jsonb; snapshot jsonb; safe_name text;
begin
 if actor is null or not private.is_super_admin(actor) or not private.has_aal2() then raise exception 'Super-administrateur avec MFA requis'; end if;
 if char_length(trim(coalesce(p_reason,'')))<8 then raise exception 'Motif obligatoire (8 caractères minimum)'; end if;
 select * into c from public.conversations where id=p_conversation_id for update; if not found then raise exception 'Conversation introuvable'; end if;
 if trim(coalesce(p_confirmation,''))<>c.title then raise exception 'Confirmation incorrecte : saisissez exactement le titre de la conversation'; end if;
 safe_name:=case when c.sensitivity='standard' then c.title else 'une conversation confidentielle' end;
 snapshot:=jsonb_build_object('id',c.id,'title',c.title,'sensitivity',c.sensitivity,'status',c.status,'created_by',c.created_by,'created_at',c.created_at,'member_count',(select count(*) from public.conversation_members where conversation_id=c.id),'message_count',(select count(*) from public.messages where conversation_id=c.id));
 select coalesce(array_agg(distinct d.id),'{}'::uuid[]) into docs from public.documents d where d.conversation_id=c.id or exists(select 1 from public.message_attachments ma join public.messages m on m.id=ma.message_id where ma.document_id=d.id and m.conversation_id=c.id and d.conversation_id is null and d.owner_id=m.sender_id and d.visibility='private' and d.document_status='archived');
 select coalesce(jsonb_agg(v.storage_path),'[]'::jsonb) into paths from public.document_versions v where v.document_id=any(docs);
 perform private.write_audit('conversation.superadmin_deleted','conversation',c.id,jsonb_build_object('snapshot',snapshot,'reason',trim(p_reason)));
 insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id)
 select cm.user_id,'Conversation supprimée par le super-administrateur','« '||safe_name||' » a été supprimée. Motif : '||trim(p_reason),null,'message_admin',null,null from public.conversation_members cm where cm.conversation_id=c.id and cm.user_id<>actor;
 delete from public.notifications n where n.category in ('message','message_access') and ((n.entity_type='conversation' and n.entity_id=c.id) or (n.entity_type='message' and exists(select 1 from public.messages m where m.id=n.entity_id and m.conversation_id=c.id)));
 delete from public.message_attachments ma using public.messages m where ma.message_id=m.id and m.conversation_id=c.id;
 delete from public.document_access_logs where document_id=any(docs);
 delete from public.documents where id=any(docs);
 perform set_config('aiac.messaging_admin','on',true);
 delete from public.conversations where id=c.id;
 return jsonb_build_object('deleted',true,'conversation_id',p_conversation_id,'storage_paths',paths);
end;
$$;

grant execute on function public.send_conversation_message_v2(uuid,text,uuid,text,text,text,bigint,text) to authenticated;
grant execute on function public.edit_conversation_message(uuid,text,text) to authenticated;
grant execute on function public.delete_conversation_message(uuid,text) to authenticated;
grant execute on function public.update_conversation_member_role(uuid,uuid,text) to authenticated;
grant execute on function public.update_conversation_settings(uuid,text,text,uuid,uuid) to authenticated;
grant execute on function public.messaging_admin_catalog(text,integer) to authenticated;
grant execute on function public.superadmin_open_conversation_access(uuid,text) to authenticated;
grant execute on function public.superadmin_close_conversation_access(uuid,text) to authenticated;
grant execute on function public.superadmin_purge_message(uuid,text,text) to authenticated;
grant execute on function public.superadmin_delete_conversation(uuid,text,text) to authenticated;
