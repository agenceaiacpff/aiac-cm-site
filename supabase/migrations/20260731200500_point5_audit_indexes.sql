-- Compléments de traçabilité et d’indexation du point 5 A/B.

create index account_scope_created_by_idx on public.account_scope_assignments(created_by);
create index profiles_password_reset_by_idx on public.profiles(password_reset_required_by) where password_reset_required_by is not null;
create index request_interventions_created_by_idx on public.request_interventions(created_by);
create index request_interventions_project_idx on public.request_interventions(project_id,status) where project_id is not null;
create index requests_archived_by_idx on public.requests(archived_by,archived_at desc) where archived_by is not null;
create index requests_reopened_by_idx on public.requests(last_reopened_by,last_reopened_at desc) where last_reopened_by is not null;
create index role_permissions_permission_idx on public.role_permissions(permission_code,role);
create index user_permission_overrides_body_idx on public.user_permission_overrides(body_id,profile_id) where body_id is not null;
create index user_permission_overrides_project_idx on public.user_permission_overrides(project_id,profile_id) where project_id is not null;
create index user_permission_overrides_granted_by_idx on public.user_permission_overrides(granted_by,created_at desc);
create index user_permission_overrides_permission_idx on public.user_permission_overrides(permission_code,profile_id);

create or replace function private.audit_point5_authorization_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare target_profile uuid; actor uuid; action_name text; entity_name text; target_uuid uuid;
begin
  if tg_table_name='user_permission_overrides' then
    if tg_op='DELETE' then target_profile=old.profile_id; actor=coalesce(auth.uid(),old.granted_by); target_uuid=old.id;
    else target_profile=new.profile_id; actor=coalesce(auth.uid(),new.granted_by); target_uuid=new.id; end if;
    entity_name='permission_override';
    action_name='authorization.permission_'||lower(tg_op);
    if tg_op='INSERT' then
      insert into public.admin_account_actions(target_profile_id,actor_id,action,reason,details)
      values(new.profile_id,new.granted_by,case when new.effect='allow' then 'grant_permission' else 'deny_permission' end,new.reason,jsonb_build_object('permission',new.permission_code,'scope_type',new.scope_type,'body_id',new.body_id,'project_id',new.project_id,'scope_value',new.scope_value,'expires_at',new.expires_at));
    end if;
  else
    if tg_op='DELETE' then target_profile=old.profile_id; actor=coalesce(auth.uid(),old.created_by); target_uuid=old.id;
    else target_profile=new.profile_id; actor=coalesce(auth.uid(),new.created_by); target_uuid=new.id; end if;
    entity_name='account_scope';
    action_name='authorization.scope_'||lower(tg_op);
    if tg_op='INSERT' then
      insert into public.admin_account_actions(target_profile_id,actor_id,action,reason,details)
      values(new.profile_id,new.created_by,'assign_scope',new.decision_reference,jsonb_build_object('scope_type',new.scope_type,'body_id',new.body_id,'project_id',new.project_id,'territory',new.territory,'permission_level',new.permission_level));
    end if;
  end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details,old_data,new_data)
  values(actor,action_name,entity_name,target_uuid,jsonb_build_object('target_profile_id',target_profile),case when tg_op='INSERT' then null else to_jsonb(old) end,case when tg_op='DELETE' then null else to_jsonb(new) end);
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.audit_point5_authorization_change() from public,anon,authenticated;

create trigger user_permission_overrides_audit after insert or update or delete on public.user_permission_overrides
for each row execute function private.audit_point5_authorization_change();
create trigger account_scope_assignments_audit after insert or update or delete on public.account_scope_assignments
for each row execute function private.audit_point5_authorization_change();

create or replace function private.sync_profile_email_confirmation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.email_confirmed_at is distinct from old.email_confirmed_at then
    update public.profiles set email_verified_at=new.email_confirmed_at where id=new.id;
  end if;
  return new;
end;
$$;
revoke all on function private.sync_profile_email_confirmation() from public,anon,authenticated;
drop trigger if exists auth_user_sync_profile_email_confirmation on auth.users;
create trigger auth_user_sync_profile_email_confirmation after update of email_confirmed_at on auth.users
for each row execute function private.sync_profile_email_confirmation();
