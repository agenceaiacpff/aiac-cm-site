-- Notifications et messagerie synchronisées en temps réel.

alter table public.notifications
  add column if not exists category text not null default 'general',
  add column if not exists entity_type text,
  add column if not exists entity_id uuid;

create index if not exists notifications_entity_user_idx
  on public.notifications(user_id,entity_type,entity_id,read_at);

create or replace function public.get_unread_message_counts()
returns table(conversation_id uuid,unread_count bigint)
language sql
stable
security invoker
set search_path=''
as $$
  select m.conversation_id,count(*)::bigint
  from public.messages m
  where m.sender_id<>(select auth.uid())
    and not exists(
      select 1 from public.message_reads r
      where r.message_id=m.id and r.user_id=(select auth.uid())
    )
  group by m.conversation_id;
$$;
revoke all on function public.get_unread_message_counts() from public,anon;
grant execute on function public.get_unread_message_counts() to authenticated;

create or replace function public.mark_conversation_read(target_conversation uuid)
returns void
language plpgsql
security invoker
set search_path=''
as $$
begin
  if not private.is_active_user() or not private.is_conversation_member(target_conversation) then
    raise exception 'Accès refusé à cette conversation';
  end if;

  insert into public.message_reads(message_id,user_id,read_at)
  select m.id,auth.uid(),now()
  from public.messages m
  where m.conversation_id=target_conversation
  on conflict(message_id,user_id) do update set read_at=excluded.read_at;

  update public.notifications
  set read_at=coalesce(read_at,now())
  where user_id=auth.uid()
    and entity_type='conversation'
    and entity_id=target_conversation
    and read_at is null;
end;
$$;
revoke all on function public.mark_conversation_read(uuid) from public,anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

create or replace function private.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  update public.conversations set updated_at=now() where id=new.conversation_id;
  insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id)
  select cm.user_id,'Nouveau message',left(new.body,180),
    '/espace?tab=messages&conversation=' || new.conversation_id::text,
    'message','conversation',new.conversation_id
  from public.conversation_members cm
  where cm.conversation_id=new.conversation_id and cm.user_id<>new.sender_id;
  return new;
end;
$$;
revoke all on function private.notify_new_message() from public,anon,authenticated;

do $$
begin
  if not exists(
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='message_reads'
  ) then
    alter publication supabase_realtime add table public.message_reads;
  end if;
  if not exists(
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='conversations'
  ) then
    alter publication supabase_realtime add table public.conversations;
  end if;
end;
$$;
