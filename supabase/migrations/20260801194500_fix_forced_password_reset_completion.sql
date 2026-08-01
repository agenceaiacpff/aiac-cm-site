-- Termine un changement forcé uniquement après une modification réelle du mot de passe Auth.

create or replace function private.complete_forced_password_reset_from_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set must_reset_password = false,
      password_reset_required_at = null,
      password_reset_required_by = null
  where id = new.id
    and must_reset_password = true;
  return new;
end;
$$;

revoke all on function private.complete_forced_password_reset_from_auth()
from public, anon, authenticated;

drop trigger if exists auth_user_complete_forced_password_reset on auth.users;
create trigger auth_user_complete_forced_password_reset
after update of encrypted_password on auth.users
for each row
when (old.encrypted_password is distinct from new.encrypted_password)
execute function private.complete_forced_password_reset_from_auth();

-- Le client conserve cet appel comme vérification, mais ne reçoit aucun droit
-- d'écriture direct sur la colonne de sécurité du profil.
create or replace function public.complete_forced_password_reset()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  reset_is_pending boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentification requise';
  end if;

  select p.must_reset_password
  into reset_is_pending
  from public.profiles p
  where p.id = auth.uid();

  if not found then
    raise exception 'Profil introuvable';
  end if;
  if reset_is_pending then
    raise exception 'Le changement du mot de passe n''a pas encore été confirmé';
  end if;
end;
$$;

revoke all on function public.complete_forced_password_reset() from public, anon;
grant execute on function public.complete_forced_password_reset() to authenticated;
