create or replace function public.correspondence_directory(
  target_body_id uuid default null,
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
 where p.status='active'
   and p.registration_state='approved'
   and (
     private.has_position_capability('correspondence.orient',auth.uid(),target_body_id,null)
     or private.has_position_capability('correspondence.manage',auth.uid(),target_body_id,null)
   )
   and (
     search_text is null
     or concat_ws(' ',p.full_name,p.email,p.phone,p.organization) ilike '%'||search_text||'%'
   )
 group by p.id,p.full_name,p.email,p.phone
 order by coalesce(p.full_name,p.email)
 limit least(greatest(max_rows,1),500);
$$;

grant execute on function public.correspondence_directory(uuid,text,integer) to authenticated;
