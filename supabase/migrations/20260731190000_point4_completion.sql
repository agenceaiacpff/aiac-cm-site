-- Point 4 : cycle de vie des comptes, structure AIAC, messagerie confidentielle,
-- coffre documentaire versionné et audit détaillé.

-- ---------------------------------------------------------------------------
-- 1. Structure institutionnelle officielle de l'AIAC
-- ---------------------------------------------------------------------------

alter table public.governance_bodies drop constraint if exists governance_bodies_body_type_check;
alter table public.governance_bodies add constraint governance_bodies_body_type_check check (
  body_type in (
    'general_assembly','board','executive_office','subsidiary_body','executive_council',
    'regional_coordination','antenna','department','commission','committee',
    'program_unit','project_unit','other'
  )
);
alter table public.governance_bodies
  add column if not exists deployment_level text not null default 'central'
    check (deployment_level in ('central','subsidiary','regional','antenna','program','project')),
  add column if not exists subsidiary_code text,
  add column if not exists region text,
  add column if not exists locality text,
  add column if not exists territory text,
  add column if not exists decision_reference text,
  add column if not exists reporting_body_id uuid references public.governance_bodies(id) on delete set null;

create index if not exists governance_bodies_structure_idx
  on public.governance_bodies(subsidiary_code,deployment_level,region,locality);

create table public.position_definitions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (char_length(code) between 2 and 50),
  title text not null check (char_length(title) between 2 and 180),
  institutional_level text not null check (institutional_level in ('central','subsidiary','regional','antenna','program','project')),
  body_id uuid references public.governance_bodies(id) on delete cascade,
  reports_to_position_id uuid references public.position_definitions(id) on delete set null,
  authority_scope text,
  is_statutory boolean not null default false,
  status text not null default 'active' check (status in ('draft','active','suspended','abolished')),
  decision_reference text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.position_assignments (
  id uuid primary key default gen_random_uuid(),
  position_id uuid not null references public.position_definitions(id) on delete restrict,
  body_id uuid not null references public.governance_bodies(id) on delete restrict,
  profile_id uuid references public.profiles(id) on delete set null,
  member_id uuid references public.institutional_members(id) on delete set null,
  supervisor_assignment_id uuid references public.position_assignments(id) on delete set null,
  territory text,
  decision_reference text not null check (char_length(decision_reference) between 2 and 180),
  start_date date not null default current_date,
  end_date date,
  status text not null default 'active' check (status in ('planned','active','suspended','ended')),
  appointed_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (profile_id is not null or member_id is not null),
  check (end_date is null or end_date >= start_date)
);

create unique index position_assignments_active_profile_idx
  on public.position_assignments(position_id,body_id,profile_id)
  where profile_id is not null and status='active';
create index position_assignments_profile_idx on public.position_assignments(profile_id,status);
create index position_assignments_body_idx on public.position_assignments(body_id,status);

create trigger position_definitions_touch before update on public.position_definitions
for each row execute function private.touch_updated_at();
create trigger position_assignments_touch before update on public.position_assignments
for each row execute function private.touch_updated_at();

-- Le préchargement utilise l'identité d'un super-administrateur existant sans
-- inscrire d'identifiant généré dans la migration.
insert into public.governance_bodies(code,name,body_type,description,deployment_level,created_by)
select seed.code,seed.name,seed.body_type,seed.description,seed.deployment_level,actor.id
from (
  values
    ('AG','Assemblée générale','general_assembly','Organe suprême de l’association.','central'),
    ('CA','Conseil d’administration','board','Orientation, validation et contrôle institutionnels.','central'),
    ('OS-01','Promotion de la femme et de la famille','subsidiary_body','Conseil exécutif de l’organe subsidiaire OS-01.','subsidiary'),
    ('OS-02','Paix et droits de l’Homme','subsidiary_body','Conseil exécutif de l’organe subsidiaire OS-02.','subsidiary'),
    ('OS-03','Santé et trauma','subsidiary_body','Conseil exécutif de l’organe subsidiaire OS-03.','subsidiary'),
    ('OS-04','Éducation','subsidiary_body','Conseil exécutif de l’organe subsidiaire OS-04.','subsidiary'),
    ('OS-05','Environnement','subsidiary_body','Conseil exécutif de l’organe subsidiaire OS-05.','subsidiary'),
    ('OS-06','Conservation de la biodiversité','subsidiary_body','Conseil exécutif de l’organe subsidiaire OS-06.','subsidiary'),
    ('OS-07','Aide humanitaire','subsidiary_body','Conseil exécutif de l’organe subsidiaire OS-07.','subsidiary'),
    ('OS-08','Développement local','subsidiary_body','Conseil exécutif de l’organe subsidiaire OS-08.','subsidiary'),
    ('OS-09','Déplacés et réfugiés','subsidiary_body','Conseil exécutif de l’organe subsidiaire OS-09.','subsidiary'),
    ('OS-10','Sécurité','subsidiary_body','Conseil exécutif de l’organe subsidiaire OS-10.','subsidiary'),
    ('OS-11','Prévention et gestion des catastrophes','subsidiary_body','Conseil exécutif de l’organe subsidiaire OS-11.','subsidiary')
) as seed(code,name,body_type,description,deployment_level)
cross join lateral (
  select p.id from public.profiles p
  where p.role='super_admin' and p.status='active'
  order by p.created_at limit 1
) actor
on conflict(code) do update set
  name=excluded.name,body_type=excluded.body_type,description=excluded.description,
  deployment_level=excluded.deployment_level,updated_at=now();

update public.governance_bodies
set subsidiary_code=code
where code like 'OS-%' and subsidiary_code is null;

insert into public.position_definitions(code,title,institutional_level,body_id,authority_scope,is_statutory,created_by)
select seed.code,seed.title,seed.level,b.id,seed.scope,seed.statutory,actor.id
from (
  values
    ('AG-MEMBRE','Membre de l’Assemblée générale','central','Délibération selon les statuts.',true,'AG'),
    ('CA-PCA','Président du Conseil d’administration','central','Signataire institutionnel et autorité centrale dans les limites des textes.',true,'CA'),
    ('CA-SG','Secrétaire général du Conseil','central','Convocations, registres, procès-verbaux, courrier et archives du Conseil.',true,'CA'),
    ('CA-CRMDT-G','CRM/DT Général','central','Coordination technique globale, suivi et consolidation.',true,'CA'),
    ('CA-TG','Trésorier général / Comptable compétent','central','Contrôle budgétaire et visa financier selon délégation.',true,'CA'),
    ('REG-CR','Coordonnateur régional','regional','Coordonne les antennes d’un organe dans une région et rend compte au Conseil exécutif.',false,null),
    ('REG-TR','Technicien régional','regional','Contrôle technique régional sous validation du CRM/DT compétent.',false,null),
    ('ANT-CHEF','Chef d’antenne','antenna','Mise en œuvre territoriale dans le budget, le programme et la délégation approuvés.',false,null),
    ('ANT-SEC','Secrétariat local','antenna','Appui administratif de l’antenne selon la fiche de poste.',false,null),
    ('PROJ-CHEF','Chef de projet','project','Pilotage du projet dans la durée, le budget et la délégation approuvés.',false,null)
) as seed(code,title,level,scope,statutory,body_code)
left join public.governance_bodies b on b.code=seed.body_code
cross join lateral (
  select p.id from public.profiles p
  where p.role='super_admin' and p.status='active'
  order by p.created_at limit 1
) actor
on conflict(code) do update set title=excluded.title,authority_scope=excluded.authority_scope,updated_at=now();

insert into public.position_definitions(code,title,institutional_level,body_id,authority_scope,is_statutory,created_by)
select b.code || suffix.code,btrim(suffix.title),'subsidiary',b.id,suffix.scope,true,actor.id
from public.governance_bodies b
cross join (values
  ('-PCE','Président du Conseil exécutif','Autorité de l’organe subsidiaire dans les limites approuvées.'),
  ('-SE','Secrétaire exécutif','Préparation, rapports et administration du Conseil exécutif.'),
  ('-CRMDT-E','CRM/DT Exécutif','Coordination et contrôle technique de l’organe subsidiaire.')
) suffix(code,title,scope)
cross join lateral (
  select p.id from public.profiles p
  where p.role='super_admin' and p.status='active'
  order by p.created_at limit 1
) actor
where b.body_type='subsidiary_body'
on conflict(code) do update set title=excluded.title,authority_scope=excluded.authority_scope,updated_at=now();

-- ---------------------------------------------------------------------------
-- 2. Validation administrative distincte de la confirmation électronique
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists registration_state text not null default 'pending'
    check (registration_state in ('pending','approved','rejected')),
  add column if not exists validated_at timestamptz,
  add column if not exists validated_by uuid references public.profiles(id) on delete set null,
  add column if not exists rejection_reason text;

update public.profiles
set registration_state=case when status='active' then 'approved' else 'pending' end,
    validated_at=case when status='active' then coalesce(updated_at,created_at) else null end
where registration_state='pending';

create table public.account_reviews (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete restrict,
  decision text not null check (decision in ('approved','rejected')),
  reason text not null check (char_length(reason) between 5 and 1000),
  body_id uuid references public.governance_bodies(id) on delete set null,
  position_assignment_id uuid references public.position_assignments(id) on delete set null,
  created_at timestamptz not null default now()
);
create index account_reviews_profile_idx on public.account_reviews(profile_id,created_at desc);

create or replace function public.review_account_registration(
  target_id uuid,decision_name text,reason text,assigned_body_id uuid default null
) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not private.is_admin() or not private.has_verified_mfa() or not private.has_aal2() then
    raise exception 'Une session administrateur avec authentification à deux facteurs est obligatoire';
  end if;
  if decision_name not in ('approved','rejected') then raise exception 'Décision invalide'; end if;
  if char_length(trim(reason)) < 5 then raise exception 'Le motif doit contenir au moins 5 caractères'; end if;
  if not exists(select 1 from public.profiles where id=target_id) then raise exception 'Compte introuvable'; end if;

  update public.profiles
  set registration_state=decision_name,
      status=case when decision_name='approved' then 'active'::public.account_status else 'pending'::public.account_status end,
      validated_at=case when decision_name='approved' then now() else null end,
      validated_by=auth.uid(),
      rejection_reason=case when decision_name='rejected' then trim(reason) else null end
  where id=target_id;

  insert into public.account_reviews(profile_id,reviewer_id,decision,reason,body_id)
  values(target_id,auth.uid(),decision_name,trim(reason),assigned_body_id);
end;
$$;
revoke all on function public.review_account_registration(uuid,text,text,uuid) from public,anon;
grant execute on function public.review_account_registration(uuid,text,text,uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Messagerie strictement limitée aux participants et responsables désignés
-- ---------------------------------------------------------------------------

alter table public.conversations
  add column if not exists sensitivity text not null default 'standard'
    check (sensitivity in ('standard','confidential','restricted','gbv_protection','hr','medical_psychosocial','whistleblowing')),
  add column if not exists status text not null default 'active' check (status in ('active','archived')),
  add column if not exists organization_unit_id uuid references public.governance_bodies(id) on delete set null,
  add column if not exists assigned_to uuid references public.profiles(id) on delete set null,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null;

alter table public.conversation_members
  add column if not exists member_role text not null default 'participant'
    check (member_role in ('manager','participant','observer')),
  add column if not exists added_by uuid references public.profiles(id) on delete set null;

update public.conversation_members cm set member_role='manager'
from public.conversations c where c.id=cm.conversation_id and c.created_by=cm.user_id;

create or replace function private.can_manage_conversation(cid uuid,uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
  select private.is_active_user(uid) and exists(
    select 1 from public.conversation_members cm
    where cm.conversation_id=cid and cm.user_id=uid and cm.member_role='manager'
  );
$$;
revoke all on function private.can_manage_conversation(uuid,uuid) from public,anon;
grant execute on function private.can_manage_conversation(uuid,uuid) to authenticated;

create or replace function private.route_new_conversation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.conversation_members(conversation_id,user_id,member_role,added_by)
  values(new.id,new.created_by,'manager',new.created_by) on conflict do nothing;

  if new.assigned_to is not null then
    insert into public.conversation_members(conversation_id,user_id,member_role,added_by)
    select new.id,p.id,'manager',new.created_by from public.profiles p
    where p.id=new.assigned_to and p.status='active'
    on conflict do nothing;
  end if;

  insert into public.conversation_members(conversation_id,user_id,member_role,added_by)
  select new.id,r.assigned_to,'manager',new.created_by from public.requests r
  join public.profiles p on p.id=r.assigned_to and p.status='active'
  where r.id=new.request_id and r.assigned_to is not null
  on conflict do nothing;
  return new;
end;
$$;

drop policy if exists conversations_update on public.conversations;
create policy conversations_update on public.conversations for update to authenticated
using ((select private.can_manage_conversation(id)))
with check ((select private.can_manage_conversation(id)));

drop policy if exists members_insert on public.conversation_members;
drop policy if exists members_delete on public.conversation_members;
create policy members_insert on public.conversation_members for insert to authenticated
with check (
  (select private.can_manage_conversation(conversation_id))
  and exists(select 1 from public.profiles p where p.id=user_id and p.status='active')
);
create policy members_delete on public.conversation_members for delete to authenticated
using ((select private.can_manage_conversation(conversation_id)) and user_id<>(select auth.uid()));

create or replace function public.list_message_recipients()
returns table(id uuid,full_name text,role text,body_name text,position_title text)
language sql stable security definer set search_path='' as $$
  select p.id,coalesce(p.full_name,'Compte AIAC'),p.role::text,
    b.name,pd.title
  from public.profiles p
  left join lateral (
    select pa.body_id,pa.position_id
    from public.position_assignments pa
    where pa.profile_id=p.id and pa.status='active'
      and (pa.end_date is null or pa.end_date>=current_date)
    order by pa.start_date desc limit 1
  ) pa on true
  left join public.governance_bodies b on b.id=pa.body_id
  left join public.position_definitions pd on pd.id=pa.position_id
  where private.is_active_user() and p.status='active'
    and p.role in ('staff','manager','admin','super_admin')
  order by coalesce(b.name,''),coalesce(pd.title,''),coalesce(p.full_name,'');
$$;
revoke all on function public.list_message_recipients() from public,anon;
grant execute on function public.list_message_recipients() to authenticated;

create or replace function private.prepare_conversation_archive() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.status='archived' and old.status is distinct from 'archived' then
    new.archived_at=now(); new.archived_by=auth.uid();
  elsif new.status='active' then
    new.archived_at=null; new.archived_by=null;
  end if;
  return new;
end;
$$;
revoke all on function private.prepare_conversation_archive() from public,anon,authenticated;
create trigger conversations_archive before update of status on public.conversations
for each row execute function private.prepare_conversation_archive();

-- ---------------------------------------------------------------------------
-- 4. Coffre documentaire : dossiers, versions, validation, partage et accès
-- ---------------------------------------------------------------------------

create table public.document_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 180),
  parent_id uuid references public.document_folders(id) on delete restrict,
  body_id uuid references public.governance_bodies(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  case_id uuid references public.case_files(id) on delete set null,
  classification text not null default 'internal' check (classification in ('personal','internal','confidential','restricted','highly_restricted')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(parent_id,name)
);

alter table public.documents drop constraint if exists documents_visibility_check;
alter table public.documents add constraint documents_visibility_check
  check (visibility in ('private','request','staff','explicit'));
alter table public.documents
  add column if not exists folder_id uuid references public.document_folders(id) on delete set null,
  add column if not exists body_id uuid references public.governance_bodies(id) on delete set null,
  add column if not exists beneficiary_id uuid references public.beneficiaries(id) on delete set null,
  add column if not exists case_id uuid references public.case_files(id) on delete set null,
  add column if not exists partner_id uuid references public.partners(id) on delete set null,
  add column if not exists activity_id uuid references public.activities(id) on delete set null,
  add column if not exists member_id uuid references public.institutional_members(id) on delete set null,
  add column if not exists conversation_id uuid references public.conversations(id) on delete set null,
  add column if not exists classification text not null default 'internal'
    check (classification in ('personal','internal','confidential','restricted','highly_restricted')),
  add column if not exists document_status text not null default 'draft'
    check (document_status in ('draft','pending_validation','approved','rejected','archived')),
  add column if not exists current_version integer not null default 1 check (current_version > 0),
  add column if not exists retention_until date,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  storage_path text not null unique,
  file_name text not null,
  mime_type text,
  size_bytes bigint not null check (size_bytes between 1 and 15728640),
  checksum_sha256 text,
  change_note text check (change_note is null or char_length(change_note) <= 1000),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(document_id,version_number)
);

insert into public.document_versions(document_id,version_number,storage_path,file_name,mime_type,size_bytes,change_note,created_by,created_at)
select d.id,1,d.file_url,coalesce(d.file_name,d.title),d.mime_type,coalesce(d.size_bytes,1),'Version initiale',d.owner_id,d.created_at
from public.documents d
on conflict(document_id,version_number) do nothing;

create table public.document_approvals (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  version_id uuid not null references public.document_versions(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete restrict,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','approved','rejected','changes_requested')),
  comment text check (comment is null or char_length(comment) <= 3000),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique(version_id,reviewer_id)
);

create table public.document_access_grants (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  can_download boolean not null default true,
  can_upload_version boolean not null default false,
  can_manage boolean not null default false,
  expires_at timestamptz,
  reason text not null check (char_length(reason) between 5 and 1000),
  granted_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(document_id,user_id)
);

create table public.document_access_logs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete restrict,
  version_id uuid references public.document_versions(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('view','download','upload','new_version','approval_requested','approved','rejected','archived','shared')),
  source_ip inet,
  user_agent text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index document_versions_document_idx on public.document_versions(document_id,version_number desc);
create index document_approvals_reviewer_idx on public.document_approvals(reviewer_id,status,requested_at desc);
create index document_access_grants_user_idx on public.document_access_grants(user_id,expires_at);
create index document_access_logs_document_idx on public.document_access_logs(document_id,created_at desc);
create index documents_classification_idx on public.documents(classification,document_status,updated_at desc);

create or replace function private.has_position_in_body(target_body uuid,uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.position_assignments pa
    join public.profiles p on p.id=pa.profile_id
    where pa.profile_id=uid and pa.body_id=target_body and pa.status='active'
      and (pa.end_date is null or pa.end_date>=current_date) and p.status='active'
  );
$$;

create or replace function private.can_access_document(target_id uuid,uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
  select private.is_active_user(uid) and exists(
    select 1 from public.documents d
    where d.id=target_id and (
      d.owner_id=uid
      or exists(select 1 from public.document_access_grants g where g.document_id=d.id and g.user_id=uid and (g.expires_at is null or g.expires_at>now()))
      or (d.conversation_id is not null and private.is_conversation_member(d.conversation_id,uid))
      or (d.case_id is not null and private.can_access_case(d.case_id,uid))
      or (d.project_id is not null and private.is_project_member(d.project_id,uid))
      or (d.request_id is not null and private.can_access_request(d.request_id,uid))
      or (d.body_id is not null and d.classification in ('internal','confidential') and private.has_position_in_body(d.body_id,uid))
      or (d.classification='internal' and d.visibility='staff' and private.is_staff(uid))
    )
  );
$$;

create or replace function private.can_manage_document(target_id uuid,uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
  select private.is_active_user(uid) and exists(
    select 1 from public.documents d where d.id=target_id and (
      d.owner_id=uid
      or exists(select 1 from public.document_access_grants g where g.document_id=d.id and g.user_id=uid and g.can_manage and (g.expires_at is null or g.expires_at>now()))
      or (d.project_id is not null and private.can_manage_project(d.project_id,uid))
    )
  );
$$;

create or replace function private.can_upload_document_version(target_id uuid,uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
  select private.can_manage_document(target_id,uid) or exists(
    select 1 from public.document_access_grants g
    where g.document_id=target_id and g.user_id=uid and g.can_upload_version
      and (g.expires_at is null or g.expires_at>now())
  );
$$;

create or replace function private.can_access_document_object(object_name text,uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
  select private.is_active_user(uid) and exists(
    select 1 from public.document_versions v
    where v.storage_path=object_name and private.can_access_document(v.document_id,uid)
  );
$$;

revoke all on function private.has_position_in_body(uuid,uuid),private.can_access_document(uuid,uuid),private.can_manage_document(uuid,uuid),private.can_upload_document_version(uuid,uuid),private.can_access_document_object(text,uuid) from public,anon;
grant execute on function private.has_position_in_body(uuid,uuid),private.can_access_document(uuid,uuid),private.can_manage_document(uuid,uuid),private.can_upload_document_version(uuid,uuid),private.can_access_document_object(text,uuid) to authenticated;

create or replace function private.prepare_document_version() returns trigger
language plpgsql security definer set search_path='' as $$
declare next_version integer;
begin
  select coalesce(max(v.version_number),0)+1 into next_version
  from public.document_versions v where v.document_id=new.document_id;
  new.version_number=next_version;
  update public.documents set current_version=next_version,file_url=new.storage_path,
    file_name=new.file_name,mime_type=new.mime_type,size_bytes=new.size_bytes,
    document_status='draft',updated_at=now()
  where id=new.document_id;
  return new;
end;
$$;
revoke all on function private.prepare_document_version() from public,anon,authenticated;
create trigger document_versions_prepare before insert on public.document_versions
for each row execute function private.prepare_document_version();

create or replace function private.prepare_document_approval() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status is distinct from old.status and new.status<>'pending' then
    new.reviewed_at=now();
    update public.documents set document_status=case
      when new.status='approved' then 'approved'
      when new.status in ('rejected','changes_requested') then 'rejected'
      else document_status end,
      updated_at=now()
    where id=new.document_id;
    insert into public.document_access_logs(document_id,version_id,user_id,action,details)
    values(new.document_id,new.version_id,auth.uid(),case when new.status='approved' then 'approved' else 'rejected' end,
      jsonb_build_object('approval_id',new.id,'status',new.status));
  end if;
  return new;
end;
$$;
revoke all on function private.prepare_document_approval() from public,anon,authenticated;
create trigger document_approvals_prepare before update of status on public.document_approvals
for each row execute function private.prepare_document_approval();

create trigger document_folders_touch before update on public.document_folders
for each row execute function private.touch_updated_at();
create trigger documents_touch before update on public.documents
for each row execute function private.touch_updated_at();

drop policy if exists documents_select on public.documents;
drop policy if exists documents_insert on public.documents;
drop policy if exists documents_delete on public.documents;
create policy documents_select on public.documents for select to authenticated
using ((select private.can_access_document(id)));
create policy documents_insert on public.documents for insert to authenticated
with check (
  (select private.is_active_user()) and owner_id=(select auth.uid())
  and ((select private.can_use_operations()) or (conversation_id is not null and (select private.is_conversation_member(conversation_id))))
  and (project_id is null or (select private.can_contribute_project(project_id)))
  and (case_id is null or (select private.can_access_case(case_id)))
  and (conversation_id is null or (select private.is_conversation_member(conversation_id)))
);
create policy documents_update on public.documents for update to authenticated
using ((select private.can_manage_document(id))) with check ((select private.can_manage_document(id)));
create policy documents_delete on public.documents for delete to authenticated
using ((select private.is_super_admin()) and (select private.has_aal2()) and classification not in ('restricted','highly_restricted'));

alter table public.document_folders enable row level security;
alter table public.document_versions enable row level security;
alter table public.document_approvals enable row level security;
alter table public.document_access_grants enable row level security;
alter table public.document_access_logs enable row level security;

create policy document_folders_select on public.document_folders for select to authenticated
using ((select private.is_staff()) and (body_id is null or (select private.has_position_in_body(body_id)) or (select private.is_admin())));
create policy document_folders_insert on public.document_folders for insert to authenticated
with check (created_by=(select auth.uid()) and ((select private.is_admin()) or (body_id is not null and (select private.has_position_in_body(body_id)))));
create policy document_folders_update on public.document_folders for update to authenticated
using ((select private.is_admin()) or created_by=(select auth.uid())) with check ((select private.is_admin()) or created_by=(select auth.uid()));
create policy document_folders_delete on public.document_folders for delete to authenticated
using ((select private.is_super_admin()) and (select private.has_aal2()));

create policy document_versions_select on public.document_versions for select to authenticated
using ((select private.can_access_document(document_id)));
create policy document_versions_insert on public.document_versions for insert to authenticated
with check (created_by=(select auth.uid()) and (select private.can_upload_document_version(document_id)));

create policy document_approvals_select on public.document_approvals for select to authenticated
using ((select private.can_access_document(document_id)) and (reviewer_id=(select auth.uid()) or requested_by=(select auth.uid()) or (select private.can_manage_document(document_id))));
create policy document_approvals_insert on public.document_approvals for insert to authenticated
with check (requested_by=(select auth.uid()) and (select private.can_manage_document(document_id)) and reviewer_id<>(select auth.uid()));
create policy document_approvals_update on public.document_approvals for update to authenticated
using (reviewer_id=(select auth.uid())) with check (reviewer_id=(select auth.uid()));

create policy document_access_grants_select on public.document_access_grants for select to authenticated
using (user_id=(select auth.uid()) or (select private.can_manage_document(document_id)));
create policy document_access_grants_insert on public.document_access_grants for insert to authenticated
with check (granted_by=(select auth.uid()) and (select private.can_manage_document(document_id)));
create policy document_access_grants_update on public.document_access_grants for update to authenticated
using ((select private.can_manage_document(document_id))) with check ((select private.can_manage_document(document_id)));
create policy document_access_grants_delete on public.document_access_grants for delete to authenticated
using ((select private.can_manage_document(document_id)));

create policy document_access_logs_select on public.document_access_logs for select to authenticated
using (user_id=(select auth.uid()) or ((select private.is_super_admin()) and (select private.has_aal2())) or (select private.can_manage_document(document_id)));
create policy document_access_logs_insert on public.document_access_logs for insert to authenticated
with check (user_id=(select auth.uid()) and (select private.can_access_document(document_id)));

drop policy if exists aiac_documents_select on storage.objects;
drop policy if exists aiac_documents_delete on storage.objects;
drop policy if exists aiac_documents_update on storage.objects;
drop policy if exists aiac_documents_insert on storage.objects;
create policy aiac_documents_insert on storage.objects for insert to authenticated
with check (
  bucket_id='aiac-documents' and (select private.is_active_user())
  and (storage.foldername(name))[1]=(select auth.uid())::text
);
create policy aiac_documents_select on storage.objects for select to authenticated
using (bucket_id='aiac-documents' and (select private.can_access_document_object(name)));
create policy aiac_documents_update on storage.objects for update to authenticated
using (
  bucket_id='aiac-documents' and (storage.foldername(name))[1]=(select auth.uid())::text
  and not exists(select 1 from public.document_versions v where v.storage_path=name)
)
with check (
  bucket_id='aiac-documents' and (storage.foldername(name))[1]=(select auth.uid())::text
  and not exists(select 1 from public.document_versions v where v.storage_path=name)
);
create policy aiac_documents_delete on storage.objects for delete to authenticated
using (
  bucket_id='aiac-documents' and (storage.foldername(name))[1]=(select auth.uid())::text
  and not exists(select 1 from public.document_versions v where v.storage_path=name)
);

-- ---------------------------------------------------------------------------
-- 5. Audit détaillé, téléchargements et sessions
-- ---------------------------------------------------------------------------

alter table public.audit_logs
  add column if not exists old_data jsonb,
  add column if not exists new_data jsonb,
  add column if not exists source_ip inet,
  add column if not exists user_agent text;

create table public.session_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_identifier text not null,
  source_ip inet,
  user_agent text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique(user_id,session_identifier)
);
create index session_activity_user_idx on public.session_activity(user_id,last_seen_at desc);
alter table public.session_activity enable row level security;
create policy session_activity_select on public.session_activity for select to authenticated
using (user_id=(select auth.uid()) or ((select private.is_super_admin()) and (select private.has_aal2())));

create or replace function public.record_session_activity(
  session_identifier text,client_ip text default null,client_user_agent text default null
) returns void
language plpgsql security definer set search_path='' as $$
declare parsed_ip inet;
begin
  if auth.uid() is null or not private.is_active_user() then return; end if;
  begin parsed_ip=nullif(split_part(coalesce(client_ip,''),',',1),'')::inet;
  exception when others then parsed_ip=null; end;
  insert into public.session_activity(user_id,session_identifier,source_ip,user_agent)
  values(auth.uid(),left(session_identifier,180),parsed_ip,left(client_user_agent,1000))
  on conflict(user_id,session_identifier) do update set
    last_seen_at=now(),source_ip=excluded.source_ip,user_agent=excluded.user_agent;
end;
$$;
revoke all on function public.record_session_activity(text,text,text) from public,anon;
grant execute on function public.record_session_activity(text,text,text) to authenticated;

create or replace function private.audit_operational_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare target_id uuid;
declare old_payload jsonb;
declare new_payload jsonb;
begin
  target_id=case when tg_op='DELETE' then old.id else new.id end;
  old_payload=case when tg_op='INSERT' then null else to_jsonb(old) end;
  new_payload=case when tg_op='DELETE' then null else to_jsonb(new) end;

  -- Les contenus sensibles restent dans leurs tables protégées. L'audit conserve
  -- les champs de rattachement, d'état et de responsabilité, pas les récits.
  if tg_table_name in ('beneficiaries','case_files','case_notes','institutional_members') then
    old_payload=old_payload - array['support_notes','summary','body','notes','address','phone','email'];
    new_payload=new_payload - array['support_notes','summary','body','notes','address','phone','email'];
  end if;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details,old_data,new_data)
  values(auth.uid(),tg_table_name || '.' || lower(tg_op),tg_table_name,target_id,
    jsonb_build_object('operation',lower(tg_op),'table',tg_table_name),old_payload,new_payload);
  return case when tg_op='DELETE' then old else new end;
end;
$$;

create trigger position_definitions_audit after insert or update or delete on public.position_definitions
for each row execute function private.audit_operational_change();
create trigger position_assignments_audit after insert or update or delete on public.position_assignments
for each row execute function private.audit_operational_change();
create trigger document_folders_audit after insert or update or delete on public.document_folders
for each row execute function private.audit_operational_change();
create trigger document_versions_audit after insert or delete on public.document_versions
for each row execute function private.audit_operational_change();
create trigger document_approvals_audit after insert or update on public.document_approvals
for each row execute function private.audit_operational_change();
create trigger document_access_grants_audit after insert or update or delete on public.document_access_grants
for each row execute function private.audit_operational_change();
create trigger conversations_detailed_audit after update on public.conversations
for each row execute function private.audit_operational_change();

-- La suspension ou le rejet marque également les sessions applicatives comme révoquées.
create or replace function private.revoke_suspended_sessions() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if (new.status='suspended' or new.registration_state='rejected')
     and (old.status is distinct from new.status or old.registration_state is distinct from new.registration_state) then
    delete from auth.sessions where user_id=new.id;
    update public.session_activity set revoked_at=now()
    where user_id=new.id and revoked_at is null;
  end if;
  return new;
end;
$$;

alter table public.position_definitions enable row level security;
alter table public.position_assignments enable row level security;
alter table public.account_reviews enable row level security;

create policy position_definitions_select on public.position_definitions for select to authenticated using ((select private.is_staff()));
create policy position_definitions_insert on public.position_definitions for insert to authenticated with check ((select private.is_super_admin()) and (select private.has_aal2()) and created_by=(select auth.uid()));
create policy position_definitions_update on public.position_definitions for update to authenticated using ((select private.is_super_admin()) and (select private.has_aal2())) with check ((select private.is_super_admin()) and (select private.has_aal2()));
create policy position_definitions_delete on public.position_definitions for delete to authenticated using ((select private.is_super_admin()) and (select private.has_aal2()));

create policy position_assignments_select on public.position_assignments for select to authenticated using (profile_id=(select auth.uid()) or ((select private.is_admin()) and (select private.has_aal2())));
create policy position_assignments_insert on public.position_assignments for insert to authenticated with check ((select private.is_admin()) and (select private.has_aal2()) and appointed_by=(select auth.uid()));
create policy position_assignments_update on public.position_assignments for update to authenticated using ((select private.is_admin()) and (select private.has_aal2())) with check ((select private.is_admin()) and (select private.has_aal2()));
create policy position_assignments_delete on public.position_assignments for delete to authenticated using ((select private.is_super_admin()) and (select private.has_aal2()));

create policy account_reviews_select on public.account_reviews for select to authenticated using (profile_id=(select auth.uid()) or ((select private.is_admin()) and (select private.has_aal2())));

revoke all on public.position_definitions,public.position_assignments,public.account_reviews from public,anon,authenticated;
grant select,insert,update,delete on public.position_definitions,public.position_assignments to authenticated;
grant select on public.account_reviews to authenticated;
grant select,insert,update,delete on public.document_folders,public.document_versions,public.document_approvals,public.document_access_grants to authenticated;
grant select,insert on public.document_access_logs to authenticated;
grant select on public.session_activity to authenticated;

-- Le journal reste en écriture système uniquement.
revoke insert,update,delete on public.audit_logs,public.document_access_logs,public.session_activity from authenticated;
grant insert on public.document_access_logs to authenticated;
