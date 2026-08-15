-- Clarification des modules, preuve décidée à la validation et contrôle super-administrateur.

alter table public.activity_tasks alter column requires_evidence set default false;
update public.activity_tasks set requires_evidence=false where requires_evidence=true;

alter table public.task_reports
  add column if not exists evidence_required_by_reviewer boolean not null default false,
  add column if not exists evidence_requirement_comment text;

alter table public.task_reports drop constraint if exists task_reports_evidence_requirement_comment_check;
alter table public.task_reports add constraint task_reports_evidence_requirement_comment_check
  check (evidence_requirement_comment is null or char_length(btrim(evidence_requirement_comment)) between 5 and 2000);

create table if not exists public.super_admin_deletion_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  resource_type text not null,
  resource_id uuid not null,
  resource_snapshot jsonb not null default '{}'::jsonb,
  deleted_at timestamptz not null default now()
);
alter table public.super_admin_deletion_log enable row level security;
drop policy if exists super_admin_deletion_log_select on public.super_admin_deletion_log;
create policy super_admin_deletion_log_select on public.super_admin_deletion_log for select to authenticated
using ((select private.is_super_admin()) and (select private.has_aal2()));
revoke all on public.super_admin_deletion_log from public,anon,authenticated;
grant select on public.super_admin_deletion_log to authenticated;

create or replace function public.review_task_report_with_evidence(
  target_report_id uuid,
  decision text,
  review_comment text,
  signature_name text,
  signature_asset_path text default null,
  require_evidence boolean default false
)
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
  if not private.can_review_task_report(report_row.id,auth.uid()) then raise exception 'Vous n’êtes pas accrédité pour cette validation'; end if;

  if require_evidence and not exists(select 1 from public.task_report_evidence e where e.report_id=report_row.id) then
    effective_decision:='returned';
    effective_comment:=coalesce(effective_comment,'Le supérieur hiérarchique exige au moins une preuve avant approbation.');
  end if;
  if effective_decision='returned' and char_length(coalesce(effective_comment,''))<5 then
    raise exception 'Expliquez les corrections demandées';
  end if;

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
revoke all on function public.review_task_report_with_evidence(uuid,text,text,text,text,boolean) from public,anon;
grant execute on function public.review_task_report_with_evidence(uuid,text,text,text,text,boolean) to authenticated;

-- La preuve n'est contrôlée qu'après une demande explicite du validateur.
create or replace function public.submit_task_report(target_report_id uuid,signature_name text,signature_asset_path text default null)
returns public.task_reports
language plpgsql security definer set search_path='' as $$
declare
  report_row public.task_reports%rowtype;
  task_row public.activity_tasks%rowtype;
  payload_value jsonb;
  hash_value text;
  next_revision integer;
  actor_name text;
  actor_role text;
  actor_job text;
  actor_body uuid;
  recipient_id uuid;
  previous_status text;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if char_length(trim(coalesce(signature_name,'')))<2 then raise exception 'La signature nominative est obligatoire'; end if;
  select * into report_row from public.task_reports where id=target_report_id for update;
  if not found or report_row.reporter_id<>auth.uid() then raise exception 'Rapport inaccessible'; end if;
  if report_row.status not in ('draft','returned') then raise exception 'Ce rapport a déjà été soumis'; end if;
  if char_length(trim(report_row.summary))<5 then raise exception 'Le résumé d’exécution doit contenir au moins 5 caractères'; end if;
  if report_row.evidence_required_by_reviewer and not exists(select 1 from public.task_report_evidence e where e.report_id=report_row.id) then
    raise exception 'Le supérieur hiérarchique a demandé au moins une preuve avant la nouvelle soumission';
  end if;
  select * into task_row from public.activity_tasks where id=report_row.task_id;
  if task_row.requires_attendance and not exists(select 1 from public.task_report_attendance a where a.report_id=report_row.id and a.present) then
    raise exception 'La liste de présence est obligatoire pour cette tâche';
  end if;

  next_revision:=report_row.revision+1;
  payload_value:=jsonb_build_object(
    'report',to_jsonb(report_row)-array['created_at','updated_at','current_hash'],
    'task',to_jsonb(task_row),
    'evidence',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at) from public.task_report_evidence e where e.report_id=report_row.id),'[]'::jsonb),
    'attendance',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at) from public.task_report_attendance a where a.report_id=report_row.id),'[]'::jsonb),
    'indicators',coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at) from public.task_report_indicator_values i where i.report_id=report_row.id),'[]'::jsonb),
    'revision',next_revision
  );
  hash_value:=encode(extensions.digest(convert_to(payload_value::text,'UTF8'),'sha256'),'hex');
  select coalesce(p.full_name,p.email,'Compte AIAC'),p.role::text into actor_name,actor_role from public.profiles p where p.id=auth.uid();
  select wa.job_title,wa.body_id into actor_job,actor_body from public.workforce_assignments wa
  where wa.profile_id=auth.uid() and wa.status='active' and (wa.end_date is null or wa.end_date>=current_date)
  order by wa.start_date desc limit 1;
  insert into public.task_report_versions(report_id,revision,payload,content_hash,submitted_by,signature_name,signature_asset_path)
  values(report_row.id,next_revision,payload_value,hash_value,auth.uid(),trim(signature_name),signature_asset_path);
  insert into public.task_report_approvals(report_id,revision,actor_id,decision,actor_name,actor_role,actor_job_title,actor_body_id,signature_name,signature_asset_path,content_hash)
  values(report_row.id,next_revision,auth.uid(),'submitted',actor_name,actor_role,actor_job,coalesce(actor_body,report_row.body_id),trim(signature_name),signature_asset_path,hash_value);
  previous_status:=report_row.status;
  perform set_config('aiac.task_report_workflow','on',true);
  update public.task_reports set status='submitted',revision=next_revision,current_hash=hash_value,
    reporter_signature_name=trim(signature_name),reporter_signature_asset_path=signature_asset_path,
    reporter_signed_at=now(),submitted_at=now(),returned_at=null
  where id=report_row.id returning * into report_row;
  insert into public.task_report_events(report_id,actor_id,event_type,from_status,to_status,metadata)
  values(report_row.id,auth.uid(),case when previous_status='returned' then 'resubmitted' else 'submitted' end,previous_status,'submitted',jsonb_build_object('revision',next_revision,'hash',hash_value));
  select candidate into recipient_id from (
    select report_row.supervisor_id candidate,1 priority
    union all select a.manager_id,2 from public.activity_tasks t join public.activities a on a.id=t.activity_id where t.id=report_row.task_id
    union all select pm.user_id,3 from public.activity_tasks t join public.activities a on a.id=t.activity_id join public.project_members pm on pm.project_id=a.project_id and pm.member_role='lead' where t.id=report_row.task_id
    union all select p.id,4 from public.profiles p where p.status='active' and p.role in ('admin','super_admin')
  ) candidates where candidate is not null and candidate<>auth.uid() order by priority limit 1;
  if recipient_id is not null then
    insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id)
    values(recipient_id,'Rapport terrain à valider',report_row.report_number || ' a été signé et soumis.','/espace?tab=terrain&report=' || report_row.id,'workflow','task_report',report_row.id);
  end if;
  return report_row;
end;
$$;

create or replace function private.protect_task_report_version() returns trigger
language plpgsql set search_path='' as $$
begin
  if current_setting('aiac.super_admin_delete',true)='on' then return old; end if;
  raise exception 'Une version soumise est immuable';
end;
$$;

create or replace function public.super_admin_update_resource(resource_type text,target_id uuid,changes jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; old_status text; linked_publication uuid;
begin
  if not private.is_super_admin() or not private.has_aal2() then raise exception 'Action réservée au super-administrateur avec MFA'; end if;
  case resource_type
    when 'program' then update public.programs set name=coalesce(nullif(changes->>'name',''),name),description=coalesce(changes->>'description',description),status=coalesce(nullif(changes->>'status',''),status) where id=target_id returning to_jsonb(programs.*) into result;
    when 'project' then update public.projects set name=coalesce(nullif(changes->>'name',''),name),description=coalesce(changes->>'description',description),status=coalesce(nullif(changes->>'status',''),status) where id=target_id returning to_jsonb(projects.*) into result;
    when 'activity' then update public.activities set title=coalesce(nullif(changes->>'name',''),title),description=coalesce(changes->>'description',description),status=coalesce(nullif(changes->>'status',''),status) where id=target_id returning to_jsonb(activities.*) into result;
    when 'activity_task' then update public.activity_tasks set title=coalesce(nullif(changes->>'name',''),title),description=coalesce(changes->>'description',description),status=coalesce(nullif(changes->>'status',''),status) where id=target_id returning to_jsonb(activity_tasks.*) into result;
    when 'task_report' then
      select status,public_content_id into old_status,linked_publication from public.task_reports where id=target_id;
      if linked_publication is not null then update public.public_content_items set status='archived' where id=linked_publication; end if;
      perform set_config('aiac.task_report_workflow','on',true);
      update public.task_reports set
        title=coalesce(nullif(changes->>'name',''),title),
        summary=coalesce(nullif(changes->>'description',''),summary),
        status=case when old_status in ('draft','returned') then old_status else 'returned' end,
        approved_at=case when old_status in ('draft','returned') then approved_at else null end,
        approved_by=case when old_status in ('draft','returned') then approved_by else null end,
        returned_at=case when old_status in ('draft','returned') then returned_at else now() end,
        public_content_id=case when old_status in ('draft','returned') then public_content_id else null end,
        published_at=case when old_status in ('draft','returned') then published_at else null end,
        published_by=case when old_status in ('draft','returned') then published_by else null end
      where id=target_id returning to_jsonb(task_reports.*) into result;
      if old_status not in ('draft','returned') then
        insert into public.task_report_events(report_id,actor_id,event_type,from_status,to_status,comment,metadata)
        values(target_id,auth.uid(),'returned',old_status,'returned','Réouvert pour correction par le super-administrateur.',jsonb_build_object('super_admin_override',true));
      end if;
    when 'public_content' then update public.public_content_items set title=coalesce(nullif(changes->>'name',''),title),summary=coalesce(changes->>'description',summary),status=coalesce(nullif(changes->>'status',''),status) where id=target_id returning to_jsonb(public_content_items.*) into result;
    when 'document' then update public.documents set title=coalesce(nullif(changes->>'name',''),title),document_status=coalesce(nullif(changes->>'status',''),document_status) where id=target_id returning to_jsonb(documents.*) into result;
    when 'governance_body' then update public.governance_bodies set name=coalesce(nullif(changes->>'name',''),name),description=coalesce(changes->>'description',description),status=coalesce(nullif(changes->>'status',''),status) where id=target_id returning to_jsonb(governance_bodies.*) into result;
    when 'institutional_member' then update public.institutional_members set full_name=coalesce(nullif(changes->>'name',''),full_name),notes=coalesce(changes->>'description',notes),status=coalesce(nullif(changes->>'status',''),status) where id=target_id returning to_jsonb(institutional_members.*) into result;
    when 'workforce_assignment' then update public.workforce_assignments set job_title=coalesce(nullif(changes->>'name',''),job_title),notes=coalesce(changes->>'description',notes),status=coalesce(nullif(changes->>'status',''),status) where id=target_id returning to_jsonb(workforce_assignments.*) into result;
    when 'partner' then update public.partners set legal_name=coalesce(nullif(changes->>'name',''),legal_name),notes=coalesce(changes->>'description',notes),status=coalesce(nullif(changes->>'status',''),status) where id=target_id returning to_jsonb(partners.*) into result;
    else raise exception 'Type de ressource non autorisé';
  end case;
  if result is null then raise exception 'Ressource introuvable'; end if;
  return result;
end;
$$;

create or replace function public.super_admin_delete_resource(resource_type text,target_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare snapshot jsonb;
begin
  if not private.is_super_admin() or not private.has_aal2() then raise exception 'Action réservée au super-administrateur avec MFA'; end if;
  perform set_config('aiac.super_admin_delete','on',true);
  case resource_type
    when 'task_report' then
      select to_jsonb(r) into snapshot from public.task_reports r where r.id=target_id;
      update public.public_content_items set source_task_report_id=null where source_task_report_id=target_id;
      delete from public.task_report_events where report_id=target_id;
      delete from public.task_report_approvals where report_id=target_id;
      delete from public.task_report_indicator_values where report_id=target_id;
      delete from public.task_report_attendance where report_id=target_id;
      delete from public.task_report_evidence where report_id=target_id;
      delete from public.task_report_versions where report_id=target_id;
      delete from public.task_reports where id=target_id;
    when 'activity_task' then
      select to_jsonb(t) into snapshot from public.activity_tasks t where t.id=target_id;
      if exists(select 1 from public.task_reports where task_id=target_id) then raise exception 'Supprimez d’abord les rapports de cette tâche'; end if;
      delete from public.activity_tasks where id=target_id;
    when 'activity' then
      select to_jsonb(a) into snapshot from public.activities a where a.id=target_id;
      if exists(select 1 from public.activity_tasks where activity_id=target_id) then raise exception 'Supprimez d’abord les tâches de cette activité'; end if;
      delete from public.activities where id=target_id;
    when 'project' then
      select to_jsonb(p) into snapshot from public.projects p where p.id=target_id;
      delete from public.projects where id=target_id;
    when 'program' then
      select to_jsonb(p) into snapshot from public.programs p where p.id=target_id;
      delete from public.programs where id=target_id;
    when 'public_content' then
      select to_jsonb(c) into snapshot from public.public_content_items c where c.id=target_id;
      perform set_config('aiac.task_report_workflow','on',true);
      update public.task_reports set public_content_id=null,published_at=null,published_by=null where public_content_id=target_id;
      delete from public.public_content_items where id=target_id;
    when 'document' then
      select to_jsonb(d) into snapshot from public.documents d where d.id=target_id;
      delete from public.message_attachments where document_id=target_id;
      delete from public.document_access_logs where document_id=target_id;
      delete from public.documents where id=target_id;
    when 'governance_body' then select to_jsonb(b) into snapshot from public.governance_bodies b where b.id=target_id; delete from public.governance_bodies where id=target_id;
    when 'institutional_member' then select to_jsonb(m) into snapshot from public.institutional_members m where m.id=target_id; delete from public.institutional_members where id=target_id;
    when 'workforce_assignment' then select to_jsonb(w) into snapshot from public.workforce_assignments w where w.id=target_id; delete from public.workforce_assignments where id=target_id;
    when 'partner' then select to_jsonb(p) into snapshot from public.partners p where p.id=target_id; delete from public.partners where id=target_id;
    else raise exception 'Type de ressource non autorisé';
  end case;
  if snapshot is null then raise exception 'Ressource introuvable'; end if;
  insert into public.super_admin_deletion_log(actor_id,resource_type,resource_id,resource_snapshot)
  values(auth.uid(),resource_type,target_id,snapshot);
  return true;
end;
$$;
revoke all on function public.super_admin_update_resource(text,uuid,jsonb),public.super_admin_delete_resource(text,uuid) from public,anon;
grant execute on function public.super_admin_update_resource(text,uuid,jsonb),public.super_admin_delete_resource(text,uuid) to authenticated;
