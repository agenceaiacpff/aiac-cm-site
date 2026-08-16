create or replace function private.audit_conversation_member_change() returns trigger
language plpgsql security definer set search_path=''
as $$
begin
  if tg_op='INSERT' then
    perform private.write_audit('conversation.member_added','conversation',new.conversation_id,jsonb_build_object('user_id',new.user_id,'member_role',new.member_role));
    return new;
  elsif tg_op='UPDATE' then
    if new.member_role is distinct from old.member_role then
      perform private.write_audit('conversation.member_role_changed','conversation',new.conversation_id,jsonb_build_object('user_id',new.user_id,'from_role',old.member_role,'to_role',new.member_role));
    end if;
    return new;
  end if;
  perform private.write_audit('conversation.member_removed','conversation',old.conversation_id,jsonb_build_object('user_id',old.user_id,'member_role',old.member_role));
  return old;
end;
$$;

drop trigger if exists conversation_members_audit on public.conversation_members;
create trigger conversation_members_audit after insert or update of member_role or delete on public.conversation_members for each row execute function private.audit_conversation_member_change();

create or replace function private.notify_conversation_member_change() returns trigger
language plpgsql security definer set search_path=''
as $$
declare cid uuid:=coalesce(new.conversation_id,old.conversation_id); c public.conversations%rowtype; safe_name text; actor_name text;
begin
 select * into c from public.conversations where id=cid;
 safe_name:=case when c.sensitivity='standard' then c.title else 'une conversation confidentielle' end;
 if tg_op='INSERT' then
   if new.user_id is distinct from new.added_by then
     insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id)
     values(new.user_id,'Ajout à une conversation','Vous avez été ajouté à « '||safe_name||' » comme '||new.member_role||'.','/espace?tab=messages&conversation='||cid::text,'message_access','conversation',cid);
   end if;
   return new;
 elsif tg_op='UPDATE' and new.member_role is distinct from old.member_role then
   insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id)
   values(new.user_id,'Rôle de conversation modifié','Votre rôle dans « '||safe_name||' » est maintenant : '||new.member_role||'.','/espace?tab=messages&conversation='||cid::text,'message_access','conversation',cid);
   return new;
 elsif tg_op='DELETE' then
   if current_setting('aiac.messaging_admin',true)='on' then return old; end if;
   if old.user_id=auth.uid() then
     select coalesce(full_name,'Un participant') into actor_name from public.profiles where id=old.user_id;
     insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id)
     select cm.user_id,'Participant parti d’une conversation',actor_name||' a quitté « '||safe_name||' ».','/espace?tab=messages&conversation='||cid::text,'message_access','conversation',cid
     from public.conversation_members cm where cm.conversation_id=cid and cm.member_role='manager' and cm.user_id<>old.user_id;
   else
     insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id)
     values(old.user_id,'Accès à une conversation retiré','Votre accès à « '||safe_name||' » a été retiré.',null,'message_access','conversation',cid);
   end if;
   return old;
 end if;
 return coalesce(new,old);
end;
$$;

drop trigger if exists conversation_members_notify on public.conversation_members;
create trigger conversation_members_notify after insert or update of member_role or delete on public.conversation_members for each row execute function private.notify_conversation_member_change();

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
 select cm.user_id,'Conversation supprimée par le super-administrateur','« '||safe_name||' » a été supprimée. Motif : '||trim(p_reason),null,'message_admin','conversation',c.id from public.conversation_members cm where cm.conversation_id=c.id and cm.user_id<>actor;
 delete from public.notifications n where n.category in ('message','message_access') and ((n.entity_type='conversation' and n.entity_id=c.id) or (n.entity_type='message' and exists(select 1 from public.messages m where m.id=n.entity_id and m.conversation_id=c.id)));
 delete from public.message_attachments ma using public.messages m where ma.message_id=m.id and m.conversation_id=c.id;
 delete from public.document_access_logs where document_id=any(docs);
 delete from public.documents where id=any(docs);
 perform set_config('aiac.messaging_admin','on',true);
 delete from public.conversations where id=c.id;
 return jsonb_build_object('deleted',true,'conversation_id',p_conversation_id,'storage_paths',paths);
end;
$$;
