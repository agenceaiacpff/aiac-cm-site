create or replace function public.meal_reporting_dashboard() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not (private.has_position_capability('meal.manage',auth.uid(),null,null) or private.has_position_capability('report.view_scope',auth.uid(),null,null) or private.is_super_admin(auth.uid())) then raise exception 'Accès SERA/MEAL non autorisé'; end if;
 return jsonb_build_object(
  'reports_total',(select count(*) from public.task_reports tr where private.can_view_task_report(tr.id)),
  'submitted',(select count(*) from public.task_reports tr where tr.status='submitted' and private.can_view_task_report(tr.id)),
  'approved',(select count(*) from public.task_reports tr where tr.status='approved' and private.can_view_task_report(tr.id)),
  'returned',(select count(*) from public.task_reports tr where tr.status in('returned','rejected') and private.can_view_task_report(tr.id)),
  'quality_reviews',(select count(*) from public.meal_report_quality_reviews q where private.can_view_task_report(q.report_id)),
  'invalidated',(select count(*) from public.meal_report_quality_reviews q where q.verdict='invalid' and private.can_view_task_report(q.report_id)),
  'indicators',(select count(*) from public.task_report_indicator_values i where private.can_view_task_report(i.report_id)),
  'recent',coalesce((select jsonb_agg(x) from (select jsonb_build_object('id',tr.id,'number',tr.report_number,'title',tr.title,'status',tr.status,'execution_date',tr.execution_date,'reporter',p.full_name,'quality_verdict',(select q.verdict from public.meal_report_quality_reviews q where q.report_id=tr.id order by q.updated_at desc limit 1),'quality_score',(select q.quality_score from public.meal_report_quality_reviews q where q.report_id=tr.id order by q.updated_at desc limit 1)) x from public.task_reports tr join public.profiles p on p.id=tr.reporter_id where private.can_view_task_report(tr.id) order by tr.created_at desc limit 100) s),'[]'::jsonb)
 );
end $$;
grant execute on function public.meal_reporting_dashboard() to authenticated;