-- Rapports terrain centralisés : Programme -> Projet -> Activité -> Tâche -> Rapport.
-- Migration exclusivement additive, avec maintien des tâches administratives existantes.

create extension if not exists pgcrypto with schema extensions;

create table public.activity_tasks (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete restrict,
  code text not null default ('TAC-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  title text not null check (char_length(title) between 3 and 220),
  description text check (description is null or char_length(description) <= 10000),
  expected_output text check (expected_output is null or char_length(expected_output) <= 5000),
  sequence_no integer not null default 1 check (sequence_no > 0),
  assigned_to uuid references public.profiles(id) on delete set null,
  due_date date,
  requires_evidence boolean not null default true,
  requires_attendance boolean not null default false,
  status text not null default 'planned' check (status in ('planned','active','completed','cancelled')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(activity_id,code)
);

create table public.task_reports (
  id uuid primary key default gen_random_uuid(),
  report_number text not null unique default ('RPT-' || to_char(current_date,'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  task_id uuid not null references public.activity_tasks(id) on delete restrict,
  reporter_id uuid not null references public.profiles(id) on delete restrict,
  supervisor_id uuid references public.profiles(id) on delete set null,
  body_id uuid references public.governance_bodies(id) on delete set null,
  execution_date date not null default current_date,
  started_at timestamptz,
  ended_at timestamptz,
  location text,
  latitude numeric(9,6) check (latitude is null or latitude between -90 and 90),
  longitude numeric(9,6) check (longitude is null or longitude between -180 and 180),
  summary text not null default '' check (char_length(summary) <= 15000),
  objectives text check (objectives is null or char_length(objectives) <= 10000),
  methodology text check (methodology is null or char_length(methodology) <= 10000),
  outcomes text check (outcomes is null or char_length(outcomes) <= 15000),
  challenges text check (challenges is null or char_length(challenges) <= 10000),
  recommendations text check (recommendations is null or char_length(recommendations) <= 10000),
  success_story text check (success_story is null or char_length(success_story) <= 10000),
  safeguarding_notes text check (safeguarding_notes is null or char_length(safeguarding_notes) <= 5000),
  women_count integer not null default 0 check (women_count >= 0),
  men_count integer not null default 0 check (men_count >= 0),
  girls_count integer not null default 0 check (girls_count >= 0),
  boys_count integer not null default 0 check (boys_count >= 0),
  disability_count integer not null default 0 check (disability_count >= 0),
  vulnerable_count integer not null default 0 check (vulnerable_count >= 0),
  status text not null default 'draft' check (status in ('draft','submitted','returned','approved','archived')),
  revision integer not null default 0 check (revision >= 0),
  current_hash text,
  reporter_signature_name text,
  reporter_signature_asset_path text,
  reporter_signed_at timestamptz,
  submitted_at timestamptz,
  returned_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at is null or started_at is null or ended_at >= started_at),
  check (status <> 'approved' or (approved_at is not null and approved_by is not null and current_hash is not null))
);

create table public.task_report_versions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.task_reports(id) on delete restrict,
  revision integer not null check (revision > 0),
  payload jsonb not null,
  content_hash text not null check (char_length(content_hash)=64),
  submitted_by uuid not null references public.profiles(id) on delete restrict,
  signature_name text not null check (char_length(signature_name) between 2 and 180),
  signature_asset_path text,
  signed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(report_id,revision)
);

create table public.task_report_evidence (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.task_reports(id) on delete restrict,
  evidence_type text not null default 'photo' check (evidence_type in ('photo','document','video','audio','other')),
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes between 1 and 15728640),
  sha256 text check (sha256 is null or char_length(sha256)=64),
  caption text check (caption is null or char_length(caption) <= 1000),
  taken_at timestamptz,
  latitude numeric(9,6) check (latitude is null or latitude between -90 and 90),
  longitude numeric(9,6) check (longitude is null or longitude between -180 and 180),
  classification text not null default 'internal' check (classification in ('internal','restricted','public')),
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.task_report_attendance (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.task_reports(id) on delete restrict,
  participant_code text,
  full_name text not null check (char_length(full_name) between 2 and 180),
  phone text,
  email text,
  gender text not null default 'unknown' check (gender in ('female','male','other','prefer_not_to_say','unknown')),
  age_group text not null default 'adult' check (age_group in ('child','youth','adult','older_person','unknown')),
  person_with_disability boolean not null default false,
  vulnerable boolean not null default false,
  organization text,
  role text,
  present boolean not null default true,
  arrival_at timestamptz,
  departure_at timestamptz,
  signature_name text,
  consent_at timestamptz not null,
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (departure_at is null or arrival_at is null or departure_at >= arrival_at)
);

create table public.task_report_indicator_values (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.task_reports(id) on delete restrict,
  indicator_code text not null check (char_length(indicator_code) between 2 and 80),
  indicator_label text not null check (char_length(indicator_label) between 3 and 300),
  unit text not null check (char_length(unit) between 1 and 80),
  baseline_value numeric,
  target_value numeric,
  achieved_value numeric not null,
  verification_source text,
  notes text check (notes is null or char_length(notes) <= 3000),
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.task_report_approvals (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.task_reports(id) on delete restrict,
  revision integer not null check (revision > 0),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  decision text not null check (decision in ('submitted','returned','approved')),
  actor_name text not null,
  actor_role text not null,
  actor_job_title text,
  actor_body_id uuid references public.governance_bodies(id) on delete set null,
  comment text check (comment is null or char_length(comment) <= 5000),
  signature_name text not null,
  signature_asset_path text,
  content_hash text not null check (char_length(content_hash)=64),
  signed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.task_report_events (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.task_reports(id) on delete restrict,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type in ('created','updated','evidence_added','attendance_added','submitted','returned','resubmitted','approved','archived')),
  from_status text,
  to_status text,
  comment text check (comment is null or char_length(comment) <= 5000),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index activity_tasks_activity_idx on public.activity_tasks(activity_id,status,sequence_no);
create index activity_tasks_assigned_idx on public.activity_tasks(assigned_to,status,due_date);
create index task_reports_task_idx on public.task_reports(task_id,status,execution_date desc);
create index task_reports_reporter_idx on public.task_reports(reporter_id,status,updated_at desc);
create index task_reports_supervisor_idx on public.task_reports(supervisor_id,status,submitted_at desc);
create index task_reports_body_idx on public.task_reports(body_id,status,execution_date desc);
create index task_report_evidence_report_idx on public.task_report_evidence(report_id,created_at);
create index task_report_attendance_report_idx on public.task_report_attendance(report_id,created_at);
create index task_report_indicators_report_idx on public.task_report_indicator_values(report_id,created_at);
create index task_report_approvals_report_idx on public.task_report_approvals(report_id,revision,created_at);
create index task_report_events_report_idx on public.task_report_events(report_id,created_at);

create or replace function private.can_view_activity_task(target_id uuid,uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
  select private.is_active_user(uid) and exists(
    select 1
    from public.activity_tasks t
    join public.activities a on a.id=t.activity_id
    where t.id=target_id and (
      (private.is_admin(uid) and case when uid=auth.uid() then private.has_aal2() else true end)
      or t.assigned_to=uid or t.created_by=uid or a.manager_id=uid or a.created_by=uid
      or private.is_project_member(a.project_id,uid)
    )
  );
$$;

create or replace function private.can_manage_activity_task(target_id uuid,uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
  select private.is_active_user(uid) and exists(
    select 1
    from public.activity_tasks t
    join public.activities a on a.id=t.activity_id
    where t.id=target_id and (
      (private.is_admin(uid) and case when uid=auth.uid() then private.has_aal2() else true end)
      or a.manager_id=uid or a.created_by=uid or private.can_manage_project(a.project_id,uid)
    )
  );
$$;

create or replace function private.can_contribute_activity_task(target_id uuid,uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
  select private.is_active_user(uid) and exists(
    select 1
    from public.activity_tasks t
    join public.activities a on a.id=t.activity_id
    where t.id=target_id and t.status in ('planned','active') and (
      t.assigned_to=uid or a.manager_id=uid or a.created_by=uid
      or private.can_contribute_project(a.project_id,uid)
    )
  );
$$;

create or replace function private.can_review_task_report(target_id uuid,uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
  select private.is_active_user(uid) and exists(
    select 1
    from public.task_reports r
    join public.activity_tasks t on t.id=r.task_id
    join public.activities a on a.id=t.activity_id
    where r.id=target_id and uid<>r.reporter_id and (
      (private.is_admin(uid) and case when uid=auth.uid() then private.has_aal2() else true end)
      or r.supervisor_id=uid or a.manager_id=uid or private.can_manage_project(a.project_id,uid)
    )
  );
$$;

create or replace function private.can_view_task_report(target_id uuid,uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
  select private.is_active_user(uid) and exists(
    select 1 from public.task_reports r
    where r.id=target_id and (
      r.reporter_id=uid or r.supervisor_id=uid
      or private.can_review_task_report(r.id,uid)
    )
  );
$$;

create or replace function private.can_edit_task_report(target_id uuid,uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.task_reports r
    where r.id=target_id and r.reporter_id=uid and r.status in ('draft','returned')
  );
$$;

revoke all on function private.can_view_activity_task(uuid,uuid),private.can_manage_activity_task(uuid,uuid),private.can_contribute_activity_task(uuid,uuid),private.can_review_task_report(uuid,uuid),private.can_view_task_report(uuid,uuid),private.can_edit_task_report(uuid,uuid) from public,anon;
grant execute on function private.can_view_activity_task(uuid,uuid),private.can_manage_activity_task(uuid,uuid),private.can_contribute_activity_task(uuid,uuid),private.can_review_task_report(uuid,uuid),private.can_view_task_report(uuid,uuid),private.can_edit_task_report(uuid,uuid) to authenticated;

create or replace function private.resolve_task_report_context() returns trigger
language plpgsql security definer set search_path='' as $$
declare
  resolved_supervisor uuid;
  resolved_body uuid;
begin
  if new.reporter_id is null then new.reporter_id:=auth.uid(); end if;

  select wa.supervisor_id,wa.body_id into resolved_supervisor,resolved_body
  from public.workforce_assignments wa
  where wa.profile_id=new.reporter_id and wa.status='active'
    and (wa.end_date is null or wa.end_date>=current_date)
  order by wa.start_date desc limit 1;

  if resolved_body is null or resolved_supervisor is null then
    select coalesce(resolved_supervisor,spa.profile_id),coalesce(resolved_body,pa.body_id)
    into resolved_supervisor,resolved_body
    from public.position_assignments pa
    left join public.position_assignments spa on spa.id=pa.supervisor_assignment_id and spa.status='active'
    where pa.profile_id=new.reporter_id and pa.status='active'
      and (pa.end_date is null or pa.end_date>=current_date)
    order by pa.start_date desc limit 1;
  end if;

  if resolved_supervisor is null then
    select case when a.manager_id<>new.reporter_id then a.manager_id end
    into resolved_supervisor
    from public.activity_tasks t join public.activities a on a.id=t.activity_id
    where t.id=new.task_id;
  end if;

  new.supervisor_id:=coalesce(new.supervisor_id,resolved_supervisor);
  new.body_id:=coalesce(new.body_id,resolved_body);
  return new;
end;
$$;
revoke all on function private.resolve_task_report_context() from public,anon,authenticated;

create or replace function private.protect_task_report_fields() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if current_setting('aiac.task_report_workflow',true)='on' then return new; end if;
  if auth.uid() is null then return new; end if;
  if old.reporter_id<>auth.uid() or old.status not in ('draft','returned') then
    raise exception 'Ce rapport ne peut plus être modifié directement';
  end if;
  if new.task_id is distinct from old.task_id
     or new.reporter_id is distinct from old.reporter_id
     or new.supervisor_id is distinct from old.supervisor_id
     or new.body_id is distinct from old.body_id
     or new.status is distinct from old.status
     or new.revision is distinct from old.revision
     or new.current_hash is distinct from old.current_hash
     or new.submitted_at is distinct from old.submitted_at
     or new.approved_at is distinct from old.approved_at
     or new.approved_by is distinct from old.approved_by
     or new.reporter_signed_at is distinct from old.reporter_signed_at then
    raise exception 'Les champs d’identité et de workflow sont protégés';
  end if;
  return new;
end;
$$;
revoke all on function private.protect_task_report_fields() from public,anon,authenticated;

create or replace function private.protect_task_report_version() returns trigger
language plpgsql set search_path='' as $$
begin
  raise exception 'Une version soumise est immuable';
end;
$$;
revoke all on function private.protect_task_report_version() from public,anon,authenticated;

create or replace function private.log_task_report_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare
  target_report uuid;
  event_name text;
begin
  if tg_table_name='task_reports' then
    target_report:=new.id;
    if tg_op='INSERT' then event_name:='created';
    elsif new.status is not distinct from old.status then event_name:='updated';
    else return new;
    end if;
  else
    target_report:=coalesce(new.report_id,old.report_id);
    event_name:=case tg_table_name
      when 'task_report_evidence' then 'evidence_added'
      when 'task_report_attendance' then 'attendance_added'
      else 'updated'
    end;
  end if;
  insert into public.task_report_events(report_id,actor_id,event_type,metadata)
  values(target_report,auth.uid(),event_name,jsonb_build_object('table',tg_table_name,'operation',tg_op));
  return coalesce(new,old);
end;
$$;
revoke all on function private.log_task_report_change() from public,anon,authenticated;

create trigger activity_tasks_touch before update on public.activity_tasks for each row execute function private.touch_updated_at();
create trigger task_reports_context before insert on public.task_reports for each row execute function private.resolve_task_report_context();
create trigger task_reports_protect before update on public.task_reports for each row execute function private.protect_task_report_fields();
create trigger task_reports_touch before update on public.task_reports for each row execute function private.touch_updated_at();
create trigger task_report_versions_immutable before update or delete on public.task_report_versions for each row execute function private.protect_task_report_version();
create trigger task_reports_log after insert or update on public.task_reports for each row execute function private.log_task_report_change();
create trigger task_report_evidence_log after insert or delete on public.task_report_evidence for each row execute function private.log_task_report_change();
create trigger task_report_attendance_log after insert or delete on public.task_report_attendance for each row execute function private.log_task_report_change();
create trigger task_report_indicators_log after insert or delete on public.task_report_indicator_values for each row execute function private.log_task_report_change();

create or replace function public.submit_task_report(target_report_id uuid,signature_name text,signature_asset_path text default null)
returns public.task_reports
language plpgsql security definer set search_path='' as $$
declare
  report_row public.task_reports%rowtype;
  task_row public.activity_tasks%rowtype;
  payload_value jsonb;
  hash_value text;
  next_revision integer;
  actor_name text;
  actor_role text;
  actor_job text;
  actor_body uuid;
  recipient_id uuid;
  previous_status text;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if char_length(trim(coalesce(signature_name,'')))<2 then raise exception 'La signature nominative est obligatoire'; end if;

  select * into report_row from public.task_reports where id=target_report_id for update;
  if not found or report_row.reporter_id<>auth.uid() then raise exception 'Rapport inaccessible'; end if;
  if report_row.status not in ('draft','returned') then raise exception 'Ce rapport a déjà été soumis'; end if;
  if char_length(trim(report_row.summary))<5 then raise exception 'Le résumé d’exécution doit contenir au moins 5 caractères'; end if;
  select * into task_row from public.activity_tasks where id=report_row.task_id;
  if task_row.requires_evidence and not exists(select 1 from public.task_report_evidence e where e.report_id=report_row.id) then
    raise exception 'Ajoutez au moins une preuve avant la soumission';
  end if;
  if task_row.requires_attendance and not exists(select 1 from public.task_report_attendance a where a.report_id=report_row.id and a.present) then
    raise exception 'La liste de présence est obligatoire pour cette tâche';
  end if;

  next_revision:=report_row.revision+1;
  payload_value:=jsonb_build_object(
    'report',to_jsonb(report_row)-array['created_at','updated_at','current_hash'],
    'task',to_jsonb(task_row),
    'evidence',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at) from public.task_report_evidence e where e.report_id=report_row.id),'[]'::jsonb),
    'attendance',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at) from public.task_report_attendance a where a.report_id=report_row.id),'[]'::jsonb),
    'indicators',coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at) from public.task_report_indicator_values i where i.report_id=report_row.id),'[]'::jsonb),
    'revision',next_revision
  );
  hash_value:=encode(extensions.digest(convert_to(payload_value::text,'UTF8'),'sha256'),'hex');

  select coalesce(p.full_name,p.email,'Compte AIAC'),p.role::text into actor_name,actor_role
  from public.profiles p where p.id=auth.uid();
  select wa.job_title,wa.body_id into actor_job,actor_body
  from public.workforce_assignments wa
  where wa.profile_id=auth.uid() and wa.status='active' and (wa.end_date is null or wa.end_date>=current_date)
  order by wa.start_date desc limit 1;

  insert into public.task_report_versions(report_id,revision,payload,content_hash,submitted_by,signature_name,signature_asset_path)
  values(report_row.id,next_revision,payload_value,hash_value,auth.uid(),trim(signature_name),signature_asset_path);

  insert into public.task_report_approvals(report_id,revision,actor_id,decision,actor_name,actor_role,actor_job_title,actor_body_id,signature_name,signature_asset_path,content_hash)
  values(report_row.id,next_revision,auth.uid(),'submitted',actor_name,actor_role,actor_job,coalesce(actor_body,report_row.body_id),trim(signature_name),signature_asset_path,hash_value);

  previous_status:=report_row.status;
  perform set_config('aiac.task_report_workflow','on',true);
  update public.task_reports set status='submitted',revision=next_revision,current_hash=hash_value,
    reporter_signature_name=trim(signature_name),reporter_signature_asset_path=signature_asset_path,
    reporter_signed_at=now(),submitted_at=now(),returned_at=null
  where id=report_row.id returning * into report_row;

  insert into public.task_report_events(report_id,actor_id,event_type,from_status,to_status,metadata)
  values(report_row.id,auth.uid(),case when previous_status='returned' then 'resubmitted' else 'submitted' end,previous_status,'submitted',jsonb_build_object('revision',next_revision,'hash',hash_value));

  select candidate into recipient_id from (
    select report_row.supervisor_id candidate,1 priority
    union all
    select a.manager_id,2 from public.activity_tasks t join public.activities a on a.id=t.activity_id where t.id=report_row.task_id
    union all
    select pm.user_id,3 from public.activity_tasks t join public.activities a on a.id=t.activity_id join public.project_members pm on pm.project_id=a.project_id and pm.member_role='lead' where t.id=report_row.task_id
    union all
    select p.id,4 from public.profiles p where p.status='active' and p.role in ('admin','super_admin')
  ) candidates where candidate is not null and candidate<>auth.uid() order by priority limit 1;

  if recipient_id is not null then
    insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id)
    values(recipient_id,'Rapport terrain à valider',report_row.report_number || ' a été signé et soumis.','/espace?tab=terrain&report=' || report_row.id,'workflow','task_report',report_row.id);
  end if;
  return report_row;
end;
$$;

create or replace function public.review_task_report(target_report_id uuid,decision text,review_comment text,signature_name text,signature_asset_path text default null)
returns public.task_reports
language plpgsql security definer set search_path='' as $$
declare
  report_row public.task_reports%rowtype;
  actor_name text;
  actor_role text;
  actor_job text;
  actor_body uuid;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if decision not in ('approved','returned') then raise exception 'Décision invalide'; end if;
  if char_length(trim(coalesce(signature_name,'')))<2 then raise exception 'La signature nominative est obligatoire'; end if;
  if decision='returned' and char_length(trim(coalesce(review_comment,'')))<5 then raise exception 'Expliquez les corrections demandées'; end if;

  select * into report_row from public.task_reports where id=target_report_id for update;
  if not found or report_row.status<>'submitted' then raise exception 'Ce rapport n’est pas disponible pour validation'; end if;
  if not private.can_review_task_report(report_row.id,auth.uid()) then raise exception 'Vous n’êtes pas accrédité pour cette validation'; end if;

  select coalesce(p.full_name,p.email,'Compte AIAC'),p.role::text into actor_name,actor_role
  from public.profiles p where p.id=auth.uid();
  select wa.job_title,wa.body_id into actor_job,actor_body
  from public.workforce_assignments wa
  where wa.profile_id=auth.uid() and wa.status='active' and (wa.end_date is null or wa.end_date>=current_date)
  order by wa.start_date desc limit 1;

  insert into public.task_report_approvals(report_id,revision,actor_id,decision,actor_name,actor_role,actor_job_title,actor_body_id,comment,signature_name,signature_asset_path,content_hash)
  values(report_row.id,report_row.revision,auth.uid(),decision,actor_name,actor_role,actor_job,actor_body,nullif(trim(coalesce(review_comment,'')),''),trim(signature_name),signature_asset_path,report_row.current_hash);

  perform set_config('aiac.task_report_workflow','on',true);
  if decision='approved' then
    update public.task_reports set status='approved',approved_at=now(),approved_by=auth.uid(),returned_at=null where id=report_row.id returning * into report_row;
  else
    update public.task_reports set status='returned',returned_at=now(),approved_at=null,approved_by=null where id=report_row.id returning * into report_row;
  end if;

  insert into public.task_report_events(report_id,actor_id,event_type,from_status,to_status,comment,metadata)
  values(report_row.id,auth.uid(),decision,'submitted',decision,nullif(trim(coalesce(review_comment,'')),''),jsonb_build_object('revision',report_row.revision,'hash',report_row.current_hash));

  insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id)
  values(report_row.reporter_id,case when decision='approved' then 'Rapport terrain approuvé' else 'Rapport terrain retourné' end,
    case when decision='approved' then report_row.report_number || ' a été validé et signé.' else coalesce(review_comment,'Des corrections sont demandées.') end,
    '/espace?tab=terrain&report=' || report_row.id,'workflow','task_report',report_row.id);
  return report_row;
end;
$$;

revoke all on function public.submit_task_report(uuid,text,text),public.review_task_report(uuid,text,text,text,text) from public,anon;
grant execute on function public.submit_task_report(uuid,text,text),public.review_task_report(uuid,text,text,text,text) to authenticated;

alter table public.activity_tasks enable row level security;
alter table public.task_reports enable row level security;
alter table public.task_report_versions enable row level security;
alter table public.task_report_evidence enable row level security;
alter table public.task_report_attendance enable row level security;
alter table public.task_report_indicator_values enable row level security;
alter table public.task_report_approvals enable row level security;
alter table public.task_report_events enable row level security;

create policy activity_tasks_select on public.activity_tasks for select to authenticated using ((select private.can_view_activity_task(id)));
create policy activity_tasks_insert on public.activity_tasks for insert to authenticated with check (created_by=(select auth.uid()) and (select private.can_manage_activity(activity_id)));
create policy activity_tasks_update on public.activity_tasks for update to authenticated using ((select private.can_manage_activity_task(id))) with check ((select private.can_manage_activity_task(id)));

create policy task_reports_select on public.task_reports for select to authenticated using ((select private.can_view_task_report(id)));
create policy task_reports_insert on public.task_reports for insert to authenticated with check (reporter_id=(select auth.uid()) and status='draft' and (select private.can_contribute_activity_task(task_id)));
create policy task_reports_update on public.task_reports for update to authenticated using ((select private.can_edit_task_report(id))) with check ((select private.can_edit_task_report(id)));

create policy task_report_versions_select on public.task_report_versions for select to authenticated using ((select private.can_view_task_report(report_id)));

create policy task_report_evidence_select on public.task_report_evidence for select to authenticated using ((select private.can_view_task_report(report_id)));
create policy task_report_evidence_insert on public.task_report_evidence for insert to authenticated with check (uploaded_by=(select auth.uid()) and (select private.can_edit_task_report(report_id)));
create policy task_report_evidence_update on public.task_report_evidence for update to authenticated using (uploaded_by=(select auth.uid()) and (select private.can_edit_task_report(report_id))) with check (uploaded_by=(select auth.uid()) and (select private.can_edit_task_report(report_id)));
create policy task_report_evidence_delete on public.task_report_evidence for delete to authenticated using (uploaded_by=(select auth.uid()) and (select private.can_edit_task_report(report_id)));

create policy task_report_attendance_select on public.task_report_attendance for select to authenticated using ((select private.can_view_task_report(report_id)));
create policy task_report_attendance_insert on public.task_report_attendance for insert to authenticated with check (recorded_by=(select auth.uid()) and (select private.can_edit_task_report(report_id)));
create policy task_report_attendance_update on public.task_report_attendance for update to authenticated using (recorded_by=(select auth.uid()) and (select private.can_edit_task_report(report_id))) with check (recorded_by=(select auth.uid()) and (select private.can_edit_task_report(report_id)));
create policy task_report_attendance_delete on public.task_report_attendance for delete to authenticated using (recorded_by=(select auth.uid()) and (select private.can_edit_task_report(report_id)));

create policy task_report_indicators_select on public.task_report_indicator_values for select to authenticated using ((select private.can_view_task_report(report_id)));
create policy task_report_indicators_insert on public.task_report_indicator_values for insert to authenticated with check (recorded_by=(select auth.uid()) and (select private.can_edit_task_report(report_id)));
create policy task_report_indicators_update on public.task_report_indicator_values for update to authenticated using (recorded_by=(select auth.uid()) and (select private.can_edit_task_report(report_id))) with check (recorded_by=(select auth.uid()) and (select private.can_edit_task_report(report_id)));
create policy task_report_indicators_delete on public.task_report_indicator_values for delete to authenticated using (recorded_by=(select auth.uid()) and (select private.can_edit_task_report(report_id)));

create policy task_report_approvals_select on public.task_report_approvals for select to authenticated using ((select private.can_view_task_report(report_id)));
create policy task_report_events_select on public.task_report_events for select to authenticated using ((select private.can_view_task_report(report_id)));

revoke all on public.activity_tasks,public.task_reports,public.task_report_versions,public.task_report_evidence,public.task_report_attendance,public.task_report_indicator_values,public.task_report_approvals,public.task_report_events from public,anon,authenticated;
grant select,insert,update on public.activity_tasks,public.task_reports to authenticated;
grant select on public.task_report_versions,public.task_report_approvals,public.task_report_events to authenticated;
grant select,insert,update,delete on public.task_report_evidence,public.task_report_attendance,public.task_report_indicator_values to authenticated;

-- Corrige la lecture trop large de l’ancien rapport d’activité sans supprimer la table.
drop policy if exists activity_reports_select on public.activity_reports;
create policy activity_reports_select on public.activity_reports for select to authenticated using (
  (select private.can_manage_activity(activity_id))
  or exists(select 1 from public.activities a where a.id=activity_id and (select private.is_project_member(a.project_id)))
);

-- Les bénévoles affectés à un projet peuvent voir uniquement leur hiérarchie autorisée.
drop policy if exists programs_select on public.programs;
create policy programs_select on public.programs for select to authenticated using (
  (select private.is_staff())
  or exists(select 1 from public.projects p where p.program_id=id and (select private.is_project_member(p.id)))
);
drop policy if exists activities_select on public.activities;
create policy activities_select on public.activities for select to authenticated using (
  (select private.is_staff()) or manager_id=(select auth.uid()) or created_by=(select auth.uid())
  or (select private.is_project_member(project_id))
);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('aiac-task-reports','aiac-task-reports',false,15728640,array['image/jpeg','image/png','image/webp','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','audio/mpeg','audio/mp4','video/mp4'])
on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy "task_report_object_insert" on storage.objects for insert to authenticated with check (
  bucket_id='aiac-task-reports'
  and (storage.foldername(name))[1]=(select auth.uid()::text)
  and (select private.can_edit_task_report(nullif(split_part(name,'/',2),'')::uuid))
);
create policy "task_report_object_select" on storage.objects for select to authenticated using (
  bucket_id='aiac-task-reports'
  and (select private.can_view_task_report(nullif(split_part(name,'/',2),'')::uuid))
);
create policy "task_report_object_update" on storage.objects for update to authenticated using (
  bucket_id='aiac-task-reports' and (storage.foldername(name))[1]=(select auth.uid()::text)
  and (select private.can_edit_task_report(nullif(split_part(name,'/',2),'')::uuid))
) with check (
  bucket_id='aiac-task-reports' and (storage.foldername(name))[1]=(select auth.uid()::text)
  and (select private.can_edit_task_report(nullif(split_part(name,'/',2),'')::uuid))
);
create policy "task_report_object_delete" on storage.objects for delete to authenticated using (
  bucket_id='aiac-task-reports' and (storage.foldername(name))[1]=(select auth.uid()::text)
  and (select private.can_edit_task_report(nullif(split_part(name,'/',2),'')::uuid))
);

create view public.task_report_rollups with (security_invoker=true) as
select
  r.id report_id,r.report_number,r.execution_date,r.status,r.revision,r.reporter_id,r.supervisor_id,r.body_id,
  t.id task_id,t.code task_code,t.title task_title,
  a.id activity_id,a.code activity_code,a.title activity_title,
  p.id project_id,p.code project_code,p.name project_name,
  g.id program_id,g.code program_code,g.name program_name,
  r.women_count,r.men_count,r.girls_count,r.boys_count,r.disability_count,r.vulnerable_count,
  (r.women_count+r.men_count+r.girls_count+r.boys_count) total_participants,
  r.submitted_at,r.approved_at,r.current_hash
from public.task_reports r
join public.activity_tasks t on t.id=r.task_id
join public.activities a on a.id=t.activity_id
join public.projects p on p.id=a.project_id
join public.programs g on g.id=p.program_id;
revoke all on public.task_report_rollups from public,anon,authenticated;
grant select on public.task_report_rollups to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.task_reports;
exception when duplicate_object then null;
end $$;
