-- Deep audit hardening for the institutional "Mon poste" workspace.
-- This migration is replay-safe on top of the institutional position system.

create or replace function private.has_position_capability(
  target_capability text,
  uid uuid default auth.uid(),
  target_body_id uuid default null,
  target_project_id uuid default null
) returns boolean
language sql stable security definer set search_path=''
as $$
 select (
   uid is not null
   and uid=auth.uid()
   and private.is_super_admin(uid)
   and private.has_aal2()
 ) or exists(
  select 1
  from public.position_assignments pa
  join public.position_definitions pd on pd.id=pa.position_id and pd.status='active'
  join public.position_capabilities pc on pc.position_id=pd.id and pc.capability_key=target_capability
  left join public.position_slots ps on ps.id=pa.slot_id
  left join public.projects pr on pr.id=target_project_id
  left join public.programs pg on pg.id=pr.program_id
  where pa.profile_id=uid
    and pa.status='active'
    and pa.start_date<=current_date
    and (pa.end_date is null or pa.end_date>=current_date)
    and (
      (target_body_id is null and target_project_id is null)
      or pc.scope_mode='institution'
      or (
        target_project_id is not null
        and (
          ps.project_id=target_project_id
          or (
            ps.project_id is null
            and pc.scope_mode in('body','subordinates')
            and private.body_in_position_scope(pa.body_id,pg.body_id)
          )
        )
      )
      or (
        target_body_id is not null
        and pc.scope_mode in('body','subordinates','assignment')
        and private.body_in_position_scope(pa.body_id,target_body_id)
      )
    )
 );
$$;

create or replace function private.refresh_position_slot_status(target_slot_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare
 cnt integer;
 mx integer;
 current_status text;
begin
 if target_slot_id is null then return; end if;
 select max_occupants,status into mx,current_status
 from public.position_slots
 where id=target_slot_id
 for update;
 if not found or current_status in('suspended','abolished') then return; end if;
 select count(*) into cnt
 from public.position_assignments
 where slot_id=target_slot_id and status='active';
 update public.position_slots
 set status=case
   when cnt=0 then 'vacant'
   when mx is not null and cnt>=mx then 'filled'
   else 'partially_filled'
 end,
 updated_at=now()
 where id=target_slot_id;
end $$;

create or replace function public.my_position_workspace()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare
 uid uuid:=auth.uid();
 result jsonb;
 is_sa boolean;
 is_institution_staffer boolean;
begin
 if uid is null then raise exception 'Authentification requise'; end if;
 if not private.is_active_approved_user(uid) then raise exception 'Compte actif et approuvé requis'; end if;
 is_sa:=private.is_super_admin(uid) and private.has_aal2();

 select is_sa or exists(
   select 1
   from public.position_assignments pa
   join public.position_definitions pd on pd.id=pa.position_id and pd.status='active'
   join public.position_capabilities pc on pc.position_id=pa.position_id
   where pa.profile_id=uid
     and pa.status='active'
     and pa.start_date<=current_date
     and (pa.end_date is null or pa.end_date>=current_date)
     and pc.capability_key='staffing.assign'
     and pc.scope_mode='institution'
 ) into is_institution_staffer;

 select jsonb_build_object(
  'profile',(
    select jsonb_build_object('id',p.id,'full_name',p.full_name,'email',p.email,'phone',p.phone,'role',p.role)
    from public.profiles p where p.id=uid
  ),
  'assignments',coalesce((
    select jsonb_agg(jsonb_build_object(
      'assignment_id',pa.id,'slot_id',ps.id,'slot_code',ps.slot_code,'position_code',pd.code,'title',pd.title,
      'role_key',pd.role_key,'role_family',pd.role_family,'purpose',pd.job_purpose,'responsibilities',pd.responsibilities,
      'modules',pd.workspace_modules,'source_basis',pd.source_basis,'source_status',pd.source_status,
      'body_id',gb.id,'body_code',gb.code,'body_name',gb.name,'body_type',gb.body_type,'level',gb.deployment_level,
      'region',gb.region,'locality',gb.locality,'subsidiary_code',gb.subsidiary_code,
      'project_id',ps.project_id,'project_code',pr.code,'project_name',pr.name,
      'program_id',ps.program_id,'program_code',pg.code,'program_name',pg.name,
      'supervisor_slot_id',ps.supervisor_slot_id,'technical_supervisor_slot_id',ps.technical_supervisor_slot_id,
      'decision_reference',pa.decision_reference,'territory',pa.territory,'start_date',pa.start_date,'end_date',pa.end_date
    ) order by pa.start_date desc)
    from public.position_assignments pa
    join public.position_definitions pd on pd.id=pa.position_id and pd.status='active'
    left join public.position_slots ps on ps.id=pa.slot_id
    join public.governance_bodies gb on gb.id=pa.body_id
    left join public.projects pr on pr.id=ps.project_id
    left join public.programs pg on pg.id=ps.program_id
    where pa.profile_id=uid
      and pa.status='active'
      and pa.start_date<=current_date
      and (pa.end_date is null or pa.end_date>=current_date)
  ),'[]'::jsonb),
  'capabilities',case when is_sa then
    coalesce((select jsonb_agg(capability_key order by capability_key) from public.position_capability_catalog),'[]'::jsonb)
  else
    coalesce((
      select jsonb_agg(distinct pc.capability_key)
      from public.position_assignments pa
      join public.position_definitions pd on pd.id=pa.position_id and pd.status='active'
      join public.position_capabilities pc on pc.position_id=pa.position_id
      where pa.profile_id=uid and pa.status='active'
        and pa.start_date<=current_date and (pa.end_date is null or pa.end_date>=current_date)
    ),'[]'::jsonb)
  end,
  'capability_details',case when is_sa then
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'key',capability_key,'label',label,'description',description,'risk_level',risk_level
      ) order by capability_key)
      from public.position_capability_catalog
    ),'[]'::jsonb)
  else
    coalesce((
      select jsonb_agg(distinct jsonb_build_object(
        'key',pc.capability_key,'label',cc.label,'description',cc.description,'risk_level',cc.risk_level
      ))
      from public.position_assignments pa
      join public.position_definitions pd on pd.id=pa.position_id and pd.status='active'
      join public.position_capabilities pc on pc.position_id=pa.position_id
      join public.position_capability_catalog cc on cc.capability_key=pc.capability_key
      where pa.profile_id=uid and pa.status='active'
        and pa.start_date<=current_date and (pa.end_date is null or pa.end_date>=current_date)
    ),'[]'::jsonb)
  end,
  'supervisors',coalesce((select jsonb_agg(x.obj) from (
    select jsonb_build_object(
      'profile_id',p.id,'assignment_id',sup.id,'name',p.full_name,'email',p.email,'phone',p.phone,
      'title',pd.title,'slot_code',ss.slot_code,'relation_type','hiérarchique'
    ) obj
    from public.position_assignments me
    join public.position_slots ms on ms.id=me.slot_id
    join public.position_slots ss on ss.id=ms.supervisor_slot_id
    join public.position_assignments sup on sup.slot_id=ss.id and sup.status='active'
      and sup.start_date<=current_date and (sup.end_date is null or sup.end_date>=current_date)
    join public.position_definitions pd on pd.id=sup.position_id and pd.status='active'
    join public.profiles p on p.id=sup.profile_id
    where me.profile_id=uid and me.status='active'
      and me.start_date<=current_date and (me.end_date is null or me.end_date>=current_date)
    union all
    select jsonb_build_object(
      'profile_id',p.id,'assignment_id',sup.id,'name',p.full_name,'email',p.email,'phone',p.phone,
      'title',pd.title,'slot_code',ss.slot_code,'relation_type','technique'
    ) obj
    from public.position_assignments me
    join public.position_slots ms on ms.id=me.slot_id
    join public.position_slots ss on ss.id=ms.technical_supervisor_slot_id
    join public.position_assignments sup on sup.slot_id=ss.id and sup.status='active'
      and sup.start_date<=current_date and (sup.end_date is null or sup.end_date>=current_date)
    join public.position_definitions pd on pd.id=sup.position_id and pd.status='active'
    join public.profiles p on p.id=sup.profile_id
    where me.profile_id=uid and me.status='active'
      and me.start_date<=current_date and (me.end_date is null or me.end_date>=current_date)
  ) x),'[]'::jsonb),
  'subordinates',coalesce((select jsonb_agg(x.obj) from (
    select jsonb_build_object(
      'profile_id',p.id,'assignment_id',sub.id,'name',p.full_name,'email',p.email,'phone',p.phone,
      'title',pd.title,'slot_code',cs.slot_code,'body_code',gb.code,'relation_type','hiérarchique'
    ) obj
    from public.position_assignments me
    join public.position_slots ms on ms.id=me.slot_id
    join public.position_slots cs on cs.supervisor_slot_id=ms.id
    join public.position_assignments sub on sub.slot_id=cs.id and sub.status='active'
      and sub.start_date<=current_date and (sub.end_date is null or sub.end_date>=current_date)
    join public.position_definitions pd on pd.id=sub.position_id and pd.status='active'
    join public.profiles p on p.id=sub.profile_id
    join public.governance_bodies gb on gb.id=sub.body_id
    where me.profile_id=uid and me.status='active'
      and me.start_date<=current_date and (me.end_date is null or me.end_date>=current_date)
    union all
    select jsonb_build_object(
      'profile_id',p.id,'assignment_id',sub.id,'name',p.full_name,'email',p.email,'phone',p.phone,
      'title',pd.title,'slot_code',cs.slot_code,'body_code',gb.code,'relation_type','technique'
    ) obj
    from public.position_assignments me
    join public.position_slots ms on ms.id=me.slot_id
    join public.position_slots cs on cs.technical_supervisor_slot_id=ms.id
    join public.position_assignments sub on sub.slot_id=cs.id and sub.status='active'
      and sub.start_date<=current_date and (sub.end_date is null or sub.end_date>=current_date)
    join public.position_definitions pd on pd.id=sub.position_id and pd.status='active'
    join public.profiles p on p.id=sub.profile_id
    join public.governance_bodies gb on gb.id=sub.body_id
    where me.profile_id=uid and me.status='active'
      and me.start_date<=current_date and (me.end_date is null or me.end_date>=current_date)
  ) x),'[]'::jsonb),
  'resources',coalesce((
    select jsonb_agg(distinct jsonb_build_object(
      'resource_code',rc.resource_code,'title',rc.title,'category',rc.category,
      'source_reference',rc.source_reference,'source_file_name',rc.source_file_name,
      'classification',rc.classification,'availability',rc.availability,'document_id',rc.document_id,
      'description',rc.description,'required',rl.required
    ))
    from public.position_assignments pa
    join public.position_definitions pd on pd.id=pa.position_id and pd.status='active'
    join public.institutional_resource_role_links rl on rl.role_key=pd.role_key
    join public.institutional_resource_catalog rc on rc.id=rl.resource_id
    where pa.profile_id=uid and pa.status='active'
      and pa.start_date<=current_date and (pa.end_date is null or pa.end_date>=current_date)
  ),'[]'::jsonb),
  'linked_projects',coalesce((
    select jsonb_agg(distinct jsonb_build_object(
      'id',pr.id,'code',pr.code,'name',pr.name,'status',pr.status,'program_code',pg.code,
      'body_id',gb.id,'body_code',gb.code,'body_name',gb.name
    ))
    from public.projects pr
    join public.programs pg on pg.id=pr.program_id
    join public.governance_bodies gb on gb.id=pg.body_id
    where is_sa or exists(
      select 1
      from public.position_assignments pa
      left join public.position_slots ps on ps.id=pa.slot_id
      where pa.profile_id=uid and pa.status='active'
        and pa.start_date<=current_date and (pa.end_date is null or pa.end_date>=current_date)
        and (ps.project_id=pr.id or private.body_in_position_scope(pa.body_id,pg.body_id) or is_institution_staffer)
    )
  ),'[]'::jsonb)
 ) into result;
 return result;
end $$;

create or replace function public.my_position_operational_summary()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare uid uuid:=auth.uid(); result jsonb;
begin
 if uid is null then raise exception 'Authentification requise'; end if;
 select jsonb_build_object(
  'pending_reports_to_validate',(select count(*) from public.task_reports r where r.status='submitted' and private.can_review_task_report(r.id,uid)),
  'my_reports',(select count(*) from public.task_reports r where r.reporter_id=uid),
  'my_approved_reports',(select count(*) from public.task_reports r where r.reporter_id=uid and r.status='approved'),
  'upcoming_meetings',(select count(*) from public.meeting_participants mp join public.meetings m on m.id=mp.meeting_id where mp.user_id=uid and m.ends_at>=now() and m.status not in('cancelled','archived')),
  'correspondence_to_process',(select count(*) from public.institutional_correspondence c where c.status not in('closed','no_action','archived') and (c.assigned_to=uid or private.has_position_capability('correspondence.manage',uid,c.body_id,null) or private.has_position_capability('correspondence.orient',uid,c.body_id,null))),
  'assigned_sensitive_cases',(select count(*) from public.case_files c where c.status<>'closed' and c.assigned_to=uid),
  'subordinates',(select count(distinct sub.id)
    from public.position_assignments me
    join public.position_slots ms on ms.id=me.slot_id
    join public.position_slots cs on (cs.supervisor_slot_id=ms.id or cs.technical_supervisor_slot_id=ms.id)
    join public.position_assignments sub on sub.slot_id=cs.id and sub.status='active'
      and sub.start_date<=current_date and (sub.end_date is null or sub.end_date>=current_date)
    where me.profile_id=uid and me.status='active'
      and me.start_date<=current_date and (me.end_date is null or me.end_date>=current_date))
 ) into result;
 return result;
end $$;

create or replace function public.position_assignment_catalog(
  target_slot_id uuid default null,
  search_text text default null,
  max_rows integer default 500
)
returns table(
 assignment_id uuid,slot_id uuid,slot_code text,position_code text,title text,
 body_id uuid,body_code text,body_name text,profile_id uuid,full_name text,email text,phone text,
 decision_reference text,territory text,start_date date,end_date date,assignment_status text,
 supervisor_assignment_id uuid,appointed_by uuid,appointed_by_name text
)
language sql stable security definer set search_path=''
as $$
 select pa.id,pa.slot_id,ps.slot_code,pd.code,pd.title,pa.body_id,gb.code,gb.name,
        pa.profile_id,p.full_name,p.email,p.phone,pa.decision_reference,pa.territory,
        pa.start_date,pa.end_date,pa.status,pa.supervisor_assignment_id,pa.appointed_by,ap.full_name
 from public.position_assignments pa
 join public.position_definitions pd on pd.id=pa.position_id
 join public.governance_bodies gb on gb.id=pa.body_id
 left join public.position_slots ps on ps.id=pa.slot_id
 left join public.profiles p on p.id=pa.profile_id
 left join public.profiles ap on ap.id=pa.appointed_by
 where private.has_position_capability('staffing.view',auth.uid(),pa.body_id,ps.project_id)
   and (target_slot_id is null or pa.slot_id=target_slot_id)
   and (search_text is null or concat_ws(' ',ps.slot_code,pd.code,pd.title,gb.code,gb.name,p.full_name,p.email,pa.decision_reference,pa.territory,pa.status) ilike '%'||search_text||'%')
 order by case pa.status when 'active' then 0 when 'planned' then 1 when 'suspended' then 2 else 3 end,pa.start_date desc
 limit least(greatest(max_rows,1),2000);
$$;
grant execute on function public.position_assignment_catalog(uuid,text,integer) to authenticated;

create or replace function public.assign_profile_to_position_slot(
  target_slot_id uuid,
  target_profile_id uuid,
  target_decision_reference text,
  target_start_date date default current_date
)
returns uuid language plpgsql security definer set search_path=''
as $$
declare
 s public.position_slots%rowtype;
 aid uuid;
 supaid uuid;
 cnt int;
begin
 if auth.uid() is null then raise exception 'Authentification requise'; end if;
 select * into s from public.position_slots where id=target_slot_id and status not in('suspended','abolished') for update;
 if not found then raise exception 'Poste établi introuvable ou inactif'; end if;
 if not private.has_position_capability('staffing.assign',auth.uid(),s.body_id,s.project_id) then raise exception 'Affectation non autorisée dans ce périmètre'; end if;
 if char_length(btrim(coalesce(target_decision_reference,'')))<2 then raise exception 'Référence de décision obligatoire'; end if;
 if not exists(select 1 from public.profiles p where p.id=target_profile_id and p.status='active' and p.registration_state='approved') then raise exception 'Compte actif et approuvé requis'; end if;
 if exists(select 1 from public.position_assignments pa where pa.slot_id=s.id and pa.profile_id=target_profile_id and pa.status='active') then raise exception 'Cette personne occupe déjà ce poste'; end if;
 select count(*) into cnt from public.position_assignments pa where pa.slot_id=s.id and pa.status='active';
 if s.max_occupants is not null and cnt>=s.max_occupants then raise exception 'Nombre de titulaires atteint'; end if;
 if s.supervisor_slot_id is not null then
   select id into supaid from public.position_assignments
   where slot_id=s.supervisor_slot_id and status='active'
     and start_date<=current_date and (end_date is null or end_date>=current_date)
   order by start_date desc limit 1;
 end if;
 insert into public.position_assignments(position_id,body_id,profile_id,supervisor_assignment_id,territory,decision_reference,start_date,status,appointed_by,slot_id)
 values(
   s.position_id,s.body_id,target_profile_id,supaid,
   (select coalesce(region,territory,locality) from public.governance_bodies where id=s.body_id),
   btrim(target_decision_reference),coalesce(target_start_date,current_date),'active',auth.uid(),s.id
 ) returning id into aid;
 update public.position_assignments child
 set supervisor_assignment_id=aid
 from public.position_slots child_slot
 where child.slot_id=child_slot.id and child.status='active' and child.supervisor_assignment_id is null
   and child_slot.supervisor_slot_id=s.id;
 perform private.refresh_position_slot_status(s.id);
 insert into public.institutional_position_events(slot_id,assignment_id,actor_id,event_type,metadata)
 values(s.id,aid,auth.uid(),'assigned',jsonb_build_object('profile_id',target_profile_id,'decision_reference',target_decision_reference,'start_date',target_start_date));
 if target_profile_id<>auth.uid() then
   insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id)
   values(
     target_profile_id,'Nouvelle affectation à un poste AIAC',
     (select pd.title||' · '||gb.code from public.position_definitions pd join public.governance_bodies gb on gb.id=s.body_id where pd.id=s.position_id),
     '/espace/poste?section=dashboard','position','position_assignment',aid
   );
 end if;
 return aid;
end $$;

create or replace function public.assign_profile_to_position_definition(
  target_position_id uuid,
  target_body_id uuid,
  target_profile_id uuid,
  target_decision_reference text,
  target_start_date date default current_date
)
returns uuid language plpgsql security definer set search_path=''
as $$
declare sid uuid; n integer;
begin
 select count(*),min(s.id) into n,sid
 from public.position_slots s
 where s.position_id=target_position_id
   and s.body_id=target_body_id
   and s.project_id is null
   and s.program_id is null
   and s.status not in('suspended','abolished','filled');
 if n=0 then raise exception 'Aucun poste établi disponible pour cette fonction et cet organe'; end if;
 if n>1 then raise exception 'Plusieurs postes correspondent : utilisez Mon poste > Structure & affectations pour choisir le poste exact'; end if;
 return public.assign_profile_to_position_slot(sid,target_profile_id,target_decision_reference,target_start_date);
end $$;
grant execute on function public.assign_profile_to_position_definition(uuid,uuid,uuid,text,date) to authenticated;

create or replace function public.update_position_assignment(
  target_assignment_id uuid,
  target_decision_reference text default null,
  target_start_date date default null,
  target_end_date date default null,
  target_territory text default null,
  target_status text default null,
  target_reason text default null
)
returns public.position_assignments language plpgsql security definer set search_path=''
as $$
declare
 a public.position_assignments%rowtype;
 s public.position_slots%rowtype;
 old_status text;
 replacement uuid;
begin
 select * into a from public.position_assignments where id=target_assignment_id for update;
 if not found then raise exception 'Affectation introuvable'; end if;
 select * into s from public.position_slots where id=a.slot_id;
 if not private.has_position_capability('staffing.assign',auth.uid(),a.body_id,s.project_id) then raise exception 'Modification d’affectation non autorisée'; end if;
 if target_status is not null and target_status not in('active','planned','suspended','ended') then raise exception 'Statut d’affectation invalide'; end if;
 if target_decision_reference is not null and char_length(btrim(target_decision_reference))<2 then raise exception 'Référence de décision invalide'; end if;
 if target_status is distinct from a.status and char_length(btrim(coalesce(target_reason,'')))<3 then raise exception 'Motif obligatoire pour changer l’état de l’affectation'; end if;
 old_status:=a.status;
 update public.position_assignments set
   decision_reference=coalesce(nullif(btrim(target_decision_reference),''),decision_reference),
   start_date=coalesce(target_start_date,start_date),
   end_date=case
     when target_status='ended' then coalesce(target_end_date,current_date)
     when target_status='active' then target_end_date
     else coalesce(target_end_date,end_date)
   end,
   territory=case when target_territory is null then territory else nullif(btrim(target_territory),'') end,
   status=coalesce(target_status,status),
   updated_at=now()
 where id=a.id returning * into a;
 if a.end_date is not null and a.end_date<a.start_date then raise exception 'La date de fin ne peut pas précéder la prise d’effet'; end if;
 if a.status in('ended','suspended') then
   if a.slot_id is not null then
     select id into replacement from public.position_assignments
     where slot_id=a.slot_id and id<>a.id and status='active'
       and start_date<=current_date and (end_date is null or end_date>=current_date)
     order by start_date desc limit 1;
   end if;
   update public.position_assignments set supervisor_assignment_id=replacement where supervisor_assignment_id=a.id;
 elsif a.status='active' and a.slot_id is not null then
   update public.position_assignments child
   set supervisor_assignment_id=a.id
   from public.position_slots cs
   where child.slot_id=cs.id and child.status='active' and child.supervisor_assignment_id is null
     and cs.supervisor_slot_id=a.slot_id;
 end if;
 perform private.refresh_position_slot_status(a.slot_id);
 insert into public.institutional_position_events(slot_id,assignment_id,actor_id,event_type,metadata)
 values(
   a.slot_id,a.id,auth.uid(),case when a.status<>old_status then 'status_changed' else 'updated' end,
   jsonb_build_object('old_status',old_status,'new_status',a.status,'reason',target_reason,'decision_reference',a.decision_reference,'start_date',a.start_date,'end_date',a.end_date)
 );
 if a.profile_id is not null and a.profile_id<>auth.uid() then
   insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id)
   values(
     a.profile_id,
     case when a.status='ended' then 'Affectation AIAC terminée' when a.status='suspended' then 'Affectation AIAC suspendue' else 'Affectation AIAC mise à jour' end,
     'Une modification a été enregistrée sur votre poste. Consultez Mon poste pour les détails.',
     '/espace/poste?section=dashboard','position','position_assignment',a.id
   );
 end if;
 return a;
end $$;
grant execute on function public.update_position_assignment(uuid,text,date,date,text,text,text) to authenticated;

create or replace function public.delete_position_assignment_admin(target_assignment_id uuid,target_reason text)
returns boolean language plpgsql security definer set search_path=''
as $$
declare a public.position_assignments%rowtype; replacement uuid;
begin
 if not private.is_super_admin(auth.uid()) or not private.has_aal2() then raise exception 'Suppression réservée au super-administrateur avec MFA AAL2'; end if;
 if char_length(btrim(coalesce(target_reason,'')))<5 then raise exception 'Motif de suppression obligatoire'; end if;
 select * into a from public.position_assignments where id=target_assignment_id for update;
 if not found then raise exception 'Affectation introuvable'; end if;
 if a.slot_id is not null then
   select id into replacement from public.position_assignments
   where slot_id=a.slot_id and id<>a.id and status='active'
     and start_date<=current_date and (end_date is null or end_date>=current_date)
   order by start_date desc limit 1;
 end if;
 update public.position_assignments set supervisor_assignment_id=replacement where supervisor_assignment_id=a.id;
 insert into public.institutional_position_events(slot_id,assignment_id,actor_id,event_type,metadata)
 values(a.slot_id,a.id,auth.uid(),'deleted',jsonb_build_object('reason',target_reason,'profile_id',a.profile_id,'decision_reference',a.decision_reference));
 perform private.write_audit('position.assignment_deleted','position_assignment',a.id,jsonb_build_object('reason',target_reason,'profile_id',a.profile_id,'slot_id',a.slot_id));
 delete from public.position_assignments where id=a.id;
 perform private.refresh_position_slot_status(a.slot_id);
 return true;
end $$;
grant execute on function public.delete_position_assignment_admin(uuid,text) to authenticated;

create or replace function public.orient_correspondence(
  target_id uuid,
  target_assigned_to uuid,
  target_due_at timestamptz default null,
  target_comment text default null
)
returns public.institutional_correspondence language plpgsql security definer set search_path=''
as $$
declare c public.institutional_correspondence%rowtype; old text; old_assigned uuid;
begin
 select * into c from public.institutional_correspondence where id=target_id for update;
 if not found then raise exception 'Courrier introuvable'; end if;
 if not private.has_position_capability('correspondence.orient',auth.uid(),c.body_id,null) then raise exception 'Orientation non autorisée'; end if;
 if not exists(select 1 from public.profiles p where p.id=target_assigned_to and p.status='active' and p.registration_state='approved') then raise exception 'Destinataire actif et approuvé requis'; end if;
 old:=c.status; old_assigned:=c.assigned_to;
 update public.institutional_correspondence
 set assigned_to=target_assigned_to,oriented_by=auth.uid(),oriented_at=now(),due_at=target_due_at,status='transmitted',updated_at=now()
 where id=c.id returning * into c;
 insert into public.institutional_correspondence_events(correspondence_id,actor_id,event_type,from_status,to_status,comment,metadata)
 values(c.id,auth.uid(),'oriented',old,c.status,target_comment,jsonb_build_object('assigned_to',target_assigned_to,'due_at',target_due_at));
 if target_assigned_to<>auth.uid() then
   insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id)
   values(
     target_assigned_to,'Courrier AIAC à traiter',
     case when c.classification in('restricted','confidential') then 'Un courrier protégé vous a été orienté.' else c.correspondence_number||' · '||left(c.subject,240) end,
     '/espace/poste?section=correspondence&correspondence='||c.id,'position_correspondence','correspondence',c.id
   );
 end if;
 if old_assigned is not null and old_assigned<>target_assigned_to and old_assigned<>auth.uid() then
   insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id)
   values(old_assigned,'Courrier AIAC réorienté','Le courrier qui vous était affecté a été réorienté.','/espace/poste?section=correspondence','position_correspondence','correspondence',c.id);
 end if;
 return c;
end $$;

create or replace function public.update_correspondence(
  target_id uuid,
  target_subject text,
  target_sender_name text default null,
  target_sender_organization text default null,
  target_sender_reference text default null,
  target_recipient_name text default null,
  target_recipient_organization text default null,
  target_recipient_contact text default null,
  target_medium text default null,
  target_priority text default null,
  target_classification text default null,
  target_comment text default null
)
returns public.institutional_correspondence language plpgsql security definer set search_path=''
as $$
declare c public.institutional_correspondence%rowtype;
begin
 select * into c from public.institutional_correspondence where id=target_id for update;
 if not found then raise exception 'Courrier introuvable'; end if;
 if not private.has_position_capability('correspondence.manage',auth.uid(),c.body_id,null) then raise exception 'Modification non autorisée'; end if;
 if c.status='archived' then raise exception 'Un courrier archivé ne peut plus être modifié'; end if;
 if char_length(btrim(coalesce(target_subject,'')))<3 then raise exception 'Objet du courrier obligatoire'; end if;
 update public.institutional_correspondence set
   subject=btrim(target_subject),sender_name=target_sender_name,sender_organization=target_sender_organization,
   sender_reference=target_sender_reference,recipient_name=target_recipient_name,
   recipient_organization=target_recipient_organization,recipient_contact=target_recipient_contact,
   medium=coalesce(target_medium,medium),priority=coalesce(target_priority,priority),
   classification=coalesce(target_classification,classification),updated_at=now()
 where id=c.id returning * into c;
 insert into public.institutional_correspondence_events(correspondence_id,actor_id,event_type,from_status,to_status,comment,metadata)
 values(c.id,auth.uid(),'updated',c.status,c.status,target_comment,jsonb_build_object('subject',c.subject,'priority',c.priority,'classification',c.classification));
 return c;
end $$;
grant execute on function public.update_correspondence(uuid,text,text,text,text,text,text,text,text,text,text,text) to authenticated;

create or replace function public.process_correspondence(target_id uuid,target_status text,target_comment text default null)
returns public.institutional_correspondence language plpgsql security definer set search_path=''
as $$
declare c public.institutional_correspondence%rowtype; old text; can_manage boolean;
begin
 select * into c from public.institutional_correspondence where id=target_id for update;
 if not found then raise exception 'Courrier introuvable'; end if;
 can_manage:=private.has_position_capability('correspondence.manage',auth.uid(),c.body_id,null);
 if c.assigned_to<>auth.uid() and not can_manage then raise exception 'Traitement non autorisé'; end if;
 if target_status not in('processing','waiting','validated','replied','closed','no_action') then raise exception 'État de traitement invalide'; end if;
 if target_status='validated' and not can_manage then raise exception 'Validation du courrier réservée au responsable habilité'; end if;
 old:=c.status;
 update public.institutional_correspondence
 set status=target_status,
     closed_at=case when target_status in('closed','no_action') then now() else null end,
     closing_note=case when target_status in('closed','no_action') then target_comment else closing_note end,
     updated_at=now()
 where id=c.id returning * into c;
 insert into public.institutional_correspondence_events(correspondence_id,actor_id,event_type,from_status,to_status,comment,metadata)
 values(c.id,auth.uid(),'status_changed',old,c.status,target_comment,'{}'::jsonb);
 if c.created_by<>auth.uid() then
   insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id)
   values(c.created_by,'Évolution d’un courrier AIAC',c.correspondence_number||' · état : '||c.status,'/espace/poste?section=correspondence&correspondence='||c.id,'position_correspondence','correspondence',c.id);
 end if;
 return c;
end $$;
grant execute on function public.process_correspondence(uuid,text,text) to authenticated;

create or replace function public.delete_correspondence_admin(target_id uuid,target_reason text)
returns boolean language plpgsql security definer set search_path=''
as $$
declare c public.institutional_correspondence%rowtype;
begin
 if not private.is_super_admin(auth.uid()) or not private.has_aal2() then raise exception 'Suppression réservée au super-administrateur avec MFA AAL2'; end if;
 if char_length(btrim(coalesce(target_reason,'')))<5 then raise exception 'Motif de suppression obligatoire'; end if;
 select * into c from public.institutional_correspondence where id=target_id for update;
 if not found then raise exception 'Courrier introuvable'; end if;
 perform private.write_audit('correspondence.deleted','institutional_correspondence',c.id,jsonb_build_object('reason',target_reason,'number',c.correspondence_number,'body_id',c.body_id));
 delete from public.institutional_correspondence where id=c.id;
 return true;
end $$;
grant execute on function public.delete_correspondence_admin(uuid,text) to authenticated;

create or replace function private.prepare_gender_analysis()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 new.updated_at:=now();
 if new.status='validated' and (tg_op='INSERT' or old.status is distinct from 'validated') then
   new.validated_by:=auth.uid();
   new.validated_at:=now();
 end if;
 if new.status<>'validated' and tg_op='UPDATE' and old.status='validated' then
   new.validated_by:=null;
   new.validated_at:=null;
 end if;
 return new;
end $$;

drop trigger if exists gender_analysis_prepare on public.gender_analysis_records;
create trigger gender_analysis_prepare
before insert or update on public.gender_analysis_records
for each row execute function private.prepare_gender_analysis();

drop trigger if exists gender_analysis_audit on public.gender_analysis_records;
create trigger gender_analysis_audit
after insert or update or delete on public.gender_analysis_records
for each row execute function private.audit_operational_change();

drop policy if exists gender_analysis_delete on public.gender_analysis_records;
create policy gender_analysis_delete on public.gender_analysis_records
for delete to authenticated
using(private.is_super_admin(auth.uid()) and private.has_aal2());

create or replace function private.notify_institutional_assignment()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_program uuid; v_body uuid;
begin
 if tg_table_name='workforce_assignments' then
   if new.profile_id is not null then
     insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id)
     values(new.profile_id,'Nouvelle affectation AIAC',new.job_title,'/espace/poste?section=dashboard','position','workforce_assignment',new.id);
   end if;
 elsif tg_table_name='case_files' then
   if new.assigned_to is not null and (tg_op='INSERT' or new.assigned_to is distinct from old.assigned_to) then
     insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id)
     values(new.assigned_to,'Dossier sensible affecté','Un dossier protégé vous a été affecté. Ouvrez le coffre Protection pour le consulter.','/espace/poste?section=protection','case','case_file',new.id);
   end if;
 elsif tg_table_name='activities' then
   select p.program_id,pg.body_id into v_program,v_body
   from public.projects p join public.programs pg on pg.id=p.program_id
   where p.id=new.project_id;
   if tg_op='UPDATE' and old.manager_id is not null and old.manager_id is distinct from new.manager_id and old.manager_id is distinct from auth.uid() then
     insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id)
     values(old.manager_id,'Responsabilité d’activité terminée',old.code||' · '||old.title,'/espace/terrain','program_cycle','activity',old.id);
   end if;
   if new.manager_id is not null and (tg_op='INSERT' or new.manager_id is distinct from old.manager_id) and new.manager_id is distinct from auth.uid() then
     insert into public.notifications(user_id,title,body,href,category,entity_type,entity_id)
     values(new.manager_id,'Activité AIAC à coordonner',new.code||' · '||new.title,'/espace/terrain/complet?body='||v_body::text||'&program='||v_program::text||'&project='||new.project_id::text||'&activity='||new.id::text,'program_cycle','activity',new.id);
   end if;
 end if;
 return new;
end $$;

create index if not exists correspondence_subject_trgm_idx on public.institutional_correspondence using gin(subject gin_trgm_ops);
create index if not exists gender_analysis_title_trgm_idx on public.gender_analysis_records using gin(title gin_trgm_ops);
create index if not exists case_files_title_trgm_idx on public.case_files using gin(title gin_trgm_ops);

DO $$
declare t text;
begin
 foreach t in array array[
   'position_assignments','position_slots','institutional_position_events',
   'institutional_correspondence','institutional_correspondence_events',
   'gender_analysis_records','case_files','beneficiaries'
 ] loop
   if not exists(
     select 1 from pg_publication_tables
     where pubname='supabase_realtime' and schemaname='public' and tablename=t
   ) then
     execute format('alter publication supabase_realtime add table public.%I',t);
   end if;
 end loop;
end $$;
