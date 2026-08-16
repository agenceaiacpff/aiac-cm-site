create or replace function public.my_hierarchical_task_report_review_queue()
returns table(
  report_id uuid,report_number text,title text,summary text,revision integer,current_hash text,
  reporter_id uuid,reporter_name text,body_code text,program_code text,project_code text,
  activity_code text,task_code text,task_title text,submitted_at timestamptz
)
language sql stable security definer set search_path=''
as $$
  select r.id,r.report_number,r.title,r.summary,r.revision,r.current_hash,r.reporter_id,
    coalesce(pf.full_name,pf.email,'Agent AIAC'),b.code,pg.code,pr.code,a.code,t.code,t.title,r.submitted_at
  from public.task_reports r
  join public.activity_tasks t on t.id=r.task_id
  join public.activities a on a.id=t.activity_id
  join public.projects pr on pr.id=a.project_id
  join public.programs pg on pg.id=pr.program_id
  join public.governance_bodies b on b.id=pg.body_id
  join public.profiles pf on pf.id=r.reporter_id
  where auth.uid() is not null
    and private.is_active_approved_user(auth.uid())
    and r.status='submitted'
    and r.validation_authority_type<>'collective_body'
    and r.reporter_id<>auth.uid()
    and private.can_review_task_report(r.id,auth.uid())
  order by r.submitted_at asc nulls last,r.report_number;
$$;
revoke all on function public.my_hierarchical_task_report_review_queue() from public,anon;
grant execute on function public.my_hierarchical_task_report_review_queue() to authenticated;
