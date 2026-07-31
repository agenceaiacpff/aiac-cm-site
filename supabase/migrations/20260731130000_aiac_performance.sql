create index conversations_created_by_idx on public.conversations(created_by,updated_at desc);
create index conversations_request_id_idx on public.conversations(request_id) where request_id is not null;
create index documents_owner_id_idx on public.documents(owner_id,created_at desc);
create index documents_request_id_idx on public.documents(request_id) where request_id is not null;
create index message_reads_user_id_idx on public.message_reads(user_id,read_at desc);
create index messages_sender_id_idx on public.messages(sender_id,created_at desc);
create index tasks_created_by_idx on public.tasks(created_by,created_at desc);
create index tasks_request_id_idx on public.tasks(request_id) where request_id is not null;

drop policy profiles_update_own on public.profiles;
drop policy profiles_update_admin on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
using ((select auth.uid())=id or (select private.is_admin()))
with check ((select auth.uid())=id or (select private.is_admin()));
