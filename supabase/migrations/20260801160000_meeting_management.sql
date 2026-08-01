-- Réunions institutionnelles AIAC : agenda, invitations, participation en ligne,
-- notifications internes, invités externes et suivi des réponses.

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('REU-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  title text not null check (char_length(title) between 3 and 220),
  meeting_type text not null check (meeting_type in (
    'general_assembly','board','expanded_board','executive','subsidiary_body',
    'regional_coordination','expanded_regional_coordination','branch','expanded_branch',
    'project','team','partner','training','public','other'
  )),
  description text check (description is null or char_length(description) <= 10000),
  agenda text check (agenda is null or char_length(agenda) <= 20000),
  status text not null default 'scheduled' check (status in ('draft','scheduled','in_progress','completed','cancelled','archived')),
  access_level text not null default 'invite_only' check (access_level in ('invite_only','body_members','project_members','all_members')),
  modality text not null default 'online' check (modality in ('online','in_person','hybrid')),
  body_id uuid references public.governance_bodies(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'Africa/Douala' check (char_length(timezone) between 3 and 80),
  venue text check (venue is null or char_length(venue) <= 500),
  online_provider text check (online_provider is null or online_provider in ('jitsi','google_meet','zoom','microsoft_teams','other')),
  meeting_url text check (meeting_url is null or (char_length(meeting_url) <= 2000 and meeting_url ~* '^https://')),
  access_instructions text check (access_instructions is null or char_length(access_instructions) <= 5000),
  organizer_id uuid not null references public.profiles(id) on delete restrict,
  capacity integer check (capacity is null or capacity between 1 and 10000),
  registration_deadline timestamptz,
  allow_external_guests boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (registration_deadline is null or registration_deadline <= starts_at),
  check (access_level <> 'body_members' or body_id is not null),
  check (access_level <> 'project_members' or project_id is not null),
  check (modality <> 'in_person' or venue is not null)
);

create table public.meeting_participants (
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  participant_role text not null default 'participant' check (participant_role in ('organizer','chair','secretary','participant','observer','presenter')),
  response_status text not null default 'pending' check (response_status in ('pending','accepted','declined','tentative')),
  attendance_status text not null default 'not_recorded' check (attendance_status in ('not_recorded','present','absent','excused','late')),
  invited_by uuid not null references public.profiles(id) on delete restrict,
  notify_by_email boolean not null default true,
  email_status text not null default 'pending' check (email_status in ('pending','sent','failed','skipped')),
  email_sent_at timestamptz,
  email_error text,
  invited_at timestamptz not null default now(),
  responded_at timestamptz,
  joined_at timestamptz,
  primary key(meeting_id,user_id)
);

create table public.meeting_guests (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 180),
  email text not null check (email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  organization text check (organization is null or char_length(organization) <= 220),
  participant_role text not null default 'guest' check (participant_role in ('guest','observer','presenter','partner')),
  response_status text not null default 'pending' check (response_status in ('pending','accepted','declined','tentative')),
  attendance_status text not null default 'not_recorded' check (attendance_status in ('not_recorded','present','absent','excused','late')),
  invitation_token uuid not null unique default gen_random_uuid(),
  email_status text not null default 'pending' check (email_status in ('pending','sent','failed','skipped')),
  email_sent_at timestamptz,
  email_error text,
  invited_by uuid not null references public.profiles(id) on delete restrict,
  invited_at timestamptz not null default now(),
  responded_at timestamptz
);

create unique index meeting_guests_meeting_email_uidx on public.meeting_guests(meeting_id,lower(email));
create index meetings_start_status_idx on public.meetings(starts_at,status) where status in ('scheduled','in_progress');
create index meetings_body_start_idx on public.meetings(body_id,starts_at desc) where body_id is not null;
create index meetings_project_start_idx on public.meetings(project_id,starts_at desc) where project_id is not null;
create index meetings_organizer_start_idx on public.meetings(organizer_id,starts_at desc);
create index meeting_participants_user_start_idx on public.meeting_participants(user_id,meeting_id,response_status);
create index meeting_guests_meeting_idx on public.meeting_guests(meeting_id,email_status);

create or replace function private.is_body_participant(target_body uuid,uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
  select private.is_active_user(uid) and (
    private.is_admin(uid)
    or exists(
      select 1 from public.institutional_members im
      join public.body_memberships bm on bm.member_id=im.id
      where im.profile_id=uid and im.status='active' and bm.body_id=target_body and bm.status='active'
    )
    or exists(select 1 from public.workforce_assignments wa where wa.profile_id=uid and wa.body_id=target_body and wa.status='active')
    or exists(select 1 from public.position_assignments pa where pa.profile_id=uid and pa.body_id=target_body and pa.status='active')
  );
$$;

create or replace function private.can_view_meeting(target_id uuid,uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
  select private.is_active_user(uid) and exists(
    select 1 from public.meetings m where m.id=target_id and (
      m.organizer_id=uid
      or (private.is_admin(uid) and private.has_aal2())
      or exists(select 1 from public.meeting_participants mp where mp.meeting_id=m.id and mp.user_id=uid)
      or (m.access_level='all_members')
      or (m.access_level='body_members' and private.is_body_participant(m.body_id,uid))
      or (m.access_level='project_members' and private.is_project_member(m.project_id,uid))
    )
  );
$$;

create or replace function private.can_manage_meeting(target_id uuid,uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
  select private.is_active_user(uid) and exists(
    select 1 from public.meetings m where m.id=target_id
      and (m.organizer_id=uid or (private.is_admin(uid) and private.has_aal2()))
  );
$$;

revoke all on function private.is_body_participant(uuid,uuid),private.can_view_meeting(uuid,uuid),private.can_manage_meeting(uuid,uuid) from public,anon;
grant execute on function private.is_body_participant(uuid,uuid),private.can_view_meeting(uuid,uuid),private.can_manage_meeting(uuid,uuid) to authenticated;

create or replace function private.prepare_meeting() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.modality in ('online','hybrid') and nullif(trim(coalesce(new.meeting_url,'')),'') is null then
    if coalesce(new.online_provider,'jitsi') <> 'jitsi' then
      raise exception 'Ajoutez le lien de la réunion pour le fournisseur sélectionné';
    end if;
    new.online_provider='jitsi';
    new.meeting_url='https://meet.jit.si/AIAC-' || upper(replace(new.id::text,'-',''));
  end if;
  if new.modality='in_person' then
    new.meeting_url=null;
    new.online_provider=null;
  end if;
  new.updated_at=now();
  return new;
end;
$$;
revoke all on function private.prepare_meeting() from public,anon,authenticated;
create trigger meetings_prepare before insert or update on public.meetings for each row execute function private.prepare_meeting();

create or replace function private.notify_meeting_participant() returns trigger
language plpgsql security definer set search_path='' as $$
declare m public.meetings;
begin
  select * into m from public.meetings where id=new.meeting_id;
  if new.user_id<>m.organizer_id and m.status in ('scheduled','in_progress') then
    insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id)
    values(new.user_id,'Invitation à une réunion AIAC',m.title || ' · ' || to_char(m.starts_at at time zone m.timezone,'DD/MM/YYYY HH24:MI'),'/espace?tab=reunions&meeting='||m.id,'meeting','meeting',m.id);
  end if;
  return new;
end;
$$;
revoke all on function private.notify_meeting_participant() from public,anon,authenticated;
create trigger meeting_participants_notify after insert on public.meeting_participants for each row execute function private.notify_meeting_participant();

create or replace function private.notify_meeting_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_title text; v_body text;
begin
  if new.status='scheduled' and old.status='draft' then
    v_title='Réunion AIAC programmée';
    v_body=new.title || ' · ' || to_char(new.starts_at at time zone new.timezone,'DD/MM/YYYY HH24:MI');
  elsif new.status='cancelled' and old.status is distinct from 'cancelled' then
    v_title='Réunion AIAC annulée'; v_body=new.title;
  elsif new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at
     or new.venue is distinct from old.venue or new.meeting_url is distinct from old.meeting_url then
    v_title='Réunion AIAC modifiée';
    v_body=new.title || ' · ' || to_char(new.starts_at at time zone new.timezone,'DD/MM/YYYY HH24:MI');
  else
    return new;
  end if;
  insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id)
  select mp.user_id,v_title,left(v_body,500),'/espace?tab=reunions&meeting='||new.id,'meeting','meeting',new.id
  from public.meeting_participants mp where mp.meeting_id=new.id and mp.user_id<>auth.uid();
  perform private.write_audit('meeting.changed','meeting',new.id,jsonb_build_object('status',new.status,'starts_at',new.starts_at));
  return new;
end;
$$;
revoke all on function private.notify_meeting_change() from public,anon,authenticated;
create trigger meetings_notify_change after update on public.meetings for each row execute function private.notify_meeting_change();

create or replace function private.protect_meeting_participant_update() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if not private.can_manage_meeting(old.meeting_id) then
    if old.user_id<>auth.uid() then raise exception 'Modification non autorisée'; end if;
    new.meeting_id=old.meeting_id; new.user_id=old.user_id; new.participant_role=old.participant_role;
    new.attendance_status=old.attendance_status; new.invited_by=old.invited_by;
    new.notify_by_email=old.notify_by_email; new.email_status=old.email_status;
    new.email_sent_at=old.email_sent_at; new.email_error=old.email_error;
    new.invited_at=old.invited_at; new.joined_at=old.joined_at;
    if new.response_status is distinct from old.response_status then new.responded_at=now(); end if;
  end if;
  return new;
end;
$$;
revoke all on function private.protect_meeting_participant_update() from public,anon,authenticated;
create trigger meeting_participants_protect before update on public.meeting_participants for each row execute function private.protect_meeting_participant_update();

create or replace function private.notify_meeting_response() returns trigger
language plpgsql security definer set search_path='' as $$
declare m public.meetings; participant_name text;
begin
  if new.response_status is distinct from old.response_status then
    select * into m from public.meetings where id=new.meeting_id;
    select coalesce(full_name,email,'Participant') into participant_name from public.profiles where id=new.user_id;
    if m.organizer_id<>new.user_id then
      insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id)
      values(m.organizer_id,'Réponse à une invitation',participant_name || ' : ' || new.response_status,'/espace?tab=reunions&meeting='||m.id,'meeting','meeting',m.id);
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.notify_meeting_response() from public,anon,authenticated;
create trigger meeting_participants_notify_response after update of response_status on public.meeting_participants for each row execute function private.notify_meeting_response();

alter table public.meetings enable row level security;
alter table public.meeting_participants enable row level security;
alter table public.meeting_guests enable row level security;

create policy meetings_select on public.meetings for select to authenticated using ((select private.can_view_meeting(id)));
create policy meetings_insert on public.meetings for insert to authenticated with check (organizer_id=(select auth.uid()) and (select private.is_active_user()));
create policy meetings_update on public.meetings for update to authenticated using ((select private.can_manage_meeting(id))) with check ((select private.can_manage_meeting(id)));
create policy meetings_delete on public.meetings for delete to authenticated using ((select private.can_manage_meeting(id)) and status='draft');

create policy meeting_participants_select on public.meeting_participants for select to authenticated using ((select private.can_view_meeting(meeting_id)));
create policy meeting_participants_insert on public.meeting_participants for insert to authenticated with check ((select private.can_manage_meeting(meeting_id)) and invited_by=(select auth.uid()));
create policy meeting_participants_update on public.meeting_participants for update to authenticated
using (user_id=(select auth.uid()) or (select private.can_manage_meeting(meeting_id)))
with check (user_id=(select auth.uid()) or (select private.can_manage_meeting(meeting_id)));
create policy meeting_participants_delete on public.meeting_participants for delete to authenticated using ((select private.can_manage_meeting(meeting_id)) and participant_role<>'organizer');

create policy meeting_guests_select on public.meeting_guests for select to authenticated using ((select private.can_manage_meeting(meeting_id)));
create policy meeting_guests_insert on public.meeting_guests for insert to authenticated with check ((select private.can_manage_meeting(meeting_id)) and invited_by=(select auth.uid()));
create policy meeting_guests_update on public.meeting_guests for update to authenticated using ((select private.can_manage_meeting(meeting_id))) with check ((select private.can_manage_meeting(meeting_id)));
create policy meeting_guests_delete on public.meeting_guests for delete to authenticated using ((select private.can_manage_meeting(meeting_id)));

grant select,insert,update,delete on public.meetings,public.meeting_participants,public.meeting_guests to authenticated;

create or replace function public.list_meeting_recipients()
returns table(id uuid,full_name text,role text,organization text)
language sql stable security definer set search_path='' as $$
  select p.id,coalesce(p.full_name,p.email,'Membre AIAC'),p.role::text,p.organization
  from public.profiles p
  where private.is_active_user() and p.status='active' and p.registration_state='approved'
  order by coalesce(p.full_name,p.email);
$$;
revoke all on function public.list_meeting_recipients() from public,anon;
grant execute on function public.list_meeting_recipients() to authenticated;

create or replace function public.create_meeting(p_meeting jsonb,p_participant_ids uuid[] default '{}',p_guests jsonb default '[]') returns uuid
language plpgsql security definer set search_path='' as $$
declare
  uid uuid:=auth.uid(); mid uuid; access text:=coalesce(p_meeting->>'access_level','invite_only');
  selected_body uuid:=nullif(p_meeting->>'body_id','')::uuid;
  selected_project uuid:=nullif(p_meeting->>'project_id','')::uuid;
  guest jsonb; guest_email text;
begin
  if uid is null or not private.is_active_user(uid) then raise exception 'Compte actif requis'; end if;
  if access='all_members' and not (private.is_admin(uid) and private.has_aal2()) then raise exception 'Seuls les administrateurs authentifiés peuvent inviter tous les membres'; end if;
  if access='body_members' and not ((private.is_admin(uid) and private.has_aal2()) or private.is_body_participant(selected_body,uid)) then raise exception 'Vous ne pouvez pas convoquer cet organe'; end if;
  if access='project_members' and not (private.is_admin(uid) or private.is_project_member(selected_project,uid)) then raise exception 'Vous ne pouvez pas convoquer ce projet'; end if;

  insert into public.meetings(title,meeting_type,description,agenda,status,access_level,modality,body_id,project_id,starts_at,ends_at,timezone,venue,online_provider,meeting_url,access_instructions,organizer_id,capacity,registration_deadline,allow_external_guests)
  values(
    trim(p_meeting->>'title'),coalesce(p_meeting->>'meeting_type','other'),nullif(trim(p_meeting->>'description'),''),nullif(trim(p_meeting->>'agenda'),''),
    coalesce(p_meeting->>'status','scheduled'),access,coalesce(p_meeting->>'modality','online'),selected_body,selected_project,
    (p_meeting->>'starts_at')::timestamptz,(p_meeting->>'ends_at')::timestamptz,coalesce(nullif(p_meeting->>'timezone',''),'Africa/Douala'),
    nullif(trim(p_meeting->>'venue'),''),nullif(p_meeting->>'online_provider',''),nullif(trim(p_meeting->>'meeting_url'),''),nullif(trim(p_meeting->>'access_instructions'),''),uid,
    nullif(p_meeting->>'capacity','')::integer,nullif(p_meeting->>'registration_deadline','')::timestamptz,coalesce((p_meeting->>'allow_external_guests')::boolean,true)
  ) returning id into mid;

  insert into public.meeting_participants(meeting_id,user_id,participant_role,response_status,invited_by)
  values(mid,uid,'organizer','accepted',uid);

  if access='all_members' then
    insert into public.meeting_participants(meeting_id,user_id,invited_by)
    select mid,p.id,uid from public.profiles p where p.status='active' and p.registration_state='approved' and p.id<>uid on conflict do nothing;
  elsif access='body_members' then
    insert into public.meeting_participants(meeting_id,user_id,invited_by)
    select distinct mid,member_user,uid from (
      select im.profile_id member_user from public.institutional_members im join public.body_memberships bm on bm.member_id=im.id where bm.body_id=selected_body and bm.status='active' and im.status='active'
      union select wa.profile_id from public.workforce_assignments wa where wa.body_id=selected_body and wa.status='active'
      union select pa.profile_id from public.position_assignments pa where pa.body_id=selected_body and pa.status='active'
    ) members join public.profiles p on p.id=member_user where member_user is not null and member_user<>uid and p.status='active' on conflict do nothing;
  elsif access='project_members' then
    insert into public.meeting_participants(meeting_id,user_id,invited_by)
    select mid,pm.user_id,uid from public.project_members pm join public.profiles p on p.id=pm.user_id where pm.project_id=selected_project and pm.user_id<>uid and p.status='active' on conflict do nothing;
  end if;

  insert into public.meeting_participants(meeting_id,user_id,invited_by)
  select mid,p.id,uid from public.profiles p join unnest(coalesce(p_participant_ids,'{}'::uuid[])) selected(id) on selected.id=p.id
  where p.status='active' and p.registration_state='approved' and p.id<>uid on conflict do nothing;

  if coalesce((p_meeting->>'allow_external_guests')::boolean,true) then
    for guest in select value from jsonb_array_elements(coalesce(p_guests,'[]'::jsonb)) loop
      guest_email:=lower(trim(guest->>'email'));
      if guest_email<>'' then
        insert into public.meeting_guests(meeting_id,full_name,email,organization,participant_role,invited_by)
        values(mid,coalesce(nullif(trim(guest->>'full_name'),''),guest_email),guest_email,nullif(trim(guest->>'organization'),''),coalesce(nullif(guest->>'participant_role',''),'guest'),uid)
        on conflict do nothing;
      end if;
    end loop;
  end if;
  perform private.write_audit('meeting.created','meeting',mid,jsonb_build_object('access_level',access,'body_id',selected_body,'project_id',selected_project));
  return mid;
end;
$$;
revoke all on function public.create_meeting(jsonb,uuid[],jsonb) from public,anon;
grant execute on function public.create_meeting(jsonb,uuid[],jsonb) to authenticated;

create or replace function public.add_meeting_invitees(target_meeting uuid,p_participant_ids uuid[] default '{}',p_guests jsonb default '[]') returns integer
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); guest jsonb; guest_email text; added integer:=0; affected integer;
begin
  if uid is null or not private.can_manage_meeting(target_meeting,uid) then raise exception 'Gestion de la réunion non autorisée'; end if;
  insert into public.meeting_participants(meeting_id,user_id,invited_by)
  select target_meeting,p.id,uid from public.profiles p join unnest(coalesce(p_participant_ids,'{}'::uuid[])) selected(id) on selected.id=p.id
  where p.status='active' and p.id<>uid on conflict do nothing;
  get diagnostics added=row_count;
  for guest in select value from jsonb_array_elements(coalesce(p_guests,'[]'::jsonb)) loop
    guest_email:=lower(trim(guest->>'email'));
    if guest_email<>'' then
      insert into public.meeting_guests(meeting_id,full_name,email,organization,participant_role,invited_by)
      values(target_meeting,coalesce(nullif(trim(guest->>'full_name'),''),guest_email),guest_email,nullif(trim(guest->>'organization'),''),coalesce(nullif(guest->>'participant_role',''),'guest'),uid)
      on conflict do nothing;
      get diagnostics affected=row_count; added:=added+affected;
    end if;
  end loop;
  return added;
end;
$$;
revoke all on function public.add_meeting_invitees(uuid,uuid[],jsonb) from public,anon;
grant execute on function public.add_meeting_invitees(uuid,uuid[],jsonb) to authenticated;

create or replace function public.get_guest_meeting_invitation(p_token uuid)
returns table(guest_name text,guest_organization text,response_status text,meeting_id uuid,code text,title text,meeting_type text,description text,agenda text,status text,modality text,starts_at timestamptz,ends_at timestamptz,timezone text,venue text,online_provider text,meeting_url text,access_instructions text)
language sql stable security definer set search_path='' as $$
  select g.full_name,g.organization,g.response_status,m.id,m.code,m.title,m.meeting_type,m.description,m.agenda,m.status,m.modality,m.starts_at,m.ends_at,m.timezone,m.venue,m.online_provider,m.meeting_url,m.access_instructions
  from public.meeting_guests g join public.meetings m on m.id=g.meeting_id
  where g.invitation_token=p_token;
$$;
revoke all on function public.get_guest_meeting_invitation(uuid) from public;
grant execute on function public.get_guest_meeting_invitation(uuid) to anon,authenticated;

create or replace function public.respond_to_guest_meeting(p_token uuid,p_response text) returns boolean
language plpgsql security definer set search_path='' as $$
declare guest public.meeting_guests; organizer uuid;
begin
  if p_response not in ('accepted','declined','tentative') then raise exception 'Réponse invalide'; end if;
  update public.meeting_guests set response_status=p_response,responded_at=now() where invitation_token=p_token returning * into guest;
  if guest.id is null then return false; end if;
  select organizer_id into organizer from public.meetings where id=guest.meeting_id;
  insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id)
  values(organizer,'Réponse d’un invité externe',guest.full_name || ' : ' || p_response,'/espace?tab=reunions&meeting='||guest.meeting_id,'meeting','meeting',guest.meeting_id);
  return true;
end;
$$;
revoke all on function public.respond_to_guest_meeting(uuid,text) from public;
grant execute on function public.respond_to_guest_meeting(uuid,text) to anon,authenticated;

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='meetings') then
    alter publication supabase_realtime add table public.meetings;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='meeting_participants') then
    alter publication supabase_realtime add table public.meeting_participants;
  end if;
end $$;
