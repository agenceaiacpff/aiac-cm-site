drop policy if exists task_report_object_superadmin_delete on storage.objects;
create policy task_report_object_superadmin_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id='aiac-task-reports'
  and private.is_super_admin(auth.uid())
  and private.has_aal2()
);
