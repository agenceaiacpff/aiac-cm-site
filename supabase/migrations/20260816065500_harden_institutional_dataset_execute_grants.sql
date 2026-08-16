revoke execute on function public.institutional_structure_dataset(uuid,uuid,uuid,uuid,uuid) from anon;
revoke execute on function public.institutional_reporting_dataset(uuid,uuid,uuid,uuid,uuid,date,date,boolean) from anon;
revoke execute on function public.my_institutional_task_dashboard(uuid) from anon;
revoke execute on function public.list_activity_task_counts() from anon;

grant execute on function public.institutional_structure_dataset(uuid,uuid,uuid,uuid,uuid) to authenticated;
grant execute on function public.institutional_reporting_dataset(uuid,uuid,uuid,uuid,uuid,date,date,boolean) to authenticated;
grant execute on function public.my_institutional_task_dashboard(uuid) to authenticated;
grant execute on function public.list_activity_task_counts() to authenticated;
