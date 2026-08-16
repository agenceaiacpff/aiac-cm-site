create table if not exists public.report_validation_mandates (
  id uuid primary key default gen_random_uuid(),
  authority_body_id uuid not null references public.governance_bodies(id) on delete restrict,
  subject_profile_id uuid not null references public.profiles(id) on delete restrict,
  mandate_code text not null unique,
  pv_reference text not null unique,
  resolution_reference text not null,
  title text not null,
  authority_name text not null default 'Conseil d’administration',
  adopted_on date not null,
  effective_from date not null,
  effective_until date,
  scope_summary text not null,
  document_text text not null,
  signed_pdf_file_name text,
  signed_pdf_sha256 text,
  signed_docx_file_name text,
  signed_docx_sha256 text,
  status text not null default 'active' check (status in ('active','revoked','expired')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_until is null or effective_until >= effective_from),
  check (signed_pdf_sha256 is null or char_length(signed_pdf_sha256)=64),
  check (signed_docx_sha256 is null or char_length(signed_docx_sha256)=64)
);

create table if not exists public.report_validation_mandate_members (
  mandate_id uuid not null references public.report_validation_mandates(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'accepted' check (status in ('pending','accepted','revoked')),
  accepted_at timestamptz,
  acceptance_reference text,
  created_at timestamptz not null default now(),
  primary key (mandate_id, profile_id)
);

alter table public.task_report_approvals
  add column if not exists mandate_id uuid references public.report_validation_mandates(id) on delete set null,
  add column if not exists mandate_reference text,
  add column if not exists validation_reference text;

create sequence if not exists public.task_report_collective_validation_seq start 1;

alter table public.report_validation_mandates enable row level security;
alter table public.report_validation_mandate_members enable row level security;

drop policy if exists report_validation_mandates_select on public.report_validation_mandates;
create policy report_validation_mandates_select on public.report_validation_mandates
for select to authenticated using (private.is_active_user(auth.uid()));

drop policy if exists report_validation_mandate_members_select on public.report_validation_mandate_members;
create policy report_validation_mandate_members_select on public.report_validation_mandate_members
for select to authenticated using (
  private.is_active_user(auth.uid()) and (profile_id=auth.uid() or private.is_admin(auth.uid()))
);

create or replace function public.my_report_validation_mandates(target_report_id uuid)
returns table(
  id uuid, mandate_code text, pv_reference text, resolution_reference text, title text,
  authority_name text, adopted_on date, effective_from date, effective_until date,
  scope_summary text, signed_pdf_file_name text, signed_pdf_sha256 text,
  member_status text, accepted_at timestamptz
)
language sql stable security definer set search_path=''
as $function$
  select m.id,m.mandate_code,m.pv_reference,m.resolution_reference,m.title,m.authority_name,
    m.adopted_on,m.effective_from,m.effective_until,m.scope_summary,
    m.signed_pdf_file_name,m.signed_pdf_sha256,mm.status,mm.accepted_at
  from public.task_reports r
  join public.report_validation_mandates m
    on m.authority_body_id=r.validation_authority_body_id
   and m.subject_profile_id=r.reporter_id
   and m.status='active'
   and m.effective_from<=current_date
   and (m.effective_until is null or m.effective_until>=current_date)
  join public.report_validation_mandate_members mm
    on mm.mandate_id=m.id and mm.profile_id=auth.uid() and mm.status='accepted'
  where r.id=target_report_id
    and r.status='submitted'
    and r.validation_authority_type='collective_body'
    and r.reporter_id<>auth.uid()
  order by m.effective_from desc,m.created_at desc;
$function$;

create or replace function public.review_task_report_collective_from_mandate(
  target_report_id uuid, decision text, review_comment text, mandate_id uuid,
  require_evidence boolean default false
)
returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare
  r public.task_reports%rowtype;
  m public.report_validation_mandates%rowtype;
  actor public.profiles%rowtype;
  signature_path text;
  actor_job text;
  normalized_comment text;
  validation_ref text;
  approval_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if decision not in ('approved','returned') then raise exception 'Décision invalide'; end if;
  normalized_comment:=nullif(btrim(coalesce(review_comment,'')),'');
  if decision='returned' and (normalized_comment is null or char_length(normalized_comment)<5) then raise exception 'Précisez les corrections demandées'; end if;
  if require_evidence and (normalized_comment is null or char_length(normalized_comment)<5) then raise exception 'Motivez la demande de preuve'; end if;

  select * into r from public.task_reports where id=target_report_id for update;
  if not found then raise exception 'Rapport introuvable'; end if;
  if r.status<>'submitted' then raise exception 'Le rapport n’est pas en attente de validation'; end if;
  if r.validation_authority_type<>'collective_body' or r.validation_authority_body_id is null then raise exception 'Ce rapport ne relève pas d’une validation collégiale'; end if;
  if r.reporter_id=auth.uid() then raise exception 'L’auteur ne peut pas valider son propre rapport'; end if;

  select * into m from public.report_validation_mandates
  where id=mandate_id and status='active'
    and authority_body_id=r.validation_authority_body_id
    and subject_profile_id=r.reporter_id
    and effective_from<=current_date
    and (effective_until is null or effective_until>=current_date);
  if not found then raise exception 'Ce PV d’habilitation n’est pas applicable à ce rapport'; end if;

  if not exists(select 1 from public.report_validation_mandate_members mm where mm.mandate_id=m.id and mm.profile_id=auth.uid() and mm.status='accepted') then
    raise exception 'Vous n’avez pas accepté ou reçu cette habilitation';
  end if;

  select * into actor from public.profiles where id=auth.uid() and status='active';
  if not found then raise exception 'Compte actif introuvable'; end if;
  signature_path:=private.default_signature_asset(auth.uid());
  if signature_path is null then raise exception 'Une signature officielle active est requise pour enregistrer la décision'; end if;

  select pd.title into actor_job
  from public.position_assignments pa join public.position_definitions pd on pd.id=pa.position_id
  where pa.profile_id=auth.uid() and pa.body_id=m.authority_body_id and pa.status='active'
    and pa.start_date<=current_date and (pa.end_date is null or pa.end_date>=current_date)
  order by pa.start_date desc limit 1;

  validation_ref := 'VAL-CA-'||to_char(current_date,'YYYY')||'-'||lpad(nextval('public.task_report_collective_validation_seq')::text,4,'0');
  perform set_config('aiac.task_report_workflow','on',true);
  if decision='approved' then
    update public.task_reports set status='approved',approved_at=now(),approved_by=auth.uid(),returned_at=null,evidence_required_by_reviewer=false,evidence_requirement_comment=null where id=r.id returning * into r;
  else
    update public.task_reports set status='returned',returned_at=now(),approved_at=null,approved_by=null,evidence_required_by_reviewer=require_evidence,evidence_requirement_comment=case when require_evidence then normalized_comment else null end where id=r.id returning * into r;
  end if;

  insert into public.task_report_approvals(
    report_id,revision,actor_id,decision,actor_name,actor_role,actor_job_title,actor_body_id,
    comment,signature_name,signature_asset_path,content_hash,authority_type,authority_body_id,
    authority_name,decision_reference,decision_date,mandate_id,mandate_reference,validation_reference
  ) values (
    r.id,r.revision,auth.uid(),decision,coalesce(nullif(actor.full_name,''),actor.email,'Membre du Conseil d’administration'),
    actor.role,actor_job,m.authority_body_id,normalized_comment,coalesce(nullif(actor.full_name,''),actor.email,'Membre du Conseil d’administration'),
    signature_path,r.current_hash,'collective_body',m.authority_body_id,m.authority_name,validation_ref,current_date,m.id,m.pv_reference,validation_ref
  ) returning id into approval_id;

  insert into public.task_report_events(report_id,actor_id,event_type,from_status,to_status,comment,metadata)
  values(r.id,auth.uid(),decision,'submitted',decision,normalized_comment,jsonb_build_object(
    'authority_type','collective_body','authority_body_id',m.authority_body_id,'authority_name',m.authority_name,
    'mandate_id',m.id,'mandate_reference',m.pv_reference,'resolution_reference',m.resolution_reference,
    'mandate_adopted_on',m.adopted_on,'validation_reference',validation_ref,'decision_date',current_date,'recorded_by',auth.uid()
  ));

  insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id)
  values(r.reporter_id,case when decision='approved' then 'Rapport approuvé par le Conseil d’administration' else 'Rapport retourné par le Conseil d’administration' end,
    r.report_number||case when decision='approved' then ' a été approuvé. ' else ' a été retourné pour correction. ' end||'Validation '||validation_ref||' · PV '||m.pv_reference,
    '/espace/terrain/complet?report='||r.id::text,'task_report_validation','task_report',r.id);
  perform set_config('aiac.task_report_workflow','off',true);

  return jsonb_build_object('report_id',r.id,'report_number',r.report_number,'status',r.status,'decision',decision,
    'validation_reference',validation_ref,'mandate_id',m.id,'mandate_reference',m.pv_reference,
    'resolution_reference',m.resolution_reference,'mandate_adopted_on',m.adopted_on,'decision_date',current_date,
    'authority_name',m.authority_name,'approval_id',approval_id);
end;
$function$;

revoke all on function public.my_report_validation_mandates(uuid) from public, anon;
grant execute on function public.my_report_validation_mandates(uuid) to authenticated;
revoke all on function public.review_task_report_collective_from_mandate(uuid,text,text,uuid,boolean) from public, anon;
grant execute on function public.review_task_report_collective_from_mandate(uuid,text,text,uuid,boolean) to authenticated;
