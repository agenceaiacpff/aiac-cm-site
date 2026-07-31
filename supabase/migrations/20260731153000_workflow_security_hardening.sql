-- Durcissement : le changement de statut conserve les droits/RLS de l'appelant.

alter function public.change_account_status(uuid,public.account_status,text) security invoker;

create policy account_status_history_insert on public.account_status_history for insert to authenticated
with check (
  actor_id=(select auth.uid())
  and (select private.is_admin())
  and (select private.has_verified_mfa())
  and (select private.has_aal2())
);

grant update(status) on public.profiles to authenticated;
grant insert on public.account_status_history to authenticated;

