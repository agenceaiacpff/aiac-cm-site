-- État final du durcissement Messagerie V2 après audit profond.

create index if not exists messages_body_trgm_idx on public.messages using gin (body gin_trgm_ops);

create or replace function public.create_conversation_v2(p_title text,p_recipient_id uuid,p_sensitivity text default 'standard',p_organization_unit_id uuid default null) returns public.conversations
language plpgsql security definer set search_path=''
as $$
declare actor uuid:=auth.uid(); result public.conversations%rowtype;
begin
 if actor is null or not private.is_active_approved_user(actor) then raise exception 'Compte actif et approuvé requis'; end if;
 if char_length(trim(coalesce(p_title,'')))<2 or char_length(trim(p_title))>180 then raise exception 'Objet de conversation invalide'; end if;
 if p_recipient_id is null or p_recipient_id=actor then raise exception 'Choisissez un autre destinataire'; end if;
 if not exists(select 1 from public.profiles p where p.id=p_recipient_id and p.status='active' and p.registration_state='approved' and p.role in ('member','volunteer','staff','manager','partner','admin','super_admin')) then raise exception 'Destinataire indisponible'; end if;
 if p_sensitivity not in ('standard','confidential','restricted','gbv_protection','hr','medical_psychosocial','whistleblowing') then raise exception 'Niveau de sensibilité invalide'; end if;
 if p_organization_unit_id is not null and not exists(select 1 from public.governance_bodies b where b.id=p_organization_unit_id and b.status='active') then raise exception 'Organe invalide'; end if;
 insert into public.conversations(title,created_by,assigned_to,sensitivity,organization_unit_id)
 values(trim(p_title),actor,null,p_sensitivity,p_organization_unit_id) returning * into result;
 insert into public.conversation_members(conversation_id,user_id,member_role,added_by)
 values(result.id,p_recipient_id,'participant',actor)
 on conflict(conversation_id,user_id) do update set member_role='participant';
 perform private.write_audit('conversation.created','conversation',result.id,jsonb_build_object('recipient_id',p_recipient_id,'recipient_role','participant','sensitivity',p_sensitivity,'organization_unit_id',p_organization_unit_id));
 return result;
end;
$$;

drop policy if exists conversations_insert on public.conversations;
create policy conversations_insert on public.conversations for insert to authenticated
with check(
 private.is_active_approved_user(auth.uid()) and created_by=auth.uid()
 and assigned_to is null and request_id is null
 and (organization_unit_id is null or exists(select 1 from public.governance_bodies b where b.id=organization_unit_id and b.status='active'))
);

create or replace function private.notify_new_message() returns trigger
language plpgsql security definer set search_path=''
as $$
declare c public.conversations%rowtype; sender_name text; safe_body text;
begin
 update public.conversations set updated_at=now() where id=new.conversation_id;
 select * into c from public.conversations where id=new.conversation_id;
 select coalesce(full_name,'Un participant') into sender_name from public.profiles where id=new.sender_id;
 if c.sensitivity='standard' then
   safe_body:=sender_name||' a envoyé un nouveau message dans « '||c.title||' ». Ouvrez la messagerie pour le consulter.';
 else
   safe_body:='Un nouveau message confidentiel est disponible. Ouvrez la messagerie sécurisée pour le consulter.';
 end if;
 insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id)
 select cm.user_id,case when c.sensitivity='standard' then 'Nouveau message' else 'Nouveau message confidentiel' end,
   safe_body,'/espace?tab=messages&conversation='||new.conversation_id::text,'message','message',new.id
 from public.conversation_members cm where cm.conversation_id=new.conversation_id and cm.user_id<>new.sender_id;
 return new;
end;
$$;
drop trigger if exists messages_notify on public.messages;
create trigger messages_notify after insert on public.messages for each row execute function private.notify_new_message();

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
 return result;
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
 delete from public.message_pins where message_id=m.id;
 update public.documents d set conversation_id=null,visibility='private',document_status='archived',archived_at=coalesce(archived_at,now()) where exists(select 1 from public.message_attachments ma where ma.message_id=m.id and ma.document_id=d.id);
 delete from public.notifications where entity_type='message' and entity_id=m.id;
 perform private.write_audit('message.deleted','message',m.id,jsonb_build_object('conversation_id',m.conversation_id,'old_hash',old_hash,'admin_override',admin_override,'reason',m.deletion_reason));
 return m;
end;
$$;

create or replace function public.superadmin_open_conversation_access(p_conversation_id uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare actor uuid:=auth.uid(); c public.conversations%rowtype; already_member boolean; added boolean:=false; last_action text; last_added boolean:=false;
begin
 if actor is null or not private.is_super_admin(actor) or not private.has_aal2() then raise exception 'Super-administrateur avec MFA requis'; end if;
 if char_length(trim(coalesce(p_reason,'')))<8 then raise exception 'Motif administratif obligatoire (8 caractères minimum)'; end if;
 select * into c from public.conversations where id=p_conversation_id; if not found then raise exception 'Conversation introuvable'; end if;
 select l.action,l.membership_added into last_action,last_added from public.conversation_admin_access_log l where l.conversation_id=c.id and l.actor_id=actor order by l.created_at desc,l.id desc limit 1;
 select exists(select 1 from public.conversation_members cm where cm.conversation_id=c.id and cm.user_id=actor) into already_member;
 if last_action='opened' and already_member then return to_jsonb(c)||jsonb_build_object('membership_added',last_added,'already_open',true); end if;
 if not already_member then perform set_config('aiac.messaging_admin','on',true); insert into public.conversation_members(conversation_id,user_id,member_role,added_by) values(c.id,actor,'manager',actor); added:=true; end if;
 insert into public.conversation_admin_access_log(conversation_id,actor_id,action,reason,membership_added) values(c.id,actor,'opened',trim(p_reason),added);
 perform private.write_audit('conversation.admin_access_opened','conversation',c.id,jsonb_build_object('reason',trim(p_reason),'membership_added',added));
 insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id)
 select distinct cm.user_id,'Accès administratif à une conversation','Un super-administrateur a ouvert un accès administratif journalisé à cette conversation. Consultez la messagerie sécurisée pour les détails.','/espace?tab=messages&conversation='||c.id::text,'message_admin','conversation',c.id
 from public.conversation_members cm where cm.conversation_id=c.id and cm.member_role='manager' and cm.user_id<>actor;
 return to_jsonb(c)||jsonb_build_object('membership_added',added,'already_open',false);
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
 select cm.user_id,'Conversation supprimée par le super-administrateur','« '||safe_name||' » a été supprimée dans le cadre d’une action administrative journalisée.',null,'message_admin','conversation',c.id
 from public.conversation_members cm where cm.conversation_id=c.id and cm.user_id<>actor;
 delete from public.notifications n where n.category in ('message','message_access') and ((n.entity_type='conversation' and n.entity_id=c.id) or (n.entity_type='message' and exists(select 1 from public.messages m where m.id=n.entity_id and m.conversation_id=c.id)));
 delete from public.message_attachments ma using public.messages m where ma.message_id=m.id and m.conversation_id=c.id;
 delete from public.document_access_logs where document_id=any(docs);
 delete from public.documents where id=any(docs);
 perform set_config('aiac.messaging_admin','on',true);
 delete from public.conversations where id=c.id;
 return jsonb_build_object('deleted',true,'conversation_id',p_conversation_id,'storage_paths',paths);
end;
$$;
