-- Institutional signature assets and statutory identity resolution.
-- Official seals remain private; every registration and revocation is audited.

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'aiac-signatures',
  'aiac-signatures',
  false,
  2097152,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

create table if not exists public.institutional_signature_assets (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  body_id uuid references public.governance_bodies(id) on delete restrict,
  asset_type text not null check (asset_type in ('signature','round_seal','nominal_seal','composite_signature')),
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  official_title text,
  decision_reference text,
  is_default boolean not null default true,
  status text not null default 'active' check (status in ('active','revoked')),
  valid_from date not null default current_date,
  valid_until date,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  revoked_by uuid references public.profiles(id) on delete restrict,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_until is null or valid_until >= valid_from),
  check ((status='active' and revoked_at is null and revoked_by is null) or status='revoked')
);

create unique index if not exists institutional_signature_assets_one_default_idx
  on public.institutional_signature_assets(profile_id,asset_type)
  where is_default and status='active';
create index if not exists institutional_signature_assets_profile_idx
  on public.institutional_signature_assets(profile_id,status,asset_type);
create index if not exists institutional_signature_assets_body_idx
  on public.institutional_signature_assets(body_id,status);

drop trigger if exists institutional_signature_assets_touch on public.institutional_signature_assets;
create trigger institutional_signature_assets_touch before update on public.institutional_signature_assets
for each row execute function private.touch_updated_at();
drop trigger if exists institutional_signature_assets_audit on public.institutional_signature_assets;
create trigger institutional_signature_assets_audit
after insert or update on public.institutional_signature_assets
for each row execute function private.audit_operational_change();

alter table public.institutional_signature_assets enable row level security;
revoke all on public.institutional_signature_assets from public,anon,authenticated;
grant select,insert,update on public.institutional_signature_assets to authenticated;

drop policy if exists institutional_signature_assets_select on public.institutional_signature_assets;
create policy institutional_signature_assets_select on public.institutional_signature_assets
for select to authenticated using ((select private.is_active_user()));

drop policy if exists institutional_signature_assets_insert on public.institutional_signature_assets;
create policy institutional_signature_assets_insert on public.institutional_signature_assets
for insert to authenticated with check (
  (select private.is_super_admin()) and (select private.has_aal2())
  and uploaded_by=(select auth.uid())
);

drop policy if exists institutional_signature_assets_update on public.institutional_signature_assets;
create policy institutional_signature_assets_update on public.institutional_signature_assets
for update to authenticated using (
  (select private.is_super_admin()) and (select private.has_aal2())
) with check (
  (select private.is_super_admin()) and (select private.has_aal2())
);

drop policy if exists aiac_signatures_select on storage.objects;
create policy aiac_signatures_select on storage.objects
for select to authenticated using (
  bucket_id='aiac-signatures' and (select private.is_active_user())
);

drop policy if exists aiac_signatures_insert on storage.objects;
create policy aiac_signatures_insert on storage.objects
for insert to authenticated with check (
  bucket_id='aiac-signatures'
  and (select private.is_super_admin())
  and (select private.has_aal2())
);

drop policy if exists aiac_signatures_update on storage.objects;
create policy aiac_signatures_update on storage.objects
for update to authenticated using (
  bucket_id='aiac-signatures'
  and (select private.is_super_admin())
  and (select private.has_aal2())
) with check (
  bucket_id='aiac-signatures'
  and (select private.is_super_admin())
  and (select private.has_aal2())
);

-- Storage objects are kept when an asset is revoked so old signed reports remain verifiable.

create or replace function private.default_signature_asset(target_profile_id uuid)
returns text language sql stable security definer set search_path='' as $$
  select a.storage_path
  from public.institutional_signature_assets a
  where a.profile_id=target_profile_id
    and a.status='active'
    and a.is_default
    and a.asset_type in ('signature','composite_signature')
    and a.valid_from<=current_date
    and (a.valid_until is null or a.valid_until>=current_date)
  order by case a.asset_type when 'signature' then 1 else 2 end,a.created_at desc
  limit 1
$$;
revoke all on function private.default_signature_asset(uuid) from public,anon;
grant execute on function private.default_signature_asset(uuid) to authenticated;

create or replace function public.register_institutional_signature_asset(
  target_profile_id uuid,
  target_body_id uuid,
  selected_asset_type text,
  selected_storage_path text,
  selected_file_name text,
  selected_mime_type text,
  selected_official_title text default null,
  selected_decision_reference text default null
)
returns public.institutional_signature_assets
language plpgsql security definer set search_path='' as $$
declare result public.institutional_signature_assets%rowtype;
begin
  if not private.is_super_admin() or not private.has_aal2() then
    raise exception 'Action réservée au super-administrateur avec MFA';
  end if;
  if selected_asset_type not in ('signature','round_seal','nominal_seal','composite_signature') then
    raise exception 'Type d’actif institutionnel invalide';
  end if;
  if not exists(select 1 from public.profiles p where p.id=target_profile_id and p.status='active') then
    raise exception 'Compte institutionnel actif introuvable';
  end if;
  if split_part(selected_storage_path,'/',1)<>target_profile_id::text then
    raise exception 'Le chemin de stockage ne correspond pas au titulaire';
  end if;
  if selected_mime_type not in ('image/jpeg','image/png','image/webp') then
    raise exception 'Format d’image non autorisé';
  end if;

  update public.institutional_signature_assets
  set is_default=false
  where profile_id=target_profile_id
    and asset_type=selected_asset_type
    and status='active'
    and is_default;

  insert into public.institutional_signature_assets(
    profile_id,body_id,asset_type,storage_path,file_name,mime_type,
    official_title,decision_reference,is_default,status,uploaded_by
  ) values (
    target_profile_id,target_body_id,selected_asset_type,selected_storage_path,
    selected_file_name,selected_mime_type,nullif(trim(coalesce(selected_official_title,'')),''),
    nullif(trim(coalesce(selected_decision_reference,'')),''),true,'active',auth.uid()
  ) returning * into result;
  return result;
end;
$$;
revoke all on function public.register_institutional_signature_asset(uuid,uuid,text,text,text,text,text,text) from public,anon;
grant execute on function public.register_institutional_signature_asset(uuid,uuid,text,text,text,text,text,text) to authenticated;

create or replace function public.revoke_institutional_signature_asset(target_asset_id uuid)
returns public.institutional_signature_assets
language plpgsql security definer set search_path='' as $$
declare result public.institutional_signature_assets%rowtype;
begin
  if not private.is_super_admin() or not private.has_aal2() then
    raise exception 'Action réservée au super-administrateur avec MFA';
  end if;
  update public.institutional_signature_assets
  set status='revoked',is_default=false,revoked_by=auth.uid(),revoked_at=now()
  where id=target_asset_id and status='active'
  returning * into result;
  if not found then raise exception 'Actif introuvable ou déjà révoqué'; end if;
  return result;
end;
$$;
revoke all on function public.revoke_institutional_signature_asset(uuid) from public,anon;
grant execute on function public.revoke_institutional_signature_asset(uuid) to authenticated;

create or replace function private.apply_official_report_identity()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  official_title text;
  official_body uuid;
begin
  select pd.title,pa.body_id into official_title,official_body
  from public.position_assignments pa
  join public.position_definitions pd on pd.id=pa.position_id
  where pa.profile_id=new.actor_id
    and pa.status='active'
    and pa.start_date<=current_date
    and (pa.end_date is null or pa.end_date>=current_date)
    and pd.status='active'
  order by (pa.body_id is not distinct from new.actor_body_id) desc,
           pd.is_statutory desc,
           pa.start_date desc
  limit 1;

  if official_title is not null then
    new.actor_job_title:=official_title;
    new.actor_body_id:=official_body;
  end if;
  if nullif(new.signature_asset_path,'') is null then
    new.signature_asset_path:=private.default_signature_asset(new.actor_id);
  end if;
  return new;
end;
$$;

drop trigger if exists task_report_approvals_official_identity on public.task_report_approvals;
create trigger task_report_approvals_official_identity
before insert on public.task_report_approvals
for each row execute function private.apply_official_report_identity();

create or replace function private.apply_default_version_signature()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if nullif(new.signature_asset_path,'') is null then
    new.signature_asset_path:=private.default_signature_asset(new.submitted_by);
  end if;
  return new;
end;
$$;
drop trigger if exists task_report_versions_default_signature on public.task_report_versions;
create trigger task_report_versions_default_signature
before insert on public.task_report_versions
for each row execute function private.apply_default_version_signature();

create or replace function private.apply_default_reporter_signature()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='submitted' and nullif(new.reporter_signature_asset_path,'') is null then
    new.reporter_signature_asset_path:=private.default_signature_asset(new.reporter_id);
  end if;
  return new;
end;
$$;
drop trigger if exists task_reports_default_signature on public.task_reports;
create trigger task_reports_default_signature
before insert or update of status,reporter_signature_asset_path on public.task_reports
for each row execute function private.apply_default_reporter_signature();

-- The platform recognition date is recorded without inventing an older appointment date.
insert into public.position_assignments(
  position_id,body_id,profile_id,decision_reference,start_date,status,appointed_by
)
select pd.id,pd.body_id,p.id,
  'Configuration institutionnelle confirmée sur la plateforme — 16/08/2026',
  date '2026-08-16','active',p.id
from public.profiles p
join public.position_definitions pd on pd.code='CA-PCA' and pd.status='active'
where lower(p.email)='pca@aiac-cm.org'
  and not exists (
    select 1 from public.position_assignments pa
    where pa.position_id=pd.id and pa.body_id=pd.body_id and pa.profile_id=p.id and pa.status='active'
  );

update public.position_definitions
set title='CRM/DT générale',updated_at=now()
where code='CA-CRMDT-G' and title is distinct from 'CRM/DT générale';
