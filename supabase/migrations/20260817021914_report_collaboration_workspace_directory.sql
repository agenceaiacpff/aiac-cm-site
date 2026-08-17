create or replace function public.report_collaboration_directory() returns table(profile_id uuid,full_name text,email text,position_titles text[],body_codes text[])
language sql stable security definer set search_path='' as $$
 select p.id,p.full_name,p.email,
 coalesce(array_agg(distinct pd.title) filter(where pd.title is not null),'{}'::text[]),
 coalesce(array_agg(distinct gb.code) filter(where gb.code is not null),'{}'::text[])
 from public.profiles p left join public.position_assignments pa on pa.profile_id=p.id and pa.status='active' and pa.start_date<=current_date and (pa.end_date is null or pa.end_date>=current_date)
 left join public.position_definitions pd on pd.id=pa.position_id left join public.governance_bodies gb on gb.id=pa.body_id
 where private.is_active_approved_user(auth.uid()) and p.status='active' and p.registration_state='approved'
 group by p.id,p.full_name,p.email order by p.full_name nulls last,p.email;
$$;
grant execute on function public.report_collaboration_directory() to authenticated;

create or replace function public.report_collaboration_workspace() returns table(
 session_id uuid,report_id uuid,owner_id uuid,owner_name text,report_number text,report_title text,session_status text,live_html text,revision bigint,is_owner boolean,collaborators jsonb,changes jsonb,comments jsonb
) language sql stable security definer set search_path='' as $$
 select s.id,s.report_id,s.owner_id,coalesce(op.full_name,op.email,'Auteur AIAC'),tr.report_number,tr.title,s.status,s.live_html,s.revision,(s.owner_id=auth.uid()),
 coalesce((select jsonb_agg(jsonb_build_object('user_id',c.user_id,'name',coalesce(p.full_name,p.email),'email',p.email,'access_level',c.access_level,'invited_at',c.invited_at) order by coalesce(p.full_name,p.email)) from public.report_collaborators c join public.profiles p on p.id=c.user_id where c.session_id=s.id),'[]'::jsonb),
 coalesce((select jsonb_agg(jsonb_build_object('id',ch.id,'user_id',ch.user_id,'name',coalesce(p.full_name,p.email),'revision_before',ch.revision_before,'revision_after',ch.revision_after,'note',ch.note,'disposition',ch.disposition,'created_at',ch.created_at) order by ch.created_at desc) from public.report_collaboration_changes ch join public.profiles p on p.id=ch.user_id where ch.session_id=s.id),'[]'::jsonb),
 coalesce((select jsonb_agg(jsonb_build_object('id',cm.id,'user_id',cm.user_id,'name',coalesce(p.full_name,p.email),'body',cm.body,'resolved_at',cm.resolved_at,'created_at',cm.created_at) order by cm.created_at) from public.report_collaboration_comments cm join public.profiles p on p.id=cm.user_id where cm.session_id=s.id),'[]'::jsonb)
 from public.report_collaboration_sessions s join public.task_reports tr on tr.id=s.report_id join public.profiles op on op.id=s.owner_id
 where private.can_access_report_collaboration(s.id)
 order by s.updated_at desc;
$$;
grant execute on function public.report_collaboration_workspace() to authenticated;

create or replace function public.my_collaborable_reports() returns table(id uuid,report_number text,title text,status text,updated_at timestamptz)
language sql stable security definer set search_path='' as $$
 select tr.id,tr.report_number,tr.title,tr.status,tr.updated_at from public.task_reports tr
 where tr.reporter_id=auth.uid() and tr.status in('draft','returned') order by tr.updated_at desc;
$$;
grant execute on function public.my_collaborable_reports() to authenticated;