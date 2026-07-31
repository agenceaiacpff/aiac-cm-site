-- Phase 3 : gouvernance, ressources humaines, programmes, partenariats,
-- gestion de cas et activités institutionnelles.

create table public.governance_bodies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (char_length(code) between 2 and 30),
  name text not null check (char_length(name) between 3 and 180),
  body_type text not null check (body_type in ('general_assembly','board','executive_office','department','commission','coordination','committee','other')),
  description text,
  parent_body_id uuid references public.governance_bodies(id) on delete set null,
  mandate_start date,
  mandate_end date,
  status text not null default 'active' check (status in ('active','inactive','dissolved')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (mandate_end is null or mandate_start is null or mandate_end >= mandate_start)
);

create table public.institutional_members (
  id uuid primary key default gen_random_uuid(),
  member_number text not null unique default ('MEM-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  profile_id uuid unique references public.profiles(id) on delete set null,
  full_name text not null check (char_length(full_name) between 3 and 180),
  email text,
  phone text,
  gender text not null default 'unknown' check (gender in ('female','male','other','prefer_not_to_say','unknown')),
  birth_date date,
  locality text,
  address text,
  membership_category text not null default 'ordinary' check (membership_category in ('founding','ordinary','honorary','associate','institutional')),
  joined_at date not null default current_date,
  ended_at date,
  status text not null default 'active' check (status in ('pending','active','inactive','suspended','resigned','deceased')),
  notes text check (notes is null or char_length(notes) <= 5000),
  consent_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= joined_at)
);

create table public.body_memberships (
  id uuid primary key default gen_random_uuid(),
  body_id uuid not null references public.governance_bodies(id) on delete cascade,
  member_id uuid not null references public.institutional_members(id) on delete cascade,
  position_title text not null check (char_length(position_title) between 2 and 180),
  membership_type text not null default 'appointed' check (membership_type in ('elected','appointed','ex_officio','member')),
  start_date date not null default current_date,
  end_date date,
  voting_rights boolean not null default true,
  status text not null default 'active' check (status in ('active','ended','suspended')),
  appointed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(body_id,member_id,start_date),
  check (end_date is null or end_date >= start_date)
);

create table public.workforce_assignments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  member_id uuid references public.institutional_members(id) on delete set null,
  assignment_type text not null check (assignment_type in ('employee','volunteer','intern','consultant','service_provider')),
  job_title text not null check (char_length(job_title) between 2 and 180),
  body_id uuid references public.governance_bodies(id) on delete set null,
  supervisor_id uuid references public.profiles(id) on delete set null,
  start_date date not null,
  end_date date,
  work_mode text not null default 'hybrid' check (work_mode in ('onsite','remote','hybrid','field')),
  hours_per_week numeric(5,2) check (hours_per_week is null or hours_per_week between 0 and 168),
  status text not null default 'active' check (status in ('planned','active','on_leave','completed','terminated')),
  onboarding_completed boolean not null default false,
  notes text check (notes is null or char_length(notes) <= 5000),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (profile_id is not null or member_id is not null),
  check (end_date is null or end_date >= start_date)
);

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (char_length(code) between 2 and 30),
  name text not null check (char_length(name) between 3 and 180),
  description text,
  thematic_area text,
  manager_id uuid references public.profiles(id) on delete set null,
  status text not null default 'planned' check (status in ('planned','active','on_hold','completed','cancelled')),
  start_date date,
  end_date date,
  budget_amount numeric(16,2) check (budget_amount is null or budget_amount >= 0),
  budget_currency text not null default 'XAF' check (char_length(budget_currency)=3),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);

alter table public.projects add column program_id uuid references public.programs(id) on delete set null;

create table public.partners (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('PAR-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  legal_name text not null check (char_length(legal_name) between 2 and 220),
  short_name text,
  partner_type text not null check (partner_type in ('ngo','government','donor','community','private','academic','network','international','faith_based','other')),
  country text not null default 'Cameroun',
  city text,
  address text,
  website text,
  contact_name text,
  contact_email text,
  contact_phone text,
  status text not null default 'prospect' check (status in ('prospect','active','inactive','suspended','ended')),
  notes text check (notes is null or char_length(notes) <= 5000),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.partnerships (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  program_id uuid references public.programs(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  relationship_type text not null check (relationship_type in ('funding','implementation','technical','referral','advocacy','networking','in_kind','other')),
  agreement_reference text,
  start_date date,
  end_date date,
  financial_value numeric(16,2) check (financial_value is null or financial_value >= 0),
  currency text not null default 'XAF' check (char_length(currency)=3),
  focal_point_id uuid references public.profiles(id) on delete set null,
  status text not null default 'planned' check (status in ('planned','active','on_hold','completed','terminated')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(program_id,project_id)=1),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create table public.case_files (
  id uuid primary key default gen_random_uuid(),
  case_number text not null unique default ('CAS-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  beneficiary_id uuid not null references public.beneficiaries(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  case_type text not null check (case_type in ('social_support','protection','gbv','child_protection','disability','health','livelihood','education','referral','complaint','other')),
  title text not null check (char_length(title) between 3 and 180),
  summary text check (summary is null or char_length(summary) <= 10000),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'open' check (status in ('open','assessment','active','on_hold','closed','transferred')),
  assigned_to uuid references public.profiles(id) on delete set null,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  closure_reason text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (closed_at is null or closed_at >= opened_at),
  check (status <> 'closed' or closed_at is not null)
);

create table public.case_notes (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.case_files(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  note_type text not null default 'general' check (note_type in ('general','assessment','follow_up','referral','service','incident','closure')),
  body text not null check (char_length(body) between 1 and 10000),
  event_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.case_actions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.case_files(id) on delete cascade,
  action_type text not null check (action_type in ('service','referral','appointment','call','home_visit','field_visit','material_support','cash_support','documentation','other')),
  description text not null check (char_length(description) between 2 and 5000),
  provider_partner_id uuid references public.partners(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  due_at timestamptz,
  completed_at timestamptz,
  status text not null default 'planned' check (status in ('planned','in_progress','completed','cancelled')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (completed_at is null or status='completed')
);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('ACT-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  title text not null check (char_length(title) between 3 and 220),
  activity_type text not null check (activity_type in ('meeting','training','workshop','awareness','field_visit','distribution','advocacy','fundraising','monitoring','event','other')),
  description text,
  program_id uuid references public.programs(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  status text not null default 'planned' check (status in ('planned','confirmed','in_progress','completed','cancelled','postponed')),
  expected_participants integer check (expected_participants is null or expected_participants >= 0),
  actual_participants integer check (actual_participants is null or actual_participants >= 0),
  budget_amount numeric(16,2) check (budget_amount is null or budget_amount >= 0),
  budget_currency text not null default 'XAF' check (char_length(budget_currency)=3),
  manager_id uuid references public.profiles(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (program_id is not null or project_id is not null),
  check (ends_at is null or ends_at >= starts_at)
);

create table public.activity_reports (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null unique references public.activities(id) on delete cascade,
  summary text not null check (char_length(summary) between 5 and 10000),
  outcomes text,
  challenges text,
  recommendations text,
  attendance_breakdown jsonb not null default '{}'::jsonb,
  evidence_document_id uuid references public.documents(id) on delete set null,
  submitted_by uuid not null references public.profiles(id) on delete restrict,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index governance_bodies_parent_idx on public.governance_bodies(parent_body_id);
create index governance_bodies_status_idx on public.governance_bodies(status,body_type);
create index institutional_members_profile_idx on public.institutional_members(profile_id);
create index institutional_members_status_idx on public.institutional_members(status,membership_category);
create index body_memberships_body_idx on public.body_memberships(body_id,status);
create index body_memberships_member_idx on public.body_memberships(member_id,status);
create index body_memberships_appointed_idx on public.body_memberships(appointed_by);
create index workforce_profile_idx on public.workforce_assignments(profile_id,status);
create index workforce_member_idx on public.workforce_assignments(member_id,status);
create index workforce_body_idx on public.workforce_assignments(body_id,status);
create index workforce_supervisor_idx on public.workforce_assignments(supervisor_id,status);
create index workforce_created_by_idx on public.workforce_assignments(created_by);
create index programs_manager_idx on public.programs(manager_id,status);
create index programs_created_by_idx on public.programs(created_by);
create index projects_program_idx on public.projects(program_id,status);
create index partners_status_idx on public.partners(status,partner_type);
create index partners_created_by_idx on public.partners(created_by);
create index partnerships_partner_idx on public.partnerships(partner_id,status);
create index partnerships_program_idx on public.partnerships(program_id,status);
create index partnerships_project_idx on public.partnerships(project_id,status);
create index partnerships_focal_idx on public.partnerships(focal_point_id);
create index partnerships_created_by_idx on public.partnerships(created_by);
create index case_files_beneficiary_idx on public.case_files(beneficiary_id,created_at desc);
create index case_files_project_idx on public.case_files(project_id,status);
create index case_files_assigned_idx on public.case_files(assigned_to,status,priority);
create index case_files_created_by_idx on public.case_files(created_by);
create index case_notes_case_idx on public.case_notes(case_id,event_at desc);
create index case_notes_author_idx on public.case_notes(author_id,created_at desc);
create index case_actions_case_idx on public.case_actions(case_id,status,due_at);
create index case_actions_partner_idx on public.case_actions(provider_partner_id);
create index case_actions_assigned_idx on public.case_actions(assigned_to,status);
create index case_actions_created_by_idx on public.case_actions(created_by);
create index activities_program_idx on public.activities(program_id,starts_at desc);
create index activities_project_idx on public.activities(project_id,starts_at desc);
create index activities_manager_idx on public.activities(manager_id,status,starts_at);
create index activities_created_by_idx on public.activities(created_by);
create index activity_reports_submitted_idx on public.activity_reports(submitted_by,submitted_at desc);
create index activity_reports_document_idx on public.activity_reports(evidence_document_id);

create or replace function private.validate_case_project() returns trigger
language plpgsql set search_path='' as $$
declare beneficiary_project uuid;
begin
  select b.project_id into beneficiary_project from public.beneficiaries b where b.id=new.beneficiary_id;
  if beneficiary_project is distinct from new.project_id then
    raise exception 'Le dossier doit être rattaché au projet du bénéficiaire';
  end if;
  if new.status='closed' and new.closed_at is null then new.closed_at=now(); end if;
  if new.status<>'closed' then new.closed_at=null; end if;
  return new;
end;
$$;
revoke all on function private.validate_case_project() from public,anon,authenticated;
create trigger case_files_validate before insert or update of beneficiary_id,project_id,status on public.case_files
for each row execute function private.validate_case_project();

create or replace function private.protect_case_fields() returns trigger
language plpgsql set search_path='' as $$
begin
  if not ((private.is_admin() and private.has_aal2()) or private.can_manage_project(old.project_id)) then
    if new.case_number is distinct from old.case_number
      or new.beneficiary_id is distinct from old.beneficiary_id
      or new.project_id is distinct from old.project_id
      or new.assigned_to is distinct from old.assigned_to
      or new.created_by is distinct from old.created_by
      or new.opened_at is distinct from old.opened_at then
      raise exception 'Seul un responsable autorisé peut modifier le rattachement ou l’affectation du dossier';
    end if;
  elsif new.project_id is distinct from old.project_id
    and not ((private.is_admin() and private.has_aal2()) or private.can_manage_project(new.project_id)) then
    raise exception 'Vous ne pouvez pas transférer ce dossier vers ce projet';
  end if;
  return new;
end;
$$;
revoke all on function private.protect_case_fields() from public,anon,authenticated;
create trigger case_files_protect before update on public.case_files
for each row execute function private.protect_case_fields();

create or replace function private.complete_case_action() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.status='completed' and new.completed_at is null then new.completed_at=now(); end if;
  if new.status<>'completed' then new.completed_at=null; end if;
  return new;
end;
$$;
revoke all on function private.complete_case_action() from public,anon,authenticated;
create trigger case_actions_complete before insert or update of status on public.case_actions
for each row execute function private.complete_case_action();

create or replace function private.can_access_case(target_id uuid,uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.case_files c
    where c.id=target_id and (
      (private.is_admin(uid) and private.has_aal2())
      or c.assigned_to=uid
      or private.can_manage_project(c.project_id,uid)
    )
  );
$$;

create or replace function private.can_manage_activity(target_id uuid,uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.activities a
    where a.id=target_id and (
      (private.is_admin(uid) and private.has_aal2())
      or a.manager_id=uid or a.created_by=uid
      or (a.project_id is not null and private.can_manage_project(a.project_id,uid))
    )
  );
$$;
revoke all on function private.can_access_case(uuid,uuid),private.can_manage_activity(uuid,uuid) from public,anon;
grant execute on function private.can_access_case(uuid,uuid),private.can_manage_activity(uuid,uuid) to authenticated;

create trigger governance_bodies_touch before update on public.governance_bodies for each row execute function private.touch_updated_at();
create trigger institutional_members_touch before update on public.institutional_members for each row execute function private.touch_updated_at();
create trigger body_memberships_touch before update on public.body_memberships for each row execute function private.touch_updated_at();
create trigger workforce_assignments_touch before update on public.workforce_assignments for each row execute function private.touch_updated_at();
create trigger programs_touch before update on public.programs for each row execute function private.touch_updated_at();
create trigger partners_touch before update on public.partners for each row execute function private.touch_updated_at();
create trigger partnerships_touch before update on public.partnerships for each row execute function private.touch_updated_at();
create trigger case_files_touch before update on public.case_files for each row execute function private.touch_updated_at();
create trigger case_actions_touch before update on public.case_actions for each row execute function private.touch_updated_at();
create trigger activities_touch before update on public.activities for each row execute function private.touch_updated_at();
create trigger activity_reports_touch before update on public.activity_reports for each row execute function private.touch_updated_at();

create or replace function private.notify_institutional_assignment() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='workforce_assignments' and new.profile_id is not null then
    insert into public.notifications(user_id,title,body,href)
    values(new.profile_id,'Nouvelle affectation AIAC',new.job_title,'/espace?tab=institution');
  elsif tg_table_name='case_files' and new.assigned_to is not null then
    if tg_op='INSERT' or (tg_op='UPDATE' and new.assigned_to is distinct from old.assigned_to) then
      insert into public.notifications(user_id,title,body,href)
      values(new.assigned_to,'Dossier de cas affecté',new.case_number || ' · ' || new.title,'/espace?tab=institution');
    end if;
  elsif tg_table_name='activities' and new.manager_id is not null then
    if tg_op='INSERT' or (tg_op='UPDATE' and new.manager_id is distinct from old.manager_id) then
      insert into public.notifications(user_id,title,body,href)
      values(new.manager_id,'Activité à coordonner',new.title,'/espace?tab=institution');
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.notify_institutional_assignment() from public,anon,authenticated;
create trigger workforce_notify after insert on public.workforce_assignments for each row execute function private.notify_institutional_assignment();
create trigger case_files_notify after insert or update of assigned_to on public.case_files for each row execute function private.notify_institutional_assignment();
create trigger activities_notify after insert or update of manager_id on public.activities for each row execute function private.notify_institutional_assignment();

create trigger governance_bodies_audit after insert or update or delete on public.governance_bodies for each row execute function private.audit_operational_change();
create trigger institutional_members_audit after insert or update or delete on public.institutional_members for each row execute function private.audit_operational_change();
create trigger body_memberships_audit after insert or update or delete on public.body_memberships for each row execute function private.audit_operational_change();
create trigger workforce_assignments_audit after insert or update or delete on public.workforce_assignments for each row execute function private.audit_operational_change();
create trigger programs_audit after insert or update or delete on public.programs for each row execute function private.audit_operational_change();
create trigger partners_audit after insert or update or delete on public.partners for each row execute function private.audit_operational_change();
create trigger partnerships_audit after insert or update or delete on public.partnerships for each row execute function private.audit_operational_change();
create trigger case_files_audit after insert or update or delete on public.case_files for each row execute function private.audit_operational_change();
create trigger case_notes_audit after insert or delete on public.case_notes for each row execute function private.audit_operational_change();
create trigger case_actions_audit after insert or update or delete on public.case_actions for each row execute function private.audit_operational_change();
create trigger activities_audit after insert or update or delete on public.activities for each row execute function private.audit_operational_change();
create trigger activity_reports_audit after insert or update or delete on public.activity_reports for each row execute function private.audit_operational_change();

alter table public.governance_bodies enable row level security;
alter table public.institutional_members enable row level security;
alter table public.body_memberships enable row level security;
alter table public.workforce_assignments enable row level security;
alter table public.programs enable row level security;
alter table public.partners enable row level security;
alter table public.partnerships enable row level security;
alter table public.case_files enable row level security;
alter table public.case_notes enable row level security;
alter table public.case_actions enable row level security;
alter table public.activities enable row level security;
alter table public.activity_reports enable row level security;

create policy governance_bodies_select on public.governance_bodies for select to authenticated using ((select private.is_staff()));
create policy governance_bodies_insert on public.governance_bodies for insert to authenticated with check ((select private.is_admin()) and (select private.has_aal2()) and created_by=(select auth.uid()));
create policy governance_bodies_update on public.governance_bodies for update to authenticated using ((select private.is_admin()) and (select private.has_aal2())) with check ((select private.is_admin()) and (select private.has_aal2()));
create policy governance_bodies_delete on public.governance_bodies for delete to authenticated using ((select private.is_super_admin()) and (select private.has_aal2()));

create policy institutional_members_select on public.institutional_members for select to authenticated using (profile_id=(select auth.uid()) or ((select private.is_admin()) and (select private.has_aal2())));
create policy institutional_members_insert on public.institutional_members for insert to authenticated with check ((select private.is_admin()) and (select private.has_aal2()) and created_by=(select auth.uid()));
create policy institutional_members_update on public.institutional_members for update to authenticated using ((select private.is_admin()) and (select private.has_aal2())) with check ((select private.is_admin()) and (select private.has_aal2()));
create policy institutional_members_delete on public.institutional_members for delete to authenticated using ((select private.is_super_admin()) and (select private.has_aal2()));

create policy body_memberships_select on public.body_memberships for select to authenticated using (((select private.is_admin()) and (select private.has_aal2())) or exists(select 1 from public.institutional_members m where m.id=member_id and m.profile_id=(select auth.uid())));
create policy body_memberships_insert on public.body_memberships for insert to authenticated with check ((select private.is_admin()) and (select private.has_aal2()) and appointed_by=(select auth.uid()));
create policy body_memberships_update on public.body_memberships for update to authenticated using ((select private.is_admin()) and (select private.has_aal2())) with check ((select private.is_admin()) and (select private.has_aal2()));
create policy body_memberships_delete on public.body_memberships for delete to authenticated using ((select private.is_super_admin()) and (select private.has_aal2()));

create policy workforce_assignments_select on public.workforce_assignments for select to authenticated using (profile_id=(select auth.uid()) or ((select private.is_admin()) and (select private.has_aal2())));
create policy workforce_assignments_insert on public.workforce_assignments for insert to authenticated with check ((select private.is_admin()) and (select private.has_aal2()) and created_by=(select auth.uid()));
create policy workforce_assignments_update on public.workforce_assignments for update to authenticated using ((select private.is_admin()) and (select private.has_aal2())) with check ((select private.is_admin()) and (select private.has_aal2()));
create policy workforce_assignments_delete on public.workforce_assignments for delete to authenticated using ((select private.is_super_admin()) and (select private.has_aal2()));

create policy programs_select on public.programs for select to authenticated using ((select private.is_staff()));
create policy programs_insert on public.programs for insert to authenticated with check ((select private.is_admin()) and (select private.has_aal2()) and created_by=(select auth.uid()));
create policy programs_update on public.programs for update to authenticated using ((select private.is_admin()) and (select private.has_aal2())) with check ((select private.is_admin()) and (select private.has_aal2()));
create policy programs_delete on public.programs for delete to authenticated using ((select private.is_super_admin()) and (select private.has_aal2()));

create policy partners_select on public.partners for select to authenticated using ((select private.is_staff()));
create policy partners_insert on public.partners for insert to authenticated with check ((select private.is_admin()) and (select private.has_aal2()) and created_by=(select auth.uid()));
create policy partners_update on public.partners for update to authenticated using ((select private.is_admin()) and (select private.has_aal2())) with check ((select private.is_admin()) and (select private.has_aal2()));
create policy partners_delete on public.partners for delete to authenticated using ((select private.is_super_admin()) and (select private.has_aal2()));

create policy partnerships_select on public.partnerships for select to authenticated using ((select private.is_staff()));
create policy partnerships_insert on public.partnerships for insert to authenticated with check ((select private.is_admin()) and (select private.has_aal2()) and created_by=(select auth.uid()));
create policy partnerships_update on public.partnerships for update to authenticated using ((select private.is_admin()) and (select private.has_aal2())) with check ((select private.is_admin()) and (select private.has_aal2()));
create policy partnerships_delete on public.partnerships for delete to authenticated using ((select private.is_super_admin()) and (select private.has_aal2()));

create policy case_files_select on public.case_files for select to authenticated using ((select private.can_access_case(id)));
create policy case_files_insert on public.case_files for insert to authenticated with check (created_by=(select auth.uid()) and (((select private.is_admin()) and (select private.has_aal2())) or (select private.can_manage_project(project_id))));
create policy case_files_update on public.case_files for update to authenticated using ((select private.can_access_case(id))) with check ((select private.can_access_case(id)));
create policy case_files_delete on public.case_files for delete to authenticated using ((select private.is_super_admin()) and (select private.has_aal2()));

create policy case_notes_select on public.case_notes for select to authenticated using ((select private.can_access_case(case_id)));
create policy case_notes_insert on public.case_notes for insert to authenticated with check (author_id=(select auth.uid()) and (select private.can_access_case(case_id)));
create policy case_notes_delete on public.case_notes for delete to authenticated using ((select private.is_super_admin()) and (select private.has_aal2()));

create policy case_actions_select on public.case_actions for select to authenticated using ((select private.can_access_case(case_id)));
create policy case_actions_insert on public.case_actions for insert to authenticated with check (created_by=(select auth.uid()) and (select private.can_access_case(case_id)));
create policy case_actions_update on public.case_actions for update to authenticated using ((select private.can_access_case(case_id))) with check ((select private.can_access_case(case_id)));
create policy case_actions_delete on public.case_actions for delete to authenticated using ((select private.is_admin()) and (select private.has_aal2()));

create policy activities_select on public.activities for select to authenticated using ((select private.is_staff()));
create policy activities_insert on public.activities for insert to authenticated with check (created_by=(select auth.uid()) and (((select private.is_admin()) and (select private.has_aal2())) or (project_id is not null and (select private.can_contribute_project(project_id)))));
create policy activities_update on public.activities for update to authenticated using ((select private.can_manage_activity(id))) with check ((select private.can_manage_activity(id)));
create policy activities_delete on public.activities for delete to authenticated using ((select private.is_super_admin()) and (select private.has_aal2()));

create policy activity_reports_select on public.activity_reports for select to authenticated using (exists(select 1 from public.activities a where a.id=activity_id));
create policy activity_reports_insert on public.activity_reports for insert to authenticated with check (submitted_by=(select auth.uid()) and (select private.can_manage_activity(activity_id)));
create policy activity_reports_update on public.activity_reports for update to authenticated using ((select private.can_manage_activity(activity_id))) with check ((select private.can_manage_activity(activity_id)));
create policy activity_reports_delete on public.activity_reports for delete to authenticated using ((select private.is_super_admin()) and (select private.has_aal2()));

grant select,insert,update,delete on public.governance_bodies,public.institutional_members,public.body_memberships,public.workforce_assignments to authenticated;
grant select,insert,update,delete on public.programs,public.partners,public.partnerships to authenticated;
grant select,insert,update,delete on public.case_files,public.case_notes,public.case_actions to authenticated;
grant select,insert,update,delete on public.activities,public.activity_reports to authenticated;
