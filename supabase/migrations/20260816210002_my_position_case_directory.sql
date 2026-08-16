create or replace function public.sensitive_case_directory(
  target_project_id uuid,
  search_text text default null,
  max_rows integer default 200
)
returns table(
  profile_id uuid,
  full_name text,
  email text,
  phone text,
  position_titles text[]
)
language sql stable security definer set search_path=''
as $$
 with scope as (
   select pg.body_id
   from public.projects pr
   join public.programs pg on pg.id=pr.program_id
   where pr.id=target_project_id
 )
 select p.id,p.full_name,p.email,p.phone,
   coalesce(array_agg(distinct pd.title) filter(where pa.id is not null),array[]::text[])
 from public.profiles p
 left join public.position_assignments pa
   on pa.profile_id=p.id
  and pa.status='active'
  and pa.start_date<=current_date
  and (pa.end_date is null or pa.end_date>=current_date)
 left join public.position_definitions pd
   on pd.id=pa.position_id and pd.status='active'
 cross join scope s
 where p.status='active'
   and p.registration_state='approved'
   and (
     private.has_position_capability('case.assigned.manage',auth.uid(),s.body_id,target_project_id)
     or private.has_position_capability('case.supervise_sensitive',auth.uid(),s.body_id,target_project_id)
     or private.has_position_capability('protection.manage',auth.uid(),s.body_id,target_project_id)
   )
   and (
     search_text is null
     or concat_ws(' ',p.full_name,p.email,p.phone,p.organization) ilike '%'||search_text||'%'
   )
 group by p.id,p.full_name,p.email,p.phone
 order by coalesce(p.full_name,p.email)
 limit least(greatest(max_rows,1),500);
$$;

grant execute on function public.sensitive_case_directory(uuid,text,integer) to authenticated;
