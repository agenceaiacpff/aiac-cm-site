drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations for select to authenticated
using(private.is_active_approved_user(auth.uid()) and private.is_conversation_member(id,auth.uid()));

drop policy if exists members_select on public.conversation_members;
create policy members_select on public.conversation_members for select to authenticated
using(private.is_active_approved_user(auth.uid()) and private.is_conversation_member(conversation_id,auth.uid()));

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated
using(private.is_active_approved_user(auth.uid()) and private.is_conversation_member(conversation_id,auth.uid()));

drop policy if exists reads_insert on public.message_reads;
create policy reads_insert on public.message_reads for insert to authenticated
with check(
  private.is_active_approved_user(auth.uid())
  and user_id=auth.uid()
  and exists(select 1 from public.messages m where m.id=message_id and private.is_conversation_member(m.conversation_id,auth.uid()))
);

drop policy if exists reads_select on public.message_reads;
create policy reads_select on public.message_reads for select to authenticated
using(
  private.is_active_approved_user(auth.uid())
  and exists(select 1 from public.messages m where m.id=message_id and private.is_conversation_member(m.conversation_id,auth.uid()))
);

drop policy if exists reads_update on public.message_reads;
create policy reads_update on public.message_reads for update to authenticated
using(
  private.is_active_approved_user(auth.uid()) and user_id=auth.uid()
  and exists(select 1 from public.messages m where m.id=message_id and private.is_conversation_member(m.conversation_id,auth.uid()))
)
with check(
  private.is_active_approved_user(auth.uid()) and user_id=auth.uid()
  and exists(select 1 from public.messages m where m.id=message_id and private.is_conversation_member(m.conversation_id,auth.uid()))
);
