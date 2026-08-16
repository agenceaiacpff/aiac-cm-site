create or replace function public.submit_task_report_with_signature_options(target_report_id uuid,signature_name text,signature_asset_path text default null,include_nominal_seal boolean default false,include_round_seal boolean default false,signature_block_side text default 'right') returns public.task_reports language plpgsql security definer set search_path='' as $$
declare r public.task_reports%rowtype;uid uuid:=auth.uid();effective_signature text;nominal_path text;round_path text;chosen_side text:=signature_block_side;
begin
 if uid is null then raise exception 'Authentification requise';end if;if chosen_side not in ('left','right') then raise exception 'Position du bloc de signature invalide';end if;
 effective_signature:=coalesce(nullif(signature_asset_path,''),private.default_signature_asset(uid));if effective_signature is null then raise exception 'Une signature officielle active est requise';end if;
 if include_nominal_seal then nominal_path:=private.default_official_asset(uid,'nominal_seal');if nominal_path is null then raise exception 'Aucun cachet nominatif actif n’est enregistré pour votre compte';end if;end if;
 if include_round_seal then round_path:=private.default_official_asset(uid,'round_seal');if round_path is null then raise exception 'Aucun cachet rond actif n’est enregistré pour votre compte';end if;end if;
 r:=public.submit_task_report(target_report_id,signature_name,effective_signature);perform set_config('aiac.task_report_workflow','on',true);
 update public.task_reports set reporter_nominal_seal_asset_path=nominal_path,reporter_round_seal_asset_path=round_path,reporter_signature_block_side=chosen_side where id=r.id returning * into r;
 update public.task_report_approvals a set nominal_seal_asset_path=nominal_path,round_seal_asset_path=round_path,signature_block_side=chosen_side where a.report_id=r.id and a.revision=r.revision and a.actor_id=uid and a.decision='submitted';
 perform set_config('aiac.task_report_workflow','off',true);return r;
end;$$;

create or replace function public.review_task_report_with_signature_options(target_report_id uuid,decision text,review_comment text,signature_name text,signature_asset_path text default null,require_evidence boolean default false,include_nominal_seal boolean default false,include_round_seal boolean default false,signature_block_side text default 'right') returns public.task_reports language plpgsql security definer set search_path='' as $$
declare r public.task_reports%rowtype;uid uuid:=auth.uid();effective_signature text;nominal_path text;round_path text;approval_id uuid;chosen_side text:=signature_block_side;
begin
 if uid is null then raise exception 'Authentification requise';end if;if chosen_side not in ('left','right') then raise exception 'Position du bloc de signature invalide';end if;
 effective_signature:=coalesce(nullif(signature_asset_path,''),private.default_signature_asset(uid));if effective_signature is null then raise exception 'Une signature officielle active est requise';end if;
 if include_nominal_seal then nominal_path:=private.default_official_asset(uid,'nominal_seal');if nominal_path is null then raise exception 'Aucun cachet nominatif actif n’est enregistré pour votre compte';end if;end if;
 if include_round_seal then round_path:=private.default_official_asset(uid,'round_seal');if round_path is null then raise exception 'Aucun cachet rond actif n’est enregistré pour votre compte';end if;end if;
 r:=public.review_task_report_with_evidence(target_report_id,decision,review_comment,signature_name,effective_signature,require_evidence);
 select a.id into approval_id from public.task_report_approvals a where a.report_id=r.id and a.actor_id=uid and a.decision in ('approved','returned') order by a.created_at desc limit 1;
 update public.task_report_approvals a set nominal_seal_asset_path=nominal_path,round_seal_asset_path=round_path,signature_block_side=chosen_side where a.id=approval_id;return r;
end;$$;

create or replace function public.review_task_report_collective_from_mandate_with_signature_options(target_report_id uuid,decision text,review_comment text,mandate_id uuid,require_evidence boolean default false,include_nominal_seal boolean default false,include_round_seal boolean default false,signature_block_side text default 'right') returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;uid uuid:=auth.uid();nominal_path text;round_path text;approval_id uuid;chosen_side text:=signature_block_side;
begin
 if uid is null then raise exception 'Authentification requise';end if;if chosen_side not in ('left','right') then raise exception 'Position du bloc de signature invalide';end if;
 if include_nominal_seal then nominal_path:=private.default_official_asset(uid,'nominal_seal');if nominal_path is null then raise exception 'Aucun cachet nominatif actif n’est enregistré pour votre compte';end if;end if;
 if include_round_seal then round_path:=private.default_official_asset(uid,'round_seal');if round_path is null then raise exception 'Aucun cachet rond actif n’est enregistré pour votre compte';end if;end if;
 result:=public.review_task_report_collective_from_mandate(target_report_id,decision,review_comment,mandate_id,require_evidence);approval_id:=(result->>'approval_id')::uuid;
 update public.task_report_approvals a set nominal_seal_asset_path=nominal_path,round_seal_asset_path=round_path,signature_block_side=chosen_side where a.id=approval_id and a.actor_id=uid;return result;
end;$$;
