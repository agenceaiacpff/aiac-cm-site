alter table public.position_assignments
  add column if not exists assignment_nature text not null default 'regular',
  add column if not exists acting_reason text,
  add column if not exists assignment_notes text;

do $$ begin
  alter table public.position_assignments add constraint position_assignments_assignment_nature_check
    check (assignment_nature in ('regular','interim','acting','volunteer','intern','consultant','secondment'));
exception when duplicate_object then null; end $$;

create table if not exists public.meeting_documents(
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  shared_by uuid not null references public.profiles(id),
  shared_at timestamptz not null default now(),
  primary key(meeting_id,document_id)
);
alter table public.meeting_documents enable row level security;
drop policy if exists meeting_documents_select on public.meeting_documents;
create policy meeting_documents_select on public.meeting_documents for select to authenticated
using (private.can_view_meeting(meeting_id) and private.can_access_document(document_id));
drop policy if exists meeting_documents_insert on public.meeting_documents;
create policy meeting_documents_insert on public.meeting_documents for insert to authenticated
with check (shared_by=auth.uid() and private.can_manage_meeting(meeting_id) and private.can_manage_document(document_id));
drop policy if exists meeting_documents_delete on public.meeting_documents;
create policy meeting_documents_delete on public.meeting_documents for delete to authenticated
using (private.can_manage_meeting(meeting_id));

create table if not exists public.gender_analysis_documents(
  analysis_id uuid not null references public.gender_analysis_records(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  linked_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key(analysis_id,document_id)
);
alter table public.gender_analysis_documents enable row level security;
drop policy if exists gender_analysis_documents_select on public.gender_analysis_documents;
create policy gender_analysis_documents_select on public.gender_analysis_documents for select to authenticated
using (private.can_access_document(document_id) and exists(
  select 1 from public.gender_analysis_records g where g.id=analysis_id and (
    private.has_position_capability('gender.analysis.manage',auth.uid(),g.body_id,g.project_id)
    or private.has_position_capability('report.view_scope',auth.uid(),g.body_id,g.project_id)
  )
));
drop policy if exists gender_analysis_documents_insert on public.gender_analysis_documents;
create policy gender_analysis_documents_insert on public.gender_analysis_documents for insert to authenticated
with check (linked_by=auth.uid() and private.can_manage_document(document_id) and exists(
  select 1 from public.gender_analysis_records g where g.id=analysis_id and private.has_position_capability('gender.analysis.manage',auth.uid(),g.body_id,g.project_id)
));
drop policy if exists gender_analysis_documents_delete on public.gender_analysis_documents;
create policy gender_analysis_documents_delete on public.gender_analysis_documents for delete to authenticated
using (exists(select 1 from public.gender_analysis_records g where g.id=analysis_id and private.has_position_capability('gender.analysis.manage',auth.uid(),g.body_id,g.project_id)));

create table if not exists public.meal_report_quality_reviews(
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.task_reports(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id),
  verdict text not null check(verdict in ('valid','invalid','revise')),
  quality_score numeric(5,2) check(quality_score between 0 and 100),
  completeness_score numeric(5,2) check(completeness_score between 0 and 100),
  consistency_score numeric(5,2) check(consistency_score between 0 and 100),
  timeliness_score numeric(5,2) check(timeliness_score between 0 and 100),
  comments text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(report_id,reviewer_id)
);
alter table public.meal_report_quality_reviews enable row level security;
drop policy if exists meal_quality_select on public.meal_report_quality_reviews;
create policy meal_quality_select on public.meal_report_quality_reviews for select to authenticated
using (private.can_view_task_report(report_id));
drop policy if exists meal_quality_write on public.meal_report_quality_reviews;
create policy meal_quality_write on public.meal_report_quality_reviews for all to authenticated
using (reviewer_id=auth.uid() and (private.has_position_capability('meal.manage',auth.uid(),null,null) or private.is_super_admin(auth.uid())))
with check (reviewer_id=auth.uid() and (private.has_position_capability('meal.manage',auth.uid(),null,null) or private.is_super_admin(auth.uid())));

create table if not exists public.report_collaboration_sessions(
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null unique references public.task_reports(id) on delete cascade,
  owner_id uuid not null references public.profiles(id),
  status text not null default 'open' check(status in ('open','locked','finalized','cancelled')),
  live_html text not null default '',
  revision bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finalized_at timestamptz
);
create table if not exists public.report_collaborators(
  session_id uuid not null references public.report_collaboration_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  access_level text not null default 'edit' check(access_level in ('view','comment','edit')),
  invited_by uuid not null references public.profiles(id),
  invited_at timestamptz not null default now(),
  last_seen_at timestamptz,
  primary key(session_id,user_id)
);
create table if not exists public.report_collaboration_changes(
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.report_collaboration_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  revision_before bigint not null,
  revision_after bigint not null,
  content_html text not null,
  note text,
  disposition text not null default 'unreviewed' check(disposition in ('unreviewed','accepted','rejected')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.report_collaboration_comments(
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.report_collaboration_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  body text not null check(char_length(btrim(body)) between 1 and 5000),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create or replace function private.can_access_report_collaboration(target_session uuid, uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path=''
as $$ select private.is_active_approved_user(uid) and exists(
  select 1 from public.report_collaboration_sessions s
  where s.id=target_session and (s.owner_id=uid or exists(select 1 from public.report_collaborators c where c.session_id=s.id and c.user_id=uid))
); $$;
create or replace function private.can_edit_report_collaboration(target_session uuid, uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path=''
as $$ select private.can_access_report_collaboration(target_session,uid) and exists(
  select 1 from public.report_collaboration_sessions s where s.id=target_session and s.status='open' and (
    s.owner_id=uid or exists(select 1 from public.report_collaborators c where c.session_id=s.id and c.user_id=uid and c.access_level='edit')
  )
); $$;

alter table public.report_collaboration_sessions enable row level security;
alter table public.report_collaborators enable row level security;
alter table public.report_collaboration_changes enable row level security;
alter table public.report_collaboration_comments enable row level security;
drop policy if exists collab_session_select on public.report_collaboration_sessions;
create policy collab_session_select on public.report_collaboration_sessions for select to authenticated using(private.can_access_report_collaboration(id));
drop policy if exists collab_members_select on public.report_collaborators;
create policy collab_members_select on public.report_collaborators for select to authenticated using(private.can_access_report_collaboration(session_id));
drop policy if exists collab_changes_select on public.report_collaboration_changes;
create policy collab_changes_select on public.report_collaboration_changes for select to authenticated using(private.can_access_report_collaboration(session_id));
drop policy if exists collab_comments_select on public.report_collaboration_comments;
create policy collab_comments_select on public.report_collaboration_comments for select to authenticated using(private.can_access_report_collaboration(session_id));

create or replace function public.assign_profile_to_position_slot_v2(
 target_slot_id uuid,target_profile_id uuid,target_decision_reference text,target_start_date date default current_date,
 target_assignment_nature text default 'regular',target_end_date date default null,target_acting_reason text default null,target_notes text default null
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare s public.position_slots%rowtype; aid uuid; supaid uuid; cnt int; pname text; nature text:=coalesce(target_assignment_nature,'regular');
begin
 if auth.uid() is null then raise exception 'Authentification requise'; end if;
 if nature not in ('regular','interim','acting','volunteer','intern','consultant','secondment') then raise exception 'Nature d’affectation invalide'; end if;
 select * into s from public.position_slots where id=target_slot_id and status not in('suspended','abolished') for update;
 if not found then raise exception 'Poste établi introuvable ou inactif'; end if;
 if not private.has_position_capability('staffing.assign',auth.uid(),s.body_id,s.project_id) then raise exception 'Affectation non autorisée dans ce périmètre'; end if;
 if char_length(btrim(coalesce(target_decision_reference,'')))<2 then raise exception 'Référence de décision obligatoire'; end if;
 if not exists(select 1 from public.profiles p where p.id=target_profile_id and p.status='active' and p.registration_state='approved') then raise exception 'Compte actif et approuvé requis'; end if;
 if exists(select 1 from public.position_assignments pa where pa.slot_id=s.id and pa.profile_id=target_profile_id and pa.status='active') then raise exception 'Cette personne occupe déjà ce poste'; end if;
 select count(*) into cnt from public.position_assignments pa where pa.slot_id=s.id and pa.status='active';
 if s.max_occupants is not null and cnt>=s.max_occupants then raise exception 'Nombre de titulaires atteint'; end if;
 if target_end_date is not null and target_end_date<coalesce(target_start_date,current_date) then raise exception 'La date de fin précède la prise d’effet'; end if;
 if nature in ('interim','acting') and target_end_date is null then raise exception 'Une affectation intérimaire doit avoir une date de fin prévue'; end if;
 if s.supervisor_slot_id is not null then select id into supaid from public.position_assignments where slot_id=s.supervisor_slot_id and status='active' and start_date<=current_date and (end_date is null or end_date>=current_date) order by start_date desc limit 1; end if;
 insert into public.position_assignments(position_id,body_id,profile_id,supervisor_assignment_id,territory,decision_reference,start_date,end_date,status,appointed_by,slot_id,assignment_nature,acting_reason,assignment_notes)
 values(s.position_id,s.body_id,target_profile_id,supaid,(select coalesce(region,territory,locality) from public.governance_bodies where id=s.body_id),btrim(target_decision_reference),coalesce(target_start_date,current_date),target_end_date,'active',auth.uid(),s.id,nature,nullif(btrim(coalesce(target_acting_reason,'')),''),nullif(btrim(coalesce(target_notes,'')),'')) returning id into aid;
 perform private.refresh_position_slot_status(s.id);
 insert into public.institutional_position_events(slot_id,assignment_id,actor_id,event_type,metadata) values(s.id,aid,auth.uid(),'assigned',jsonb_build_object('profile_id',target_profile_id,'decision_reference',target_decision_reference,'start_date',target_start_date,'assignment_nature',nature,'end_date',target_end_date));
 if target_profile_id<>auth.uid() then insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id)
 values(target_profile_id,case when nature in('interim','acting') then 'Nouvel intérim / suppléance AIAC' else 'Nouvelle affectation à un poste AIAC' end,(select pd.title||' · '||gb.code from public.position_definitions pd join public.governance_bodies gb on gb.id=s.body_id where pd.id=s.position_id),'/espace/poste?section=dashboard','position','position_assignment',aid); end if;
 return aid;
end $$;
grant execute on function public.assign_profile_to_position_slot_v2(uuid,uuid,text,date,text,date,text,text) to authenticated;

create or replace function public.hr_personnel_catalog() returns table(
 profile_id uuid,full_name text,email text,phone text,account_role text,assignment_id uuid,assignment_nature text,position_id uuid,position_code text,position_title text,role_key text,slot_id uuid,slot_code text,body_id uuid,body_code text,body_name text,region text,locality text,program_id uuid,program_code text,project_id uuid,project_code text,decision_reference text,start_date date,end_date date,assignment_status text
) language plpgsql security definer set search_path='' as $$
declare full_access boolean;
begin
 if not private.is_active_approved_user(auth.uid()) then raise exception 'Accès refusé'; end if;
 if not (private.has_position_capability('staffing.view',auth.uid(),null,null) or private.has_position_capability('hr.manage',auth.uid(),null,null) or private.is_super_admin(auth.uid())) then raise exception 'Annuaire RH non autorisé'; end if;
 full_access:=private.has_position_capability('hr.manage',auth.uid(),null,null) or private.has_position_capability('staffing.assign',auth.uid(),null,null) or private.is_super_admin(auth.uid());
 return query select p.id,p.full_name,case when full_access then p.email else null end,case when full_access then p.phone else null end,p.role,
 pa.id,pa.assignment_nature,pd.id,pd.code,pd.title,pd.role_key,ps.id,ps.slot_code,gb.id,gb.code,gb.name,gb.region,gb.locality,ps.program_id,prg.code,ps.project_id,pr.code,pa.decision_reference,pa.start_date,pa.end_date,pa.status
 from public.position_assignments pa join public.profiles p on p.id=pa.profile_id join public.position_definitions pd on pd.id=pa.position_id
 left join public.position_slots ps on ps.id=pa.slot_id join public.governance_bodies gb on gb.id=pa.body_id
 left join public.programs prg on prg.id=ps.program_id left join public.projects pr on pr.id=ps.project_id
 where p.status='active' order by p.full_name nulls last,pd.title,pa.start_date desc;
end $$;
grant execute on function public.hr_personnel_catalog() to authenticated;

create or replace function public.hr_profile_organizational_cv(target_profile_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare allowed boolean; result jsonb;
begin
 allowed:=target_profile_id=auth.uid() or private.has_position_capability('hr.manage',auth.uid(),null,null) or private.has_position_capability('staffing.assign',auth.uid(),null,null) or private.is_super_admin(auth.uid());
 if not allowed then raise exception 'Fiche RH non autorisée'; end if;
 select jsonb_build_object(
  'profile',jsonb_build_object('id',p.id,'full_name',p.full_name,'email',p.email,'phone',p.phone,'role',p.role,'organization',p.organization,'status',p.status),
  'assignments',coalesce((select jsonb_agg(jsonb_build_object('assignment_id',pa.id,'position_code',pd.code,'position_title',pd.title,'role_key',pd.role_key,'body_code',gb.code,'body_name',gb.name,'slot_code',ps.slot_code,'project_code',pr.code,'program_code',pg.code,'assignment_nature',pa.assignment_nature,'decision_reference',pa.decision_reference,'start_date',pa.start_date,'end_date',pa.end_date,'status',pa.status,'acting_reason',pa.acting_reason) order by pa.start_date desc) from public.position_assignments pa join public.position_definitions pd on pd.id=pa.position_id join public.governance_bodies gb on gb.id=pa.body_id left join public.position_slots ps on ps.id=pa.slot_id left join public.projects pr on pr.id=ps.project_id left join public.programs pg on pg.id=ps.program_id where pa.profile_id=p.id),'[]'::jsonb),
  'reports',coalesce((select jsonb_agg(jsonb_build_object('report_id',tr.id,'report_number',tr.report_number,'title',tr.title,'status',tr.status,'execution_date',tr.execution_date,'task_id',tr.task_id,'task_code',at.task_code,'task_title',at.task_title) order by tr.execution_date desc nulls last,tr.created_at desc) from public.task_reports tr left join public.activity_tasks at on at.id=tr.task_id where tr.reporter_id=p.id),'[]'::jsonb),
  'meetings_led',coalesce((select jsonb_agg(jsonb_build_object('meeting_id',m.id,'code',m.code,'title',m.title,'starts_at',m.starts_at,'status',m.status) order by m.starts_at desc) from public.meetings m where m.organizer_id=p.id),'[]'::jsonb)
 ) into result from public.profiles p where p.id=target_profile_id;
 if result is null then raise exception 'Profil introuvable'; end if; return result;
end $$;
grant execute on function public.hr_profile_organizational_cv(uuid) to authenticated;

create or replace function public.meal_reporting_dashboard() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not (private.has_position_capability('meal.manage',auth.uid(),null,null) or private.has_position_capability('report.view_scope',auth.uid(),null,null) or private.is_super_admin(auth.uid())) then raise exception 'Accès SERA/MEAL non autorisé'; end if;
 return jsonb_build_object(
  'reports_total',(select count(*) from public.task_reports tr where private.can_view_task_report(tr.id)),
  'submitted',(select count(*) from public.task_reports tr where tr.status='submitted' and private.can_view_task_report(tr.id)),
  'approved',(select count(*) from public.task_reports tr where tr.status='approved' and private.can_view_task_report(tr.id)),
  'returned',(select count(*) from public.task_reports tr where tr.status in('returned','rejected') and private.can_view_task_report(tr.id)),
  'quality_reviews',(select count(*) from public.meal_report_quality_reviews q where private.can_view_task_report(q.report_id)),
  'invalidated',(select count(*) from public.meal_report_quality_reviews q where q.verdict='invalid' and private.can_view_task_report(q.report_id)),
  'indicators',(select count(*) from public.task_report_indicators i where private.can_view_task_report(i.report_id)),
  'recent',coalesce((select jsonb_agg(x) from (select jsonb_build_object('id',tr.id,'number',tr.report_number,'title',tr.title,'status',tr.status,'execution_date',tr.execution_date,'reporter',p.full_name,'quality_verdict',(select q.verdict from public.meal_report_quality_reviews q where q.report_id=tr.id order by q.updated_at desc limit 1),'quality_score',(select q.quality_score from public.meal_report_quality_reviews q where q.report_id=tr.id order by q.updated_at desc limit 1)) x from public.task_reports tr join public.profiles p on p.id=tr.reporter_id where private.can_view_task_report(tr.id) order by tr.created_at desc limit 100) s),'[]'::jsonb)
 );
end $$;
grant execute on function public.meal_reporting_dashboard() to authenticated;

create or replace function public.meal_review_report(target_report_id uuid,target_verdict text,target_quality_score numeric,target_completeness_score numeric,target_consistency_score numeric,target_timeliness_score numeric,target_comments text default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare rid uuid;
begin
 if not (private.has_position_capability('meal.manage',auth.uid(),null,null) or private.is_super_admin(auth.uid())) then raise exception 'Contrôle qualité SERA/MEAL non autorisé'; end if;
 if target_verdict not in('valid','invalid','revise') then raise exception 'Verdict invalide'; end if;
 if not private.can_view_task_report(target_report_id) then raise exception 'Rapport inaccessible'; end if;
 insert into public.meal_report_quality_reviews(report_id,reviewer_id,verdict,quality_score,completeness_score,consistency_score,timeliness_score,comments)
 values(target_report_id,auth.uid(),target_verdict,target_quality_score,target_completeness_score,target_consistency_score,target_timeliness_score,nullif(btrim(coalesce(target_comments,'')),''))
 on conflict(report_id,reviewer_id) do update set verdict=excluded.verdict,quality_score=excluded.quality_score,completeness_score=excluded.completeness_score,consistency_score=excluded.consistency_score,timeliness_score=excluded.timeliness_score,comments=excluded.comments,updated_at=now()
 returning id into rid;
 insert into public.task_report_events(report_id,actor_id,event_type,metadata) values(target_report_id,auth.uid(),'meal_quality_review',jsonb_build_object('verdict',target_verdict,'quality_score',target_quality_score));
 return rid;
end $$;
grant execute on function public.meal_review_report(uuid,text,numeric,numeric,numeric,numeric,text) to authenticated;

create or replace function public.start_report_collaboration(target_report_id uuid,target_user_ids uuid[] default '{}',target_access_level text default 'edit') returns uuid
language plpgsql security definer set search_path='' as $$
declare sid uuid; base_html text;
begin
 if target_access_level not in('view','comment','edit') then raise exception 'Niveau invalide'; end if;
 select coalesce(rich_content_html,'') into base_html from public.task_reports where id=target_report_id and reporter_id=auth.uid() and status in('draft','returned');
 if not found then raise exception 'Seul l’auteur peut ouvrir une collaboration sur un brouillon ou rapport retourné'; end if;
 insert into public.report_collaboration_sessions(report_id,owner_id,live_html) values(target_report_id,auth.uid(),base_html)
 on conflict(report_id) do update set status='open',updated_at=now() returning id into sid;
 insert into public.report_collaborators(session_id,user_id,access_level,invited_by)
 select sid,u,target_access_level,auth.uid() from unnest(coalesce(target_user_ids,'{}'::uuid[])) u
 join public.profiles p on p.id=u and p.status='active' and p.registration_state='approved'
 where u<>auth.uid()
 on conflict(session_id,user_id) do update set access_level=excluded.access_level,invited_by=excluded.invited_by,invited_at=now();
 insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id)
 select c.user_id,'Contribution demandée sur un rapport','Un collègue vous invite à contribuer à un brouillon avant soumission.','/espace/terrain/complet?mode=collaboration','report_collaboration','report_collaboration',sid
 from public.report_collaborators c where c.session_id=sid and c.invited_by=auth.uid();
 return sid;
end $$;
grant execute on function public.start_report_collaboration(uuid,uuid[],text) to authenticated;

create or replace function public.save_report_collaboration(target_session_id uuid,target_expected_revision bigint,target_html text,target_note text default null) returns bigint
language plpgsql security definer set search_path='' as $$
declare oldrev bigint; newrev bigint;
begin
 if not private.can_edit_report_collaboration(target_session_id) then raise exception 'Modification non autorisée'; end if;
 select revision into oldrev from public.report_collaboration_sessions where id=target_session_id for update;
 if oldrev<>target_expected_revision then raise exception 'Le document a changé. Rechargez la dernière version avant de fusionner votre modification.'; end if;
 newrev:=oldrev+1;
 update public.report_collaboration_sessions set live_html=target_html,revision=newrev,updated_at=now() where id=target_session_id;
 insert into public.report_collaboration_changes(session_id,user_id,revision_before,revision_after,content_html,note) values(target_session_id,auth.uid(),oldrev,newrev,target_html,nullif(btrim(coalesce(target_note,'')),''));
 return newrev;
end $$;
grant execute on function public.save_report_collaboration(uuid,bigint,text,text) to authenticated;

create or replace function public.finalize_report_collaboration(target_session_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare s public.report_collaboration_sessions%rowtype;
begin
 select * into s from public.report_collaboration_sessions where id=target_session_id for update;
 if not found or s.owner_id<>auth.uid() then raise exception 'Seul l’auteur peut finaliser'; end if;
 if s.status<>'open' then raise exception 'Session non ouverte'; end if;
 update public.task_reports set rich_content_html=s.live_html,updated_at=now() where id=s.report_id and reporter_id=auth.uid() and status in('draft','returned');
 update public.report_collaboration_sessions set status='finalized',finalized_at=now(),updated_at=now() where id=s.id;
 insert into public.task_report_events(report_id,actor_id,event_type,metadata) values(s.report_id,auth.uid(),'collaboration_finalized',jsonb_build_object('revision',s.revision));
 return true;
end $$;
grant execute on function public.finalize_report_collaboration(uuid) to authenticated;