-- Les coordinations régionales sont des unités de déploiement / postes nommés,
-- pas des organes statutaires. Cette migration conserve tous les postes régionaux
-- et leur provenance territoriale, puis retire les pseudo-organes REG de la gouvernance.

lock table public.governance_bodies in access exclusive mode;
lock table public.position_slots in share row exclusive mode;

alter table public.position_slots
  add column if not exists coordination_code text,
  add column if not exists coordination_name text,
  add column if not exists coordination_region text;

comment on column public.position_slots.coordination_code is
  'Code de la coordination de déploiement du poste. Une coordination n''est pas un organe statutaire.';
comment on column public.position_slots.coordination_name is
  'Libellé historique de la coordination de déploiement du poste.';
comment on column public.position_slots.coordination_region is
  'Région de déploiement du poste régional, indépendante de la notion d''organe.';

create temporary table _aiac_regional_coordination_map on commit drop as
select b.id, b.code, b.name, b.region, b.parent_body_id
from public.governance_bodies b
where b.body_type = 'regional_coordination';

-- Chaque ancienne coordination doit être rattachée à un véritable organe subsidiaire.
do $$
begin
  if exists (
    select 1
    from _aiac_regional_coordination_map m
    left join public.governance_bodies p on p.id = m.parent_body_id
    where m.parent_body_id is null
       or p.id is null
       or p.body_type <> 'subsidiary_body'
  ) then
    raise exception 'Migration interrompue : une coordination régionale n''a pas d''organe subsidiaire parent valide';
  end if;

  if exists (
    select 1
    from public.governance_bodies child
    join _aiac_regional_coordination_map m
      on child.parent_body_id = m.id or child.reporting_body_id = m.id
    where child.id <> m.id
      and child.body_type <> 'regional_coordination'
  ) then
    raise exception 'Migration interrompue : une structure non régionale dépend encore d''une pseudo-coordination';
  end if;
end $$;

-- Refuser toute suppression silencieuse si une table métier autre que les postes
-- ou les affectations a commencé à référencer une pseudo-coordination.
do $$
declare
  dep record;
  dep_count bigint;
begin
  for dep in
    select ns.nspname as schema_name,
           rel.relname as table_name,
           att.attname as column_name
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
    where con.contype = 'f'
      and con.confrelid = 'public.governance_bodies'::regclass
      and con.conrelid not in (
        'public.governance_bodies'::regclass,
        'public.position_slots'::regclass,
        'public.position_assignments'::regclass
      )
  loop
    execute format(
      'select count(*) from %I.%I t join _aiac_regional_coordination_map m on t.%I = m.id',
      dep.schema_name, dep.table_name, dep.column_name
    ) into dep_count;

    if dep_count > 0 then
      raise exception 'Migration interrompue : %.% référence encore % coordination(s) régionale(s)',
        dep.table_name, dep.column_name, dep_count;
    end if;
  end loop;
end $$;

-- Les 990 postes régionaux restent intacts : seule leur appartenance est corrigée.
-- Ils appartiennent désormais à l'organe subsidiaire et portent la coordination au niveau du poste.
update public.position_slots ps
set coordination_code = m.code,
    coordination_name = m.name,
    coordination_region = m.region,
    body_id = m.parent_body_id,
    updated_at = now()
from _aiac_regional_coordination_map m
where ps.body_id = m.id;

-- Préserver aussi une éventuelle affectation créée juste avant la migration.
update public.position_assignments pa
set body_id = ps.body_id,
    territory = coalesce(nullif(btrim(pa.territory), ''), ps.coordination_region),
    updated_at = now()
from public.position_slots ps
where pa.slot_id = ps.id
  and ps.coordination_code is not null;

-- Plus aucun poste ne doit pointer vers une pseudo-coordination.
do $$
begin
  if exists (
    select 1
    from public.position_slots ps
    join _aiac_regional_coordination_map m on m.id = ps.body_id
  ) then
    raise exception 'Migration interrompue : certains postes pointent encore vers une coordination régionale';
  end if;
end $$;

-- Les coordinations disparaissent réellement de la table des organes.
delete from public.governance_bodies b
using _aiac_regional_coordination_map m
where b.id = m.id;

-- Verrou sémantique anti-régression : on ne pourra plus recréer une coordination
-- régionale comme type d'organe.
alter table public.governance_bodies
  drop constraint if exists governance_bodies_body_type_check;

alter table public.governance_bodies
  add constraint governance_bodies_body_type_check check (
    body_type = any (array[
      'general_assembly'::text,
      'board'::text,
      'executive_office'::text,
      'subsidiary_body'::text,
      'executive_council'::text,
      'antenna'::text,
      'department'::text,
      'commission'::text,
      'committee'::text,
      'program_unit'::text,
      'project_unit'::text,
      'other'::text
    ])
  );

create index if not exists position_slots_body_coordination_region_idx
  on public.position_slots(body_id, coordination_region)
  where coordination_region is not null;

-- Un sélecteur intitulé « Organe » retourne uniquement les organes statutaires
-- existant aujourd'hui : AG, CA et les onze organes subsidiaires.
create or replace function public.institutional_reporting_bodies()
returns table(body_id uuid, body_code text, body_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.code, b.name
  from public.governance_bodies b
  where private.is_active_approved_user(auth.uid())
    and b.status = 'active'
    and b.body_type in ('general_assembly', 'board', 'subsidiary_body')
  order by
    case b.body_type
      when 'general_assembly' then 0
      when 'board' then 1
      else 2
    end,
    b.code;
$$;

-- Toute future affectation sur un poste régional garde automatiquement sa région,
-- même si son body_id est désormais l'organe subsidiaire réel.
create or replace function private.position_assignment_fill_coordination_territory()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.slot_id is not null
     and nullif(btrim(coalesce(new.territory, '')), '') is null then
    select ps.coordination_region
    into new.territory
    from public.position_slots ps
    where ps.id = new.slot_id;
  end if;
  return new;
end $$;

drop trigger if exists position_assignment_fill_coordination_territory
  on public.position_assignments;
create trigger position_assignment_fill_coordination_territory
before insert or update of slot_id on public.position_assignments
for each row execute function private.position_assignment_fill_coordination_territory();

-- La création d'une antenne ne recherche plus une « coordination-organe ».
-- Elle prend l'organe subsidiaire réel et les postes régionaux correspondants.
create or replace function public.create_antenna_structure(
  target_subsidiary_code text,
  target_region text,
  target_locality text,
  target_decision_reference text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  sub public.governance_bodies%rowtype;
  ant_id uuid;
  bp record;
  pos uuid;
  chiefid uuid;
  parent_slot uuid;
  tech_slot uuid;
  ant_code text;
begin
  if uid is null then raise exception 'Authentification requise'; end if;

  select * into sub
  from public.governance_bodies
  where body_type = 'subsidiary_body'
    and code = upper(target_subsidiary_code)
    and status = 'active'
  limit 1;
  if not found then raise exception 'Organe subsidiaire introuvable'; end if;

  if nullif(btrim(coalesce(target_region, '')), '') is null then
    raise exception 'Région obligatoire';
  end if;
  if not private.has_position_capability('staffing.assign', uid, sub.id, null) then
    raise exception 'La création structurelle d’une antenne exige une autorité RH habilitée';
  end if;
  if char_length(btrim(coalesce(target_locality, ''))) < 2
     or char_length(btrim(coalesce(target_decision_reference, ''))) < 2 then
    raise exception 'Localité et décision obligatoires';
  end if;

  ant_code := left(sub.code || '-ANT-' || upper(regexp_replace(target_locality, '[^A-Za-z0-9]', '', 'g')), 30);

  insert into public.governance_bodies(
    code, name, body_type, description, parent_body_id, status, created_by,
    deployment_level, subsidiary_code, region, locality, territory,
    decision_reference, reporting_body_id
  ) values (
    ant_code,
    'Antenne ' || target_locality || ' — ' || sub.name,
    'antenna',
    'Antenne matérialisée sur décision enregistrée; aucun titulaire n’est créé automatiquement.',
    sub.id,
    'active',
    uid,
    'antenna',
    sub.code,
    target_region,
    target_locality,
    target_locality,
    target_decision_reference,
    sub.id
  )
  on conflict(code) do update
    set decision_reference = excluded.decision_reference,
        status = 'active',
        locality = excluded.locality,
        region = excluded.region,
        parent_body_id = excluded.parent_body_id,
        reporting_body_id = excluded.reporting_body_id
  returning id into ant_id;

  select s.id into parent_slot
  from public.position_slots s
  join public.position_definitions pd on pd.id = s.position_id
  where s.body_id = sub.id
    and pd.code = 'REG-CR'
    and lower(coalesce(s.coordination_region, '')) = lower(target_region)
  limit 1;

  select s.id into tech_slot
  from public.position_slots s
  join public.position_definitions pd on pd.id = s.position_id
  where s.body_id = sub.id
    and pd.code = 'REG-TR'
    and lower(coalesce(s.coordination_region, '')) = lower(target_region)
  limit 1;

  for bp in
    select *
    from public.staffing_blueprints
    where blueprint_scope = 'antenna'
      and (subsidiary_code is null or subsidiary_code = sub.code)
    order by display_order
  loop
    select id into pos from public.position_definitions where code = bp.position_code;

    if bp.position_code = 'ANT-CHEF' then
      insert into public.position_slots(
        slot_code, position_id, body_id, supervisor_slot_id,
        technical_supervisor_slot_id, status, max_occupants,
        allowed_assignment_types, decision_reference, source_basis, created_by
      ) values (
        ant_code || '-CHEF', pos, ant_id, parent_slot, tech_slot,
        'vacant', bp.max_occupants, bp.allowed_assignment_types,
        target_decision_reference, bp.source_basis, uid
      )
      on conflict(slot_code) do update
        set decision_reference = excluded.decision_reference
      returning id into chiefid;
    else
      insert into public.position_slots(
        slot_code, position_id, body_id, supervisor_slot_id,
        technical_supervisor_slot_id, status, max_occupants,
        allowed_assignment_types, decision_reference, source_basis, created_by
      ) values (
        ant_code || '-' || bp.position_code,
        pos,
        ant_id,
        coalesce(chiefid, parent_slot),
        case when bp.technical_reports_to_position_code is not null then tech_slot else null end,
        'vacant',
        bp.max_occupants,
        bp.allowed_assignment_types,
        target_decision_reference,
        bp.source_basis,
        uid
      )
      on conflict(slot_code) do nothing;
    end if;
  end loop;

  return ant_id;
end $$;

-- Contrôles finaux : aucune coordination dans les organes et les postes régionaux
-- restent identifiables par leur région.
do $$
begin
  if exists (select 1 from public.governance_bodies where body_type = 'regional_coordination') then
    raise exception 'Contrôle final échoué : une coordination est encore classée comme organe';
  end if;

  if exists (
    select 1
    from public.position_slots ps
    where ps.slot_code like 'OS-%-REG-%'
      and ps.coordination_region is null
  ) then
    raise exception 'Contrôle final échoué : un poste régional a perdu sa région de coordination';
  end if;
end $$;
