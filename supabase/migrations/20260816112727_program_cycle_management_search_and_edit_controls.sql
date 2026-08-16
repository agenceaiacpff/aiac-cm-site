-- Recherche/édition centralisée du Cycle des programmes.

create or replace function private.can_view_task_report(target_id uuid, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path=''
as $$
 select private.is_active_user(uid) and exists(
  select 1 from public.task_reports r
  join public.activity_tasks t on t.id=r.task_id
  join public.activities a on a.id=t.activity_id
  join public.projects pr on pr.id=a.project_id
  join public.programs pg on pg.id=pr.program_id
  where r.id=target_id and (
   r.reporter_id=uid or r.supervisor_id=uid
   or (private.is_super_admin(uid) and case when uid=auth.uid() then private.has_aal2() else true end)
   or private.can_review_task_report(r.id,uid)
   or private.has_position_capability('report.view_scope',uid,pg.body_id,pr.id)
  )
 );
$$;

create or replace function public.program_cycle_management_search(search_text text default '',target_type text default 'all',result_limit integer default 100)
returns table(node_type text,id uuid,code text,label text,status text,parent_label text,child_count bigint,report_count bigint,can_manage boolean,can_delete boolean,details jsonb)
language sql stable security definer set search_path=''
as $$
  with caller as (
    select lower(trim(coalesce(search_text,''))) q,lower(trim(coalesce(target_type,'all'))) t,
      greatest(1,least(coalesce(result_limit,100),200)) lim,
      private.is_super_admin(auth.uid()) and private.has_aal2() super_delete
    where auth.uid() is not null and private.is_active_approved_user(auth.uid())
  ), nodes as (
    select 'program'::text node_type,pg.id,pg.code,pg.name label,pg.status::text status,b.code||' · '||b.name parent_label,
      (select count(*) from public.projects p where p.program_id=pg.id)::bigint child_count,
      (select count(*) from public.task_reports r join public.activity_tasks t on t.id=r.task_id join public.activities a on a.id=t.activity_id join public.projects p on p.id=a.project_id where p.program_id=pg.id)::bigint report_count,
      private.can_manage_body_program(pg.body_id,auth.uid()) can_manage,(select super_delete from caller) can_delete,
      jsonb_build_object('body_id',pg.body_id,'code',pg.code,'name',pg.name,'description',pg.description,'thematic_area',pg.thematic_area,'manager_id',pg.manager_id,'status',pg.status,'start_date',pg.start_date,'end_date',pg.end_date,'budget_amount',pg.budget_amount,'budget_currency',pg.budget_currency) details,
      lower(concat_ws(' ',pg.code,pg.name,pg.description,pg.thematic_area,b.code,b.name)) searchable
    from public.programs pg join public.governance_bodies b on b.id=pg.body_id
    union all
    select 'project',p.id,p.code,p.name,p.status::text,pg.code||' · '||pg.name,
      (select count(*) from public.activities a where a.project_id=p.id)::bigint,
      (select count(*) from public.task_reports r join public.activity_tasks t on t.id=r.task_id join public.activities a on a.id=t.activity_id where a.project_id=p.id)::bigint,
      private.can_manage_project(p.id,auth.uid()),(select super_delete from caller),
      jsonb_build_object('program_id',p.program_id,'code',p.code,'name',p.name,'description',p.description,'status',p.status,'location',p.location,'start_date',p.start_date,'end_date',p.end_date,'budget_amount',p.budget_amount,'budget_currency',p.budget_currency),
      lower(concat_ws(' ',p.code,p.name,p.description,p.location,pg.code,pg.name))
    from public.projects p join public.programs pg on pg.id=p.program_id
    union all
    select 'activity',a.id,a.code,a.title,a.status::text,p.code||' · '||p.name,
      (select count(*) from public.activity_tasks t where t.activity_id=a.id)::bigint,
      (select count(*) from public.task_reports r join public.activity_tasks t on t.id=r.task_id where t.activity_id=a.id)::bigint,
      private.can_manage_activity(a.id,auth.uid()),(select super_delete from caller),
      jsonb_build_object('project_id',a.project_id,'program_id',a.program_id,'code',a.code,'title',a.title,'activity_type',a.activity_type,'description',a.description,'status',a.status,'location',a.location,'starts_at',a.starts_at,'ends_at',a.ends_at,'expected_participants',a.expected_participants,'budget_amount',a.budget_amount,'budget_currency',a.budget_currency,'manager_id',a.manager_id),
      lower(concat_ws(' ',a.code,a.title,a.description,a.location,p.code,p.name))
    from public.activities a join public.projects p on p.id=a.project_id
    union all
    select 'task',t.id,t.code,t.title,t.status::text,a.code||' · '||a.title,0::bigint,
      (select count(*) from public.task_reports r where r.task_id=t.id)::bigint,
      private.can_manage_activity_task(t.id,auth.uid()),(select super_delete from caller),
      jsonb_build_object('activity_id',t.activity_id,'code',t.code,'title',t.title,'description',t.description,'expected_output',t.expected_output,'sequence_no',t.sequence_no,'assigned_to',t.assigned_to,'due_date',t.due_date,'requires_evidence',t.requires_evidence,'requires_attendance',t.requires_attendance,'status',t.status),
      lower(concat_ws(' ',t.code,t.title,t.description,t.expected_output,a.code,a.title))
    from public.activity_tasks t join public.activities a on a.id=t.activity_id
    union all
    select 'report',r.id,r.report_number,coalesce(r.title,r.report_number),r.status::text,t.code||' · '||t.title,
      ((select count(*) from public.task_report_evidence e where e.report_id=r.id)+(select count(*) from public.task_report_attendance x where x.report_id=r.id)+(select count(*) from public.task_report_indicator_values i where i.report_id=r.id))::bigint,
      1::bigint,private.can_edit_task_report(r.id,auth.uid()),(select super_delete from caller),
      jsonb_build_object('report_number',r.report_number,'title',r.title,'status',r.status,'task_id',r.task_id,'reporter_id',r.reporter_id,'revision',r.revision,'execution_date',r.execution_date,'submitted_at',r.submitted_at,'approved_at',r.approved_at,'public_content_id',r.public_content_id,'validation_authority_type',r.validation_authority_type),
      lower(concat_ws(' ',r.report_number,r.title,r.summary,t.code,t.title))
    from public.task_reports r join public.activity_tasks t on t.id=r.task_id
    where private.can_view_task_report(r.id,auth.uid())
  )
  select n.node_type,n.id,n.code,n.label,n.status,n.parent_label,n.child_count,n.report_count,n.can_manage,n.can_delete,n.details
  from nodes n cross join caller c
  where (c.t='all' or n.node_type=c.t) and (c.q='' or n.searchable like '%'||c.q||'%')
  order by case n.node_type when 'program' then 1 when 'project' then 2 when 'activity' then 3 when 'task' then 4 else 5 end,n.code,n.label
  limit (select lim from caller);
$$;
revoke all on function public.program_cycle_management_search(text,text,integer) from public,anon;
grant execute on function public.program_cycle_management_search(text,text,integer) to authenticated;

create or replace function public.update_program_cycle_item(target_type text,target_id uuid,p_patch jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  kind text:=lower(trim(coalesce(target_type,''))); before_row jsonb; after_row jsonb;
  old_program public.programs%rowtype; old_project public.projects%rowtype; old_activity public.activities%rowtype; old_task public.activity_tasks%rowtype;
  target_program public.programs%rowtype; target_project public.projects%rowtype;
  is_super boolean:=private.is_super_admin(auth.uid()) and private.has_aal2();
begin
  if auth.uid() is null or not private.is_active_approved_user(auth.uid()) then raise exception 'Compte actif et approuvé requis'; end if;
  if p_patch is null or jsonb_typeof(p_patch)<>'object' then raise exception 'Modification invalide'; end if;
  if kind='program' then
    select * into old_program from public.programs where id=target_id for update; if not found then raise exception 'Programme introuvable'; end if;
    if not private.can_manage_body_program(old_program.body_id,auth.uid()) then raise exception 'Modification non autorisée'; end if;
    if p_patch ? 'body_id' and nullif(p_patch->>'body_id','')::uuid is distinct from old_program.body_id then
      if not is_super then raise exception 'Seul le super-administrateur peut déplacer un programme vers un autre organe'; end if;
      if not private.can_manage_body_program(nullif(p_patch->>'body_id','')::uuid,auth.uid()) then raise exception 'Organe cible non autorisé'; end if;
    end if;
    before_row:=to_jsonb(old_program);
    update public.programs set body_id=case when p_patch?'body_id' then (p_patch->>'body_id')::uuid else body_id end,code=case when p_patch?'code' then upper(trim(p_patch->>'code')) else code end,name=case when p_patch?'name' then trim(p_patch->>'name') else name end,description=case when p_patch?'description' then nullif(trim(p_patch->>'description'),'') else description end,thematic_area=case when p_patch?'thematic_area' then nullif(trim(p_patch->>'thematic_area'),'') else thematic_area end,manager_id=case when p_patch?'manager_id' then nullif(p_patch->>'manager_id','')::uuid else manager_id end,status=case when p_patch?'status' then p_patch->>'status' else status end,start_date=case when p_patch?'start_date' then nullif(p_patch->>'start_date','')::date else start_date end,end_date=case when p_patch?'end_date' then nullif(p_patch->>'end_date','')::date else end_date end,budget_amount=case when p_patch?'budget_amount' then nullif(p_patch->>'budget_amount','')::numeric else budget_amount end where id=target_id;
    select to_jsonb(p) into after_row from public.programs p where p.id=target_id;
  elsif kind='project' then
    select * into old_project from public.projects where id=target_id for update; if not found then raise exception 'Projet introuvable'; end if;
    if not private.can_manage_project(old_project.id,auth.uid()) then raise exception 'Modification non autorisée'; end if;
    if p_patch?'program_id' and nullif(p_patch->>'program_id','')::uuid is distinct from old_project.program_id then
      if not is_super then raise exception 'Seul le super-administrateur peut déplacer un projet vers un autre programme'; end if;
      select * into target_program from public.programs where id=(p_patch->>'program_id')::uuid;
      if target_program.id is null or not private.can_manage_body_program(target_program.body_id,auth.uid()) then raise exception 'Programme cible non autorisé'; end if;
    end if;
    before_row:=to_jsonb(old_project);
    update public.projects set program_id=case when p_patch?'program_id' then (p_patch->>'program_id')::uuid else program_id end,code=case when p_patch?'code' then upper(trim(p_patch->>'code')) else code end,name=case when p_patch?'name' then trim(p_patch->>'name') else name end,description=case when p_patch?'description' then nullif(trim(p_patch->>'description'),'') else description end,status=case when p_patch?'status' then (p_patch->>'status')::public.project_status else status end,location=case when p_patch?'location' then nullif(trim(p_patch->>'location'),'') else location end,start_date=case when p_patch?'start_date' then nullif(p_patch->>'start_date','')::date else start_date end,end_date=case when p_patch?'end_date' then nullif(p_patch->>'end_date','')::date else end_date end,budget_amount=case when p_patch?'budget_amount' then nullif(p_patch->>'budget_amount','')::numeric else budget_amount end where id=target_id;
    select to_jsonb(p) into after_row from public.projects p where p.id=target_id;
  elsif kind='activity' then
    select * into old_activity from public.activities where id=target_id for update; if not found then raise exception 'Activité introuvable'; end if;
    if not private.can_manage_activity(old_activity.id,auth.uid()) then raise exception 'Modification non autorisée'; end if;
    if p_patch?'project_id' and nullif(p_patch->>'project_id','')::uuid is distinct from old_activity.project_id then
      if not is_super then raise exception 'Seul le super-administrateur peut déplacer une activité vers un autre projet'; end if;
      select * into target_project from public.projects where id=(p_patch->>'project_id')::uuid; if target_project.id is null then raise exception 'Projet cible introuvable'; end if;
      select * into target_program from public.programs where id=target_project.program_id; if not private.can_manage_body_program(target_program.body_id,auth.uid()) then raise exception 'Projet cible non autorisé'; end if;
    end if;
    before_row:=to_jsonb(old_activity);
    update public.activities set project_id=case when p_patch?'project_id' then (p_patch->>'project_id')::uuid else project_id end,code=case when p_patch?'code' then upper(trim(p_patch->>'code')) else code end,title=case when p_patch?'title' then trim(p_patch->>'title') else title end,activity_type=case when p_patch?'activity_type' then p_patch->>'activity_type' else activity_type end,description=case when p_patch?'description' then nullif(trim(p_patch->>'description'),'') else description end,status=case when p_patch?'status' then p_patch->>'status' else status end,location=case when p_patch?'location' then nullif(trim(p_patch->>'location'),'') else location end,starts_at=case when p_patch?'starts_at' then (p_patch->>'starts_at')::timestamptz else starts_at end,ends_at=case when p_patch?'ends_at' then nullif(p_patch->>'ends_at','')::timestamptz else ends_at end,expected_participants=case when p_patch?'expected_participants' then nullif(p_patch->>'expected_participants','')::integer else expected_participants end,budget_amount=case when p_patch?'budget_amount' then nullif(p_patch->>'budget_amount','')::numeric else budget_amount end,manager_id=case when p_patch?'manager_id' then nullif(p_patch->>'manager_id','')::uuid else manager_id end where id=target_id;
    select to_jsonb(a) into after_row from public.activities a where a.id=target_id;
  elsif kind='task' then
    select * into old_task from public.activity_tasks where id=target_id for update; if not found then raise exception 'Tâche introuvable'; end if;
    if not private.can_manage_activity_task(old_task.id,auth.uid()) then raise exception 'Modification non autorisée'; end if;
    if p_patch?'activity_id' and nullif(p_patch->>'activity_id','')::uuid is distinct from old_task.activity_id then
      if not is_super then raise exception 'Seul le super-administrateur peut déplacer une tâche vers une autre activité'; end if;
      if not private.can_manage_activity((p_patch->>'activity_id')::uuid,auth.uid()) then raise exception 'Activité cible non autorisée'; end if;
    end if;
    before_row:=to_jsonb(old_task);
    update public.activity_tasks set activity_id=case when p_patch?'activity_id' then (p_patch->>'activity_id')::uuid else activity_id end,code=case when p_patch?'code' then upper(trim(p_patch->>'code')) else code end,title=case when p_patch?'title' then trim(p_patch->>'title') else title end,description=case when p_patch?'description' then nullif(trim(p_patch->>'description'),'') else description end,expected_output=case when p_patch?'expected_output' then nullif(trim(p_patch->>'expected_output'),'') else expected_output end,sequence_no=case when p_patch?'sequence_no' then (p_patch->>'sequence_no')::integer else sequence_no end,assigned_to=case when p_patch?'assigned_to' then nullif(p_patch->>'assigned_to','')::uuid else assigned_to end,due_date=case when p_patch?'due_date' then nullif(p_patch->>'due_date','')::date else due_date end,requires_evidence=case when p_patch?'requires_evidence' then (p_patch->>'requires_evidence')::boolean else requires_evidence end,requires_attendance=case when p_patch?'requires_attendance' then (p_patch->>'requires_attendance')::boolean else requires_attendance end,status=case when p_patch?'status' then p_patch->>'status' else status end where id=target_id;
    select to_jsonb(t) into after_row from public.activity_tasks t where t.id=target_id;
  else raise exception 'Type de donnée non pris en charge'; end if;
  perform private.write_audit('program_cycle.item_updated',kind,target_id,jsonb_build_object('before',before_row,'after',after_row));
  return after_row;
end;
$$;
revoke all on function public.update_program_cycle_item(text,uuid,jsonb) from public,anon;
grant execute on function public.update_program_cycle_item(text,uuid,jsonb) to authenticated;

drop trigger if exists activity_tasks_audit on public.activity_tasks;
create trigger activity_tasks_audit after insert or update or delete on public.activity_tasks
for each row execute function private.audit_operational_change();
