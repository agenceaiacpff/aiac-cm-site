-- Notifications lors des échanges dans les dossiers de demandes et tâches.

create or replace function private.notify_request_comment() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.event_type='comment' then
    insert into public.notifications(user_id,title,body,href)
    select distinct recipient,'Nouveau commentaire sur une demande',left(r.subject || ' · ' || new.body,240),'/espace?tab=demandes'
    from public.requests r
    cross join lateral (
      select r.created_by as recipient
      union all select r.assigned_to
      union all select p.id from public.profiles p
        where r.assigned_to is null and p.status='active' and p.role in ('admin','super_admin')
    ) recipients
    where r.id=new.request_id and recipient is not null and recipient is distinct from new.actor_id;
  end if;
  return new;
end;
$$;
revoke all on function private.notify_request_comment() from public,anon,authenticated;
create trigger request_events_notify_comment after insert on public.request_events
for each row execute function private.notify_request_comment();

create or replace function private.notify_task_comment() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.event_type='comment' then
    insert into public.notifications(user_id,title,body,href)
    select distinct recipient,'Nouveau commentaire sur une tâche',left(t.title || ' · ' || new.body,240),'/espace?tab=operations'
    from public.tasks t
    cross join lateral (
      select t.created_by as recipient
      union all select t.assigned_to
    ) recipients
    where t.id=new.task_id and recipient is not null and recipient is distinct from new.actor_id;
  end if;
  return new;
end;
$$;
revoke all on function private.notify_task_comment() from public,anon,authenticated;
create trigger task_events_notify_comment after insert on public.task_events
for each row execute function private.notify_task_comment();

