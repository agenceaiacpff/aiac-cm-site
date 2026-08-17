create or replace function public.position_reference_catalog_admin(search_text text default null, max_rows integer default 500)
returns table(
  position_id uuid, code text, title text, institutional_level text, body_id uuid, body_code text, body_name text,
  authority_scope text, is_statutory boolean, status text, decision_reference text, reports_to_position_id uuid,
  role_key text, role_family text, job_purpose text, responsibilities jsonb, workspace_modules jsonb,
  source_basis text, source_status text, sensitive_access_level text, slot_count bigint, assignment_count bigint,
  capabilities jsonb
)
language sql stable security definer set search_path=''
as $$
 select pd.id,pd.code,pd.title,pd.institutional_level,pd.body_id,gb.code,gb.name,
        pd.authority_scope,pd.is_statutory,pd.status,pd.decision_reference,pd.reports_to_position_id,
        pd.role_key,pd.role_family,pd.job_purpose,pd.responsibilities,pd.workspace_modules,
        pd.source_basis,pd.source_status,pd.sensitive_access_level,
        (select count(*) from public.position_slots ps where ps.position_id=pd.id),
        (select count(*) from public.position_assignments pa where pa.position_id=pd.id),
        coalesce((select jsonb_agg(jsonb_build_object('key',pc.capability_key,'scope_mode',pc.scope_mode,'label',cc.label,'risk_level',cc.risk_level) order by pc.capability_key)
                  from public.position_capabilities pc
                  join public.position_capability_catalog cc on cc.capability_key=pc.capability_key
                  where pc.position_id=pd.id),'[]'::jsonb)
 from public.position_definitions pd
 left join public.governance_bodies gb on gb.id=pd.body_id
 where private.is_super_admin(auth.uid()) and private.has_aal2()
   and (search_text is null or concat_ws(' ',pd.code,pd.title,pd.role_key,pd.role_family,pd.institutional_level,pd.status,gb.code,gb.name,pd.source_basis) ilike '%'||search_text||'%')
 order by pd.code
 limit least(greatest(max_rows,1),2000);
$$;

create or replace function public.update_position_definition_admin(
 target_id uuid,
 target_title text,
 target_job_purpose text default null,
 target_responsibilities jsonb default '[]'::jsonb,
 target_workspace_modules jsonb default '[]'::jsonb,
 target_authority_scope text default null,
 target_decision_reference text default null,
 target_source_basis text default null,
 target_source_status text default null,
 target_sensitive_access_level text default null,
 target_status text default null
) returns public.position_definitions
language plpgsql security definer set search_path=''
as $$
declare r public.position_definitions%rowtype;
begin
 if not private.is_super_admin(auth.uid()) or not private.has_aal2() then raise exception 'Modification réservée au super-administrateur avec MFA AAL2'; end if;
 select * into r from public.position_definitions where id=target_id for update;
 if not found then raise exception 'Fiche de poste introuvable'; end if;
 if char_length(btrim(coalesce(target_title,'')))<2 then raise exception 'Intitulé du poste obligatoire'; end if;
 if target_status is not null and target_status not in('draft','active','suspended','abolished') then raise exception 'Statut de fiche invalide'; end if;
 if target_responsibilities is null or jsonb_typeof(target_responsibilities)<>'array' then raise exception 'Les responsabilités doivent être une liste'; end if;
 if target_workspace_modules is null or jsonb_typeof(target_workspace_modules)<>'array' then raise exception 'Les modules doivent être une liste'; end if;
 update public.position_definitions set
   title=btrim(target_title),
   job_purpose=nullif(btrim(coalesce(target_job_purpose,'')),''),
   responsibilities=target_responsibilities,
   workspace_modules=target_workspace_modules,
   authority_scope=case when target_authority_scope is null then authority_scope else nullif(btrim(target_authority_scope),'') end,
   decision_reference=case when target_decision_reference is null then decision_reference else nullif(btrim(target_decision_reference),'') end,
   source_basis=case when target_source_basis is null then source_basis else nullif(btrim(target_source_basis),'') end,
   source_status=coalesce(nullif(btrim(coalesce(target_source_status,'')),''),source_status),
   sensitive_access_level=coalesce(nullif(btrim(coalesce(target_sensitive_access_level,'')),''),sensitive_access_level),
   status=coalesce(target_status,status),updated_at=now()
 where id=target_id returning * into r;
 perform private.write_audit('position.definition_updated','position_definition',r.id,jsonb_build_object('code',r.code,'status',r.status));
 return r;
end $$;

create or replace function public.set_position_capabilities_admin(target_position_id uuid,target_capabilities jsonb)
returns boolean
language plpgsql security definer set search_path=''
as $$
declare item jsonb; k text; s text;
begin
 if not private.is_super_admin(auth.uid()) or not private.has_aal2() then raise exception 'Gestion des habilitations réservée au super-administrateur avec MFA AAL2'; end if;
 if not exists(select 1 from public.position_definitions where id=target_position_id) then raise exception 'Fiche de poste introuvable'; end if;
 if target_capabilities is null or jsonb_typeof(target_capabilities)<>'array' then raise exception 'Liste des habilitations invalide'; end if;
 delete from public.position_capabilities where position_id=target_position_id;
 for item in select value from jsonb_array_elements(target_capabilities) loop
   k:=btrim(coalesce(item->>'key','')); s:=coalesce(nullif(btrim(item->>'scope_mode'),''),'assignment');
   if not exists(select 1 from public.position_capability_catalog where capability_key=k) then raise exception 'Habilitation inconnue : %',k; end if;
   if s not in('assignment','body','project','subordinates','institution') then raise exception 'Portée invalide pour %',k; end if;
   insert into public.position_capabilities(position_id,capability_key,scope_mode) values(target_position_id,k,s);
 end loop;
 perform private.write_audit('position.capabilities_replaced','position_definition',target_position_id,jsonb_build_object('count',jsonb_array_length(target_capabilities)));
 return true;
end $$;

create or replace function public.delete_position_definition_admin(target_id uuid,target_reason text)
returns boolean
language plpgsql security definer set search_path=''
as $$
declare r public.position_definitions%rowtype; deps jsonb;
begin
 if not private.is_super_admin(auth.uid()) or not private.has_aal2() then raise exception 'Suppression réservée au super-administrateur avec MFA AAL2'; end if;
 if char_length(btrim(coalesce(target_reason,'')))<5 then raise exception 'Motif de suppression obligatoire'; end if;
 select * into r from public.position_definitions where id=target_id for update;
 if not found then raise exception 'Fiche de poste introuvable'; end if;
 deps:=jsonb_build_object(
  'slots',(select count(*) from public.position_slots where position_id=r.id),
  'assignments',(select count(*) from public.position_assignments where position_id=r.id),
  'blueprints',(select count(*) from public.staffing_blueprints where position_code=r.code or reports_to_position_code=r.code or technical_reports_to_position_code=r.code)
 );
 if (deps->>'slots')::int>0 or (deps->>'assignments')::int>0 or (deps->>'blueprints')::int>0 then
   raise exception 'Suppression impossible : cette fiche est référencée. Utilisez le statut « aboli » pour préserver l’historique.';
 end if;
 perform private.write_audit('position.definition_deleted','position_definition',r.id,jsonb_build_object('reason',target_reason,'code',r.code));
 delete from public.position_definitions where id=r.id;
 return true;
end $$;

revoke all on function public.position_reference_catalog_admin(text,integer) from public,anon;
revoke all on function public.update_position_definition_admin(uuid,text,text,jsonb,jsonb,text,text,text,text,text,text) from public,anon;
revoke all on function public.set_position_capabilities_admin(uuid,jsonb) from public,anon;
revoke all on function public.delete_position_definition_admin(uuid,text) from public,anon;
grant execute on function public.position_reference_catalog_admin(text,integer) to authenticated;
grant execute on function public.update_position_definition_admin(uuid,text,text,jsonb,jsonb,text,text,text,text,text,text) to authenticated;
grant execute on function public.set_position_capabilities_admin(uuid,jsonb) to authenticated;
grant execute on function public.delete_position_definition_admin(uuid,text) to authenticated;
