-- Phase 2 : pilotage opérationnel des projets, équipes, bénéficiaires, tâches et documents.

create type public.project_status as enum ('planned','active','on_hold','completed','cancelled');
create type public.project_member_role as enum ('lead','officer','contributor','viewer');
create type public.beneficiary_status as enum ('active','graduated','inactive','archived');

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9][A-Z0-9_-]{1,29}$'),
  name text not null check (char_length(name) between 3 and 180),
  description text,
  status public.project_status not null default 'planned',
  location text,
  start_date date,
  end_date date,
  budget_amount numeric(14,2) check (budget_amount is null or budget_amount >= 0),
  budget_currency text not null default 'XAF' check (budget_currency ~ '^[A-Z]{3}$'),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  member_role public.project_member_role not null default 'contributor',
  added_by uuid references public.profiles(id) on delete set null,
  joined_at timestamptz not null default now(),
  primary key(project_id,user_id)
);

create table public.beneficiaries (
  id uuid primary key default gen_random_uuid(),
  reference_code text not null unique default ('BEN-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  project_id uuid not null references public.projects(id) on delete restrict,
  full_name text not null check (char_length(full_name) between 2 and 180),
  gender text not null default 'unknown' check (gender in ('female','male','other','prefer_not_to_say','unknown')),
  birth_date date,
  phone text,
  locality text,
  support_notes text check (support_notes is null or char_length(support_notes) <= 5000),
  consent_at timestamptz,
  status public.beneficiary_status not null default 'active',
  assigned_to uuid references public.profiles(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (birth_date is null or birth_date <= current_date)
);

alter table public.requests
  add column project_id uuid references public.projects(id) on delete set null;

alter table public.tasks
  add column project_id uuid references public.projects(id) on delete cascade,
  add column priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  add column completed_at timestamptz;

alter table public.documents
  add column project_id uuid references public.projects(id) on delete cascade,
  add column file_name text,
  add column mime_type text,
  add column size_bytes bigint check (size_bytes is null or size_bytes between 1 and 15728640);

create unique index documents_object_path_idx on public.documents(file_url);
create index projects_status_idx on public.projects(status,updated_at desc);
create index project_members_user_idx on public.project_members(user_id,project_id);
create index beneficiaries_project_idx on public.beneficiaries(project_id,status,created_at desc);
create index beneficiaries_assigned_idx on public.beneficiaries(assigned_to,status);
create index requests_project_idx on public.requests(project_id,status);
create index tasks_project_idx on public.tasks(project_id,status,due_at);
create index documents_project_idx on public.documents(project_id,created_at desc);

create or replace function private.can_use_operations(uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
  select private.is_active_user(uid) and (
    not private.is_admin(uid)
    or case when uid=auth.uid() then private.has_aal2() else true end
  );
$$;

create or replace function private.is_project_member(pid uuid,uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
  select private.can_use_operations(uid) and exists(
    select 1 from public.project_members pm
    join public.profiles p on p.id=pm.user_id
    where pm.project_id=pid and pm.user_id=uid and p.status='active'
  );
$$;

create or replace function private.can_manage_project(pid uuid,uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
  select
    (private.is_admin(uid) and case when uid=auth.uid() then private.has_aal2() else true end)
    or exists(
      select 1 from public.project_members pm
      join public.profiles p on p.id=pm.user_id
      where pm.project_id=pid and pm.user_id=uid and pm.member_role='lead'
        and p.status='active' and p.role='manager'
    );
$$;

create or replace function private.can_contribute_project(pid uuid,uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
  select private.can_use_operations(uid) and (
    private.is_admin(uid)
    or exists(
      select 1 from public.project_members pm
      join public.profiles p on p.id=pm.user_id
      where pm.project_id=pid and pm.user_id=uid and pm.member_role<>'viewer'
        and p.status='active'
    )
  );
$$;

create or replace function private.can_access_document_object(object_name text,uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
  select private.can_use_operations(uid) and exists(
    select 1 from public.documents d
    where d.file_url=object_name and (
      d.owner_id=uid
      or (private.is_admin(uid) and case when uid=auth.uid() then private.has_aal2() else true end)
      or (d.visibility='staff' and d.project_id is not null and private.is_project_member(d.project_id,uid))
      or (
        d.visibility='request' and (
          (d.project_id is not null and private.is_project_member(d.project_id,uid))
          or exists(select 1 from public.requests r where r.id=d.request_id and r.created_by=uid)
        )
      )
    )
  );
$$;

revoke all on function private.can_use_operations(uuid),private.is_project_member(uuid,uuid),private.can_manage_project(uuid,uuid),private.can_contribute_project(uuid,uuid),private.can_access_document_object(text,uuid) from public,anon;
grant execute on function private.can_use_operations(uuid),private.is_project_member(uuid,uuid),private.can_manage_project(uuid,uuid),private.can_contribute_project(uuid,uuid),private.can_access_document_object(text,uuid) to authenticated;

create or replace function private.protect_task_fields() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then return new; end if;
  if private.can_manage_project(coalesce(old.project_id,new.project_id),auth.uid()) then return new; end if;
  if old.assigned_to=auth.uid()
     and new.title is not distinct from old.title
     and new.description is not distinct from old.description
     and new.project_id is not distinct from old.project_id
     and new.request_id is not distinct from old.request_id
     and new.created_by is not distinct from old.created_by
     and new.assigned_to is not distinct from old.assigned_to
     and new.priority is not distinct from old.priority
     and new.due_at is not distinct from old.due_at
     and (new.completed_at is not distinct from old.completed_at or new.status is distinct from old.status) then
    return new;
  end if;
  raise exception 'Seul le responsable du projet peut modifier l’affectation ou le contenu de cette tâche';
end;
$$;
revoke all on function private.protect_task_fields() from public,anon,authenticated;

drop trigger if exists tasks_protect_fields on public.tasks;
create trigger tasks_protect_fields before update on public.tasks
for each row execute function private.protect_task_fields();

create or replace function private.protect_request_workflow_fields() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then return new; end if;
  if private.can_manage_project(coalesce(old.project_id,new.project_id),auth.uid()) then return new; end if;
  if old.assigned_to=auth.uid()
     and new.created_by is not distinct from old.created_by
     and new.assigned_to is not distinct from old.assigned_to
     and new.project_id is not distinct from old.project_id
     and new.priority is not distinct from old.priority
     and new.request_type is not distinct from old.request_type
     and new.subject is not distinct from old.subject
     and new.description is not distinct from old.description then
    return new;
  end if;
  raise exception 'Seul le responsable du projet peut modifier l’affectation de cette demande';
end;
$$;
revoke all on function private.protect_request_workflow_fields() from public,anon,authenticated;

drop trigger if exists requests_protect_workflow_fields on public.requests;
create trigger requests_protect_workflow_fields before update on public.requests
for each row execute function private.protect_request_workflow_fields();

create or replace function private.complete_task_timestamp() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.status='done' and old.status is distinct from new.status then new.completed_at=now(); end if;
  if new.status<>'done' then new.completed_at=null; end if;
  return new;
end;
$$;
revoke all on function private.complete_task_timestamp() from public,anon,authenticated;

drop trigger if exists tasks_complete_timestamp on public.tasks;
create trigger tasks_complete_timestamp before update of status on public.tasks
for each row execute function private.complete_task_timestamp();

create trigger projects_touch before update on public.projects
for each row execute function private.touch_updated_at();
create trigger beneficiaries_touch before update on public.beneficiaries
for each row execute function private.touch_updated_at();

create or replace function private.notify_task_assignment() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.assigned_to is not null and (tg_op='INSERT' or new.assigned_to is distinct from old.assigned_to) then
    insert into public.notifications(user_id,title,body,href)
    values(new.assigned_to,'Nouvelle tâche affectée',new.title,'/espace');
  end if;
  return new;
end;
$$;
revoke all on function private.notify_task_assignment() from public,anon,authenticated;

drop trigger if exists tasks_notify_assignment on public.tasks;
create trigger tasks_notify_assignment after insert or update of assigned_to on public.tasks
for each row execute function private.notify_task_assignment();

create or replace function private.notify_request_workflow() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.assigned_to is not null and new.assigned_to is distinct from old.assigned_to then
    insert into public.notifications(user_id,title,body,href)
    values(new.assigned_to,'Demande affectée',new.subject,'/espace');
  end if;
  if new.status is distinct from old.status and new.created_by<>auth.uid() then
    insert into public.notifications(user_id,title,body,href)
    values(new.created_by,'Mise à jour de votre demande',new.subject || ' · ' || new.status::text,'/espace');
  end if;
  return new;
end;
$$;
revoke all on function private.notify_request_workflow() from public,anon,authenticated;

drop trigger if exists requests_notify_workflow on public.requests;
create trigger requests_notify_workflow after update of assigned_to,status on public.requests
for each row execute function private.notify_request_workflow();

create or replace function private.notify_project_membership() returns trigger
language plpgsql security definer set search_path='' as $$
declare project_name text;
begin
  select p.name into project_name from public.projects p where p.id=new.project_id;
  insert into public.notifications(user_id,title,body,href)
  values(new.user_id,'Ajout à un projet',project_name,'/espace');
  return new;
end;
$$;
revoke all on function private.notify_project_membership() from public,anon,authenticated;

drop trigger if exists project_members_notify on public.project_members;
create trigger project_members_notify after insert on public.project_members
for each row execute function private.notify_project_membership();

create or replace function private.audit_operational_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare target_id uuid;
declare summary jsonb;
begin
  target_id=case when tg_op='DELETE' then old.id else new.id end;
  summary=jsonb_build_object('operation',lower(tg_op),'table',tg_table_name);
  if tg_table_name='projects' then
    summary=summary || jsonb_build_object('status',case when tg_op='DELETE' then old.status::text else new.status::text end);
  elsif tg_table_name='tasks' then
    summary=summary || jsonb_build_object('status',case when tg_op='DELETE' then old.status::text else new.status::text end);
  elsif tg_table_name='beneficiaries' then
    summary=summary || jsonb_build_object('project_id',case when tg_op='DELETE' then old.project_id else new.project_id end);
  elsif tg_table_name='documents' then
    summary=summary || jsonb_build_object('visibility',case when tg_op='DELETE' then old.visibility else new.visibility end);
  elsif tg_table_name='requests' then
    summary=summary || jsonb_build_object('status',case when tg_op='DELETE' then old.status::text else new.status::text end);
  end if;
  perform private.write_audit(tg_table_name || '.' || lower(tg_op),tg_table_name,target_id,summary);
  return case when tg_op='DELETE' then old else new end;
end;
$$;
revoke all on function private.audit_operational_change() from public,anon,authenticated;

create trigger projects_audit after insert or update or delete on public.projects
for each row execute function private.audit_operational_change();
create trigger beneficiaries_audit after insert or update or delete on public.beneficiaries
for each row execute function private.audit_operational_change();
create trigger tasks_audit after insert or update or delete on public.tasks
for each row execute function private.audit_operational_change();
create trigger documents_audit after insert or update or delete on public.documents
for each row execute function private.audit_operational_change();
create trigger requests_workflow_audit after update of project_id,assigned_to,status,priority on public.requests
for each row execute function private.audit_operational_change();

alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.beneficiaries enable row level security;

create policy projects_select on public.projects for select to authenticated
using ((select private.can_use_operations()) and ((select private.is_admin()) or (select private.is_project_member(id))));
create policy projects_insert on public.projects for insert to authenticated
with check ((select private.is_admin()) and (select private.has_aal2()) and created_by=(select auth.uid()));
create policy projects_update on public.projects for update to authenticated
using ((select private.can_manage_project(id)))
with check ((select private.can_manage_project(id)));
create policy projects_delete on public.projects for delete to authenticated
using ((select private.is_super_admin()) and (select private.has_aal2()));

create policy project_members_select on public.project_members for select to authenticated
using (((select private.is_admin()) and (select private.has_aal2())) or (select private.is_project_member(project_id)));
create policy project_members_insert on public.project_members for insert to authenticated
with check ((select private.can_manage_project(project_id)) and exists(select 1 from public.profiles p where p.id=user_id and p.status='active'));
create policy project_members_update on public.project_members for update to authenticated
using ((select private.can_manage_project(project_id)))
with check ((select private.can_manage_project(project_id)));
create policy project_members_delete on public.project_members for delete to authenticated
using ((select private.can_manage_project(project_id)) and user_id<>(select auth.uid()));

create policy beneficiaries_select on public.beneficiaries for select to authenticated
using ((select private.can_use_operations()) and ((select private.is_admin()) or (select private.is_project_member(project_id))));
create policy beneficiaries_insert on public.beneficiaries for insert to authenticated
with check ((select private.can_manage_project(project_id)) and created_by=(select auth.uid()));
create policy beneficiaries_update on public.beneficiaries for update to authenticated
using ((select private.can_manage_project(project_id)))
with check ((select private.can_manage_project(project_id)));
create policy beneficiaries_delete on public.beneficiaries for delete to authenticated
using ((select private.is_super_admin()) and (select private.has_aal2()));

drop policy if exists requests_select on public.requests;
drop policy if exists requests_staff_update on public.requests;
create policy requests_select on public.requests for select to authenticated
using (
  (select private.can_use_operations()) and (
    created_by=(select auth.uid()) or assigned_to=(select auth.uid()) or ((select private.is_admin()) and (select private.has_aal2()))
    or (project_id is not null and (select private.is_project_member(project_id)))
  )
);
create policy requests_staff_update on public.requests for update to authenticated
using (
  (select private.can_use_operations()) and (
    assigned_to=(select auth.uid()) or ((select private.is_admin()) and (select private.has_aal2()))
    or (project_id is not null and (select private.can_manage_project(project_id)))
  )
)
with check (
  (select private.can_use_operations()) and (
    assigned_to=(select auth.uid()) or ((select private.is_admin()) and (select private.has_aal2()))
    or (project_id is not null and (select private.can_manage_project(project_id)))
  )
);

drop policy if exists tasks_select on public.tasks;
drop policy if exists tasks_insert on public.tasks;
drop policy if exists tasks_update on public.tasks;
create policy tasks_select on public.tasks for select to authenticated
using (
  (select private.can_use_operations()) and (
    created_by=(select auth.uid()) or assigned_to=(select auth.uid()) or ((select private.is_admin()) and (select private.has_aal2()))
    or (project_id is not null and (select private.is_project_member(project_id)))
  )
);
create policy tasks_insert on public.tasks for insert to authenticated
with check (
  (select private.can_use_operations()) and (select private.is_staff()) and created_by=(select auth.uid()) and (
    project_id is not null and (select private.can_contribute_project(project_id))
  )
);
create policy tasks_update on public.tasks for update to authenticated
using (
  (select private.can_use_operations()) and (
    assigned_to=(select auth.uid()) or (project_id is not null and (select private.can_manage_project(project_id)))
  )
)
with check (
  (select private.can_use_operations()) and (
    assigned_to=(select auth.uid()) or (project_id is not null and (select private.can_manage_project(project_id)))
  )
);
create policy tasks_delete on public.tasks for delete to authenticated
using (((select private.is_admin()) and (select private.has_aal2())) or (project_id is not null and (select private.can_manage_project(project_id))));

drop policy if exists documents_select on public.documents;
drop policy if exists documents_insert on public.documents;
create policy documents_select on public.documents for select to authenticated
using (
  (select private.can_use_operations()) and (
    owner_id=(select auth.uid()) or ((select private.is_admin()) and (select private.has_aal2()))
    or (visibility='staff' and project_id is not null and (select private.is_project_member(project_id)))
    or (visibility='request' and (
      (project_id is not null and (select private.is_project_member(project_id)))
      or exists(select 1 from public.requests r where r.id=request_id and r.created_by=(select auth.uid()))
    ))
  )
);
create policy documents_insert on public.documents for insert to authenticated
with check (
  (select private.can_use_operations()) and owner_id=(select auth.uid()) and (
    project_id is null or (select private.can_contribute_project(project_id))
  )
);
create policy documents_delete on public.documents for delete to authenticated
using ((select private.can_use_operations()) and (owner_id=(select auth.uid()) or (select private.is_admin())));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'aiac-documents','aiac-documents',false,15728640,
  array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/jpeg','image/png']
)
on conflict(id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists aiac_documents_insert on storage.objects;
drop policy if exists aiac_documents_select on storage.objects;
drop policy if exists aiac_documents_delete on storage.objects;
create policy aiac_documents_insert on storage.objects for insert to authenticated
with check (
  bucket_id='aiac-documents' and (select private.can_use_operations())
  and (storage.foldername(name))[1]=(select auth.uid())::text
);
create policy aiac_documents_select on storage.objects for select to authenticated
using (bucket_id='aiac-documents' and (select private.can_access_document_object(name)));
create policy aiac_documents_delete on storage.objects for delete to authenticated
using (
  bucket_id='aiac-documents' and (select private.can_use_operations()) and (
    (storage.foldername(name))[1]=(select auth.uid())::text or ((select private.is_admin()) and (select private.has_aal2()))
  )
);

grant select,insert,update,delete on public.projects,public.project_members,public.beneficiaries to authenticated;
grant select,insert,update,delete on public.requests,public.tasks,public.documents to authenticated;
