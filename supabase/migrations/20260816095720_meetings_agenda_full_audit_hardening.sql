alter table public.meetings
  add column if not exists minutes text,
  add column if not exists decisions text,
  add column if not exists follow_up_actions text,
  add column if not exists minutes_recorded_at timestamptz,
  add column if not exists minutes_recorded_by uuid references public.profiles(id) on delete set null;

do $$ begin alter table public.meetings add constraint meetings_minutes_check check (minutes is null or char_length(minutes) <= 50000); exception when duplicate_object then null; end $$;
do $$ begin alter table public.meetings add constraint meetings_decisions_check check (decisions is null or char_length(decisions) <= 30000); exception when duplicate_object then null; end $$;
do $$ begin alter table public.meetings add constraint meetings_follow_up_actions_check check (follow_up_actions is null or char_length(follow_up_actions) <= 30000); exception when duplicate_object then null; end $$;

alter table public.meetings drop constraint if exists meetings_check4;
alter table public.meetings add constraint meetings_check4 check (modality not in ('in_person','hybrid') or venue is not null);

create or replace function private.can_create_meeting(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path=''
as $$
  select private.is_active_user(uid) and exists(
    select 1 from public.profiles p where p.id=uid and p.status='active' and p.registration_state='approved'
      and p.role::text in ('staff','manager','admin','super_admin')
  );
$$;
revoke all on function private.can_create_meeting(uuid) from public, anon;
grant execute on function private.can_create_meeting(uuid) to authenticated;

drop policy if exists meetings_insert on public.meetings;
create policy meetings_insert on public.meetings for insert to authenticated
with check (organizer_id=auth.uid() and private.can_create_meeting(auth.uid()));

create or replace function public.list_meeting_recipients()
returns table(id uuid, full_name text, role text, organization text)
language sql stable security definer set search_path=''
as $$
  select p.id,coalesce(p.full_name,p.email,'Membre AIAC'),p.role::text,p.organization
  from public.profiles p
  where private.can_create_meeting() and p.status='active' and p.registration_state='approved'
  order by coalesce(p.full_name,p.email);
$$;
revoke all on function public.list_meeting_recipients() from public, anon;
grant execute on function public.list_meeting_recipients() to authenticated;

create or replace function private.prepare_meeting()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  new.title=trim(new.title);
  new.description=nullif(trim(coalesce(new.description,'')),'');
  new.agenda=nullif(trim(coalesce(new.agenda,'')),'');
  new.venue=nullif(trim(coalesce(new.venue,'')),'');
  new.meeting_url=nullif(trim(coalesce(new.meeting_url,'')),'');
  new.access_instructions=nullif(trim(coalesce(new.access_instructions,'')),'');
  if new.access_level<>'body_members' then new.body_id=null; end if;
  if new.access_level<>'project_members' then new.project_id=null; end if;
  if new.modality in ('online','hybrid') and new.meeting_url is null then
    if coalesce(new.online_provider,'jitsi') <> 'jitsi' then raise exception 'Ajoutez le lien de la réunion pour le fournisseur sélectionné'; end if;
    new.online_provider='jitsi';
    new.meeting_url='https://meet.jit.si/AIAC-' || upper(replace(new.id::text,'-',''));
  end if;
  if new.modality='online' then new.venue=null; end if;
  if new.modality='in_person' then new.meeting_url=null; new.online_provider=null; end if;
  if new.modality='hybrid' and new.venue is null then raise exception 'Indiquez le lieu physique pour une réunion hybride'; end if;
  if new.registration_deadline is not null and new.registration_deadline>new.starts_at then raise exception 'La date limite de réponse doit être antérieure ou égale au début de la réunion'; end if;
  new.updated_at=now();
  return new;
end;
$$;

create or replace function private.assert_meeting_capacity(target_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare cap integer; total integer;
begin
  select capacity into cap from public.meetings where id=target_id;
  if cap is null then return; end if;
  select (select count(*) from public.meeting_participants where meeting_id=target_id)+(select count(*) from public.meeting_guests where meeting_id=target_id) into total;
  if total>cap then raise exception 'La capacité de la réunion (%) est dépassée par % personne(s) inscrite(s)',cap,total; end if;
end;
$$;
revoke all on function private.assert_meeting_capacity(uuid) from public, anon;

create or replace function public.create_meeting(p_meeting jsonb, p_participant_ids uuid[] default '{}'::uuid[], p_guests jsonb default '[]'::jsonb)
returns uuid language plpgsql security definer set search_path=''
as $$
declare uid uuid:=auth.uid(); mid uuid; access text:=coalesce(p_meeting->>'access_level','invite_only'); selected_body uuid:=nullif(p_meeting->>'body_id','')::uuid; selected_project uuid:=nullif(p_meeting->>'project_id','')::uuid; guest jsonb; guest_email text; external_allowed boolean:=coalesce((p_meeting->>'allow_external_guests')::boolean,true);
begin
  if uid is null or not private.can_create_meeting(uid) then raise exception 'Création de réunion réservée au personnel et aux administrateurs autorisés'; end if;
  if access='all_members' and not (private.is_admin(uid) and private.has_aal2()) then raise exception 'Seuls les administrateurs authentifiés peuvent convoquer tous les membres'; end if;
  if access='body_members' and not ((private.is_admin(uid) and private.has_aal2()) or private.is_body_participant(selected_body,uid)) then raise exception 'Vous ne pouvez pas convoquer cet organe'; end if;
  if access='project_members' and not ((private.is_admin(uid) and private.has_aal2()) or private.is_project_member(selected_project,uid)) then raise exception 'Vous ne pouvez pas convoquer ce projet'; end if;
  insert into public.meetings(title,meeting_type,description,agenda,status,access_level,modality,body_id,project_id,starts_at,ends_at,timezone,venue,online_provider,meeting_url,access_instructions,organizer_id,capacity,registration_deadline,allow_external_guests)
  values(trim(p_meeting->>'title'),coalesce(p_meeting->>'meeting_type','other'),nullif(trim(p_meeting->>'description'),''),nullif(trim(p_meeting->>'agenda'),''),coalesce(p_meeting->>'status','scheduled'),access,coalesce(p_meeting->>'modality','online'),selected_body,selected_project,(p_meeting->>'starts_at')::timestamptz,(p_meeting->>'ends_at')::timestamptz,coalesce(nullif(p_meeting->>'timezone',''),'Africa/Douala'),nullif(trim(p_meeting->>'venue'),''),nullif(p_meeting->>'online_provider',''),nullif(trim(p_meeting->>'meeting_url'),''),nullif(trim(p_meeting->>'access_instructions'),''),uid,nullif(p_meeting->>'capacity','')::integer,nullif(p_meeting->>'registration_deadline','')::timestamptz,external_allowed) returning id into mid;
  insert into public.meeting_participants(meeting_id,user_id,participant_role,response_status,invited_by) values(mid,uid,'organizer','accepted',uid);
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
      if guest_email<>'' then insert into public.meeting_guests(meeting_id,full_name,email,organization,participant_role,invited_by) values(mid,coalesce(nullif(trim(guest->>'full_name'),''),guest_email),guest_email,nullif(trim(guest->>'organization'),''),coalesce(nullif(guest->>'participant_role',''),'guest'),uid) on conflict do nothing; end if;
    end loop;
  end if;
  perform private.assert_meeting_capacity(mid);
  perform private.write_audit('meeting.created','meeting',mid,jsonb_build_object('access_level',access,'body_id',selected_body,'project_id',selected_project));
  return mid;
end;
$$;

create or replace function public.add_meeting_invitees(target_meeting uuid, p_participant_ids uuid[] default '{}'::uuid[], p_guests jsonb default '[]'::jsonb)
returns integer language plpgsql security definer set search_path=''
as $$
declare uid uuid:=auth.uid(); guest jsonb; guest_email text; added integer:=0; affected integer; external_allowed boolean;
begin
  if uid is null or not private.can_manage_meeting(target_meeting,uid) then raise exception 'Gestion de la réunion non autorisée'; end if;
  select allow_external_guests into external_allowed from public.meetings where id=target_meeting;
  insert into public.meeting_participants(meeting_id,user_id,invited_by)
  select target_meeting,p.id,uid from public.profiles p join unnest(coalesce(p_participant_ids,'{}'::uuid[])) selected(id) on selected.id=p.id where p.status='active' and p.registration_state='approved' and p.id<>uid on conflict do nothing;
  get diagnostics added=row_count;
  if external_allowed then
    for guest in select value from jsonb_array_elements(coalesce(p_guests,'[]'::jsonb)) loop
      guest_email:=lower(trim(guest->>'email'));
      if guest_email<>'' then
        insert into public.meeting_guests(meeting_id,full_name,email,organization,participant_role,invited_by) values(target_meeting,coalesce(nullif(trim(guest->>'full_name'),''),guest_email),guest_email,nullif(trim(guest->>'organization'),''),coalesce(nullif(guest->>'participant_role',''),'guest'),uid) on conflict do nothing;
        get diagnostics affected=row_count; added:=added+affected;
      end if;
    end loop;
  elsif jsonb_array_length(coalesce(p_guests,'[]'::jsonb))>0 then raise exception 'Les invités externes sont désactivés pour cette réunion'; end if;
  perform private.assert_meeting_capacity(target_meeting);
  perform private.write_audit('meeting.invitees_added','meeting',target_meeting,jsonb_build_object('added',added));
  return added;
end;
$$;

create or replace function private.protect_meeting_participant_update()
returns trigger language plpgsql security definer set search_path=''
as $$
declare m public.meetings;
begin
  if not private.can_manage_meeting(old.meeting_id) then
    if old.user_id<>auth.uid() then raise exception 'Modification non autorisée'; end if;
    new.meeting_id=old.meeting_id; new.user_id=old.user_id; new.participant_role=old.participant_role; new.attendance_status=old.attendance_status; new.invited_by=old.invited_by; new.notify_by_email=old.notify_by_email; new.email_status=old.email_status; new.email_sent_at=old.email_sent_at; new.email_error=old.email_error; new.invited_at=old.invited_at; new.joined_at=old.joined_at;
    if new.response_status is distinct from old.response_status then
      select * into m from public.meetings where id=old.meeting_id;
      if m.status not in ('scheduled','in_progress') then raise exception 'La réponse à cette invitation est fermée'; end if;
      if m.registration_deadline is not null and now()>m.registration_deadline then raise exception 'La date limite de réponse est dépassée'; end if;
      new.responded_at=now();
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.respond_to_guest_meeting(p_token uuid, p_response text)
returns boolean language plpgsql security definer set search_path=''
as $$
declare guest public.meeting_guests; organizer uuid; m public.meetings;
begin
  if p_response not in ('accepted','declined','tentative') then raise exception 'Réponse invalide'; end if;
  select * into guest from public.meeting_guests where invitation_token=p_token;
  if guest.id is null then return false; end if;
  select * into m from public.meetings where id=guest.meeting_id;
  if m.status not in ('scheduled','in_progress') then raise exception 'La réponse à cette invitation est fermée'; end if;
  if m.registration_deadline is not null and now()>m.registration_deadline then raise exception 'La date limite de réponse est dépassée'; end if;
  update public.meeting_guests set response_status=p_response,responded_at=now() where id=guest.id;
  organizer:=m.organizer_id;
  insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id)
  values(organizer,'Réponse d’un invité externe',guest.full_name || ' : ' || case p_response when 'accepted' then 'participe' when 'declined' then 'ne participe pas' else 'peut-être' end,'/espace?tab=reunions&meeting='||guest.meeting_id,'meeting','meeting',guest.meeting_id);
  return true;
end;
$$;

create or replace function private.notify_meeting_change()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_title text; v_body text;
begin
  if new.status='scheduled' and old.status='draft' then v_title='Réunion AIAC programmée'; v_body=new.title || ' · ' || to_char(new.starts_at at time zone new.timezone,'DD/MM/YYYY HH24:MI');
  elsif new.status='cancelled' and old.status is distinct from 'cancelled' then v_title='Réunion AIAC annulée'; v_body=new.title;
  elsif new.title is distinct from old.title or new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at or new.venue is distinct from old.venue or new.meeting_url is distinct from old.meeting_url or new.modality is distinct from old.modality or new.agenda is distinct from old.agenda or new.description is distinct from old.description or new.access_instructions is distinct from old.access_instructions then v_title='Réunion AIAC modifiée'; v_body=new.title || ' · ' || to_char(new.starts_at at time zone new.timezone,'DD/MM/YYYY HH24:MI');
  else return new; end if;
  insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id)
  select mp.user_id,v_title,left(v_body,500),'/espace?tab=reunions&meeting='||new.id,'meeting','meeting',new.id from public.meeting_participants mp where mp.meeting_id=new.id and mp.user_id<>auth.uid();
  perform private.write_audit('meeting.changed','meeting',new.id,jsonb_build_object('status',new.status,'starts_at',new.starts_at));
  return new;
end;
$$;

create or replace function public.notify_meeting_reminder(target_meeting uuid)
returns integer language plpgsql security definer set search_path=''
as $$
declare uid uuid:=auth.uid(); n integer;
begin
  if uid is null or not private.can_manage_meeting(target_meeting,uid) then raise exception 'Gestion de la réunion non autorisée'; end if;
  insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id)
  select mp.user_id,'Rappel de réunion AIAC',m.title || ' · ' || to_char(m.starts_at at time zone m.timezone,'DD/MM/YYYY HH24:MI'),'/espace?tab=reunions&meeting='||m.id,'meeting','meeting',m.id
  from public.meetings m join public.meeting_participants mp on mp.meeting_id=m.id where m.id=target_meeting and mp.user_id<>uid and mp.response_status<>'declined';
  get diagnostics n=row_count;
  perform private.write_audit('meeting.reminder_sent','meeting',target_meeting,jsonb_build_object('site_notifications',n));
  return n;
end;
$$;
revoke all on function public.notify_meeting_reminder(uuid) from public, anon;
grant execute on function public.notify_meeting_reminder(uuid) to authenticated;

create or replace function public.update_meeting_details(target_meeting uuid, p_patch jsonb)
returns uuid language plpgsql security definer set search_path=''
as $$
declare uid uuid:=auth.uid(); oldm public.meetings; access text; selected_body uuid; selected_project uuid;
begin
  if uid is null or not private.can_manage_meeting(target_meeting,uid) then raise exception 'Gestion de la réunion non autorisée'; end if;
  select * into oldm from public.meetings where id=target_meeting for update;
  if oldm.id is null then raise exception 'Réunion introuvable'; end if;
  if oldm.status='archived' then raise exception 'Une réunion archivée ne peut plus être modifiée'; end if;
  access=coalesce(nullif(p_patch->>'access_level',''),oldm.access_level);
  selected_body=case when access='body_members' then coalesce(nullif(p_patch->>'body_id','')::uuid,oldm.body_id) else null end;
  selected_project=case when access='project_members' then coalesce(nullif(p_patch->>'project_id','')::uuid,oldm.project_id) else null end;
  if access='all_members' and not (private.is_admin(uid) and private.has_aal2()) then raise exception 'Seuls les administrateurs authentifiés peuvent convoquer tous les membres'; end if;
  if access='body_members' and not ((private.is_admin(uid) and private.has_aal2()) or private.is_body_participant(selected_body,uid)) then raise exception 'Vous ne pouvez pas convoquer cet organe'; end if;
  if access='project_members' and not ((private.is_admin(uid) and private.has_aal2()) or private.is_project_member(selected_project,uid)) then raise exception 'Vous ne pouvez pas convoquer ce projet'; end if;
  update public.meetings set title=coalesce(nullif(trim(p_patch->>'title'),''),title), meeting_type=coalesce(nullif(p_patch->>'meeting_type',''),meeting_type), description=case when p_patch ? 'description' then nullif(trim(p_patch->>'description'),'') else description end, agenda=case when p_patch ? 'agenda' then nullif(trim(p_patch->>'agenda'),'') else agenda end, access_level=access, body_id=selected_body, project_id=selected_project, modality=coalesce(nullif(p_patch->>'modality',''),modality), starts_at=case when p_patch ? 'starts_at' then (p_patch->>'starts_at')::timestamptz else starts_at end, ends_at=case when p_patch ? 'ends_at' then (p_patch->>'ends_at')::timestamptz else ends_at end, timezone=coalesce(nullif(p_patch->>'timezone',''),timezone), venue=case when p_patch ? 'venue' then nullif(trim(p_patch->>'venue'),'') else venue end, online_provider=case when p_patch ? 'online_provider' then nullif(p_patch->>'online_provider','') else online_provider end, meeting_url=case when p_patch ? 'meeting_url' then nullif(trim(p_patch->>'meeting_url'),'') else meeting_url end, access_instructions=case when p_patch ? 'access_instructions' then nullif(trim(p_patch->>'access_instructions'),'') else access_instructions end, capacity=case when p_patch ? 'capacity' then nullif(p_patch->>'capacity','')::integer else capacity end, registration_deadline=case when p_patch ? 'registration_deadline' then nullif(p_patch->>'registration_deadline','')::timestamptz else registration_deadline end, allow_external_guests=case when p_patch ? 'allow_external_guests' then (p_patch->>'allow_external_guests')::boolean else allow_external_guests end where id=target_meeting;
  perform private.assert_meeting_capacity(target_meeting);
  perform private.write_audit('meeting.details_updated','meeting',target_meeting,jsonb_build_object('field_count',(select count(*) from jsonb_object_keys(p_patch))));
  return target_meeting;
end;
$$;
revoke all on function public.update_meeting_details(uuid,jsonb) from public, anon;
grant execute on function public.update_meeting_details(uuid,jsonb) to authenticated;

create or replace function public.set_meeting_status(target_meeting uuid, target_status text)
returns text language plpgsql security definer set search_path=''
as $$
declare uid uuid:=auth.uid(); current_status text;
begin
  if uid is null or not private.can_manage_meeting(target_meeting,uid) then raise exception 'Gestion de la réunion non autorisée'; end if;
  if target_status not in ('scheduled','in_progress','completed','cancelled','archived') then raise exception 'Statut cible invalide'; end if;
  select status into current_status from public.meetings where id=target_meeting for update;
  if current_status is null then raise exception 'Réunion introuvable'; end if;
  if not ((current_status='draft' and target_status in ('scheduled','cancelled')) or (current_status='scheduled' and target_status in ('in_progress','cancelled')) or (current_status='in_progress' and target_status in ('completed','cancelled')) or (current_status in ('completed','cancelled') and target_status='archived') or current_status=target_status) then raise exception 'Transition de statut non autorisée : % vers %',current_status,target_status; end if;
  update public.meetings set status=target_status where id=target_meeting;
  perform private.write_audit('meeting.status_changed','meeting',target_meeting,jsonb_build_object('from',current_status,'to',target_status));
  return target_status;
end;
$$;
revoke all on function public.set_meeting_status(uuid,text) from public, anon;
grant execute on function public.set_meeting_status(uuid,text) to authenticated;

create or replace function public.record_meeting_attendance(target_meeting uuid, target_user uuid default null, target_guest uuid default null, target_status text default 'present')
returns boolean language plpgsql security definer set search_path=''
as $$
declare uid uuid:=auth.uid(); affected integer;
begin
  if uid is null or not private.can_manage_meeting(target_meeting,uid) then raise exception 'Gestion de la réunion non autorisée'; end if;
  if target_status not in ('not_recorded','present','absent','excused','late') then raise exception 'Présence invalide'; end if;
  if (target_user is null)=(target_guest is null) then raise exception 'Indiquez exactement un participant interne ou un invité externe'; end if;
  if target_user is not null then update public.meeting_participants set attendance_status=target_status,joined_at=case when target_status in ('present','late') then coalesce(joined_at,now()) else joined_at end where meeting_id=target_meeting and user_id=target_user;
  else update public.meeting_guests set attendance_status=target_status where meeting_id=target_meeting and id=target_guest; end if;
  get diagnostics affected=row_count;
  if affected<>1 then raise exception 'Participant introuvable'; end if;
  perform private.write_audit('meeting.attendance_recorded','meeting',target_meeting,jsonb_build_object('user_id',target_user,'guest_id',target_guest,'attendance',target_status));
  return true;
end;
$$;
revoke all on function public.record_meeting_attendance(uuid,uuid,uuid,text) from public, anon;
grant execute on function public.record_meeting_attendance(uuid,uuid,uuid,text) to authenticated;

create or replace function public.save_meeting_closeout(target_meeting uuid, p_minutes text default null, p_decisions text default null, p_follow_up_actions text default null)
returns uuid language plpgsql security definer set search_path=''
as $$
declare uid uuid:=auth.uid(); st text;
begin
  if uid is null or not private.can_manage_meeting(target_meeting,uid) then raise exception 'Gestion de la réunion non autorisée'; end if;
  select status into st from public.meetings where id=target_meeting for update;
  if st not in ('in_progress','completed') then raise exception 'Le compte rendu se renseigne pendant ou après la réunion'; end if;
  update public.meetings set minutes=nullif(trim(coalesce(p_minutes,'')),''),decisions=nullif(trim(coalesce(p_decisions,'')),''),follow_up_actions=nullif(trim(coalesce(p_follow_up_actions,'')),''),minutes_recorded_at=now(),minutes_recorded_by=uid where id=target_meeting;
  perform private.write_audit('meeting.closeout_saved','meeting',target_meeting,jsonb_build_object('has_minutes',nullif(trim(coalesce(p_minutes,'')),'') is not null,'has_decisions',nullif(trim(coalesce(p_decisions,'')),'') is not null));
  return target_meeting;
end;
$$;
revoke all on function public.save_meeting_closeout(uuid,text,text,text) from public, anon;
grant execute on function public.save_meeting_closeout(uuid,text,text,text) to authenticated;

create or replace function public.remove_meeting_invitee(target_meeting uuid, target_user uuid default null, target_guest uuid default null)
returns boolean language plpgsql security definer set search_path=''
as $$
declare uid uuid:=auth.uid(); affected integer;
begin
  if uid is null or not private.can_manage_meeting(target_meeting,uid) then raise exception 'Gestion de la réunion non autorisée'; end if;
  if (target_user is null)=(target_guest is null) then raise exception 'Indiquez exactement un participant interne ou un invité externe'; end if;
  if target_user is not null then delete from public.meeting_participants where meeting_id=target_meeting and user_id=target_user and participant_role<>'organizer'; else delete from public.meeting_guests where meeting_id=target_meeting and id=target_guest; end if;
  get diagnostics affected=row_count;
  if affected=1 then perform private.write_audit('meeting.invitee_removed','meeting',target_meeting,jsonb_build_object('user_id',target_user,'guest_id',target_guest)); end if;
  return affected=1;
end;
$$;
revoke all on function public.remove_meeting_invitee(uuid,uuid,uuid) from public, anon;
grant execute on function public.remove_meeting_invitee(uuid,uuid,uuid) to authenticated;

drop policy if exists meeting_guests_insert on public.meeting_guests;
create policy meeting_guests_insert on public.meeting_guests for insert to authenticated
with check (private.can_manage_meeting(meeting_id) and invited_by=auth.uid() and exists(select 1 from public.meetings m where m.id=meeting_id and m.allow_external_guests));

create or replace function private.cleanup_meeting_notifications()
returns trigger language plpgsql security definer set search_path=''
as $$ begin delete from public.notifications where entity_type='meeting' and entity_id=old.id; return old; end; $$;
drop trigger if exists meetings_cleanup_notifications on public.meetings;
create trigger meetings_cleanup_notifications after delete on public.meetings for each row execute function private.cleanup_meeting_notifications();

delete from public.notifications n where n.entity_type='meeting' and n.entity_id is not null and not exists(select 1 from public.meetings m where m.id=n.entity_id);

create index if not exists meetings_organizer_status_starts_idx on public.meetings(organizer_id,status,starts_at);
create index if not exists meeting_participants_user_response_idx on public.meeting_participants(user_id,response_status,meeting_id);
create index if not exists meeting_participants_meeting_attendance_idx on public.meeting_participants(meeting_id,attendance_status);
create index if not exists meeting_guests_meeting_attendance_idx on public.meeting_guests(meeting_id,attendance_status);
