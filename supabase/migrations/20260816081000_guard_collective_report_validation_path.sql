-- Empêche qu’un rapport relevant d’une autorité collégiale soit validé par le circuit hiérarchique historique.

create or replace function public.review_task_report(target_report_id uuid, decision text, review_comment text, signature_name text, signature_asset_path text default null)
returns public.task_reports
language plpgsql security definer set search_path='' as $$
declare
  report_row public.task_reports%rowtype;
  actor_name text;
  actor_role text;
  actor_job text;
  actor_body uuid;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if decision not in ('approved','returned') then raise exception 'Décision invalide'; end if;
  if char_length(trim(coalesce(signature_name,'')))<2 then raise exception 'La signature nominative est obligatoire'; end if;
  if decision='returned' and char_length(trim(coalesce(review_comment,'')))<5 then raise exception 'Expliquez les corrections demandées'; end if;

  select * into report_row from public.task_reports where id=target_report_id for update;
  if not found or report_row.status<>'submitted' then raise exception 'Ce rapport n’est pas disponible pour validation'; end if;
  if report_row.validation_authority_type='collective_body' then
    raise exception 'Ce rapport relève d’une décision collégiale. Utilisez la validation du Conseil d’administration avec référence de décision/PV.';
  end if;
  if not private.can_review_task_report(report_row.id,auth.uid()) then raise exception 'Vous n’êtes pas accrédité pour cette validation'; end if;

  select coalesce(p.full_name,p.email,'Compte AIAC'),p.role::text into actor_name,actor_role
  from public.profiles p where p.id=auth.uid();
  select wa.job_title,wa.body_id into actor_job,actor_body
  from public.workforce_assignments wa
  where wa.profile_id=auth.uid() and wa.status='active' and (wa.end_date is null or wa.end_date>=current_date)
  order by wa.start_date desc limit 1;

  insert into public.task_report_approvals(report_id,revision,actor_id,decision,actor_name,actor_role,actor_job_title,actor_body_id,comment,signature_name,signature_asset_path,content_hash)
  values(report_row.id,report_row.revision,auth.uid(),decision,actor_name,actor_role,actor_job,actor_body,nullif(trim(coalesce(review_comment,'')),''),trim(signature_name),signature_asset_path,report_row.current_hash);

  perform set_config('aiac.task_report_workflow','on',true);
  if decision='approved' then
    update public.task_reports set status='approved',approved_at=now(),approved_by=auth.uid(),returned_at=null where id=report_row.id returning * into report_row;
  else
    update public.task_reports set status='returned',returned_at=now(),approved_at=null,approved_by=null where id=report_row.id returning * into report_row;
  end if;

  insert into public.task_report_events(report_id,actor_id,event_type,from_status,to_status,comment,metadata)
  values(report_row.id,auth.uid(),decision,'submitted',decision,nullif(trim(coalesce(review_comment,'')),''),jsonb_build_object('revision',report_row.revision,'hash',report_row.current_hash));
  insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id)
  values(report_row.reporter_id,case when decision='approved' then 'Rapport terrain approuvé' else 'Rapport terrain retourné' end,
    case when decision='approved' then report_row.report_number || ' a été validé et signé.' else coalesce(review_comment,'Des corrections sont demandées.') end,
    '/espace?tab=terrain&report=' || report_row.id,'workflow','task_report',report_row.id);
  return report_row;
end;
$$;

create or replace function public.review_task_report_with_evidence(target_report_id uuid, decision text, review_comment text, signature_name text, signature_asset_path text default null, require_evidence boolean default false)
returns public.task_reports
language plpgsql security definer set search_path='' as $$
declare
  report_row public.task_reports%rowtype;
  actor_name text;
  actor_role text;
  actor_job text;
  actor_body uuid;
  effective_decision text:=decision;
  effective_comment text:=nullif(trim(coalesce(review_comment,'')),'');
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if decision not in ('approved','returned') then raise exception 'Décision invalide'; end if;
  if char_length(trim(coalesce(signature_name,'')))<2 then raise exception 'La signature nominative est obligatoire'; end if;

  select * into report_row from public.task_reports where id=target_report_id for update;
  if not found or report_row.status<>'submitted' then raise exception 'Ce rapport n’est pas disponible pour validation'; end if;
  if report_row.validation_authority_type='collective_body' then
    raise exception 'Ce rapport relève d’une décision collégiale. Utilisez la validation du Conseil d’administration avec référence de décision/PV.';
  end if;
  if not private.can_review_task_report(report_row.id,auth.uid()) then raise exception 'Vous n’êtes pas accrédité pour cette validation'; end if;

  if require_evidence and not exists(select 1 from public.task_report_evidence e where e.report_id=report_row.id) then
    effective_decision:='returned';
    effective_comment:=coalesce(effective_comment,'Le supérieur hiérarchique exige au moins une preuve avant approbation.');
  end if;
  if effective_decision='returned' and char_length(coalesce(effective_comment,''))<5 then raise exception 'Expliquez les corrections demandées'; end if;

  select coalesce(p.full_name,p.email,'Compte AIAC'),p.role::text into actor_name,actor_role
  from public.profiles p where p.id=auth.uid();
  select wa.job_title,wa.body_id into actor_job,actor_body
  from public.workforce_assignments wa
  where wa.profile_id=auth.uid() and wa.status='active' and (wa.end_date is null or wa.end_date>=current_date)
  order by wa.start_date desc limit 1;

  insert into public.task_report_approvals(report_id,revision,actor_id,decision,actor_name,actor_role,actor_job_title,actor_body_id,comment,signature_name,signature_asset_path,content_hash)
  values(report_row.id,report_row.revision,auth.uid(),effective_decision,actor_name,actor_role,actor_job,actor_body,effective_comment,trim(signature_name),signature_asset_path,report_row.current_hash);

  perform set_config('aiac.task_report_workflow','on',true);
  if effective_decision='approved' then
    update public.task_reports set status='approved',approved_at=now(),approved_by=auth.uid(),returned_at=null,
      evidence_required_by_reviewer=false,evidence_requirement_comment=null
    where id=report_row.id returning * into report_row;
  else
    update public.task_reports set status='returned',returned_at=now(),approved_at=null,approved_by=null,
      evidence_required_by_reviewer=require_evidence,evidence_requirement_comment=case when require_evidence then effective_comment else null end
    where id=report_row.id returning * into report_row;
  end if;

  insert into public.task_report_events(report_id,actor_id,event_type,from_status,to_status,comment,metadata)
  values(report_row.id,auth.uid(),effective_decision,'submitted',effective_decision,effective_comment,
    jsonb_build_object('revision',report_row.revision,'hash',report_row.current_hash,'evidence_required',require_evidence));
  insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id)
  values(report_row.reporter_id,case when effective_decision='approved' then 'Rapport terrain approuvé' else 'Rapport terrain retourné' end,
    case when effective_decision='approved' then report_row.report_number || ' a été validé et signé.' else effective_comment end,
    '/espace?tab=terrain&report=' || report_row.id,'workflow','task_report',report_row.id);
  return report_row;
end;
$$;
