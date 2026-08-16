create or replace function public.update_meeting_details(target_meeting uuid, p_patch jsonb)
returns uuid language plpgsql security definer set search_path=''
as $$
declare uid uuid:=auth.uid(); oldm public.meetings; access text; selected_body uuid; selected_project uuid;
begin
  if uid is null or not private.can_manage_meeting(target_meeting,uid) then raise exception 'Gestion de la réunion non autorisée'; end if;
  select * into oldm from public.meetings where id=target_meeting for update;
  if oldm.id is null then raise exception 'Réunion introuvable'; end if;
  if oldm.status='archived' then raise exception 'Une réunion archivée ne peut plus être modifiée'; end if;

  if (p_patch ? 'access_level' and nullif(p_patch->>'access_level','') is distinct from oldm.access_level)
     or (p_patch ? 'body_id' and nullif(p_patch->>'body_id','')::uuid is distinct from oldm.body_id)
     or (p_patch ? 'project_id' and nullif(p_patch->>'project_id','')::uuid is distinct from oldm.project_id) then
    raise exception 'Le public de base ne peut pas être changé après création. Ajoutez ou retirez des participants dans le dossier de la réunion.';
  end if;

  access=oldm.access_level; selected_body=oldm.body_id; selected_project=oldm.project_id;
  update public.meetings set
    title=coalesce(nullif(trim(p_patch->>'title'),''),title),
    meeting_type=coalesce(nullif(p_patch->>'meeting_type',''),meeting_type),
    description=case when p_patch ? 'description' then nullif(trim(p_patch->>'description'),'') else description end,
    agenda=case when p_patch ? 'agenda' then nullif(trim(p_patch->>'agenda'),'') else agenda end,
    access_level=access, body_id=selected_body, project_id=selected_project,
    modality=coalesce(nullif(p_patch->>'modality',''),modality),
    starts_at=case when p_patch ? 'starts_at' then (p_patch->>'starts_at')::timestamptz else starts_at end,
    ends_at=case when p_patch ? 'ends_at' then (p_patch->>'ends_at')::timestamptz else ends_at end,
    timezone=coalesce(nullif(p_patch->>'timezone',''),timezone),
    venue=case when p_patch ? 'venue' then nullif(trim(p_patch->>'venue'),'') else venue end,
    online_provider=case when p_patch ? 'online_provider' then nullif(p_patch->>'online_provider','') else online_provider end,
    meeting_url=case when p_patch ? 'meeting_url' then nullif(trim(p_patch->>'meeting_url'),'') else meeting_url end,
    access_instructions=case when p_patch ? 'access_instructions' then nullif(trim(p_patch->>'access_instructions'),'') else access_instructions end,
    capacity=case when p_patch ? 'capacity' then nullif(p_patch->>'capacity','')::integer else capacity end,
    registration_deadline=case when p_patch ? 'registration_deadline' then nullif(p_patch->>'registration_deadline','')::timestamptz else registration_deadline end,
    allow_external_guests=case when p_patch ? 'allow_external_guests' then (p_patch->>'allow_external_guests')::boolean else allow_external_guests end
  where id=target_meeting;
  perform private.assert_meeting_capacity(target_meeting);
  perform private.write_audit('meeting.details_updated','meeting',target_meeting,jsonb_build_object('field_count',(select count(*) from jsonb_object_keys(p_patch))));
  return target_meeting;
end;
$$;
