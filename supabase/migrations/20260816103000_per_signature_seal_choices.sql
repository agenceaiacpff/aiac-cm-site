alter table public.task_reports
  add column if not exists reporter_nominal_seal_asset_path text,
  add column if not exists reporter_round_seal_asset_path text,
  add column if not exists reporter_signature_block_side text not null default 'right';

alter table public.task_report_approvals
  add column if not exists nominal_seal_asset_path text,
  add column if not exists round_seal_asset_path text,
  add column if not exists signature_block_side text not null default 'right';

alter table public.task_reports drop constraint if exists task_reports_reporter_signature_block_side_check;
alter table public.task_reports add constraint task_reports_reporter_signature_block_side_check check (reporter_signature_block_side in ('left','right'));
alter table public.task_report_approvals drop constraint if exists task_report_approvals_signature_block_side_check;
alter table public.task_report_approvals add constraint task_report_approvals_signature_block_side_check check (signature_block_side in ('left','right'));

create or replace function private.default_official_asset(target_profile_id uuid,target_asset_type text)
returns text language plpgsql stable security definer set search_path='' as $$
declare result_path text;
begin
  if target_asset_type not in ('signature','nominal_seal','round_seal','composite_signature') then raise exception 'Type d’actif de signature invalide'; end if;
  select a.storage_path into result_path from public.institutional_signature_assets a
  where a.profile_id=target_profile_id and a.status='active' and a.is_default and a.asset_type=target_asset_type
    and a.valid_from<=current_date and (a.valid_until is null or a.valid_until>=current_date)
  order by a.created_at desc limit 1;
  return result_path;
end;$$;

create or replace function public.submit_task_report_with_signature_options(target_report_id uuid,signature_name text,signature_asset_path text default null,include_nominal_seal boolean default false,include_round_seal boolean default false,signature_block_side text default 'right')
returns public.task_reports language plpgsql security definer set search_path='' as $$
declare r public.task_reports%rowtype;uid uuid:=auth.uid();effective_signature text;nominal_path text;round_path text;
begin
 if uid is null then raise exception 'Authentification requise'; end if;
 if signature_block_side not in ('left','right') then raise exception 'Position du bloc de signature invalide'; end if;
 effective_signature:=coalesce(nullif(signature_asset_path,''),private.default_signature_asset(uid));
 if effective_signature is null then raise exception 'Une signature officielle active est requise'; end if;
 if include_nominal_seal then nominal_path:=private.default_official_asset(uid,'nominal_seal');if nominal_path is null then raise exception 'Aucun cachet nominatif actif n’est enregistré pour votre compte';end if;end if;
 if include_round_seal then round_path:=private.default_official_asset(uid,'round_seal');if round_path is null then raise exception 'Aucun cachet rond actif n’est enregistré pour votre compte';end if;end if;
 r:=public.submit_task_report(target_report_id,signature_name,effective_signature);
 perform set_config('aiac.task_report_workflow','on',true);
 update public.task_reports set reporter_nominal_seal_asset_path=nominal_path,reporter_round_seal_asset_path=round_path,reporter_signature_block_side=signature_block_side where id=r.id returning * into r;
 update public.task_report_approvals set nominal_seal_asset_path=nominal_path,round_seal_asset_path=round_path,signature_block_side=signature_block_side where report_id=r.id and revision=r.revision and actor_id=uid and decision='submitted';
 perform set_config('aiac.task_report_workflow','off',true);return r;
end;$$;

create or replace function public.review_task_report_with_signature_options(target_report_id uuid,decision text,review_comment text,signature_name text,signature_asset_path text default null,require_evidence boolean default false,include_nominal_seal boolean default false,include_round_seal boolean default false,signature_block_side text default 'right')
returns public.task_reports language plpgsql security definer set search_path='' as $$
declare r public.task_reports%rowtype;uid uuid:=auth.uid();effective_signature text;nominal_path text;round_path text;approval_id uuid;
begin
 if uid is null then raise exception 'Authentification requise'; end if;if signature_block_side not in ('left','right') then raise exception 'Position du bloc de signature invalide'; end if;
 effective_signature:=coalesce(nullif(signature_asset_path,''),private.default_signature_asset(uid));if effective_signature is null then raise exception 'Une signature officielle active est requise';end if;
 if include_nominal_seal then nominal_path:=private.default_official_asset(uid,'nominal_seal');if nominal_path is null then raise exception 'Aucun cachet nominatif actif n’est enregistré pour votre compte';end if;end if;
 if include_round_seal then round_path:=private.default_official_asset(uid,'round_seal');if round_path is null then raise exception 'Aucun cachet rond actif n’est enregistré pour votre compte';end if;end if;
 r:=public.review_task_report_with_evidence(target_report_id,decision,review_comment,signature_name,effective_signature,require_evidence);
 select a.id into approval_id from public.task_report_approvals a where a.report_id=r.id and a.actor_id=uid and a.decision in ('approved','returned') order by a.created_at desc limit 1;
 update public.task_report_approvals set nominal_seal_asset_path=nominal_path,round_seal_asset_path=round_path,signature_block_side=signature_block_side where id=approval_id;return r;
end;$$;

create or replace function public.review_task_report_collective_from_mandate_with_signature_options(target_report_id uuid,decision text,review_comment text,mandate_id uuid,require_evidence boolean default false,include_nominal_seal boolean default false,include_round_seal boolean default false,signature_block_side text default 'right')
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;uid uuid:=auth.uid();nominal_path text;round_path text;approval_id uuid;
begin
 if uid is null then raise exception 'Authentification requise';end if;if signature_block_side not in ('left','right') then raise exception 'Position du bloc de signature invalide';end if;
 if include_nominal_seal then nominal_path:=private.default_official_asset(uid,'nominal_seal');if nominal_path is null then raise exception 'Aucun cachet nominatif actif n’est enregistré pour votre compte';end if;end if;
 if include_round_seal then round_path:=private.default_official_asset(uid,'round_seal');if round_path is null then raise exception 'Aucun cachet rond actif n’est enregistré pour votre compte';end if;end if;
 result:=public.review_task_report_collective_from_mandate(target_report_id,decision,review_comment,mandate_id,require_evidence);approval_id:=(result->>'approval_id')::uuid;
 update public.task_report_approvals set nominal_seal_asset_path=nominal_path,round_seal_asset_path=round_path,signature_block_side=signature_block_side where id=approval_id and actor_id=uid;return result;
end;$$;

create or replace function private.protect_task_report_fields() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if current_setting('aiac.task_report_workflow',true)='on' then return new;end if;if auth.uid() is null then return new;end if;
 if old.reporter_id<>auth.uid() or old.status not in ('draft','returned') then raise exception 'Ce rapport ne peut plus être modifié directement';end if;
 if new.task_id is distinct from old.task_id or new.reporter_id is distinct from old.reporter_id or new.supervisor_id is distinct from old.supervisor_id or new.body_id is distinct from old.body_id or new.validation_authority_type is distinct from old.validation_authority_type or new.validation_authority_body_id is distinct from old.validation_authority_body_id or new.status is distinct from old.status or new.revision is distinct from old.revision or new.current_hash is distinct from old.current_hash or new.submitted_at is distinct from old.submitted_at or new.approved_at is distinct from old.approved_at or new.approved_by is distinct from old.approved_by or new.reporter_signed_at is distinct from old.reporter_signed_at or new.reporter_nominal_seal_asset_path is distinct from old.reporter_nominal_seal_asset_path or new.reporter_round_seal_asset_path is distinct from old.reporter_round_seal_asset_path or new.reporter_signature_block_side is distinct from old.reporter_signature_block_side then raise exception 'Les champs d’identité et de workflow sont protégés';end if;return new;
end;$$;

revoke execute on function private.default_official_asset(uuid,text) from public,anon,authenticated;
revoke execute on function public.submit_task_report_with_signature_options(uuid,text,text,boolean,boolean,text) from public,anon;
revoke execute on function public.review_task_report_with_signature_options(uuid,text,text,text,text,boolean,boolean,boolean,text) from public,anon;
revoke execute on function public.review_task_report_collective_from_mandate_with_signature_options(uuid,text,text,uuid,boolean,boolean,boolean,text) from public,anon;
grant execute on function public.submit_task_report_with_signature_options(uuid,text,text,boolean,boolean,text) to authenticated;
grant execute on function public.review_task_report_with_signature_options(uuid,text,text,text,text,boolean,boolean,boolean,text) to authenticated;
grant execute on function public.review_task_report_collective_from_mandate_with_signature_options(uuid,text,text,uuid,boolean,boolean,boolean,text) to authenticated;
