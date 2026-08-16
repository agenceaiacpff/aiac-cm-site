drop policy if exists meeting_participants_delete on public.meeting_participants;
create policy meeting_participants_delete on public.meeting_participants
for delete to authenticated
using (
  private.can_manage_meeting(meeting_id)
  and participant_role<>'organizer'
  and exists(select 1 from public.meetings m where m.id=meeting_id and m.status in ('draft','scheduled','in_progress'))
);

drop policy if exists meeting_guests_delete on public.meeting_guests;
create policy meeting_guests_delete on public.meeting_guests
for delete to authenticated
using (
  private.can_manage_meeting(meeting_id)
  and exists(select 1 from public.meetings m where m.id=meeting_id and m.status in ('draft','scheduled','in_progress'))
);

create or replace function public.remove_meeting_invitee(target_meeting uuid, target_user uuid default null, target_guest uuid default null)
returns boolean language plpgsql security definer set search_path=''
as $$
declare uid uuid:=auth.uid(); affected integer; st text; target_name text;
begin
  if uid is null or not private.can_manage_meeting(target_meeting,uid) then raise exception 'Gestion de la réunion non autorisée'; end if;
  select status into st from public.meetings where id=target_meeting;
  if st not in ('draft','scheduled','in_progress') then raise exception 'La liste des participants d’une réunion terminée, annulée ou archivée est conservée pour la traçabilité'; end if;
  if (target_user is null)=(target_guest is null) then raise exception 'Indiquez exactement un participant interne ou un invité externe'; end if;
  if target_user is not null then
    select coalesce(full_name,email,'Participant') into target_name from public.profiles where id=target_user;
    if st<>'draft' then
      insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id)
      values(target_user,'Invitation à une réunion retirée','Votre invitation à cette réunion a été retirée par l’organisateur.','/espace?tab=reunions&meeting='||target_meeting,'meeting','meeting',target_meeting);
    end if;
    delete from public.meeting_participants where meeting_id=target_meeting and user_id=target_user and participant_role<>'organizer';
  else
    delete from public.meeting_guests where meeting_id=target_meeting and id=target_guest;
  end if;
  get diagnostics affected=row_count;
  if affected=1 then perform private.write_audit('meeting.invitee_removed','meeting',target_meeting,jsonb_build_object('user_id',target_user,'guest_id',target_guest,'meeting_status',st)); end if;
  return affected=1;
end;
$$;

create or replace function public.record_meeting_attendance(target_meeting uuid, target_user uuid default null, target_guest uuid default null, target_status text default 'present')
returns boolean language plpgsql security definer set search_path=''
as $$
declare uid uuid:=auth.uid(); affected integer; st text;
begin
  if uid is null or not private.can_manage_meeting(target_meeting,uid) then raise exception 'Gestion de la réunion non autorisée'; end if;
  select status into st from public.meetings where id=target_meeting;
  if st not in ('in_progress','completed') then raise exception 'La présence se renseigne uniquement pendant une réunion ou après sa tenue, avant archivage'; end if;
  if target_status not in ('not_recorded','present','absent','excused','late') then raise exception 'Présence invalide'; end if;
  if (target_user is null)=(target_guest is null) then raise exception 'Indiquez exactement un participant interne ou un invité externe'; end if;
  if target_user is not null then
    update public.meeting_participants set attendance_status=target_status,joined_at=case when target_status in ('present','late') then coalesce(joined_at,now()) else joined_at end where meeting_id=target_meeting and user_id=target_user;
  else
    update public.meeting_guests set attendance_status=target_status where meeting_id=target_meeting and id=target_guest;
  end if;
  get diagnostics affected=row_count;
  if affected<>1 then raise exception 'Participant introuvable'; end if;
  perform private.write_audit('meeting.attendance_recorded','meeting',target_meeting,jsonb_build_object('user_id',target_user,'guest_id',target_guest,'attendance',target_status));
  return true;
end;
$$;

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
  if target_status='in_progress' and current_status='scheduled' then
    update public.meeting_participants p
    set attendance_status='present',joined_at=coalesce(p.joined_at,now())
    from public.meetings m
    where m.id=target_meeting and p.meeting_id=m.id and p.user_id=m.organizer_id and p.participant_role='organizer';
  end if;
  perform private.write_audit('meeting.status_changed','meeting',target_meeting,jsonb_build_object('from',current_status,'to',target_status));
  return target_status;
end;
$$;
