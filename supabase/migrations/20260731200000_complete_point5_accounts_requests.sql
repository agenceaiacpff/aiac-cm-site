-- Point 5 A/B : comptes, RBAC, périmètres institutionnels et cycle complet des demandes.

-- -----------------------------------------------------------------------------
-- A. Architecture RBAC et périmètres AIAC
-- -----------------------------------------------------------------------------

create table public.permissions (
  code text primary key check (code ~ '^[a-z][a-z0-9_.]{2,79}$'),
  domain text not null check (domain in ('accounts','requests','audit','documents','institution','projects')),
  name text not null check (char_length(name) between 3 and 120),
  description text not null check (char_length(description) between 5 and 500),
  sensitive boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.role_permissions (
  role public.aiac_role not null,
  permission_code text not null references public.permissions(code) on delete cascade,
  granted_at timestamptz not null default now(),
  primary key (role,permission_code)
);

create table public.user_permission_overrides (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  permission_code text not null references public.permissions(code) on delete cascade,
  effect text not null check (effect in ('allow','deny')),
  scope_type text not null default 'global' check (scope_type in ('global','body','project','region','service','antenna')),
  body_id uuid references public.governance_bodies(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  scope_value text,
  reason text not null check (char_length(reason) between 5 and 1000),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  granted_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (expires_at is null or expires_at > starts_at),
  check (
    (scope_type='global' and body_id is null and project_id is null)
    or (scope_type in ('body','service','antenna') and body_id is not null and project_id is null)
    or (scope_type='project' and project_id is not null and body_id is null)
    or (scope_type='region' and scope_value is not null and body_id is null and project_id is null)
  )
);

create unique index user_permission_override_unique
  on public.user_permission_overrides(
    profile_id,permission_code,effect,scope_type,
    coalesce(body_id,'00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(project_id,'00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(scope_value,'')
  );
create index user_permission_overrides_profile_idx on public.user_permission_overrides(profile_id,permission_code,expires_at);

create table public.account_scope_assignments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  scope_type text not null check (scope_type in ('body','regional_coordination','service','antenna','project')),
  body_id uuid references public.governance_bodies(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  territory text,
  permission_level text not null default 'viewer' check (permission_level in ('viewer','contributor','manager','authority')),
  decision_reference text not null check (char_length(decision_reference) between 2 and 180),
  starts_on date not null default current_date,
  ends_on date,
  status text not null default 'active' check (status in ('active','suspended','ended')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on),
  check (
    (scope_type='project' and project_id is not null and body_id is null)
    or (scope_type<>'project' and body_id is not null and project_id is null)
  )
);
create index account_scope_profile_idx on public.account_scope_assignments(profile_id,status,starts_on,ends_on);
create index account_scope_body_idx on public.account_scope_assignments(body_id,profile_id) where body_id is not null;
create index account_scope_project_idx on public.account_scope_assignments(project_id,profile_id) where project_id is not null;

create table public.admin_account_actions (
  id uuid primary key default gen_random_uuid(),
  target_profile_id uuid not null references public.profiles(id) on delete restrict,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('invite','create','reject','revoke_sessions','require_password_reset','verify_email','grant_permission','deny_permission','assign_scope')),
  reason text not null check (char_length(reason) between 2 and 1000),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index admin_account_actions_target_idx on public.admin_account_actions(target_profile_id,created_at desc);
create index admin_account_actions_actor_idx on public.admin_account_actions(actor_id,created_at desc);

alter table public.profiles
  add column must_reset_password boolean not null default false,
  add column password_reset_required_at timestamptz,
  add column password_reset_required_by uuid references public.profiles(id) on delete set null,
  add column email_verified_at timestamptz;

insert into public.permissions(code,domain,name,description,sensitive) values
  ('accounts.invite','accounts','Inviter ou créer un compte','Créer un compte ou envoyer une invitation institutionnelle.',true),
  ('accounts.review','accounts','Valider les inscriptions','Approuver ou refuser officiellement une inscription.',true),
  ('accounts.status.manage','accounts','Gérer le statut des comptes','Activer, suspendre et réactiver un compte.',true),
  ('accounts.roles.manage','accounts','Gérer les rôles','Attribuer les rôles ordinaires du portail.',true),
  ('accounts.super_admin.manage','accounts','Gérer les super-administrateurs','Nommer ou retirer un super-administrateur.',true),
  ('accounts.sessions.revoke','accounts','Révoquer les sessions','Déconnecter un utilisateur de tous ses appareils.',true),
  ('accounts.password_reset.require','accounts','Imposer un nouveau mot de passe','Révoquer les sessions et imposer une réinitialisation.',true),
  ('accounts.email.verify','accounts','Vérifier une adresse électronique','Marquer manuellement une adresse électronique comme vérifiée.',true),
  ('accounts.scopes.manage','accounts','Gérer les périmètres institutionnels','Rattacher un compte à un organe, service, coordination, antenne, région ou projet.',true),
  ('accounts.permissions.manage','accounts','Gérer les permissions individuelles','Accorder ou refuser une permission individuelle et limitée.',true),
  ('accounts.connections.read','accounts','Consulter les connexions','Consulter les appareils, adresses IP et sessions observées.',true),
  ('requests.read_all','requests','Consulter toutes les demandes','Consulter toutes les demandes autorisées dans le portefeuille AIAC.',true),
  ('requests.manage_all','requests','Piloter toutes les demandes','Modifier, affecter et organiser toutes les demandes.',true),
  ('requests.update_assigned','requests','Traiter les demandes affectées','Traiter une demande personnellement affectée.',false),
  ('requests.comment_internal','requests','Écrire des notes internes','Lire et écrire les commentaires invisibles au demandeur.',true),
  ('requests.request_information','requests','Demander des compléments','Demander officiellement des informations complémentaires.',false),
  ('requests.convert_intervention','requests','Créer un dossier d’intervention','Transformer une demande en dossier d’intervention traçable.',true),
  ('requests.archive','requests','Archiver une demande','Archiver une demande sans confondre archivage et clôture.',true),
  ('requests.reopen','requests','Rouvrir une demande','Rouvrir formellement une demande avec un motif.',true),
  ('requests.statistics.read','requests','Consulter les délais','Consulter les statistiques de première réponse et de résolution.',false),
  ('audit.read','audit','Consulter le journal d’audit','Consulter les actions sensibles et les historiques techniques.',true)
on conflict (code) do update set
  domain=excluded.domain,name=excluded.name,description=excluded.description,sensitive=excluded.sensitive;

insert into public.role_permissions(role,permission_code)
select 'super_admin'::public.aiac_role,code from public.permissions
on conflict do nothing;

insert into public.role_permissions(role,permission_code) values
  ('admin','accounts.review'),('admin','accounts.status.manage'),('admin','accounts.roles.manage'),
  ('admin','accounts.connections.read'),('admin','requests.read_all'),('admin','requests.manage_all'),
  ('admin','requests.comment_internal'),('admin','requests.request_information'),
  ('admin','requests.convert_intervention'),('admin','requests.archive'),('admin','requests.reopen'),
  ('admin','requests.statistics.read'),
  ('manager','requests.update_assigned'),('manager','requests.comment_internal'),
  ('manager','requests.request_information'),('manager','requests.convert_intervention'),
  ('manager','requests.archive'),('manager','requests.reopen'),('manager','requests.statistics.read'),
  ('staff','requests.update_assigned'),('staff','requests.comment_internal'),
  ('staff','requests.request_information')
on conflict do nothing;

create or replace function private.has_permission(
  requested_permission text,
  uid uuid default auth.uid(),
  requested_body_id uuid default null,
  requested_project_id uuid default null,
  requested_region text default null
) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.profiles p
    where p.id=uid and p.status='active' and p.registration_state='approved'
      and not exists(
        select 1 from public.user_permission_overrides d
        where d.profile_id=uid and d.permission_code=requested_permission and d.effect='deny'
          and d.starts_at<=now() and (d.expires_at is null or d.expires_at>now())
          and (
            d.scope_type='global'
            or (d.scope_type in ('body','service','antenna') and d.body_id=requested_body_id)
            or (d.scope_type='project' and d.project_id=requested_project_id)
            or (d.scope_type='region' and lower(d.scope_value)=lower(requested_region))
          )
      )
      and (
        exists(select 1 from public.role_permissions rp where rp.role=p.role and rp.permission_code=requested_permission)
        or exists(
          select 1 from public.user_permission_overrides a
          where a.profile_id=uid and a.permission_code=requested_permission and a.effect='allow'
            and a.starts_at<=now() and (a.expires_at is null or a.expires_at>now())
            and (
              a.scope_type='global'
              or (a.scope_type in ('body','service','antenna') and a.body_id=requested_body_id)
              or (a.scope_type='project' and a.project_id=requested_project_id)
              or (a.scope_type='region' and lower(a.scope_value)=lower(requested_region))
            )
        )
      )
  );
$$;
revoke all on function private.has_permission(text,uuid,uuid,uuid,text) from public,anon;
grant execute on function private.has_permission(text,uuid,uuid,uuid,text) to authenticated;

create or replace function public.can_admin_action(permission_code text) returns boolean
language sql stable set search_path='' as $$
  select private.has_permission(permission_code)
    and private.has_verified_mfa()
    and private.has_aal2();
$$;
revoke all on function public.can_admin_action(text) from public,anon;
grant execute on function public.can_admin_action(text) to authenticated;

-- -----------------------------------------------------------------------------
-- A. Actions sensibles sur les comptes
-- -----------------------------------------------------------------------------

create or replace function public.revoke_user_sessions(target_id uuid, reason text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.can_admin_action('accounts.sessions.revoke') then
    raise exception 'Permission et authentification MFA insuffisantes';
  end if;
  if target_id=auth.uid() then raise exception 'Utilisez la déconnexion pour votre propre compte'; end if;
  if char_length(trim(reason))<5 then raise exception 'Le motif doit contenir au moins 5 caractères'; end if;
  if not exists(select 1 from public.profiles where id=target_id) then raise exception 'Compte introuvable'; end if;
  delete from auth.sessions where user_id=target_id;
  update public.session_activity set revoked_at=coalesce(revoked_at,now()) where user_id=target_id;
  insert into public.admin_account_actions(target_profile_id,actor_id,action,reason)
  values(target_id,auth.uid(),'revoke_sessions',trim(reason));
  perform private.write_audit('account.sessions_revoked','profile',target_id,jsonb_build_object('reason',trim(reason)));
end;
$$;
revoke all on function public.revoke_user_sessions(uuid,text) from public,anon;
grant execute on function public.revoke_user_sessions(uuid,text) to authenticated;

create or replace function public.require_password_reset(target_id uuid, reason text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.can_admin_action('accounts.password_reset.require') then
    raise exception 'Permission et authentification MFA insuffisantes';
  end if;
  if char_length(trim(reason))<5 then raise exception 'Le motif doit contenir au moins 5 caractères'; end if;
  update public.profiles set
    must_reset_password=true,password_reset_required_at=now(),password_reset_required_by=auth.uid()
  where id=target_id;
  if not found then raise exception 'Compte introuvable'; end if;
  delete from auth.sessions where user_id=target_id;
  update public.session_activity set revoked_at=coalesce(revoked_at,now()) where user_id=target_id;
  insert into public.admin_account_actions(target_profile_id,actor_id,action,reason)
  values(target_id,auth.uid(),'require_password_reset',trim(reason));
  perform private.write_audit('account.password_reset_required','profile',target_id,jsonb_build_object('reason',trim(reason)));
end;
$$;
revoke all on function public.require_password_reset(uuid,text) from public,anon;
grant execute on function public.require_password_reset(uuid,text) to authenticated;

create or replace function public.record_manual_email_verification(target_id uuid, reason text) returns void
language plpgsql set search_path='' as $$
begin
  if not public.can_admin_action('accounts.email.verify') then
    raise exception 'Permission et authentification MFA insuffisantes';
  end if;
  if char_length(trim(reason))<5 then raise exception 'Le motif doit contenir au moins 5 caractères'; end if;
  update public.profiles set email_verified_at=now() where id=target_id;
  if not found then raise exception 'Compte introuvable'; end if;
  insert into public.admin_account_actions(target_profile_id,actor_id,action,reason)
  values(target_id,auth.uid(),'verify_email',trim(reason));
  perform private.write_audit('account.email_verified_manually','profile',target_id,jsonb_build_object('reason',trim(reason)));
end;
$$;
revoke all on function public.record_manual_email_verification(uuid,text) from public,anon;
grant execute on function public.record_manual_email_verification(uuid,text) to authenticated;

create or replace function public.complete_forced_password_reset() returns void
language plpgsql set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  update public.profiles set must_reset_password=false where id=auth.uid();
end;
$$;
revoke all on function public.complete_forced_password_reset() from public,anon;
grant execute on function public.complete_forced_password_reset() to authenticated;

create or replace function private.protect_profile_privileges() returns trigger
language plpgsql security definer set search_path='' as $$
declare active_super_admins integer;
begin
  if new.role is not distinct from old.role
     and new.status is not distinct from old.status
     and new.registration_state is not distinct from old.registration_state
     and new.validated_at is not distinct from old.validated_at
     and new.validated_by is not distinct from old.validated_by
     and new.rejection_reason is not distinct from old.rejection_reason
     and new.must_reset_password is not distinct from old.must_reset_password
     and new.email_verified_at is not distinct from old.email_verified_at then return new; end if;
  if auth.uid() is null then return new; end if;
  if not private.is_active_user(auth.uid()) then raise exception 'Votre compte n’est pas actif'; end if;
  if old.role='super_admin' or new.role='super_admin' then
    if not public.can_admin_action('accounts.super_admin.manage') then raise exception 'Seul un super-administrateur MFA peut gérer les super-administrateurs'; end if;
  elsif new.role is distinct from old.role and not public.can_admin_action('accounts.roles.manage') then
    raise exception 'Permission insuffisante pour modifier le rôle';
  elsif new.status is distinct from old.status and not public.can_admin_action('accounts.status.manage') then
    raise exception 'Permission insuffisante pour modifier le statut';
  end if;
  if old.id=auth.uid() and old.role='super_admin' and (new.role is distinct from old.role or new.status is distinct from old.status) then
    raise exception 'Un super-administrateur ne peut pas réduire ou suspendre son propre accès';
  end if;
  if old.role='super_admin' and old.status='active' and (new.role<>'super_admin' or new.status<>'active') then
    select count(*) into active_super_admins from public.profiles p where p.role='super_admin' and p.status='active';
    if active_super_admins<=1 then raise exception 'Le dernier super-administrateur actif ne peut pas être retiré ou suspendu'; end if;
  end if;
  return new;
end;
$$;
revoke all on function private.protect_profile_privileges() from public,anon,authenticated;

create or replace function public.review_account_registration(target_id uuid,decision_name text,reason text,assigned_body_id uuid default null) returns void
language plpgsql set search_path='' as $$
begin
  if not public.can_admin_action('accounts.review') then raise exception 'Permission et authentification MFA insuffisantes'; end if;
  if decision_name not in ('approved','rejected') then raise exception 'Décision invalide'; end if;
  if char_length(trim(reason))<5 then raise exception 'Le motif doit contenir au moins 5 caractères'; end if;
  if not exists(select 1 from public.profiles where id=target_id) then raise exception 'Compte introuvable'; end if;
  update public.profiles set registration_state=decision_name,
    status=case when decision_name='approved' then 'active'::public.account_status else 'pending'::public.account_status end,
    validated_at=case when decision_name='approved' then now() else null end,
    validated_by=auth.uid(),rejection_reason=case when decision_name='rejected' then trim(reason) else null end
  where id=target_id;
  insert into public.account_reviews(profile_id,reviewer_id,decision,reason,body_id)
  values(target_id,auth.uid(),decision_name,trim(reason),assigned_body_id);
  if decision_name='rejected' then
    insert into public.admin_account_actions(target_profile_id,actor_id,action,reason)
    values(target_id,auth.uid(),'reject',trim(reason));
  end if;
end;
$$;

create or replace function public.change_account_status(target_id uuid,new_status public.account_status,reason text) returns void
language plpgsql security definer set search_path='' as $$
declare previous_status public.account_status;
begin
  if not public.can_admin_action('accounts.status.manage') then raise exception 'Permission et authentification MFA insuffisantes'; end if;
  if char_length(trim(reason))<5 then raise exception 'Le motif doit contenir au moins 5 caractères'; end if;
  select p.status into previous_status from public.profiles p where p.id=target_id for update;
  if previous_status is null then raise exception 'Compte introuvable'; end if;
  if previous_status=new_status then raise exception 'Le compte possède déjà ce statut'; end if;
  update public.profiles set status=new_status where id=target_id;
  insert into public.account_status_history(profile_id,actor_id,old_status,new_status,reason)
  values(target_id,auth.uid(),previous_status,new_status,trim(reason));
end;
$$;

-- -----------------------------------------------------------------------------
-- B. Demandes, plaintes et dossiers d’intervention
-- -----------------------------------------------------------------------------

alter table public.requests
  add column body_id uuid references public.governance_bodies(id) on delete set null,
  add column region text,
  add column due_at timestamptz,
  add column first_responded_at timestamptz,
  add column resolved_at timestamptz,
  add column closed_at timestamptz,
  add column archived_at timestamptz,
  add column archived_by uuid references public.profiles(id) on delete set null,
  add column archive_reason text,
  add column reopened_count integer not null default 0 check (reopened_count>=0),
  add column last_reopened_at timestamptz,
  add column last_reopened_by uuid references public.profiles(id) on delete set null;

alter table public.request_events
  add column visibility text not null default 'requester' check (visibility in ('requester','internal')),
  add column metadata jsonb not null default '{}'::jsonb;

create table public.request_interventions (
  id uuid primary key default gen_random_uuid(),
  case_number text not null unique default ('INT-' || to_char(current_date,'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  request_id uuid not null unique references public.requests(id) on delete restrict,
  body_id uuid references public.governance_bodies(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  region text,
  assigned_to uuid references public.profiles(id) on delete set null,
  title text not null check (char_length(title) between 3 and 200),
  summary text check (summary is null or char_length(summary)<=5000),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  sensitivity text not null default 'standard' check (sensitivity in ('standard','confidential','restricted','vbg','medical','psychosocial','whistleblowing')),
  status text not null default 'open' check (status in ('open','in_progress','on_hold','resolved','closed','archived')),
  due_at timestamptz,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  closed_at timestamptz,
  archived_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index requests_body_region_idx on public.requests(body_id,region,status,created_at desc);
create index requests_period_idx on public.requests(created_at desc,due_at) where archived_at is null;
create index requests_response_idx on public.requests(first_responded_at,resolved_at,closed_at);
create index request_events_visibility_idx on public.request_events(request_id,visibility,created_at desc);
create index request_interventions_assigned_idx on public.request_interventions(assigned_to,status,due_at);
create index request_interventions_body_idx on public.request_interventions(body_id,region,status);

create or replace function private.has_active_account_scope(uid uuid,target_body uuid,target_project uuid,minimum_level text default 'viewer') returns boolean
language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.account_scope_assignments s
    where s.profile_id=uid and s.status='active' and s.starts_on<=current_date
      and (s.ends_on is null or s.ends_on>=current_date)
      and (s.body_id=target_body or s.project_id=target_project)
      and case minimum_level
        when 'viewer' then s.permission_level in ('viewer','contributor','manager','authority')
        when 'contributor' then s.permission_level in ('contributor','manager','authority')
        when 'manager' then s.permission_level in ('manager','authority')
        else s.permission_level='authority'
      end
  );
$$;
revoke all on function private.has_active_account_scope(uuid,uuid,uuid,text) from public,anon;
grant execute on function private.has_active_account_scope(uuid,uuid,uuid,text) to authenticated;

create or replace function private.can_access_request(target_id uuid,uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.requests r
    where r.id=target_id and private.is_active_user(uid) and (
      r.created_by=uid or r.assigned_to=uid
      or private.has_permission('requests.read_all',uid,r.body_id,r.project_id,r.region)
      or (r.project_id is not null and private.is_project_member(r.project_id,uid))
      or private.has_active_account_scope(uid,r.body_id,r.project_id,'viewer')
    )
  );
$$;

create or replace function private.can_manage_request(target_id uuid,uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.requests r
    where r.id=target_id and private.is_active_user(uid) and (
      private.has_permission('requests.manage_all',uid,r.body_id,r.project_id,r.region)
      or (r.assigned_to=uid and private.has_permission('requests.update_assigned',uid,r.body_id,r.project_id,r.region))
      or (r.project_id is not null and private.can_manage_project(r.project_id,uid))
      or private.has_active_account_scope(uid,r.body_id,r.project_id,'manager')
    )
  );
$$;

create or replace function private.can_view_internal_request(target_id uuid,uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
  select private.can_manage_request(target_id,uid) and exists(
    select 1 from public.requests r where r.id=target_id
      and private.has_permission('requests.comment_internal',uid,r.body_id,r.project_id,r.region)
  );
$$;
revoke all on function private.can_access_request(uuid,uuid),private.can_manage_request(uuid,uuid),private.can_view_internal_request(uuid,uuid) from public,anon;
grant execute on function private.can_access_request(uuid,uuid),private.can_manage_request(uuid,uuid),private.can_view_internal_request(uuid,uuid) to authenticated;

create or replace function private.protect_request_workflow_fields() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then return new; end if;
  if private.can_manage_request(old.id,auth.uid()) then return new; end if;
  raise exception 'Vous ne disposez pas de la permission nécessaire pour modifier cette demande';
end;
$$;
revoke all on function private.protect_request_workflow_fields() from public,anon,authenticated;

create or replace function private.prepare_request_timestamps() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.status='resolved' and old.status is distinct from new.status then new.resolved_at=now(); end if;
  if new.status='closed' and old.status is distinct from new.status then new.closed_at=now(); end if;
  if new.status not in ('resolved','closed') and old.status is distinct from new.status then
    new.resolved_at=null; new.closed_at=null;
  end if;
  return new;
end;
$$;
revoke all on function private.prepare_request_timestamps() from public,anon,authenticated;
drop trigger if exists requests_prepare_timestamps on public.requests;
create trigger requests_prepare_timestamps before update of status on public.requests
for each row execute function private.prepare_request_timestamps();

create or replace function private.mark_request_first_response() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.visibility='requester' and new.actor_id is not null and exists(
    select 1 from public.requests r where r.id=new.request_id and r.created_by<>new.actor_id and r.first_responded_at is null
  ) then
    update public.requests set first_responded_at=new.created_at where id=new.request_id and first_responded_at is null;
  end if;
  return new;
end;
$$;
revoke all on function private.mark_request_first_response() from public,anon,authenticated;
drop trigger if exists request_events_first_response on public.request_events;
create trigger request_events_first_response after insert on public.request_events
for each row execute function private.mark_request_first_response();

create or replace function private.record_request_events() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status is distinct from old.status then
    insert into public.request_events(request_id,actor_id,event_type,from_value,to_value)
    values(new.id,auth.uid(),'status_change',old.status::text,new.status::text);
  end if;
  if new.assigned_to is distinct from old.assigned_to then
    insert into public.request_events(request_id,actor_id,event_type,from_value,to_value,visibility)
    values(new.id,auth.uid(),'assignment',old.assigned_to::text,new.assigned_to::text,'internal');
  end if;
  if new.priority is distinct from old.priority then
    insert into public.request_events(request_id,actor_id,event_type,from_value,to_value,visibility)
    values(new.id,auth.uid(),'priority_change',old.priority,new.priority,'internal');
  end if;
  if new.project_id is distinct from old.project_id then
    insert into public.request_events(request_id,actor_id,event_type,from_value,to_value,visibility)
    values(new.id,auth.uid(),'project_change',old.project_id::text,new.project_id::text,'internal');
  end if;
  if new.body_id is distinct from old.body_id or new.region is distinct from old.region then
    insert into public.request_events(request_id,actor_id,event_type,from_value,to_value,visibility)
    values(new.id,auth.uid(),'routing_change',concat_ws(' · ',old.body_id::text,old.region),concat_ws(' · ',new.body_id::text,new.region),'internal');
  end if;
  if new.due_at is distinct from old.due_at then
    insert into public.request_events(request_id,actor_id,event_type,from_value,to_value,visibility)
    values(new.id,auth.uid(),'due_date_change',old.due_at::text,new.due_at::text,'internal');
  end if;
  if new.archived_at is distinct from old.archived_at then
    insert into public.request_events(request_id,actor_id,event_type,body,visibility)
    values(new.id,auth.uid(),case when new.archived_at is null then 'unarchived' else 'archived' end,new.archive_reason,'internal');
  end if;
  return new;
end;
$$;

drop trigger if exists requests_record_events on public.requests;
create trigger requests_record_events after update of status,assigned_to,priority,project_id,body_id,region,due_at,archived_at on public.requests
for each row execute function private.record_request_events();

create or replace function private.notify_request_comment() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.event_type in ('comment','information_request') then
    insert into public.notifications(user_id,title,body,href)
    select distinct recipient,
      case when new.event_type='information_request' then 'Informations complémentaires demandées' else 'Nouveau commentaire sur une demande' end,
      left(r.subject || ' · ' || coalesce(new.body,''),240),'/espace?tab=demandes'
    from public.requests r
    cross join lateral (
      select r.created_by as recipient where new.visibility='requester'
      union all select r.assigned_to
    ) recipients
    where r.id=new.request_id and recipient is not null and recipient is distinct from new.actor_id;
  end if;
  return new;
end;
$$;

create or replace function public.request_more_information(target_id uuid,message text,response_due_at timestamptz default null) returns void
language plpgsql security definer set search_path='' as $$
declare target public.requests%rowtype;
begin
  select * into target from public.requests where id=target_id for update;
  if target.id is null then raise exception 'Demande introuvable'; end if;
  if not private.can_manage_request(target_id) or not private.has_permission('requests.request_information',auth.uid(),target.body_id,target.project_id,target.region) then
    raise exception 'Permission insuffisante';
  end if;
  if char_length(trim(message))<5 then raise exception 'La demande de complément doit contenir au moins 5 caractères'; end if;
  update public.requests set status='waiting_user',due_at=coalesce(response_due_at,due_at) where id=target_id;
  insert into public.request_events(request_id,actor_id,event_type,body,visibility,metadata)
  values(target_id,auth.uid(),'information_request',trim(message),'requester',jsonb_build_object('response_due_at',response_due_at));
  perform private.write_audit('request.information_requested','request',target_id,jsonb_build_object('response_due_at',response_due_at));
end;
$$;

create or replace function public.convert_request_to_intervention(
  target_id uuid,target_body_id uuid default null,target_project_id uuid default null,
  target_assigned_to uuid default null,target_region text default null,target_due_at timestamptz default null,
  target_sensitivity text default 'standard'
) returns uuid
language plpgsql security definer set search_path='' as $$
declare target public.requests%rowtype; created_id uuid; created_number text;
begin
  select * into target from public.requests where id=target_id for update;
  if target.id is null then raise exception 'Demande introuvable'; end if;
  if not private.can_manage_request(target_id) or not private.has_permission('requests.convert_intervention',auth.uid(),target.body_id,target.project_id,target.region) then raise exception 'Permission insuffisante'; end if;
  if exists(select 1 from public.request_interventions where request_id=target_id) then raise exception 'Un dossier d’intervention existe déjà pour cette demande'; end if;
  insert into public.request_interventions(request_id,body_id,project_id,region,assigned_to,title,summary,priority,sensitivity,due_at,created_by)
  values(target_id,coalesce(target_body_id,target.body_id),coalesce(target_project_id,target.project_id),coalesce(nullif(trim(target_region),''),target.region),coalesce(target_assigned_to,target.assigned_to),target.subject,target.description,target.priority,target_sensitivity,coalesce(target_due_at,target.due_at),auth.uid())
  returning id,case_number into created_id,created_number;
  update public.requests set status='in_progress',body_id=coalesce(target_body_id,body_id),project_id=coalesce(target_project_id,project_id),assigned_to=coalesce(target_assigned_to,assigned_to),region=coalesce(nullif(trim(target_region),''),region),due_at=coalesce(target_due_at,due_at) where id=target_id;
  insert into public.request_events(request_id,actor_id,event_type,body,visibility,metadata)
  values(target_id,auth.uid(),'intervention_created','Dossier d’intervention '||created_number||' créé.','requester',jsonb_build_object('intervention_id',created_id,'case_number',created_number));
  perform private.write_audit('request.converted_to_intervention','request',target_id,jsonb_build_object('intervention_id',created_id,'case_number',created_number));
  return created_id;
end;
$$;

create or replace function public.archive_request(target_id uuid,reason text) returns void
language plpgsql security definer set search_path='' as $$
declare target public.requests%rowtype;
begin
  select * into target from public.requests where id=target_id for update;
  if target.id is null then raise exception 'Demande introuvable'; end if;
  if not private.can_manage_request(target_id) or not private.has_permission('requests.archive',auth.uid(),target.body_id,target.project_id,target.region) then raise exception 'Permission insuffisante'; end if;
  if target.status::text not in ('resolved','closed','rejected') then raise exception 'La demande doit être résolue, clôturée ou rejetée avant archivage'; end if;
  if target.archived_at is not null then raise exception 'Cette demande est déjà archivée'; end if;
  if char_length(trim(reason))<5 then raise exception 'Le motif doit contenir au moins 5 caractères'; end if;
  update public.requests set archived_at=now(),archived_by=auth.uid(),archive_reason=trim(reason) where id=target_id;
  perform private.write_audit('request.archived','request',target_id,jsonb_build_object('reason',trim(reason)));
end;
$$;

create or replace function public.reopen_request(target_id uuid,reason text) returns void
language plpgsql security definer set search_path='' as $$
declare target public.requests%rowtype;
begin
  select * into target from public.requests where id=target_id for update;
  if target.id is null then raise exception 'Demande introuvable'; end if;
  if not private.can_manage_request(target_id) or not private.has_permission('requests.reopen',auth.uid(),target.body_id,target.project_id,target.region) then raise exception 'Permission insuffisante'; end if;
  if target.status::text not in ('resolved','closed','rejected') and target.archived_at is null then raise exception 'Seule une demande terminée ou archivée peut être rouverte'; end if;
  if char_length(trim(reason))<5 then raise exception 'Le motif doit contenir au moins 5 caractères'; end if;
  update public.requests set status='under_review',archived_at=null,archived_by=null,archive_reason=null,
    reopened_count=reopened_count+1,last_reopened_at=now(),last_reopened_by=auth.uid()
  where id=target_id;
  insert into public.request_events(request_id,actor_id,event_type,body,visibility)
  values(target_id,auth.uid(),'reopened',trim(reason),'requester');
  perform private.write_audit('request.reopened','request',target_id,jsonb_build_object('reason',trim(reason)));
end;
$$;

revoke all on function public.request_more_information(uuid,text,timestamptz),public.convert_request_to_intervention(uuid,uuid,uuid,uuid,text,timestamptz,text),public.archive_request(uuid,text),public.reopen_request(uuid,text) from public,anon;
grant execute on function public.request_more_information(uuid,text,timestamptz),public.convert_request_to_intervention(uuid,uuid,uuid,uuid,text,timestamptz,text),public.archive_request(uuid,text),public.reopen_request(uuid,text) to authenticated;

-- RLS
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_permission_overrides enable row level security;
alter table public.account_scope_assignments enable row level security;
alter table public.admin_account_actions enable row level security;
alter table public.request_interventions enable row level security;

create policy permissions_select on public.permissions for select to authenticated using ((select private.is_active_user()));
create policy role_permissions_select on public.role_permissions for select to authenticated using ((select public.can_admin_action('accounts.permissions.manage')));
create policy user_permission_overrides_select on public.user_permission_overrides for select to authenticated using (profile_id=(select auth.uid()) or (select public.can_admin_action('accounts.permissions.manage')));
create policy user_permission_overrides_insert on public.user_permission_overrides for insert to authenticated with check (granted_by=(select auth.uid()) and (select public.can_admin_action('accounts.permissions.manage')));
create policy user_permission_overrides_update on public.user_permission_overrides for update to authenticated using ((select public.can_admin_action('accounts.permissions.manage'))) with check (granted_by=(select auth.uid()) and (select public.can_admin_action('accounts.permissions.manage')));
create policy user_permission_overrides_delete on public.user_permission_overrides for delete to authenticated using ((select public.can_admin_action('accounts.permissions.manage')));

create policy account_scope_assignments_select on public.account_scope_assignments for select to authenticated using (profile_id=(select auth.uid()) or (select private.is_staff()));
create policy account_scope_assignments_insert on public.account_scope_assignments for insert to authenticated with check (created_by=(select auth.uid()) and (select public.can_admin_action('accounts.scopes.manage')));
create policy account_scope_assignments_update on public.account_scope_assignments for update to authenticated using ((select public.can_admin_action('accounts.scopes.manage'))) with check ((select public.can_admin_action('accounts.scopes.manage')));
create policy account_scope_assignments_delete on public.account_scope_assignments for delete to authenticated using ((select public.can_admin_action('accounts.scopes.manage')));
create policy admin_account_actions_select on public.admin_account_actions for select to authenticated using ((select public.can_admin_action('accounts.connections.read')));

drop policy if exists requests_select on public.requests;
drop policy if exists requests_staff_update on public.requests;
create policy requests_select on public.requests for select to authenticated using ((select private.can_access_request(id)));
create policy requests_staff_update on public.requests for update to authenticated using ((select private.can_manage_request(id))) with check ((select private.can_manage_request(id)));

drop policy if exists request_events_select on public.request_events;
drop policy if exists request_events_comment_insert on public.request_events;
create policy request_events_select on public.request_events for select to authenticated using (
  (select private.can_access_request(request_id)) and (
    visibility='requester' or (select private.can_view_internal_request(request_id))
  )
);
create policy request_events_comment_insert on public.request_events for insert to authenticated with check (
  actor_id=(select auth.uid()) and event_type='comment' and (select private.can_access_request(request_id))
  and (visibility='requester' or (visibility='internal' and (select private.can_view_internal_request(request_id))))
);

create policy request_interventions_select on public.request_interventions for select to authenticated using ((select private.can_access_request(request_id)) and (sensitivity='standard' or (select private.can_manage_request(request_id))));
create policy request_interventions_insert on public.request_interventions for insert to authenticated with check (created_by=(select auth.uid()) and (select private.can_manage_request(request_id)));
create policy request_interventions_update on public.request_interventions for update to authenticated using ((select private.can_manage_request(request_id))) with check ((select private.can_manage_request(request_id)));

grant select on public.permissions,public.role_permissions,public.user_permission_overrides,public.account_scope_assignments,public.admin_account_actions,public.request_interventions to authenticated;
grant insert,update,delete on public.user_permission_overrides,public.account_scope_assignments to authenticated;
grant insert,update on public.request_interventions to authenticated;
revoke insert,update,delete on public.permissions,public.role_permissions,public.admin_account_actions from authenticated;

create trigger account_scope_touch before update on public.account_scope_assignments for each row execute function private.touch_updated_at();
create trigger request_interventions_touch before update on public.request_interventions for each row execute function private.touch_updated_at();

-- Synchronise les confirmations déjà présentes dans Auth sans exposer auth.users.
update public.profiles p set email_verified_at=u.email_confirmed_at
from auth.users u where u.id=p.id and u.email_confirmed_at is not null and p.email_verified_at is null;
