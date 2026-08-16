-- Cycle des programmes : notifications, liens, droits d'édition contrôlés et hygiène des traces.

create or replace function private.can_edit_task_report(target_id uuid, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path=''
as $$
  select private.is_active_approved_user(uid)
    and exists(
      select 1 from public.task_reports r
      where r.id=target_id and r.status in ('draft','returned')
        and (r.reporter_id=uid or (private.is_super_admin(uid) and case when uid=auth.uid() then private.has_aal2() else true end))
    );
$$;

create or replace function private.protect_task_report_fields()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if current_setting('aiac.task_report_workflow',true)='on' then return new; end if;
  if auth.uid() is null then return new; end if;
  if old.status not in ('draft','returned') then raise exception 'Ce rapport ne peut plus être modifié directement'; end if;
  if old.reporter_id<>auth.uid() and not (private.is_super_admin(auth.uid()) and private.has_aal2()) then
    raise exception 'Ce rapport ne peut être modifié que par son auteur ou le super-administrateur authentifié';
  end if;
  if new.task_id is distinct from old.task_id
     or new.reporter_id is distinct from old.reporter_id
     or new.supervisor_id is distinct from old.supervisor_id
     or new.body_id is distinct from old.body_id
     or new.validation_authority_type is distinct from old.validation_authority_type
     or new.validation_authority_body_id is distinct from old.validation_authority_body_id
     or new.status is distinct from old.status
     or new.revision is distinct from old.revision
     or new.current_hash is distinct from old.current_hash
     or new.submitted_at is distinct from old.submitted_at
     or new.approved_at is distinct from old.approved_at
     or new.approved_by is distinct from old.approved_by
     or new.reporter_signed_at is distinct from old.reporter_signed_at
     or new.reporter_nominal_seal_asset_path is distinct from old.reporter_nominal_seal_asset_path
     or new.reporter_round_seal_asset_path is distinct from old.reporter_round_seal_asset_path
     or new.reporter_signature_block_side is distinct from old.reporter_signature_block_side then
    raise exception 'Les champs d’identité et de workflow sont protégés';
  end if;
  return new;
end;
$$;

drop policy if exists task_report_evidence_delete on public.task_report_evidence;
create policy task_report_evidence_delete on public.task_report_evidence for delete to authenticated
using (private.can_edit_task_report(report_id) and (uploaded_by=auth.uid() or (private.is_super_admin(auth.uid()) and private.has_aal2())));
drop policy if exists task_report_evidence_update on public.task_report_evidence;
create policy task_report_evidence_update on public.task_report_evidence for update to authenticated
using (private.can_edit_task_report(report_id) and (uploaded_by=auth.uid() or (private.is_super_admin(auth.uid()) and private.has_aal2())))
with check (private.can_edit_task_report(report_id));

drop policy if exists task_report_attendance_delete on public.task_report_attendance;
create policy task_report_attendance_delete on public.task_report_attendance for delete to authenticated
using (private.can_edit_task_report(report_id) and (recorded_by=auth.uid() or (private.is_super_admin(auth.uid()) and private.has_aal2())));
drop policy if exists task_report_attendance_update on public.task_report_attendance;
create policy task_report_attendance_update on public.task_report_attendance for update to authenticated
using (private.can_edit_task_report(report_id) and (recorded_by=auth.uid() or (private.is_super_admin(auth.uid()) and private.has_aal2())))
with check (private.can_edit_task_report(report_id));

drop policy if exists task_report_indicators_delete on public.task_report_indicator_values;
create policy task_report_indicators_delete on public.task_report_indicator_values for delete to authenticated
using (private.can_edit_task_report(report_id) and (recorded_by=auth.uid() or (private.is_super_admin(auth.uid()) and private.has_aal2())));
drop policy if exists task_report_indicators_update on public.task_report_indicator_values;
create policy task_report_indicators_update on public.task_report_indicator_values for update to authenticated
using (private.can_edit_task_report(report_id) and (recorded_by=auth.uid() or (private.is_super_admin(auth.uid()) and private.has_aal2())))
with check (private.can_edit_task_report(report_id));

create or replace function private.normalize_task_report_notification()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_authority text;
begin
  if new.entity_type='task_report' and new.entity_id is not null then
    select validation_authority_type into v_authority from public.task_reports where id=new.entity_id;
    if new.title='Rapport terrain à valider' and v_authority='collective_body' then return null; end if;
    if coalesce(new.href,'') like '/espace?tab=terrain%' then
      new.href:='/espace/terrain/complet?report='||new.entity_id::text||case when new.title ilike '%à valider%' then '&mode=validation' else '' end;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists notifications_normalize_task_report on public.notifications;
create trigger notifications_normalize_task_report before insert on public.notifications
for each row execute function private.normalize_task_report_notification();

update public.notifications n
set href='/espace/terrain/complet?report='||n.entity_id::text||case when n.title ilike '%à valider%' then '&mode=validation' else '' end
where n.entity_type='task_report' and n.entity_id is not null
  and exists(select 1 from public.task_reports r where r.id=n.entity_id)
  and coalesce(n.href,'') like '/espace?tab=terrain%';

delete from public.notifications n
where n.entity_type='task_report' and n.entity_id is not null
  and not exists(select 1 from public.task_reports r where r.id=n.entity_id);

create or replace function private.notify_program_manager()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if new.manager_id is not null and (tg_op='INSERT' or new.manager_id is distinct from old.manager_id) and new.manager_id is distinct from auth.uid() then
    insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id)
    values(new.manager_id,'Programme AIAC à piloter',new.code||' · '||new.name,
      '/espace/terrain/complet?body='||new.body_id::text||'&program='||new.id::text,'program_cycle','program',new.id);
  end if;
  return new;
end;
$$;
drop trigger if exists programs_notify_manager on public.programs;
create trigger programs_notify_manager after insert or update of manager_id on public.programs
for each row execute function private.notify_program_manager();

create or replace function private.notify_institutional_assignment()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_program uuid; v_body uuid;
begin
  if tg_table_name='workforce_assignments' then
    if new.profile_id is not null then
      insert into public.notifications(user_id,title,body,href) values(new.profile_id,'Nouvelle affectation AIAC',new.job_title,'/espace?tab=institution');
    end if;
  elsif tg_table_name='case_files' then
    if new.assigned_to is not null and (tg_op='INSERT' or new.assigned_to is distinct from old.assigned_to) then
      insert into public.notifications(user_id,title,body,href) values(new.assigned_to,'Dossier de cas affecté',new.case_number||' · '||new.title,'/espace?tab=institution');
    end if;
  elsif tg_table_name='activities' then
    if new.manager_id is not null and (tg_op='INSERT' or new.manager_id is distinct from old.manager_id) then
      select p.program_id,pg.body_id into v_program,v_body from public.projects p join public.programs pg on pg.id=p.program_id where p.id=new.project_id;
      if new.manager_id is distinct from auth.uid() then
        insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id)
        values(new.manager_id,'Activité AIAC à coordonner',new.code||' · '||new.title,
          '/espace/terrain/complet?body='||v_body::text||'&program='||v_program::text||'&project='||new.project_id::text||'&activity='||new.id::text,
          'program_cycle','activity',new.id);
      end if;
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.notify_activity_task_assignment()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_project uuid; v_program uuid; v_body uuid; v_notify boolean:=false; v_title text;
begin
  if new.assigned_to is null then return new; end if;
  if tg_op='INSERT' then v_notify:=true; v_title:='Nouvelle tâche AIAC affectée';
  elsif new.assigned_to is distinct from old.assigned_to then v_notify:=true; v_title:='Nouvelle tâche AIAC affectée';
  elsif new.due_date is distinct from old.due_date then v_notify:=true; v_title:='Échéance de tâche AIAC modifiée';
  elsif new.status is distinct from old.status and new.status in ('active','cancelled') then v_notify:=true; v_title:=case when new.status='cancelled' then 'Tâche AIAC annulée' else 'Tâche AIAC activée' end;
  end if;
  if not v_notify or new.assigned_to is not distinct from auth.uid() then return new; end if;
  select a.project_id,p.program_id,pg.body_id into v_project,v_program,v_body
  from public.activities a join public.projects p on p.id=a.project_id join public.programs pg on pg.id=p.program_id where a.id=new.activity_id;
  insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id)
  values(new.assigned_to,v_title,new.code||' · '||new.title||case when new.due_date is not null then ' · échéance '||to_char(new.due_date,'DD/MM/YYYY') else '' end,
    '/espace/terrain/complet?body='||v_body::text||'&program='||v_program::text||'&project='||v_project::text||'&activity='||new.activity_id::text||'&task='||new.id::text,
    'program_cycle','activity_task',new.id);
  return new;
end;
$$;
drop trigger if exists activity_tasks_notify_assignment on public.activity_tasks;
create trigger activity_tasks_notify_assignment after insert or update of assigned_to,due_date,status on public.activity_tasks
for each row execute function private.notify_activity_task_assignment();

create or replace function private.notify_project_membership()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_project uuid; v_user uuid; v_role text; v_name text; v_program uuid; v_body uuid; v_title text;
begin
  if tg_op='DELETE' then v_project:=old.project_id; v_user:=old.user_id; v_role:=old.member_role; v_title:='Retrait d’un projet AIAC';
  else
    v_project:=new.project_id; v_user:=new.user_id; v_role:=new.member_role;
    if tg_op='UPDATE' and new.member_role is distinct from old.member_role then v_title:='Rôle de projet AIAC modifié';
    elsif tg_op='UPDATE' then return new;
    else v_title:='Ajout à un projet AIAC'; end if;
  end if;
  select p.name,p.program_id,pg.body_id into v_name,v_program,v_body from public.projects p join public.programs pg on pg.id=p.program_id where p.id=v_project;
  if v_user is distinct from auth.uid() then
    insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id)
    values(v_user,v_title,coalesce(v_name,'Projet AIAC')||' · rôle '||coalesce(v_role,'—'),
      '/espace/terrain/complet?body='||v_body::text||'&program='||v_program::text||'&project='||v_project::text,'program_cycle','project',v_project);
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;
drop trigger if exists project_members_notify on public.project_members;
create trigger project_members_notify after insert or update of member_role or delete on public.project_members
for each row execute function private.notify_project_membership();

create or replace function private.cleanup_task_report_notifications()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  delete from public.notifications where entity_type='task_report' and entity_id=old.id;
  return old;
end;
$$;
drop trigger if exists task_reports_cleanup_notifications on public.task_reports;
create trigger task_reports_cleanup_notifications after delete on public.task_reports
for each row execute function private.cleanup_task_report_notifications();
