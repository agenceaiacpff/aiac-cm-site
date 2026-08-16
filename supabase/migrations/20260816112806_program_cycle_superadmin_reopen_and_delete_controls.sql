-- Pouvoirs exceptionnels du super-administrateur sur le Cycle des programmes.

create or replace function public.superadmin_reopen_task_report(target_report_id uuid, reason text)
returns public.task_reports language plpgsql security definer set search_path=''
as $$
declare r public.task_reports%rowtype; previous_status text; restored_task_status text:='planned'; aid uuid; pid uuid; pgid uuid;
begin
  if auth.uid() is null or not private.is_super_admin(auth.uid()) or not private.has_aal2() then raise exception 'Super-administrateur avec MFA requis'; end if;
  if char_length(trim(coalesce(reason,'')))<8 then raise exception 'Motif administratif obligatoire (8 caractères minimum)'; end if;
  select * into r from public.task_reports where id=target_report_id for update; if not found then raise exception 'Rapport introuvable'; end if;
  if r.status in ('draft','returned') then return r; end if;
  previous_status:=r.status;
  select case when payload->'task'->>'status' in ('planned','active') then payload->'task'->>'status' else 'planned' end into restored_task_status
  from public.task_report_versions where report_id=r.id order by revision desc limit 1;
  restored_task_status:=coalesce(restored_task_status,'planned');
  if r.public_content_id is not null then update public.public_content_items set status='archived' where id=r.public_content_id; end if;
  perform set_config('aiac.task_report_workflow','on',true);
  update public.task_reports set status='returned',returned_at=now(),approved_at=null,approved_by=null,public_content_id=null,published_at=null,published_by=null where id=r.id returning * into r;
  update public.activity_tasks set status=restored_task_status where id=r.task_id and status='completed';
  select a.id,p.id,pg.id into aid,pid,pgid from public.activity_tasks t join public.activities a on a.id=t.activity_id join public.projects p on p.id=a.project_id join public.programs pg on pg.id=p.program_id where t.id=r.task_id;
  update public.activities set status='in_progress' where id=aid and status='completed';
  update public.projects set status='active' where id=pid and status='completed';
  update public.programs set status='active' where id=pgid and status='completed';
  insert into public.task_report_events(report_id,actor_id,event_type,from_status,to_status,comment,metadata)
  values(r.id,auth.uid(),'returned',previous_status,'returned',trim(reason),jsonb_build_object('superadmin_override',true,'revision',r.revision));
  if r.reporter_id<>auth.uid() then
    insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id)
    values(r.reporter_id,'Rapport rouvert pour correction administrative',r.report_number||' · '||trim(reason),'/espace/terrain/complet?report='||r.id::text,'task_report_admin','task_report',r.id);
  end if;
  perform private.write_audit('task_report.superadmin_reopened','task_report',r.id,jsonb_build_object('from_status',previous_status,'reason',trim(reason),'revision',r.revision));
  return r;
end;
$$;
revoke all on function public.superadmin_reopen_task_report(uuid,text) from public,anon;
grant execute on function public.superadmin_reopen_task_report(uuid,text) to authenticated;

create or replace function public.superadmin_delete_program_cycle_item(target_type text,target_id uuid,confirmation text,reason text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare kind text:=lower(trim(coalesce(target_type,''))); expected text; dependent bigint:=0; snapshot jsonb; paths jsonb:='[]'::jsonb; r public.task_reports%rowtype; task_id_value uuid; aid uuid; pid uuid; pgid uuid;
begin
  if auth.uid() is null or not private.is_super_admin(auth.uid()) or not private.has_aal2() then raise exception 'Super-administrateur avec MFA requis'; end if;
  if char_length(trim(coalesce(reason,'')))<8 then raise exception 'Motif de suppression obligatoire (8 caractères minimum)'; end if;
  if kind='program' then
    select p.code,to_jsonb(p) into expected,snapshot from public.programs p where p.id=target_id for update; if expected is null then raise exception 'Programme introuvable'; end if;
    select count(*) into dependent from public.projects where program_id=target_id; if dependent>0 then raise exception 'Suppression refusée : ce programme contient % projet(s). Supprimez d’abord ses descendants.',dependent; end if;
  elsif kind='project' then
    select p.code,to_jsonb(p) into expected,snapshot from public.projects p where p.id=target_id for update; if expected is null then raise exception 'Projet introuvable'; end if;
    select count(*) into dependent from public.activities where project_id=target_id; if dependent>0 then raise exception 'Suppression refusée : ce projet contient % activité(s). Supprimez d’abord ses descendants.',dependent; end if;
  elsif kind='activity' then
    select a.code,to_jsonb(a) into expected,snapshot from public.activities a where a.id=target_id for update; if expected is null then raise exception 'Activité introuvable'; end if;
    select count(*) into dependent from public.activity_tasks where activity_id=target_id; if dependent>0 then raise exception 'Suppression refusée : cette activité contient % tâche(s). Supprimez d’abord ses descendants.',dependent; end if;
  elsif kind='task' then
    select t.code,to_jsonb(t) into expected,snapshot from public.activity_tasks t where t.id=target_id for update; if expected is null then raise exception 'Tâche introuvable'; end if;
    select count(*) into dependent from public.task_reports where task_id=target_id; if dependent>0 then raise exception 'Suppression refusée : cette tâche possède % rapport(s). Supprimez d’abord les rapports concernés.',dependent; end if;
  elsif kind='report' then
    select * into r from public.task_reports where id=target_id for update; if not found then raise exception 'Rapport introuvable'; end if;
    expected:=r.report_number; snapshot:=to_jsonb(r); task_id_value:=r.task_id;
    select coalesce(jsonb_agg(distinct x.path),'[]'::jsonb) into paths from (
      select e.storage_path path from public.task_report_evidence e where e.report_id=r.id
      union all select r.reporter_signature_asset_path where r.reporter_signature_asset_path is not null and r.reporter_signature_asset_path like '%'||r.id::text||'/%'
      union all select a.signature_asset_path from public.task_report_approvals a where a.report_id=r.id and a.signature_asset_path is not null and a.signature_asset_path like '%'||r.id::text||'/%'
    ) x;
  else raise exception 'Type de donnée non pris en charge'; end if;
  if trim(coalesce(confirmation,''))<>expected then raise exception 'Confirmation incorrecte : saisissez exactement %',expected; end if;
  perform private.write_audit('program_cycle.superadmin_delete',kind,target_id,jsonb_build_object('snapshot',snapshot,'reason',trim(reason)));
  if kind='report' then
    if r.public_content_id is not null then update public.public_content_items set status='archived' where id=r.public_content_id; end if;
    perform set_config('aiac.super_admin_delete','on',true);
    delete from public.task_report_approvals where report_id=r.id;
    delete from public.task_report_versions where report_id=r.id;
    delete from public.task_report_evidence where report_id=r.id;
    delete from public.task_report_attendance where report_id=r.id;
    delete from public.task_report_indicator_values where report_id=r.id;
    delete from public.task_report_events where report_id=r.id;
    delete from public.notifications where entity_type='task_report' and entity_id=r.id;
    delete from public.task_reports where id=r.id;
    if not exists(select 1 from public.task_reports rr where rr.task_id=task_id_value and rr.status in ('approved','archived')) then
      update public.activity_tasks set status='planned' where id=task_id_value and status='completed';
      select a.id,p.id,pg.id into aid,pid,pgid from public.activity_tasks t join public.activities a on a.id=t.activity_id join public.projects p on p.id=a.project_id join public.programs pg on pg.id=p.program_id where t.id=task_id_value;
      update public.activities set status='in_progress' where id=aid and status='completed';
      update public.projects set status='active' where id=pid and status='completed';
      update public.programs set status='active' where id=pgid and status='completed';
    end if;
    if r.reporter_id is not null and r.reporter_id<>auth.uid() then
      insert into public.notifications(user_id,title,body,href,category) values(r.reporter_id,'Rapport supprimé par le super-administrateur',expected||' · '||trim(reason),'/espace/terrain','task_report_admin');
    end if;
  elsif kind='task' then delete from public.notifications where entity_type='activity_task' and entity_id=target_id; delete from public.activity_tasks where id=target_id;
  elsif kind='activity' then delete from public.notifications where entity_type='activity' and entity_id=target_id; delete from public.activities where id=target_id;
  elsif kind='project' then delete from public.notifications where entity_type='project' and entity_id=target_id; delete from public.projects where id=target_id;
  elsif kind='program' then delete from public.notifications where entity_type='program' and entity_id=target_id; delete from public.programs where id=target_id;
  end if;
  return jsonb_build_object('deleted',true,'node_type',kind,'id',target_id,'code',expected,'storage_paths',paths);
end;
$$;
revoke all on function public.superadmin_delete_program_cycle_item(text,uuid,text,text) from public,anon;
grant execute on function public.superadmin_delete_program_cycle_item(text,uuid,text,text) to authenticated;

drop policy if exists activity_tasks_delete on public.activity_tasks;
create policy activity_tasks_delete on public.activity_tasks for delete to authenticated
using (private.is_super_admin(auth.uid()) and private.has_aal2());
