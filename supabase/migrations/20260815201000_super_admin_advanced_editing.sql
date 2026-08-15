-- Édition complète des champs métier par le super-administrateur, sans exposer
-- les identifiants techniques, empreintes, signatures ni chemins de stockage.

create or replace function public.super_admin_update_resource(
  resource_type text,
  target_id uuid,
  changes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  target_table text;
  field_name text;
  field_value jsonb;
  result jsonb;
  old_status text;
  linked_publication uuid;
  protected_fields constant text[] := array[
    'id','created_at','updated_at','created_by','current_hash','revision',
    'report_number','reporter_id','reporter_signature_name',
    'reporter_signature_asset_path','reporter_signed_at','submitted_at',
    'approved_at','approved_by','returned_at','public_content_id',
    'published_at','published_by','file_url','file_name','mime_type','size_bytes'
  ];
begin
  if not private.is_super_admin() or not private.has_aal2() then
    raise exception 'Action réservée au super-administrateur avec MFA';
  end if;

  target_table := case resource_type
    when 'program' then 'programs'
    when 'project' then 'projects'
    when 'activity' then 'activities'
    when 'activity_task' then 'activity_tasks'
    when 'task_report' then 'task_reports'
    when 'public_content' then 'public_content_items'
    when 'document' then 'documents'
    when 'governance_body' then 'governance_bodies'
    when 'institutional_member' then 'institutional_members'
    when 'workforce_assignment' then 'workforce_assignments'
    when 'partner' then 'partners'
    else null
  end;
  if target_table is null then raise exception 'Type de ressource non autorisé'; end if;

  execute format('select to_jsonb(t) from public.%I t where t.id=$1',target_table)
    into result using target_id;
  if result is null then raise exception 'Ressource introuvable'; end if;

  -- Toute modification d'un rapport signé le rouvre et retire sa publication.
  if resource_type='task_report' then
    select status,public_content_id into old_status,linked_publication
    from public.task_reports where id=target_id;
    if old_status not in ('draft','returned') then
      if linked_publication is not null then
        update public.public_content_items set status='archived' where id=linked_publication;
      end if;
      perform set_config('aiac.task_report_workflow','on',true);
      update public.task_reports set status='returned',approved_at=null,approved_by=null,
        returned_at=now(),public_content_id=null,published_at=null,published_by=null
      where id=target_id;
      insert into public.task_report_events(report_id,actor_id,event_type,from_status,to_status,comment,metadata)
      values(target_id,auth.uid(),'returned',old_status,'returned',
        'Réouvert pour modification complète par le super-administrateur.',
        jsonb_build_object('super_admin_override',true));
    end if;
  end if;

  for field_name,field_value in select key,value from jsonb_each(coalesce(changes,'{}'::jsonb))
  loop
    if field_name=any(protected_fields) then
      raise exception 'Le champ technique % est protégé',field_name;
    end if;
    if resource_type='task_report' and field_name='status' then
      raise exception 'Le statut d’un rapport signé se modifie uniquement par le workflow';
    end if;
    if not exists(
      select 1 from information_schema.columns
      where table_schema='public' and table_name=target_table and column_name=field_name
        and is_generated='NEVER' and is_identity='NO'
    ) then
      raise exception 'Champ non modifiable : %',field_name;
    end if;

    execute format(
      'update public.%1$I t set %2$I=(select x.%2$I from jsonb_populate_record(null::public.%1$I,$1) x) where t.id=$2',
      target_table,field_name
    ) using jsonb_build_object(field_name,field_value),target_id;
  end loop;

  execute format('select to_jsonb(t) from public.%I t where t.id=$1',target_table)
    into result using target_id;
  return result;
end;
$$;

revoke all on function public.super_admin_update_resource(text,uuid,jsonb) from public,anon;
grant execute on function public.super_admin_update_resource(text,uuid,jsonb) to authenticated;
