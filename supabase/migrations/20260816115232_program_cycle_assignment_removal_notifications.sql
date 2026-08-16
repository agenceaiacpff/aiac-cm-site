create or replace function private.notify_program_manager()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if tg_op='UPDATE' and old.manager_id is not null and old.manager_id is distinct from new.manager_id and old.manager_id is distinct from auth.uid() then
    insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id)
    values(old.manager_id,'Responsabilité de programme terminée',old.code||' · '||old.name,'/espace/terrain','program_cycle','program',old.id);
  end if;
  if new.manager_id is not null and (tg_op='INSERT' or new.manager_id is distinct from old.manager_id) and new.manager_id is distinct from auth.uid() then
    insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id)
    values(new.manager_id,'Programme AIAC à piloter',new.code||' · '||new.name,'/espace/terrain/complet?body='||new.body_id::text||'&program='||new.id::text,'program_cycle','program',new.id);
  end if;
  return new;
end;
$$;

create or replace function private.notify_institutional_assignment()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_program uuid; v_body uuid;
begin
  if tg_table_name='workforce_assignments' then
    if new.profile_id is not null then insert into public.notifications(user_id,title,body,href) values(new.profile_id,'Nouvelle affectation AIAC',new.job_title,'/espace?tab=institution'); end if;
  elsif tg_table_name='case_files' then
    if new.assigned_to is not null and (tg_op='INSERT' or new.assigned_to is distinct from old.assigned_to) then insert into public.notifications(user_id,title,body,href) values(new.assigned_to,'Dossier de cas affecté',new.case_number||' · '||new.title,'/espace?tab=institution'); end if;
  elsif tg_table_name='activities' then
    select p.program_id,pg.body_id into v_program,v_body from public.projects p join public.programs pg on pg.id=p.program_id where p.id=new.project_id;
    if tg_op='UPDATE' and old.manager_id is not null and old.manager_id is distinct from new.manager_id and old.manager_id is distinct from auth.uid() then
      insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id) values(old.manager_id,'Responsabilité d’activité terminée',old.code||' · '||old.title,'/espace/terrain','program_cycle','activity',old.id);
    end if;
    if new.manager_id is not null and (tg_op='INSERT' or new.manager_id is distinct from old.manager_id) and new.manager_id is distinct from auth.uid() then
      insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id) values(new.manager_id,'Activité AIAC à coordonner',new.code||' · '||new.title,'/espace/terrain/complet?body='||v_body::text||'&program='||v_program::text||'&project='||new.project_id::text||'&activity='||new.id::text,'program_cycle','activity',new.id);
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
  if tg_op='UPDATE' and old.assigned_to is not null and old.assigned_to is distinct from new.assigned_to and old.assigned_to is distinct from auth.uid() then
    insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id) values(old.assigned_to,'Affectation de tâche retirée',old.code||' · '||old.title,'/espace/terrain','program_cycle','activity_task',old.id);
  end if;
  if new.assigned_to is null then return new; end if;
  if tg_op='INSERT' then v_notify:=true; v_title:='Nouvelle tâche AIAC affectée';
  elsif new.assigned_to is distinct from old.assigned_to then v_notify:=true; v_title:='Nouvelle tâche AIAC affectée';
  elsif new.due_date is distinct from old.due_date then v_notify:=true; v_title:='Échéance de tâche AIAC modifiée';
  elsif new.status is distinct from old.status and new.status in ('active','cancelled') then v_notify:=true; v_title:=case when new.status='cancelled' then 'Tâche AIAC annulée' else 'Tâche AIAC activée' end; end if;
  if not v_notify or new.assigned_to is not distinct from auth.uid() then return new; end if;
  select a.project_id,p.program_id,pg.body_id into v_project,v_program,v_body from public.activities a join public.projects p on p.id=a.project_id join public.programs pg on pg.id=p.program_id where a.id=new.activity_id;
  insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id)
  values(new.assigned_to,v_title,new.code||' · '||new.title||case when new.due_date is not null then ' · échéance '||to_char(new.due_date,'DD/MM/YYYY') else '' end,'/espace/terrain/complet?body='||v_body::text||'&program='||v_program::text||'&project='||v_project::text||'&activity='||new.activity_id::text||'&task='||new.id::text,'program_cycle','activity_task',new.id);
  return new;
end;
$$;

create or replace function private.notify_project_membership()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_project uuid; v_user uuid; v_role text; v_name text; v_program uuid; v_body uuid; v_title text; v_href text;
begin
  if tg_op='DELETE' then v_project:=old.project_id; v_user:=old.user_id; v_role:=old.member_role; v_title:='Retrait d’un projet AIAC'; v_href:='/espace/terrain';
  else
    v_project:=new.project_id; v_user:=new.user_id; v_role:=new.member_role;
    if tg_op='UPDATE' and new.member_role is distinct from old.member_role then v_title:='Rôle de projet AIAC modifié'; elsif tg_op='UPDATE' then return new; else v_title:='Ajout à un projet AIAC'; end if;
  end if;
  select p.name,p.program_id,pg.body_id into v_name,v_program,v_body from public.projects p join public.programs pg on pg.id=p.program_id where p.id=v_project;
  if v_href is null then v_href:='/espace/terrain/complet?body='||v_body::text||'&program='||v_program::text||'&project='||v_project::text; end if;
  if v_user is distinct from auth.uid() then insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id) values(v_user,v_title,coalesce(v_name,'Projet AIAC')||' · rôle '||coalesce(v_role,'—'),v_href,'program_cycle','project',v_project); end if;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;
