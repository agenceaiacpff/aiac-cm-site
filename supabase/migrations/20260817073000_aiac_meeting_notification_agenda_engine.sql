-- AIAC — moteur fiable des réunions, notifications, e-mails et agenda.
-- Cette migration consolide l'état de production installé le 17/08/2026.
-- Aucun secret n'est stocké en clair : le jeton worker est créé dans Supabase Vault.

alter table public.notifications add column if not exists dedupe_key text;
create unique index if not exists notifications_dedupe_key_uidx on public.notifications(dedupe_key) where dedupe_key is not null;
create index if not exists notifications_user_category_unread_idx on public.notifications(user_id,category,created_at desc) where read_at is null;

create table if not exists public.notification_email_outbox(
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  recipient_user_id uuid null references public.profiles(id) on delete cascade,
  recipient_email text not null,
  recipient_name text null,
  kind text not null,
  entity_type text not null,
  entity_id uuid null,
  subject text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check(status in ('pending','processing','sent','failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text null,
  created_at timestamptz not null default now(),
  processing_at timestamptz null,
  sent_at timestamptz null
);
create index if not exists notification_email_outbox_pending_idx on public.notification_email_outbox(status,next_attempt_at,created_at);
alter table public.notification_email_outbox enable row level security;
revoke all on public.notification_email_outbox from anon,authenticated;
grant select,insert,update,delete on public.notification_email_outbox to service_role;

create table if not exists public.meeting_user_visibility(
  user_id uuid not null references public.profiles(id) on delete cascade,
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  hidden_at timestamptz not null default now(),
  primary key(user_id,meeting_id)
);
alter table public.meeting_user_visibility enable row level security;
drop policy if exists meeting_user_visibility_self_select on public.meeting_user_visibility;
create policy meeting_user_visibility_self_select on public.meeting_user_visibility for select to authenticated using(user_id=auth.uid());
drop policy if exists meeting_user_visibility_self_insert on public.meeting_user_visibility;
create policy meeting_user_visibility_self_insert on public.meeting_user_visibility for insert to authenticated with check(user_id=auth.uid() and private.can_view_meeting(meeting_id,auth.uid()));
drop policy if exists meeting_user_visibility_self_delete on public.meeting_user_visibility;
create policy meeting_user_visibility_self_delete on public.meeting_user_visibility for delete to authenticated using(user_id=auth.uid());
grant select,insert,delete on public.meeting_user_visibility to authenticated;

create table if not exists public.meeting_start_alert_receipts(
  user_id uuid not null references public.profiles(id) on delete cascade,
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  occurrence_at timestamptz not null,
  shown_at timestamptz not null default now(),
  dismissed_at timestamptz null,
  primary key(user_id,meeting_id,occurrence_at)
);
alter table public.meeting_start_alert_receipts enable row level security;
drop policy if exists meeting_start_alert_receipts_self_select on public.meeting_start_alert_receipts;
create policy meeting_start_alert_receipts_self_select on public.meeting_start_alert_receipts for select to authenticated using(user_id=auth.uid());
drop policy if exists meeting_start_alert_receipts_self_insert on public.meeting_start_alert_receipts;
create policy meeting_start_alert_receipts_self_insert on public.meeting_start_alert_receipts for insert to authenticated with check(user_id=auth.uid());
drop policy if exists meeting_start_alert_receipts_self_update on public.meeting_start_alert_receipts;
create policy meeting_start_alert_receipts_self_update on public.meeting_start_alert_receipts for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
grant select,insert,update on public.meeting_start_alert_receipts to authenticated;

create table if not exists public.personal_agenda_tasks(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check(char_length(trim(title)) between 2 and 220),
  description text null check(description is null or char_length(description)<=10000),
  starts_at timestamptz not null,
  ends_at timestamptz null,
  timezone text not null default 'Africa/Douala',
  status text not null default 'scheduled' check(status in ('scheduled','in_progress','completed','cancelled')),
  notify_email boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz null,
  check(ends_at is null or ends_at>=starts_at)
);
create index if not exists personal_agenda_tasks_user_start_idx on public.personal_agenda_tasks(user_id,starts_at);
alter table public.personal_agenda_tasks enable row level security;
drop policy if exists personal_agenda_tasks_self_select on public.personal_agenda_tasks;
create policy personal_agenda_tasks_self_select on public.personal_agenda_tasks for select to authenticated using(user_id=auth.uid());
drop policy if exists personal_agenda_tasks_self_insert on public.personal_agenda_tasks;
create policy personal_agenda_tasks_self_insert on public.personal_agenda_tasks for insert to authenticated with check(user_id=auth.uid());
drop policy if exists personal_agenda_tasks_self_update on public.personal_agenda_tasks;
create policy personal_agenda_tasks_self_update on public.personal_agenda_tasks for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
drop policy if exists personal_agenda_tasks_self_delete on public.personal_agenda_tasks;
create policy personal_agenda_tasks_self_delete on public.personal_agenda_tasks for delete to authenticated using(user_id=auth.uid());
grant select,insert,update,delete on public.personal_agenda_tasks to authenticated;

create or replace function private.resolve_user_email(target_user uuid)
returns text language sql stable security definer set search_path='' as $f$
 select coalesce(nullif(trim(p.email),''),nullif(trim(u.email),''))
 from public.profiles p left join auth.users u on u.id=p.id where p.id=target_user;
$f$;

create or replace function private.resolve_user_name(target_user uuid)
returns text language sql stable security definer set search_path='' as $f$
 select coalesce(nullif(trim(p.full_name),''),nullif(trim(p.email),''),nullif(trim(u.email),''),'Membre AIAC')
 from public.profiles p left join auth.users u on u.id=p.id where p.id=target_user;
$f$;

create or replace function private.queue_notification_email(
  p_event_key text,p_user_id uuid,p_email text,p_name text,p_kind text,p_entity_type text,p_entity_id uuid,p_subject text,p_payload jsonb
) returns boolean language plpgsql security definer set search_path='' as $f$
declare inserted integer;
begin
  if nullif(trim(coalesce(p_email,'')),'') is null then return false; end if;
  insert into public.notification_email_outbox(event_key,recipient_user_id,recipient_email,recipient_name,kind,entity_type,entity_id,subject,payload)
  values(p_event_key,p_user_id,lower(trim(p_email)),nullif(trim(coalesce(p_name,'')),''),p_kind,p_entity_type,p_entity_id,p_subject,coalesce(p_payload,'{}'::jsonb))
  on conflict(event_key) do nothing;
  get diagnostics inserted=row_count;
  return inserted=1;
end;
$f$;

create or replace function private.queue_meeting_email_for_user(p_meeting uuid,p_user uuid,p_kind text,p_event_suffix text)
returns boolean language plpgsql security definer set search_path='' as $f$
declare m public.meetings; email text; person text; subject text; payload jsonb; participant public.meeting_participants;
begin
 select * into m from public.meetings where id=p_meeting;
 select * into participant from public.meeting_participants where meeting_id=p_meeting and user_id=p_user;
 if m.id is null or participant.user_id is null then return false; end if;
 if participant.participant_role='organizer' and p_kind in ('invitation','update','cancelled','document_added') then return false; end if;
 if participant.response_status='declined' and p_kind in ('reminder','reminder_30','reminder_5','meeting_start') then return false; end if;
 if not participant.notify_by_email and participant.participant_role<>'organizer' then return false; end if;
 email:=private.resolve_user_email(p_user); person:=private.resolve_user_name(p_user);
 subject:=case p_kind
   when 'invitation' then 'Invitation à une réunion — '||m.title
   when 'update' then 'Mise à jour de réunion — '||m.title
   when 'cancelled' then 'Réunion annulée — '||m.title
   when 'reminder_30' then 'Réunion dans 30 minutes — '||m.title
   when 'reminder_5' then 'Réunion dans 5 minutes — '||m.title
   when 'meeting_start' then 'La réunion commence maintenant — '||m.title
   when 'document_added' then 'Nouveau document de réunion — '||m.title
   else 'Rappel de réunion — '||m.title end;
 payload:=jsonb_build_object('meeting_id',m.id,'code',m.code,'title',m.title,'description',m.description,'agenda',m.agenda,'starts_at',m.starts_at,'ends_at',m.ends_at,'timezone',m.timezone,'venue',m.venue,'meeting_url',m.meeting_url,'access_instructions',m.access_instructions,'kind',p_kind,'site_url','https://aiac-cm.org/espace?tab=reunions&meeting='||m.id);
 if email is null then
   update public.meeting_participants set email_status='failed',email_error='Adresse e-mail absente du profil et du compte' where meeting_id=p_meeting and user_id=p_user and participant_role<>'organizer';
   return false;
 end if;
 if private.queue_notification_email('meeting:'||m.id||':'||p_kind||':user:'||p_user||':'||p_event_suffix,p_user,email,person,p_kind,'meeting',m.id,subject,payload) then
   if p_kind='invitation' and participant.participant_role<>'organizer' then update public.meeting_participants set email_status='pending',email_error=null where meeting_id=p_meeting and user_id=p_user; end if;
   return true;
 end if;
 return false;
end;
$f$;

create or replace function private.queue_meeting_email_for_guest(p_meeting uuid,p_guest uuid,p_kind text,p_event_suffix text)
returns boolean language plpgsql security definer set search_path='' as $f$
declare m public.meetings; g public.meeting_guests; subject text; payload jsonb;
begin
 select * into m from public.meetings where id=p_meeting;
 select * into g from public.meeting_guests where id=p_guest and meeting_id=p_meeting;
 if m.id is null or g.id is null or nullif(trim(g.email),'') is null then return false; end if;
 if g.response_status='declined' and p_kind in ('reminder','reminder_30','reminder_5','meeting_start') then return false; end if;
 subject:=case p_kind
   when 'invitation' then 'Invitation à une réunion — '||m.title
   when 'update' then 'Mise à jour de réunion — '||m.title
   when 'cancelled' then 'Réunion annulée — '||m.title
   when 'reminder_30' then 'Réunion dans 30 minutes — '||m.title
   when 'reminder_5' then 'Réunion dans 5 minutes — '||m.title
   when 'meeting_start' then 'La réunion commence maintenant — '||m.title
   when 'document_added' then 'Nouveau document de réunion — '||m.title
   else 'Rappel de réunion — '||m.title end;
 payload:=jsonb_build_object('guest_id',g.id,'meeting_id',m.id,'code',m.code,'title',m.title,'description',m.description,'agenda',m.agenda,'starts_at',m.starts_at,'ends_at',m.ends_at,'timezone',m.timezone,'venue',m.venue,'meeting_url',m.meeting_url,'access_instructions',m.access_instructions,'kind',p_kind,'site_url','https://aiac-cm.org/reunions/invitation/'||g.invitation_token);
 return private.queue_notification_email('meeting:'||m.id||':'||p_kind||':guest:'||g.id||':'||p_event_suffix,null,g.email,g.full_name,p_kind,'meeting',m.id,subject,payload);
end;
$f$;

create or replace function private.notify_meeting_participant()
returns trigger language plpgsql security definer set search_path='' as $f$
declare m public.meetings; suffix text;
begin
 select * into m from public.meetings where id=new.meeting_id;
 if new.user_id<>m.organizer_id and m.status in ('scheduled','in_progress') then
   suffix:=extract(epoch from new.invited_at)::bigint::text;
   insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id,dedupe_key)
   values(new.user_id,'Invitation à une réunion AIAC',m.title||' · '||to_char(m.starts_at at time zone m.timezone,'DD/MM/YYYY HH24:MI'),'/espace?tab=reunions&meeting='||m.id,'meeting','meeting',m.id,'meeting:'||m.id||':invitation:'||new.user_id||':'||suffix)
   on conflict(dedupe_key) where dedupe_key is not null do nothing;
   perform private.queue_meeting_email_for_user(m.id,new.user_id,'invitation',suffix);
 end if;
 return new;
end;
$f$;

create or replace function private.notify_meeting_guest()
returns trigger language plpgsql security definer set search_path='' as $f$
declare m public.meetings;suffix text;
begin
 select * into m from public.meetings where id=new.meeting_id;
 if m.status in ('scheduled','in_progress') then
   suffix:=extract(epoch from new.invited_at)::bigint::text;
   perform private.queue_meeting_email_for_guest(m.id,new.id,'invitation',suffix);
 end if;
 return new;
end;
$f$;
drop trigger if exists meeting_guests_notify on public.meeting_guests;
create trigger meeting_guests_notify after insert on public.meeting_guests for each row execute function private.notify_meeting_guest();

create or replace function private.notify_meeting_change()
returns trigger language plpgsql security definer set search_path='' as $f$
declare v_title text;v_body text;v_kind text;suffix text;r record;
begin
 if new.status='scheduled' and old.status='draft' then
   v_title='Réunion AIAC programmée';v_body=new.title||' · '||to_char(new.starts_at at time zone new.timezone,'DD/MM/YYYY HH24:MI');v_kind='invitation';
 elsif new.status='cancelled' and old.status is distinct from 'cancelled' then
   v_title='Réunion AIAC annulée';v_body=new.title;v_kind='cancelled';
 elsif new.title is distinct from old.title or new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at or new.venue is distinct from old.venue or new.meeting_url is distinct from old.meeting_url or new.modality is distinct from old.modality or new.agenda is distinct from old.agenda or new.description is distinct from old.description or new.access_instructions is distinct from old.access_instructions then
   v_title='Réunion AIAC modifiée';v_body=new.title||' · '||to_char(new.starts_at at time zone new.timezone,'DD/MM/YYYY HH24:MI');v_kind='update';
 else return new; end if;
 suffix:=extract(epoch from new.updated_at)::bigint::text;
 for r in select mp.user_id from public.meeting_participants mp where mp.meeting_id=new.id and mp.user_id<>new.organizer_id loop
   insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id,dedupe_key)
   values(r.user_id,v_title,left(v_body,500),'/espace?tab=reunions&meeting='||new.id,'meeting','meeting',new.id,'meeting:'||new.id||':'||v_kind||':'||r.user_id||':'||suffix)
   on conflict(dedupe_key) where dedupe_key is not null do nothing;
   perform private.queue_meeting_email_for_user(new.id,r.user_id,v_kind,suffix);
 end loop;
 for r in select id from public.meeting_guests where meeting_id=new.id loop perform private.queue_meeting_email_for_guest(new.id,r.id,v_kind,suffix); end loop;
 if new.starts_at is distinct from old.starts_at then delete from public.meeting_start_alert_receipts where meeting_id=new.id; end if;
 perform private.write_audit('meeting.changed','meeting',new.id,jsonb_build_object('status',new.status,'starts_at',new.starts_at));
 return new;
end;
$f$;

create or replace function private.notify_meeting_document_added()
returns trigger language plpgsql security definer set search_path='' as $f$
declare m public.meetings;doc_name text;r record;suffix text;
begin
 select * into m from public.meetings where id=new.meeting_id;
 select coalesce(nullif(d.title,''),nullif(d.file_name,''),'Document') into doc_name from public.documents d where d.id=new.document_id;
 suffix:=new.document_id::text||':'||extract(epoch from new.shared_at)::bigint::text;
 for r in select mp.user_id from public.meeting_participants mp where mp.meeting_id=new.meeting_id and mp.user_id<>new.shared_by and mp.response_status<>'declined' loop
   insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id,dedupe_key)
   values(r.user_id,'Document ajouté à une réunion',doc_name||' a été ajouté à « '||m.title||' ». Merci de le consulter avant la réunion.','/espace?tab=reunions&meeting='||m.id,'meeting','meeting',m.id,'meeting:'||m.id||':document:'||new.document_id||':'||r.user_id||':'||extract(epoch from new.shared_at)::bigint::text)
   on conflict(dedupe_key) where dedupe_key is not null do nothing;
   perform private.queue_meeting_email_for_user(m.id,r.user_id,'document_added',suffix);
   update public.notification_email_outbox set payload=payload||jsonb_build_object('document_name',doc_name) where event_key='meeting:'||m.id||':document_added:user:'||r.user_id||':'||suffix;
 end loop;
 for r in select id from public.meeting_guests where meeting_id=new.meeting_id and response_status<>'declined' loop
   perform private.queue_meeting_email_for_guest(m.id,r.id,'document_added',suffix);
   update public.notification_email_outbox set payload=payload||jsonb_build_object('document_name',doc_name) where event_key='meeting:'||m.id||':document_added:guest:'||r.id||':'||suffix;
 end loop;
 return new;
end;
$f$;
drop trigger if exists meeting_documents_notify_added on public.meeting_documents;
create trigger meeting_documents_notify_added after insert on public.meeting_documents for each row execute function private.notify_meeting_document_added();

create or replace function public.queue_meeting_email_kind(target_meeting uuid,target_kind text)
returns integer language plpgsql security definer set search_path='' as $f$
declare uid uuid:=auth.uid();m public.meetings;r record;suffix text;total integer:=0;
begin
 if uid is null or not private.can_manage_meeting(target_meeting,uid) then raise exception 'Gestion de la réunion non autorisée'; end if;
 if target_kind not in ('invitation','reminder','update','cancelled') then raise exception 'Type d’e-mail invalide'; end if;
 select * into m from public.meetings where id=target_meeting; if m.id is null then raise exception 'Réunion introuvable'; end if;
 for r in select user_id,invited_at from public.meeting_participants where meeting_id=m.id loop
   suffix:=case when target_kind='invitation' then extract(epoch from r.invited_at)::bigint::text when target_kind='reminder' then 'manual:'||to_char(date_trunc('minute',now()),'YYYYMMDDHH24MI') else extract(epoch from m.updated_at)::bigint::text end;
   if private.queue_meeting_email_for_user(m.id,r.user_id,target_kind,suffix) then total:=total+1; end if;
 end loop;
 for r in select id,invited_at from public.meeting_guests where meeting_id=m.id loop
   suffix:=case when target_kind='invitation' then extract(epoch from r.invited_at)::bigint::text when target_kind='reminder' then 'manual:'||to_char(date_trunc('minute',now()),'YYYYMMDDHH24MI') else extract(epoch from m.updated_at)::bigint::text end;
   if private.queue_meeting_email_for_guest(m.id,r.id,target_kind,suffix) then total:=total+1; end if;
 end loop;
 return total;
end;
$f$;
revoke all on function public.queue_meeting_email_kind(uuid,text) from public,anon;
grant execute on function public.queue_meeting_email_kind(uuid,text) to authenticated;

create or replace function private.deliver_meeting_timed_event(p_meeting uuid,p_kind text,p_label text)
returns integer language plpgsql security definer set search_path='' as $f$
declare m public.meetings;r record;suffix text;total integer:=0;body text;inserted integer;
begin
 select * into m from public.meetings where id=p_meeting; if m.id is null then return 0; end if;
 suffix:=to_char(m.starts_at at time zone 'UTC','YYYYMMDDHH24MISS');
 body:=case p_kind when 'reminder_30' then m.title||' commence dans environ 30 minutes · '||to_char(m.starts_at at time zone m.timezone,'HH24:MI') when 'reminder_5' then m.title||' commence dans 5 minutes · '||to_char(m.starts_at at time zone m.timezone,'HH24:MI') else 'C’est l’heure : '||m.title||' commence maintenant.' end;
 for r in select mp.user_id from public.meeting_participants mp where mp.meeting_id=m.id and (mp.response_status<>'declined' or mp.participant_role='organizer') loop
   insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id,dedupe_key)
   values(r.user_id,p_label,body,'/espace?tab=reunions&meeting='||m.id,case when p_kind='meeting_start' then 'meeting_start' else 'meeting' end,'meeting',m.id,'meeting:'||m.id||':'||p_kind||':'||r.user_id||':'||suffix)
   on conflict(dedupe_key) where dedupe_key is not null do nothing;
   get diagnostics inserted=row_count; total:=total+inserted;
   perform private.queue_meeting_email_for_user(m.id,r.user_id,p_kind,suffix);
 end loop;
 for r in select id from public.meeting_guests where meeting_id=m.id and response_status<>'declined' loop perform private.queue_meeting_email_for_guest(m.id,r.id,p_kind,suffix); end loop;
 return total;
end;
$f$;

create or replace function private.deliver_personal_task_timed_event(p_task uuid,p_kind text,p_label text)
returns integer language plpgsql security definer set search_path='' as $f$
declare t public.personal_agenda_tasks;email text;person text;suffix text;body text;inserted integer:=0;
begin
 select * into t from public.personal_agenda_tasks where id=p_task; if t.id is null then return 0; end if;
 suffix:=to_char(t.starts_at at time zone 'UTC','YYYYMMDDHH24MISS');
 body:=case p_kind when 'reminder_30' then 'Votre tâche « '||t.title||' » commence dans environ 30 minutes.' when 'reminder_5' then 'Votre tâche « '||t.title||' » commence dans 5 minutes.' else 'C’est l’heure de votre tâche : « '||t.title||' ».' end;
 insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id,dedupe_key)
 values(t.user_id,p_label,body,'/espace?tab=reunions&agenda=1','agenda_task','personal_agenda_task',t.id,'personal-task:'||t.id||':'||p_kind||':'||suffix)
 on conflict(dedupe_key) where dedupe_key is not null do nothing;
 get diagnostics inserted=row_count;
 if t.notify_email then
   email:=private.resolve_user_email(t.user_id);person:=private.resolve_user_name(t.user_id);
   perform private.queue_notification_email('personal-task:'||t.id||':'||p_kind||':'||suffix,t.user_id,email,person,p_kind,'personal_agenda_task',t.id,case p_kind when 'reminder_30' then 'Tâche dans 30 minutes — '||t.title when 'reminder_5' then 'Tâche dans 5 minutes — '||t.title else 'Votre tâche commence maintenant — '||t.title end,jsonb_build_object('title',t.title,'description',t.description,'starts_at',t.starts_at,'ends_at',t.ends_at,'timezone',t.timezone,'kind',p_kind,'site_url','https://aiac-cm.org/espace?tab=reunions&agenda=1'));
 end if;
 return inserted;
end;
$f$;

create or replace function private.deliver_assigned_task_timed_event(p_task uuid,p_kind text,p_label text)
returns integer language plpgsql security definer set search_path='' as $f$
declare t public.tasks;email text;person text;suffix text;body text;inserted integer:=0;target uuid;
begin
 select * into t from public.tasks where id=p_task; if t.id is null or t.due_at is null then return 0; end if;
 target:=coalesce(t.assigned_to,t.created_by); if target is null then return 0; end if;
 suffix:=to_char(t.due_at at time zone 'UTC','YYYYMMDDHH24MISS');
 body:=case p_kind when 'reminder_30' then 'La tâche « '||t.title||' » arrive à échéance dans environ 30 minutes.' when 'reminder_5' then 'La tâche « '||t.title||' » arrive à échéance dans 5 minutes.' else 'Échéance maintenant : « '||t.title||' ».' end;
 insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id,dedupe_key)
 values(target,p_label,body,'/espace?tab=operations','task','task',t.id,'task:'||t.id||':'||p_kind||':'||target||':'||suffix)
 on conflict(dedupe_key) where dedupe_key is not null do nothing;
 get diagnostics inserted=row_count;
 email:=private.resolve_user_email(target);person:=private.resolve_user_name(target);
 perform private.queue_notification_email('task:'||t.id||':'||p_kind||':'||target||':'||suffix,target,email,person,p_kind,'task',t.id,case p_kind when 'reminder_30' then 'Tâche dans 30 minutes — '||t.title when 'reminder_5' then 'Tâche dans 5 minutes — '||t.title else 'Échéance de tâche — '||t.title end,jsonb_build_object('title',t.title,'description',t.description,'starts_at',t.due_at,'kind',p_kind,'site_url','https://aiac-cm.org/espace?tab=operations'));
 return inserted;
end;
$f$;

create or replace function public.process_aiac_schedules()
returns jsonb language plpgsql security definer set search_path='' as $f$
declare r record;n30 integer:=0;n5 integer:=0;n0 integer:=0;t30 integer:=0;t5 integer:=0;t0 integer:=0;a30 integer:=0;a5 integer:=0;a0 integer:=0;started integer:=0;ended integer:=0;
begin
 for r in select id from public.meetings where status='scheduled' and starts_at>now()+interval '29 minutes' and starts_at<=now()+interval '30 minutes 59 seconds' loop n30:=n30+private.deliver_meeting_timed_event(r.id,'reminder_30','Réunion dans 30 minutes'); end loop;
 for r in select id from public.meetings where status='scheduled' and starts_at>now()+interval '4 minutes' and starts_at<=now()+interval '5 minutes 59 seconds' loop n5:=n5+private.deliver_meeting_timed_event(r.id,'reminder_5','Réunion dans 5 minutes'); end loop;
 for r in select id from public.meetings where status='scheduled' and starts_at<=now() and ends_at>now() loop n0:=n0+private.deliver_meeting_timed_event(r.id,'meeting_start','La réunion commence maintenant'); end loop;
 update public.meetings set status='in_progress' where status='scheduled' and starts_at<=now() and ends_at>now();get diagnostics started=row_count;
 update public.meetings set status='in_progress' where status='scheduled' and ends_at<=now();
 update public.meetings set status='completed' where status='in_progress' and ends_at<=now();get diagnostics ended=row_count;
 for r in select id from public.personal_agenda_tasks where status='scheduled' and starts_at>now()+interval '29 minutes' and starts_at<=now()+interval '30 minutes 59 seconds' loop t30:=t30+private.deliver_personal_task_timed_event(r.id,'reminder_30','Tâche dans 30 minutes'); end loop;
 for r in select id from public.personal_agenda_tasks where status='scheduled' and starts_at>now()+interval '4 minutes' and starts_at<=now()+interval '5 minutes 59 seconds' loop t5:=t5+private.deliver_personal_task_timed_event(r.id,'reminder_5','Tâche dans 5 minutes'); end loop;
 for r in select id from public.personal_agenda_tasks where status='scheduled' and starts_at<=now() loop t0:=t0+private.deliver_personal_task_timed_event(r.id,'task_start','Votre tâche commence maintenant'); end loop;
 update public.personal_agenda_tasks set status='in_progress',updated_at=now() where status='scheduled' and starts_at<=now();
 for r in select id from public.tasks where due_at is not null and status::text not in ('done','cancelled') and due_at>now()+interval '29 minutes' and due_at<=now()+interval '30 minutes 59 seconds' loop a30:=a30+private.deliver_assigned_task_timed_event(r.id,'reminder_30','Échéance dans 30 minutes'); end loop;
 for r in select id from public.tasks where due_at is not null and status::text not in ('done','cancelled') and due_at>now()+interval '4 minutes' and due_at<=now()+interval '5 minutes 59 seconds' loop a5:=a5+private.deliver_assigned_task_timed_event(r.id,'reminder_5','Échéance dans 5 minutes'); end loop;
 for r in select id from public.tasks where due_at is not null and status::text not in ('done','cancelled') and due_at<=now() and due_at>now()-interval '2 minutes' loop a0:=a0+private.deliver_assigned_task_timed_event(r.id,'task_due','Échéance de tâche'); end loop;
 return jsonb_build_object('meeting_30',n30,'meeting_5',n5,'meeting_start',n0,'meetings_started',started,'meetings_completed',ended,'personal_30',t30,'personal_5',t5,'personal_start',t0,'assigned_30',a30,'assigned_5',a5,'assigned_due',a0);
end;
$f$;
revoke all on function public.process_aiac_schedules() from public,anon,authenticated;
grant execute on function public.process_aiac_schedules() to service_role;

create or replace function public.get_pending_meeting_start_alert()
returns table(id uuid,code text,title text,description text,agenda text,starts_at timestamptz,ends_at timestamptz,timezone text,venue text,modality text,meeting_url text,access_instructions text,organizer_id uuid,organizer_name text,organizer_email text)
language sql stable security definer set search_path='' as $f$
 select m.id,m.code,m.title,m.description,m.agenda,m.starts_at,m.ends_at,m.timezone,m.venue,m.modality,m.meeting_url,m.access_instructions,m.organizer_id,private.resolve_user_name(m.organizer_id),private.resolve_user_email(m.organizer_id)
 from public.meetings m join public.meeting_participants mp on mp.meeting_id=m.id and mp.user_id=auth.uid()
 where auth.uid() is not null and m.status='in_progress' and m.starts_at<=now() and m.ends_at>now() and (mp.response_status<>'declined' or mp.participant_role='organizer')
 and not exists(select 1 from public.meeting_start_alert_receipts ar where ar.user_id=auth.uid() and ar.meeting_id=m.id and ar.occurrence_at=m.starts_at)
 order by m.starts_at limit 1;
$f$;
revoke all on function public.get_pending_meeting_start_alert() from public,anon;
grant execute on function public.get_pending_meeting_start_alert() to authenticated;

create or replace function public.ack_meeting_start_alert(target_meeting uuid,p_dismissed boolean default false)
returns boolean language plpgsql security definer set search_path='' as $f$
declare s timestamptz;
begin
 if auth.uid() is null then raise exception 'Authentification requise'; end if;
 select m.starts_at into s from public.meetings m join public.meeting_participants mp on mp.meeting_id=m.id and mp.user_id=auth.uid() where m.id=target_meeting;
 if s is null then raise exception 'Réunion inaccessible'; end if;
 insert into public.meeting_start_alert_receipts(user_id,meeting_id,occurrence_at,shown_at,dismissed_at)
 values(auth.uid(),target_meeting,s,now(),case when p_dismissed then now() else null end)
 on conflict(user_id,meeting_id,occurrence_at) do update set dismissed_at=case when p_dismissed then now() else public.meeting_start_alert_receipts.dismissed_at end;
 return true;
end;
$f$;
revoke all on function public.ack_meeting_start_alert(uuid,boolean) from public,anon;
grant execute on function public.ack_meeting_start_alert(uuid,boolean) to authenticated;

create or replace function public.set_meeting_hidden(target_meeting uuid,p_hidden boolean)
returns boolean language plpgsql security definer set search_path='' as $f$
begin
 if auth.uid() is null or not private.can_view_meeting(target_meeting,auth.uid()) then raise exception 'Réunion inaccessible'; end if;
 if p_hidden then
   insert into public.meeting_user_visibility(user_id,meeting_id) values(auth.uid(),target_meeting)
   on conflict(user_id,meeting_id) do update set hidden_at=now();
 else
   delete from public.meeting_user_visibility where user_id=auth.uid() and meeting_id=target_meeting;
 end if;
 return true;
end;
$f$;
revoke all on function public.set_meeting_hidden(uuid,boolean) from public,anon;
grant execute on function public.set_meeting_hidden(uuid,boolean) to authenticated;

create or replace function public.list_meeting_directory()
returns table(id uuid,full_name text,email text,role text,organization text)
language sql stable security definer set search_path='' as $f$
 select distinct p.id,coalesce(p.full_name,p.email,u.email,'Membre AIAC'),coalesce(p.email,u.email),p.role::text,p.organization
 from public.profiles p left join auth.users u on u.id=p.id
 where p.status='active' and p.registration_state='approved' and (
   private.can_create_meeting(auth.uid())
   or exists(select 1 from public.meetings m join public.meeting_participants mine on mine.meeting_id=m.id and mine.user_id=auth.uid() join public.meeting_participants peer on peer.meeting_id=m.id and peer.user_id=p.id)
   or exists(select 1 from public.meetings m join public.meeting_participants mine on mine.meeting_id=m.id and mine.user_id=auth.uid() where m.organizer_id=p.id)
 ) order by 2;
$f$;
revoke all on function public.list_meeting_directory() from public,anon;
grant execute on function public.list_meeting_directory() to authenticated;

create or replace function public.list_meeting_recipients()
returns table(id uuid,full_name text,role text,organization text)
language sql stable security definer set search_path='' as $f$
 select distinct p.id,coalesce(p.full_name,p.email,u.email,'Membre AIAC'),p.role::text,p.organization
 from public.profiles p left join auth.users u on u.id=p.id
 where p.status='active' and p.registration_state='approved' and (
   private.can_create_meeting(auth.uid())
   or exists(select 1 from public.meeting_participants mine join public.meeting_participants peer on peer.meeting_id=mine.meeting_id and peer.user_id=p.id where mine.user_id=auth.uid())
   or exists(select 1 from public.meeting_participants mine join public.meetings m on m.id=mine.meeting_id and m.organizer_id=p.id where mine.user_id=auth.uid())
 ) order by 2;
$f$;
revoke all on function public.list_meeting_recipients() from public,anon;
grant execute on function public.list_meeting_recipients() to authenticated;

create or replace function private.assert_scheduled_meeting_has_invitees(target_meeting uuid)
returns void language plpgsql security definer set search_path='' as $f$
declare st text;n integer;
begin
 select status into st from public.meetings where id=target_meeting;
 if st='scheduled' then
   select (select count(*) from public.meeting_participants where meeting_id=target_meeting and participant_role<>'organizer')+(select count(*) from public.meeting_guests where meeting_id=target_meeting) into n;
   if n=0 then raise exception 'Ajoutez au moins un participant ou un invité avant de programmer la réunion'; end if;
 end if;
end;
$f$;

create or replace function public.create_meeting(p_meeting jsonb,p_participant_ids uuid[] default '{}'::uuid[],p_guests jsonb default '[]'::jsonb)
returns uuid language plpgsql security definer set search_path='' as $f$
declare uid uuid:=auth.uid();mid uuid;access text:=coalesce(p_meeting->>'access_level','invite_only');selected_body uuid:=nullif(p_meeting->>'body_id','')::uuid;selected_project uuid:=nullif(p_meeting->>'project_id','')::uuid;guest jsonb;guest_email text;external_allowed boolean:=coalesce((p_meeting->>'allow_external_guests')::boolean,true);
begin
 if uid is null or not private.can_create_meeting(uid) then raise exception 'Création de réunion réservée au personnel et aux administrateurs autorisés'; end if;
 if access='all_members' and not (private.is_admin(uid) and private.has_aal2()) then raise exception 'Seuls les administrateurs authentifiés peuvent convoquer tous les membres'; end if;
 if access='body_members' and not ((private.is_admin(uid) and private.has_aal2()) or private.is_body_participant(selected_body,uid)) then raise exception 'Vous ne pouvez pas convoquer cet organe'; end if;
 if access='project_members' and not ((private.is_admin(uid) and private.has_aal2()) or private.is_project_member(selected_project,uid)) then raise exception 'Vous ne pouvez pas convoquer ce projet'; end if;
 insert into public.meetings(title,meeting_type,description,agenda,status,access_level,modality,body_id,project_id,starts_at,ends_at,timezone,venue,online_provider,meeting_url,access_instructions,organizer_id,capacity,registration_deadline,allow_external_guests)
 values(trim(p_meeting->>'title'),coalesce(p_meeting->>'meeting_type','other'),nullif(trim(p_meeting->>'description'),''),nullif(trim(p_meeting->>'agenda'),''),coalesce(p_meeting->>'status','scheduled'),access,coalesce(p_meeting->>'modality','online'),selected_body,selected_project,(p_meeting->>'starts_at')::timestamptz,(p_meeting->>'ends_at')::timestamptz,coalesce(nullif(p_meeting->>'timezone',''),'Africa/Douala'),nullif(trim(p_meeting->>'venue'),''),nullif(p_meeting->>'online_provider',''),nullif(trim(p_meeting->>'meeting_url'),''),nullif(trim(p_meeting->>'access_instructions'),''),uid,nullif(p_meeting->>'capacity','')::integer,nullif(p_meeting->>'registration_deadline','')::timestamptz,external_allowed) returning id into mid;
 insert into public.meeting_participants(meeting_id,user_id,participant_role,response_status,invited_by,notify_by_email,email_status) values(mid,uid,'organizer','accepted',uid,false,'skipped');
 if access='all_members' then
   insert into public.meeting_participants(meeting_id,user_id,invited_by) select mid,p.id,uid from public.profiles p where p.status='active' and p.registration_state='approved' and p.id<>uid on conflict do nothing;
 elsif access='body_members' then
   insert into public.meeting_participants(meeting_id,user_id,invited_by)
   select distinct mid,member_user,uid from (
     select im.profile_id member_user from public.institutional_members im join public.body_memberships bm on bm.member_id=im.id where bm.body_id=selected_body and bm.status='active' and im.status='active'
     union select wa.profile_id from public.workforce_assignments wa where wa.body_id=selected_body and wa.status='active'
     union select pa.profile_id from public.position_assignments pa where pa.body_id=selected_body and pa.status='active'
   ) members join public.profiles p on p.id=member_user where member_user is not null and member_user<>uid and p.status='active' and p.registration_state='approved' on conflict do nothing;
 elsif access='project_members' then
   insert into public.meeting_participants(meeting_id,user_id,invited_by) select mid,pm.user_id,uid from public.project_members pm join public.profiles p on p.id=pm.user_id where pm.project_id=selected_project and pm.user_id<>uid and p.status='active' and p.registration_state='approved' on conflict do nothing;
 end if;
 insert into public.meeting_participants(meeting_id,user_id,invited_by)
 select mid,p.id,uid from public.profiles p join unnest(coalesce(p_participant_ids,'{}'::uuid[])) selected(id) on selected.id=p.id where p.status='active' and p.registration_state='approved' and p.id<>uid on conflict do nothing;
 if external_allowed then
   for guest in select value from jsonb_array_elements(coalesce(p_guests,'[]'::jsonb)) loop
     guest_email:=lower(trim(guest->>'email'));
     if guest_email<>'' then
       insert into public.meeting_guests(meeting_id,full_name,email,organization,participant_role,invited_by)
       values(mid,coalesce(nullif(trim(guest->>'full_name'),''),guest_email),guest_email,nullif(trim(guest->>'organization'),''),coalesce(nullif(guest->>'participant_role',''),'guest'),uid) on conflict do nothing;
     end if;
   end loop;
 end if;
 perform private.assert_scheduled_meeting_has_invitees(mid);
 perform private.assert_meeting_capacity(mid);
 perform private.write_audit('meeting.created','meeting',mid,jsonb_build_object('access_level',access,'body_id',selected_body,'project_id',selected_project));
 return mid;
end;
$f$;

-- Worker e-mail : jeton interne dans Vault, file persistante et reprises automatiques.
do $f$
begin
 if not exists(select 1 from vault.decrypted_secrets where name='aiac_notification_worker_token') then
   perform vault.create_secret(encode(gen_random_bytes(32),'hex'),'aiac_notification_worker_token','Jeton interne du worker e-mail AIAC',null);
 end if;
end $f$;

create or replace function public.validate_notification_worker_token(p_token text)
returns boolean language sql stable security definer set search_path='' as $f$
 select exists(select 1 from vault.decrypted_secrets s where s.name='aiac_notification_worker_token' and s.decrypted_secret=p_token);
$f$;
revoke all on function public.validate_notification_worker_token(text) from public,anon,authenticated;
grant execute on function public.validate_notification_worker_token(text) to service_role;

create or replace function public.claim_notification_email_batch(p_limit integer default 50)
returns setof public.notification_email_outbox language plpgsql security definer set search_path='' as $f$
begin
 return query
 with picked as (
   select o.id from public.notification_email_outbox o
   where o.status in ('pending','failed') and o.next_attempt_at<=now() and o.attempts<6
   order by o.created_at for update skip locked limit greatest(1,least(coalesce(p_limit,50),100))
 )
 update public.notification_email_outbox o set status='processing',processing_at=now(),attempts=o.attempts+1
 from picked where o.id=picked.id returning o.*;
end;
$f$;
revoke all on function public.claim_notification_email_batch(integer) from public,anon,authenticated;
grant execute on function public.claim_notification_email_batch(integer) to service_role;

create or replace function public.complete_notification_email(p_id uuid,p_success boolean,p_error text default null)
returns boolean language plpgsql security definer set search_path='' as $f$
declare row public.notification_email_outbox;retry_minutes integer;
begin
 select * into row from public.notification_email_outbox where id=p_id for update;if row.id is null then return false;end if;
 if p_success then
   update public.notification_email_outbox set status='sent',sent_at=now(),processing_at=null,last_error=null where id=p_id;
   if row.entity_type='meeting' and row.recipient_user_id is not null and row.kind='invitation' then
     update public.meeting_participants set email_status='sent',email_sent_at=now(),email_error=null where meeting_id=row.entity_id and user_id=row.recipient_user_id;
   elsif row.entity_type='meeting' and row.kind='invitation' and row.payload ? 'guest_id' then
     update public.meeting_guests set email_status='sent',email_sent_at=now(),email_error=null where id=(row.payload->>'guest_id')::uuid;
   end if;
 else
   retry_minutes:=least(60,power(2,greatest(row.attempts,1))::integer);
   update public.notification_email_outbox set status=case when attempts>=6 then 'failed' else 'pending' end,processing_at=null,last_error=left(coalesce(p_error,'Échec e-mail'),2000),next_attempt_at=now()+make_interval(mins=>retry_minutes) where id=p_id;
   if row.entity_type='meeting' and row.recipient_user_id is not null and row.kind='invitation' then
     update public.meeting_participants set email_status='failed',email_error=left(coalesce(p_error,'Échec e-mail'),1000) where meeting_id=row.entity_id and user_id=row.recipient_user_id;
   elsif row.entity_type='meeting' and row.kind='invitation' and row.payload ? 'guest_id' then
     update public.meeting_guests set email_status='failed',email_error=left(coalesce(p_error,'Échec e-mail'),1000) where id=(row.payload->>'guest_id')::uuid;
   end if;
 end if;
 return true;
end;
$f$;
revoke all on function public.complete_notification_email(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.complete_notification_email(uuid,boolean,text) to service_role;

-- Realtime des nouvelles briques.
do $f$
begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='personal_agenda_tasks') then alter publication supabase_realtime add table public.personal_agenda_tasks; end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='meeting_user_visibility') then alter publication supabase_realtime add table public.meeting_user_visibility; end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='meeting_documents') then alter publication supabase_realtime add table public.meeting_documents; end if;
end $f$;

-- Exécution serveur toutes les minutes, indépendante du navigateur.
do $f$ begin if exists(select 1 from cron.job where jobname='aiac-meeting-agenda-scheduler-v1') then perform cron.unschedule('aiac-meeting-agenda-scheduler-v1'); end if; end $f$;
select cron.schedule('aiac-meeting-agenda-scheduler-v1','* * * * *',$cron$select public.process_aiac_schedules();$cron$);

do $f$ begin if exists(select 1 from cron.job where jobname='aiac-notification-email-worker-v1') then perform cron.unschedule('aiac-notification-email-worker-v1'); end if; end $f$;
select cron.schedule('aiac-notification-email-worker-v1','* * * * *',$cron$
select net.http_post(
  url:='https://fuvqhdhgilkltqwqitcr.supabase.co/functions/v1/meeting-emails',
  headers:=jsonb_build_object('Content-Type','application/json','x-aiac-worker-token',(select decrypted_secret from vault.decrypted_secrets where name='aiac_notification_worker_token' order by created_at desc limit 1)),
  body:='{"action":"flush_outbox"}'::jsonb,
  timeout_milliseconds:=25000
);
$cron$);
