-- Dossiers de rapport riches, typés, exportables et publiables.
-- Extension additive du workflow signé existant.

alter table public.task_reports
  add column if not exists report_type text not null default 'task_execution',
  add column if not exists title text,
  add column if not exists period_start date,
  add column if not exists period_end date,
  add column if not exists rich_content_html text not null default '',
  add column if not exists public_content_id uuid references public.public_content_items(id) on delete set null,
  add column if not exists published_at timestamptz,
  add column if not exists published_by uuid references public.profiles(id) on delete set null;

alter table public.task_reports
  add constraint task_reports_report_type_check check (report_type in (
    'task_execution','activity','weekly_antenna','weekly_meeting','monthly_staff',
    'project','program','training','mission','monitoring_evaluation','other'
  )),
  add constraint task_reports_title_check check (title is null or char_length(btrim(title)) between 3 and 240),
  add constraint task_reports_period_check check (period_end is null or period_start is null or period_end>=period_start),
  add constraint task_reports_rich_content_check check (char_length(rich_content_html)<=4900000),
  add constraint task_reports_publication_state_check check (
    (public_content_id is null and published_at is null and published_by is null)
    or (public_content_id is not null and published_at is not null and published_by is not null)
  );

create unique index if not exists task_reports_public_content_unique
  on public.task_reports(public_content_id) where public_content_id is not null;

alter table public.public_content_items
  add column if not exists source_task_report_id uuid references public.task_reports(id) on delete set null;

create unique index if not exists public_content_source_task_report_unique
  on public.public_content_items(source_task_report_id) where source_task_report_id is not null;

alter table public.public_content_items drop constraint if exists public_content_items_content_check;
alter table public.public_content_items
  add constraint public_content_items_content_check check (char_length(btrim(content)) between 10 and 4900000);

create or replace function public.get_manageable_public_body_ids()
returns table(body_id uuid)
language sql
stable
security definer
set search_path=''
as $$
  select b.id
  from public.governance_bodies b
  where b.status='active' and private.can_manage_public_content(b.id)
  order by b.code;
$$;

revoke all on function public.get_manageable_public_body_ids() from public, anon, service_role;
grant execute on function public.get_manageable_public_body_ids() to authenticated;

drop policy if exists governance_bodies_public_subsidiary_select on public.governance_bodies;
create policy governance_bodies_public_active_select on public.governance_bodies for select to anon
using (status='active' and body_type in ('general_assembly','board','expanded_board','executive','executive_office','executive_council','subsidiary_body'));

create or replace function public.link_task_report_publication(target_report_id uuid,target_content_id uuid)
returns public.task_reports
language plpgsql
security definer
set search_path=''
as $$
declare
  report_row public.task_reports%rowtype;
  content_row public.public_content_items%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  select * into report_row from public.task_reports where id=target_report_id for update;
  if not found or report_row.status<>'approved' then raise exception 'Seul un rapport approuvé peut être publié'; end if;
  if not private.can_manage_public_content(report_row.body_id) then raise exception 'Droit de publication insuffisant pour cet organe'; end if;
  select * into content_row from public.public_content_items where id=target_content_id and source_task_report_id=target_report_id;
  if not found or content_row.body_id<>report_row.body_id or content_row.content_type<>'report' or content_row.status<>'published' then
    raise exception 'Publication publique invalide';
  end if;
  perform set_config('aiac.task_report_workflow','on',true);
  update public.task_reports set public_content_id=content_row.id,published_at=content_row.published_at,published_by=auth.uid()
  where id=report_row.id returning * into report_row;
  insert into public.task_report_events(report_id,actor_id,event_type,from_status,to_status,comment,metadata)
  values(report_row.id,auth.uid(),'published','approved','approved','Version publique anonymisée mise en ligne.',jsonb_build_object('public_content_id',content_row.id,'slug',content_row.slug));
  return report_row;
end;
$$;

revoke all on function public.link_task_report_publication(uuid,uuid) from public,anon;
grant execute on function public.link_task_report_publication(uuid,uuid) to authenticated;

alter table public.task_report_events drop constraint if exists task_report_events_event_type_check;
alter table public.task_report_events add constraint task_report_events_event_type_check
  check (event_type in ('created','updated','evidence_added','attendance_added','submitted','returned','resubmitted','approved','archived','published'));
