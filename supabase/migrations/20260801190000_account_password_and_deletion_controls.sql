-- Contrôles super-administrateur pour les mots de passe et la suppression de comptes.

insert into public.permissions(code,domain,name,description,sensitive) values
  ('accounts.password.manage','accounts','Définir un mot de passe temporaire','Définir un mot de passe temporaire, révoquer les sessions et imposer son remplacement à la prochaine connexion.',true),
  ('accounts.delete','accounts','Supprimer définitivement un compte','Supprimer un accès Auth après confirmation renforcée et contrôle des données institutionnelles.',true)
on conflict (code) do update set
  domain=excluded.domain,name=excluded.name,description=excluded.description,sensitive=excluded.sensitive;

insert into public.role_permissions(role,permission_code) values
  ('super_admin','accounts.password.manage'),
  ('super_admin','accounts.delete')
on conflict do nothing;

alter table public.admin_account_actions
  drop constraint if exists admin_account_actions_action_check;

alter table public.admin_account_actions
  add constraint admin_account_actions_action_check check (
    action in (
      'invite','create','reject','revoke_sessions','require_password_reset','verify_email',
      'grant_permission','deny_permission','assign_scope','set_temporary_password','delete_account'
    )
  );

-- La trace administrative doit survivre à la suppression du profil visé.
alter table public.admin_account_actions
  alter column target_profile_id drop not null;

alter table public.admin_account_actions
  drop constraint if exists admin_account_actions_target_profile_id_fkey;

alter table public.admin_account_actions
  add constraint admin_account_actions_target_profile_id_fkey
  foreign key (target_profile_id) references public.profiles(id) on delete set null;
