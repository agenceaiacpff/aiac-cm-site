create or replace function public.update_editable_task_report_content(target_report_id uuid,p_patch jsonb)
returns public.task_reports language plpgsql security definer set search_path=''
as $$
declare r public.task_reports%rowtype; before_row jsonb;
begin
  if auth.uid() is null or not private.can_edit_task_report(target_report_id,auth.uid()) then raise exception 'Ce rapport n’est pas modifiable dans son état actuel'; end if;
  if p_patch is null or jsonb_typeof(p_patch)<>'object' then raise exception 'Modification invalide'; end if;
  select * into r from public.task_reports where id=target_report_id for update; if not found then raise exception 'Rapport introuvable'; end if;
  before_row:=to_jsonb(r);
  update public.task_reports set
    report_type=case when p_patch?'report_type' then p_patch->>'report_type' else report_type end,
    title=case when p_patch?'title' then nullif(trim(p_patch->>'title'),'') else title end,
    execution_date=case when p_patch?'execution_date' then (p_patch->>'execution_date')::date else execution_date end,
    period_start=case when p_patch?'period_start' then nullif(p_patch->>'period_start','')::date else period_start end,
    period_end=case when p_patch?'period_end' then nullif(p_patch->>'period_end','')::date else period_end end,
    started_at=case when p_patch?'started_at' then nullif(p_patch->>'started_at','')::timestamptz else started_at end,
    ended_at=case when p_patch?'ended_at' then nullif(p_patch->>'ended_at','')::timestamptz else ended_at end,
    location=case when p_patch?'location' then nullif(trim(p_patch->>'location'),'') else location end,
    latitude=case when p_patch?'latitude' then nullif(p_patch->>'latitude','')::numeric else latitude end,
    longitude=case when p_patch?'longitude' then nullif(p_patch->>'longitude','')::numeric else longitude end,
    summary=case when p_patch?'summary' then trim(p_patch->>'summary') else summary end,
    objectives=case when p_patch?'objectives' then nullif(trim(p_patch->>'objectives'),'') else objectives end,
    methodology=case when p_patch?'methodology' then nullif(trim(p_patch->>'methodology'),'') else methodology end,
    outcomes=case when p_patch?'outcomes' then nullif(trim(p_patch->>'outcomes'),'') else outcomes end,
    challenges=case when p_patch?'challenges' then nullif(trim(p_patch->>'challenges'),'') else challenges end,
    recommendations=case when p_patch?'recommendations' then nullif(trim(p_patch->>'recommendations'),'') else recommendations end,
    success_story=case when p_patch?'success_story' then nullif(trim(p_patch->>'success_story'),'') else success_story end,
    safeguarding_notes=case when p_patch?'safeguarding_notes' then nullif(trim(p_patch->>'safeguarding_notes'),'') else safeguarding_notes end,
    rich_content_html=case when p_patch?'rich_content_html' then coalesce(p_patch->>'rich_content_html','') else rich_content_html end,
    women_count=case when p_patch?'women_count' then (p_patch->>'women_count')::integer else women_count end,
    men_count=case when p_patch?'men_count' then (p_patch->>'men_count')::integer else men_count end,
    girls_count=case when p_patch?'girls_count' then (p_patch->>'girls_count')::integer else girls_count end,
    boys_count=case when p_patch?'boys_count' then (p_patch->>'boys_count')::integer else boys_count end,
    disability_count=case when p_patch?'disability_count' then (p_patch->>'disability_count')::integer else disability_count end,
    vulnerable_count=case when p_patch?'vulnerable_count' then (p_patch->>'vulnerable_count')::integer else vulnerable_count end
  where id=target_report_id returning * into r;
  if r.period_start is not null and r.period_end is not null and r.period_end<r.period_start then raise exception 'La fin de période ne peut pas précéder le début'; end if;
  if r.started_at is not null and r.ended_at is not null and r.ended_at<r.started_at then raise exception 'L’heure de fin ne peut pas précéder l’heure de début'; end if;
  if char_length(trim(r.summary))<5 then raise exception 'Le résumé doit contenir au moins 5 caractères'; end if;
  insert into public.task_report_events(report_id,actor_id,event_type,from_status,to_status,comment,metadata)
  values(r.id,auth.uid(),'updated',r.status,r.status,case when auth.uid()=r.reporter_id then 'Brouillon mis à jour' else 'Correction administrative par le super-administrateur' end,jsonb_build_object('superadmin_override',auth.uid()<>r.reporter_id));
  perform private.write_audit('task_report.content_updated','task_report',r.id,jsonb_build_object('before',before_row,'after',to_jsonb(r)));
  return r;
end;
$$;
revoke all on function public.update_editable_task_report_content(uuid,jsonb) from public,anon;
grant execute on function public.update_editable_task_report_content(uuid,jsonb) to authenticated;
