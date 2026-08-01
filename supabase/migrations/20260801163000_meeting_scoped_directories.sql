-- Répertoires de convocation limités aux structures auxquelles appartient l'organisateur.
create or replace function public.list_meeting_bodies()
returns table(id uuid,code text,name text,status text)
language sql stable security definer set search_path='' as $$
  select b.id,b.code,b.name,b.status
  from public.governance_bodies b
  where b.status='active' and private.is_active_user()
    and (
      (private.is_admin() and private.has_aal2())
      or (not private.is_admin() and private.is_body_participant(b.id))
    )
  order by b.name;
$$;
revoke all on function public.list_meeting_bodies() from public,anon;
grant execute on function public.list_meeting_bodies() to authenticated;

create or replace function public.list_meeting_projects()
returns table(id uuid,code text,name text,status text)
language sql stable security definer set search_path='' as $$
  select p.id,p.code,p.name,p.status
  from public.projects p
  where private.is_active_user()
    and (
      (private.is_admin() and private.has_aal2())
      or (not private.is_admin() and private.is_project_member(p.id))
    )
  order by p.name;
$$;
revoke all on function public.list_meeting_projects() from public,anon;
grant execute on function public.list_meeting_projects() to authenticated;

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
  if access='body_members' and not ((private.is_admin(uid) and private.has_aal2()) or (not private.is_admin(uid) and private.is_body_participant(selected_body,uid))) then raise exception 'Vous ne pouvez pas convoquer cet organe'; end if;
  if access='project_members' and not ((private.is_admin(uid) and private.has_aal2()) or (not private.is_admin(uid) and private.is_project_member(selected_project,uid))) then raise exception 'Vous ne pouvez pas convoquer ce projet'; end if;

  insert into public.meetings(title,meeting_type,description,agenda,status,access_level,modality,body_id,project_id,starts_at,ends_at,timezone,venue,online_provider,meeting_url,access_instructions,organizer_id,capacity,registration_deadline,allow_external_guests)
  values(
    trim(p_meeting->>'title'),coalesce(p_meeting->>'meeting_type','other'),nullif(trim(p_meeting->>'description'),''),nullif(trim(p_meeting->>'agenda'),''),
    coalesce(p_meeting->>'status','scheduled'),access,coalesce(p_meeting->>'modality','online'),selected_body,selected_project,
    (p_meeting->>'starts_at')::timestamptz,(p_meeting->>'ends_at')::timestamptz,coalesce(nullif(p_meeting->>'timezone',''),'Africa/Douala'),
    nullif(trim(p_meeting->>'venue'),''),nullif(p_meeting->>'online_provider',''),nullif(trim(p_meeting->>'meeting_url'),''),nullif(trim(p_meeting->>'access_instructions'),''),uid,
    nullif(p_meeting->>'capacity','')::integer,nullif(p_meeting->>'registration_deadline','')::timestamptz,coalesce((p_meeting->>'allow_external_guests')::boolean,true)
  ) returning id into mid;

  insert into public.meeting_participants(meeting_id,user_id,participant_role,response_status,invited_by) values(mid,uid,'organizer','accepted',uid);
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
        values(mid,coalesce(nullif(trim(guest->>'full_name'),''),guest_email),guest_email,nullif(trim(guest->>'organization'),''),coalesce(nullif(guest->>'participant_role',''),'guest'),uid) on conflict do nothing;
      end if;
    end loop;
  end if;
  perform private.write_audit('meeting.created','meeting',mid,jsonb_build_object('access_level',access,'body_id',selected_body,'project_id',selected_project));
  return mid;
end;
$$;
revoke all on function public.create_meeting(jsonb,uuid[],jsonb) from public,anon;
grant execute on function public.create_meeting(jsonb,uuid[],jsonb) to authenticated;
