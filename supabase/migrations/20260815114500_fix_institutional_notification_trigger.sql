-- Correctif préalable : le déclencheur partagé ne doit pas résoudre des champs
-- appartenant à une autre table avant d'avoir identifié la table appelante.
create or replace function private.notify_institutional_assignment() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='workforce_assignments' then
    if new.profile_id is not null then
      insert into public.notifications(user_id,title,body,href)
      values(new.profile_id,'Nouvelle affectation AIAC',new.job_title,'/espace?tab=institution');
    end if;
  elsif tg_table_name='case_files' then
    if new.assigned_to is not null and (tg_op='INSERT' or new.assigned_to is distinct from old.assigned_to) then
      insert into public.notifications(user_id,title,body,href)
      values(new.assigned_to,'Dossier de cas affecté',new.case_number || ' · ' || new.title,'/espace?tab=institution');
    end if;
  elsif tg_table_name='activities' then
    if new.manager_id is not null and (tg_op='INSERT' or new.manager_id is distinct from old.manager_id) then
      insert into public.notifications(user_id,title,body,href)
      values(new.manager_id,'Activité à coordonner',new.title,'/espace?tab=institution');
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.notify_institutional_assignment() from public,anon,authenticated;
