create or replace function private.prepare_meeting()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if tg_op='UPDATE' and new.status is distinct from old.status and not (
    (old.status='draft' and new.status in ('scheduled','cancelled')) or
    (old.status='scheduled' and new.status in ('in_progress','cancelled')) or
    (old.status='in_progress' and new.status in ('completed','cancelled')) or
    (old.status in ('completed','cancelled') and new.status='archived')
  ) then raise exception 'Transition de statut non autorisée : % vers %',old.status,new.status; end if;
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
    new.online_provider='jitsi'; new.meeting_url='https://meet.jit.si/AIAC-' || upper(replace(new.id::text,'-',''));
  end if;
  if new.modality='online' then new.venue=null; end if;
  if new.modality='in_person' then new.meeting_url=null; new.online_provider=null; end if;
  if new.modality='hybrid' and new.venue is null then raise exception 'Indiquez le lieu physique pour une réunion hybride'; end if;
  if new.registration_deadline is not null and new.registration_deadline>new.starts_at then raise exception 'La date limite de réponse doit être antérieure ou égale au début de la réunion'; end if;
  new.updated_at=now(); return new;
end;
$$;

create or replace function public.notify_meeting_reminder(target_meeting uuid)
returns integer language plpgsql security definer set search_path=''
as $$
declare uid uuid:=auth.uid(); n integer; st text;
begin
  if uid is null or not private.can_manage_meeting(target_meeting,uid) then raise exception 'Gestion de la réunion non autorisée'; end if;
  select status into st from public.meetings where id=target_meeting;
  if st not in ('scheduled','in_progress') then raise exception 'Un rappel ne peut être envoyé que pour une réunion programmée ou en cours'; end if;
  insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id)
  select mp.user_id,'Rappel de réunion AIAC',m.title || ' · ' || to_char(m.starts_at at time zone m.timezone,'DD/MM/YYYY HH24:MI'),'/espace?tab=reunions&meeting='||m.id,'meeting','meeting',m.id
  from public.meetings m join public.meeting_participants mp on mp.meeting_id=m.id
  where m.id=target_meeting and mp.user_id<>uid and mp.response_status<>'declined';
  get diagnostics n=row_count;
  perform private.write_audit('meeting.reminder_sent','meeting',target_meeting,jsonb_build_object('site_notifications',n)); return n;
end;
$$;

create or replace function private.notify_meeting_response()
returns trigger language plpgsql security definer set search_path=''
as $$
declare m public.meetings; participant_name text; response_fr text;
begin
  if new.response_status is distinct from old.response_status then
    select * into m from public.meetings where id=new.meeting_id;
    select coalesce(full_name,email,'Participant') into participant_name from public.profiles where id=new.user_id;
    response_fr=case new.response_status when 'accepted' then 'participe' when 'declined' then 'ne participe pas' when 'tentative' then 'peut-être' else 'en attente' end;
    if m.organizer_id<>new.user_id then
      insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id)
      values(m.organizer_id,'Réponse à une invitation',participant_name || ' : ' || response_fr,'/espace?tab=reunions&meeting='||m.id,'meeting','meeting',m.id);
    end if;
  end if; return new;
end;
$$;

create or replace function public.get_guest_meeting_invitation_v2(p_token uuid)
returns table(guest_name text,guest_organization text,response_status text,meeting_id uuid,code text,title text,meeting_type text,description text,agenda text,status text,modality text,starts_at timestamptz,ends_at timestamptz,timezone text,venue text,online_provider text,meeting_url text,access_instructions text,registration_deadline timestamptz)
language sql stable security definer set search_path=''
as $$
 select g.full_name,g.organization,g.response_status,m.id,m.code,m.title,m.meeting_type,m.description,m.agenda,m.status,m.modality,m.starts_at,m.ends_at,m.timezone,m.venue,m.online_provider,m.meeting_url,m.access_instructions,m.registration_deadline
 from public.meeting_guests g join public.meetings m on m.id=g.meeting_id where g.invitation_token=p_token;
$$;
revoke all on function public.get_guest_meeting_invitation_v2(uuid) from public;
grant execute on function public.get_guest_meeting_invitation_v2(uuid) to anon,authenticated;
