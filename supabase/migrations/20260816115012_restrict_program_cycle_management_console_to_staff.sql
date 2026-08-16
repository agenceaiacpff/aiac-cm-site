create or replace function private.can_use_program_cycle_management(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path=''
as $$
  select private.is_active_approved_user(uid)
    and exists(select 1 from public.profiles p where p.id=uid and p.role::text in ('staff','manager','admin','super_admin'));
$$;

create or replace function public.program_cycle_management_search(search_text text default '',target_type text default 'all',result_limit integer default 100)
returns table(node_type text,id uuid,code text,label text,status text,parent_label text,child_count bigint,report_count bigint,can_manage boolean,can_delete boolean,details jsonb)
language sql stable security definer set search_path=''
as $$
  with caller as (
    select lower(trim(coalesce(search_text,''))) q,lower(trim(coalesce(target_type,'all'))) t,
      greatest(1,least(coalesce(result_limit,100),200)) lim,
      private.is_super_admin(auth.uid()) and private.has_aal2() super_delete
    where auth.uid() is not null and private.can_use_program_cycle_management(auth.uid())
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
