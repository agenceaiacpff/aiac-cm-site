-- AIAC — Validation collégiale des rapports du PCA par le Conseil d'administration.
-- Le rattachement opérationnel du rapport reste inchangé; l'autorité de validation est distincte.

alter table public.task_reports
  add column if not exists validation_authority_type text not null default 'hierarchical',
  add column if not exists validation_authority_body_id uuid references public.governance_bodies(id) on delete restrict;

alter table public.task_reports drop constraint if exists task_reports_validation_authority_type_check;
alter table public.task_reports add constraint task_reports_validation_authority_type_check
  check (validation_authority_type in ('hierarchical','collective_body'));
alter table public.task_reports drop constraint if exists task_reports_validation_authority_body_check;
alter table public.task_reports add constraint task_reports_validation_authority_body_check
  check (validation_authority_type='hierarchical' or (validation_authority_type='collective_body' and validation_authority_body_id is not null));
create index if not exists task_reports_validation_authority_idx
  on public.task_reports(validation_authority_type,validation_authority_body_id,status);

alter table public.task_report_approvals
  add column if not exists authority_type text not null default 'individual_hierarchy',
  add column if not exists authority_body_id uuid references public.governance_bodies(id) on delete restrict,
  add column if not exists authority_name text,
  add column if not exists decision_reference text,
  add column if not exists decision_date date not null default current_date;

alter table public.task_report_approvals drop constraint if exists task_report_approvals_authority_type_check;
alter table public.task_report_approvals add constraint task_report_approvals_authority_type_check
  check (authority_type in ('individual_hierarchy','collective_body'));
alter table public.task_report_approvals drop constraint if exists task_report_approvals_decision_reference_check;
alter table public.task_report_approvals add constraint task_report_approvals_decision_reference_check
  check (decision_reference is null or char_length(btrim(decision_reference)) between 2 and 300);
create index if not exists task_report_approvals_authority_idx
  on public.task_report_approvals(authority_type,authority_body_id,decision_date);

create or replace function private.is_active_body_validator(target_body_id uuid, uid uuid default auth.uid())
returns boolean
language sql stable security definer set search_path='' as $$
  select private.is_active_approved_user(uid) and (
    exists(
      select 1 from public.position_assignments pa
      join public.position_definitions pd on pd.id=pa.position_id
      where pa.profile_id=uid and pa.body_id=target_body_id and pa.status='active'
        and pa.start_date<=current_date and (pa.end_date is null or pa.end_date>=current_date)
        and pd.status='active'
    )
    or exists(
      select 1 from public.body_memberships bm
      join public.institutional_members im on im.id=bm.member_id
      where bm.body_id=target_body_id and im.profile_id=uid
        and bm.status='active' and im.status='active' and bm.voting_rights=true
        and bm.start_date<=current_date and (bm.end_date is null or bm.end_date>=current_date)
    )
  );
$$;
revoke all on function private.is_active_body_validator(uuid,uuid) from public,anon;
grant execute on function private.is_active_body_validator(uuid,uuid) to authenticated;

create or replace function private.is_current_pca(uid uuid default auth.uid())
returns boolean
language sql stable security definer set search_path='' as $$
  select private.is_active_approved_user(uid) and exists(
    select 1 from public.position_assignments pa
    join public.position_definitions pd on pd.id=pa.position_id
    join public.governance_bodies gb on gb.id=pa.body_id
    where pa.profile_id=uid and pa.status='active'
      and pa.start_date<=current_date and (pa.end_date is null or pa.end_date>=current_date)
      and pd.status='active' and pd.code='CA-PCA' and gb.code='CA' and gb.status='active'
  );
$$;
revoke all on function private.is_current_pca(uuid) from public,anon;
grant execute on function private.is_current_pca(uuid) to authenticated;

create or replace function private.resolve_task_report_context()
returns trigger
language plpgsql security definer set search_path='' as $$
declare resolved_supervisor uuid; resolved_body uuid; ca_body uuid;
begin
  if new.reporter_id is null then new.reporter_id:=auth.uid(); end if;
  select pg.body_id into resolved_body
  from public.activity_tasks t
  join public.activities a on a.id=t.activity_id
  join public.projects pr on pr.id=a.project_id
  join public.programs pg on pg.id=pr.program_id
  where t.id=new.task_id;

  if private.is_current_pca(new.reporter_id) then
    select id into ca_body from public.governance_bodies
    where code='CA' and status='active' order by created_at limit 1;
    if ca_body is null then raise exception 'Conseil d’administration actif introuvable'; end if;
    new.supervisor_id:=null;
    new.body_id:=resolved_body;
    new.validation_authority_type:='collective_body';
    new.validation_authority_body_id:=ca_body;
    return new;
  end if;

  select wa.supervisor_id into resolved_supervisor
  from public.workforce_assignments wa
  where wa.profile_id=new.reporter_id and wa.body_id=resolved_body and wa.status='active'
    and wa.start_date<=current_date and (wa.end_date is null or wa.end_date>=current_date)
  order by wa.start_date desc limit 1;

  if resolved_supervisor is null then
    select spa.profile_id into resolved_supervisor
    from public.position_assignments pa
    left join public.position_assignments spa on spa.id=pa.supervisor_assignment_id and spa.status='active'
    where pa.profile_id=new.reporter_id and pa.body_id=resolved_body and pa.status='active'
      and pa.start_date<=current_date and (pa.end_date is null or pa.end_date>=current_date)
    order by pa.start_date desc limit 1;
  end if;

  if resolved_supervisor is null then
    select coalesce(case when a.manager_id<>new.reporter_id then a.manager_id end,
                    case when pg.manager_id<>new.reporter_id then pg.manager_id end)
    into resolved_supervisor
    from public.activity_tasks t
    join public.activities a on a.id=t.activity_id
    join public.projects pr on pr.id=a.project_id
    join public.programs pg on pg.id=pr.program_id
    where t.id=new.task_id;
  end if;

  new.supervisor_id:=resolved_supervisor;
  new.body_id:=resolved_body;
  new.validation_authority_type:='hierarchical';
  new.validation_authority_body_id:=null;
  return new;
end;
$$;

create or replace function private.can_review_task_report(target_id uuid, uid uuid default auth.uid())
returns boolean
language sql stable security definer set search_path='' as $$
  select private.is_active_user(uid) and exists(
    select 1
    from public.task_reports r
    join public.activity_tasks t on t.id=r.task_id
    join public.activities a on a.id=t.activity_id
    join public.projects pr on pr.id=a.project_id
    join public.programs pg on pg.id=pr.program_id
    where r.id=target_id and r.reporter_id<>uid and (
      (r.validation_authority_type='collective_body' and r.validation_authority_body_id is not null
        and private.is_active_body_validator(r.validation_authority_body_id,uid))
      or
      (r.validation_authority_type<>'collective_body' and (
        (private.is_admin(uid) and case when uid=auth.uid() then private.has_aal2() else true end)
        or r.supervisor_id=uid or a.manager_id=uid or pg.manager_id=uid
        or exists(select 1 from public.project_members pm where pm.project_id=pr.id and pm.user_id=uid and pm.member_role='lead')
      ))
    )
  );
$$;

create or replace function private.protect_task_report_fields()
returns trigger
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
     or new.validation_authority_type is distinct from old.validation_authority_type
     or new.validation_authority_body_id is distinct from old.validation_authority_body_id
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

update public.task_reports r
set validation_authority_type='collective_body', validation_authority_body_id=ca.id,
    supervisor_id=null, updated_at=now()
from public.governance_bodies ca
where ca.code='CA' and ca.status='active' and private.is_current_pca(r.reporter_id)
  and (r.validation_authority_type is distinct from 'collective_body'
       or r.validation_authority_body_id is distinct from ca.id or r.supervisor_id is not null);

create or replace function public.review_task_report_collective(
  target_report_id uuid, decision text, review_comment text, decision_reference text,
  decision_date date default current_date, require_evidence boolean default false
)
returns public.task_reports
language plpgsql security definer set search_path='' as $$
declare
  r public.task_reports%rowtype;
  actor public.profiles%rowtype;
  authority public.governance_bodies%rowtype;
  signature_path text;
  normalized_comment text;
  normalized_reference text;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if decision not in ('approved','returned') then raise exception 'Décision invalide'; end if;
  normalized_comment:=nullif(btrim(coalesce(review_comment,'')),'');
  normalized_reference:=nullif(btrim(coalesce(decision_reference,'')),'');
  if normalized_reference is null or char_length(normalized_reference)<2 then raise exception 'La référence de décision / PV est obligatoire'; end if;
  if decision='returned' and (normalized_comment is null or char_length(normalized_comment)<5) then raise exception 'Précisez les corrections demandées'; end if;
  if require_evidence and (normalized_comment is null or char_length(normalized_comment)<5) then raise exception 'Motivez la demande de preuve'; end if;

  select * into r from public.task_reports where id=target_report_id for update;
  if not found then raise exception 'Rapport introuvable'; end if;
  if r.status<>'submitted' then raise exception 'Le rapport n’est pas en attente de validation'; end if;
  if r.validation_authority_type<>'collective_body' or r.validation_authority_body_id is null then raise exception 'Ce rapport ne relève pas d’une validation collégiale'; end if;
  if not private.can_review_task_report(r.id,auth.uid()) then raise exception 'Vous n’êtes pas habilité à enregistrer la décision de cet organe'; end if;

  select * into actor from public.profiles where id=auth.uid() and status='active';
  if not found then raise exception 'Compte actif introuvable'; end if;
  select * into authority from public.governance_bodies where id=r.validation_authority_body_id and status='active';
  if not found then raise exception 'Autorité de validation inactive ou introuvable'; end if;
  signature_path:=private.default_signature_asset(auth.uid());
  if signature_path is null then raise exception 'Une signature officielle active est requise pour enregistrer la décision du Conseil d’administration'; end if;

  perform set_config('aiac.task_report_workflow','on',true);
  if decision='approved' then
    update public.task_reports set status='approved',approved_at=now(),approved_by=auth.uid(),returned_at=null,
      evidence_required_by_reviewer=false,evidence_requirement_comment=null
    where id=r.id returning * into r;
  else
    update public.task_reports set status='returned',returned_at=now(),approved_at=null,approved_by=null,
      evidence_required_by_reviewer=require_evidence,
      evidence_requirement_comment=case when require_evidence then normalized_comment else null end
    where id=r.id returning * into r;
  end if;

  insert into public.task_report_approvals(
    report_id,revision,actor_id,decision,actor_name,actor_role,actor_body_id,comment,
    signature_name,signature_asset_path,content_hash,authority_type,authority_body_id,
    authority_name,decision_reference,decision_date
  ) values (
    r.id,r.revision,auth.uid(),decision,coalesce(nullif(actor.full_name,''),actor.email,'Membre du Conseil d’administration'),
    actor.role,r.validation_authority_body_id,normalized_comment,
    coalesce(nullif(actor.full_name,''),actor.email,'Membre du Conseil d’administration'),signature_path,r.current_hash,
    'collective_body',r.validation_authority_body_id,authority.name,normalized_reference,decision_date
  );

  insert into public.task_report_events(report_id,actor_id,event_type,from_status,to_status,comment,metadata)
  values(r.id,auth.uid(),decision,'submitted',decision,normalized_comment,
    jsonb_build_object('authority_type','collective_body','authority_body_id',r.validation_authority_body_id,
      'authority_name',authority.name,'decision_reference',normalized_reference,'decision_date',decision_date,'recorded_by',auth.uid()));

  insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id)
  values(r.reporter_id,
    case when decision='approved' then 'Rapport approuvé par le Conseil d’administration' else 'Rapport retourné par le Conseil d’administration' end,
    case when decision='approved' then r.report_number||' a été approuvé. Référence : '||normalized_reference
         else r.report_number||' a été retourné pour correction. Référence : '||normalized_reference end,
    '/espace/terrain/complet?report='||r.id::text,'task_report_validation','task_report',r.id);
  perform set_config('aiac.task_report_workflow','off',true);
  return r;
end;
$$;
revoke all on function public.review_task_report_collective(uuid,text,text,text,date,boolean) from public,anon;
grant execute on function public.review_task_report_collective(uuid,text,text,text,date,boolean) to authenticated;

create or replace function private.notify_collective_report_validators()
returns trigger
language plpgsql security definer set search_path='' as $$
declare validator_id uuid; authority_name text;
begin
  if new.status<>'submitted' or new.validation_authority_type<>'collective_body' or new.validation_authority_body_id is null then return new; end if;
  if tg_op='UPDATE' and old.status='submitted' then return new; end if;
  select name into authority_name from public.governance_bodies where id=new.validation_authority_body_id;
  for validator_id in
    select distinct candidate.uid from (
      select pa.profile_id as uid from public.position_assignments pa
      join public.position_definitions pd on pd.id=pa.position_id and pd.status='active'
      where pa.body_id=new.validation_authority_body_id and pa.profile_id is not null and pa.status='active'
        and pa.start_date<=current_date and (pa.end_date is null or pa.end_date>=current_date)
      union
      select im.profile_id from public.body_memberships bm
      join public.institutional_members im on im.id=bm.member_id
      where bm.body_id=new.validation_authority_body_id and im.profile_id is not null
        and bm.status='active' and im.status='active' and bm.voting_rights=true
        and bm.start_date<=current_date and (bm.end_date is null or bm.end_date>=current_date)
    ) candidate
    join public.profiles p on p.id=candidate.uid
    where candidate.uid<>new.reporter_id and p.status='active' and p.registration_state='approved'
  loop
    if not exists(select 1 from public.notifications n where n.user_id=validator_id
      and n.category='task_report_validation' and n.entity_type='task_report' and n.entity_id=new.id and n.read_at is null) then
      insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id)
      values(validator_id,'Décision du '||coalesce(authority_name,'Conseil d’administration')||' à enregistrer',
        new.report_number||' est soumis à la validation collégiale.',
        '/espace/terrain/complet?report='||new.id::text||'&mode=validation','task_report_validation','task_report',new.id);
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists task_reports_collective_validation_notification on public.task_reports;
create trigger task_reports_collective_validation_notification
after insert or update of status on public.task_reports
for each row execute function private.notify_collective_report_validators();

-- Rattrapage des notifications pour les rapports collectifs déjà soumis.
do $$
declare r public.task_reports%rowtype; validator_id uuid; authority_name text;
begin
  for r in select * from public.task_reports where status='submitted' and validation_authority_type='collective_body' and validation_authority_body_id is not null
  loop
    select name into authority_name from public.governance_bodies where id=r.validation_authority_body_id;
    for validator_id in
      select distinct candidate.uid from (
        select pa.profile_id as uid from public.position_assignments pa
        join public.position_definitions pd on pd.id=pa.position_id and pd.status='active'
        where pa.body_id=r.validation_authority_body_id and pa.profile_id is not null and pa.status='active'
          and pa.start_date<=current_date and (pa.end_date is null or pa.end_date>=current_date)
        union
        select im.profile_id from public.body_memberships bm
        join public.institutional_members im on im.id=bm.member_id
        where bm.body_id=r.validation_authority_body_id and im.profile_id is not null
          and bm.status='active' and im.status='active' and bm.voting_rights=true
          and bm.start_date<=current_date and (bm.end_date is null or bm.end_date>=current_date)
      ) candidate
      join public.profiles p on p.id=candidate.uid
      where candidate.uid<>r.reporter_id and p.status='active' and p.registration_state='approved'
    loop
      if not exists(select 1 from public.notifications n where n.user_id=validator_id
        and n.category='task_report_validation' and n.entity_type='task_report' and n.entity_id=r.id and n.read_at is null) then
        insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id)
        values(validator_id,'Décision du '||coalesce(authority_name,'Conseil d’administration')||' à enregistrer',
          r.report_number||' est soumis à la validation collégiale.',
          '/espace/terrain/complet?report='||r.id::text||'&mode=validation','task_report_validation','task_report',r.id);
      end if;
    end loop;
  end loop;
end $$;
