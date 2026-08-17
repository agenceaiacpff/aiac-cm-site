create or replace function public.hr_personnel_catalog() returns table(
 profile_id uuid,full_name text,email text,phone text,account_role text,assignment_id uuid,assignment_nature text,position_id uuid,position_code text,position_title text,role_key text,slot_id uuid,slot_code text,body_id uuid,body_code text,body_name text,region text,locality text,program_id uuid,program_code text,project_id uuid,project_code text,decision_reference text,start_date date,end_date date,assignment_status text
) language plpgsql security definer set search_path='' as $$
declare full_access boolean;
begin
 if not private.is_active_approved_user(auth.uid()) then raise exception 'Accès refusé'; end if;
 if not (private.has_position_capability('staffing.view',auth.uid(),null,null) or private.has_position_capability('hr.manage',auth.uid(),null,null) or private.is_super_admin(auth.uid())) then raise exception 'Annuaire RH non autorisé'; end if;
 full_access:=private.has_position_capability('hr.manage',auth.uid(),null,null) or private.has_position_capability('staffing.assign',auth.uid(),null,null) or private.is_super_admin(auth.uid());
 return query select p.id,p.full_name,case when full_access then p.email else null end,case when full_access then p.phone else null end,p.role::text,
 pa.id,pa.assignment_nature,pd.id,pd.code,pd.title,pd.role_key,ps.id,ps.slot_code,gb.id,gb.code,gb.name,gb.region,gb.locality,ps.program_id,prg.code,ps.project_id,pr.code,pa.decision_reference,pa.start_date,pa.end_date,pa.status
 from public.position_assignments pa join public.profiles p on p.id=pa.profile_id join public.position_definitions pd on pd.id=pa.position_id
 left join public.position_slots ps on ps.id=pa.slot_id join public.governance_bodies gb on gb.id=pa.body_id
 left join public.programs prg on prg.id=ps.program_id left join public.projects pr on pr.id=ps.project_id
 where p.status='active' order by p.full_name nulls last,pd.title,pa.start_date desc;
end $$;
grant execute on function public.hr_personnel_catalog() to authenticated;