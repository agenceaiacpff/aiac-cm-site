create or replace function private.route_new_conversation() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.conversation_members(conversation_id,user_id) values(new.id,new.created_by) on conflict do nothing;
  insert into public.conversation_members(conversation_id,user_id)
  select new.id,p.id from public.profiles p where p.status='active' and p.role in ('staff','manager','admin','super_admin')
  on conflict do nothing;
  return new;
end; $$;
revoke all on function private.route_new_conversation() from public,anon,authenticated;
create trigger conversations_route after insert on public.conversations for each row execute function private.route_new_conversation();

create or replace function private.notify_new_request() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.notifications(user_id,title,body,href)
  select p.id,'Nouvelle demande',new.subject,'/espace'
  from public.profiles p where p.status='active' and p.role in ('staff','manager','admin','super_admin');
  return new;
end; $$;
revoke all on function private.notify_new_request() from public,anon,authenticated;
create trigger requests_notify after insert on public.requests for each row execute function private.notify_new_request();
