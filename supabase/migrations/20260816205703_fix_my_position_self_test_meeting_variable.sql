create or replace function private.institutional_position_system_self_test()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 caller uuid:=auth.uid();
 candidate uuid;
 edu_slot uuid;
 ca_sg_slot uuid;
 project_cp_slot uuid;
 ca_assignment uuid;
 test_assignment uuid;
 ant_id uuid;
 ant_slots int;
 test_meeting_id uuid;
 meeting_participants_count int;
 mail_id uuid;
 mail_number text;
 mail_status text;
 assignment_ok boolean:=false;
 assignment_rollback_ok boolean:=false;
 antenna_ok boolean:=false;
 antenna_rollback_ok boolean:=false;
 meeting_ok boolean:=false;
 meeting_rollback_ok boolean:=false;
 correspondence_ok boolean:=false;
 correspondence_rollback_ok boolean:=false;
 protection_scope_ok boolean:=false;
 current_claims text;
begin
 if caller is null or not private.is_current_pca(caller) or not private.has_aal2() then
   raise exception 'Autotest réservé au PCA avec MFA AAL2';
 end if;
 current_claims:=current_setting('request.jwt.claims',true);

 select pa.profile_id into candidate
 from public.position_assignments pa
 join public.position_definitions pd on pd.id=pa.position_id
 where pd.role_key='technical_director_general'
   and pa.status='active'
   and pa.profile_id<>caller
   and pa.start_date<=current_date
   and (pa.end_date is null or pa.end_date>=current_date)
 limit 1;
 if candidate is null then raise exception 'Un second compte actif est requis pour l’autotest'; end if;

 select pa.id into ca_assignment
 from public.position_assignments pa
 join public.position_definitions pd on pd.id=pa.position_id
 where pa.profile_id=caller and pd.role_key='pca' and pa.status='active'
   and pa.start_date<=current_date and (pa.end_date is null or pa.end_date>=current_date)
 limit 1;

 select s.id into edu_slot
 from public.position_slots s
 join public.position_definitions pd on pd.id=s.position_id
 join public.governance_bodies b on b.id=s.body_id
 where b.code='OS-04' and pd.role_key='education_officer' and s.project_id is null limit 1;

 select s.id into ca_sg_slot
 from public.position_slots s
 join public.position_definitions pd on pd.id=s.position_id
 join public.governance_bodies b on b.id=s.body_id
 where b.code='CA' and pd.role_key='secretary_general' limit 1;

 select s.id into project_cp_slot
 from public.position_slots s
 join public.position_definitions pd on pd.id=s.position_id
 join public.projects pr on pr.id=s.project_id
 join public.programs pg on pg.id=pr.program_id
 join public.governance_bodies b on b.id=pg.body_id
 where b.code='OS-04' and pd.role_key='child_protection_officer' limit 1;

 begin
  test_assignment:=public.assign_profile_to_position_slot(edu_slot,candidate,'AUTOTEST-ROLLBACK-ASSIGN',current_date);
  assignment_ok:=test_assignment is not null
    and private.has_position_capability('education.manage',candidate,(select id from public.governance_bodies where code='OS-04'),null);
  raise exception '__ROLLBACK_ASSIGN__';
 exception when others then
  if sqlerrm<>'__ROLLBACK_ASSIGN__' then raise; end if;
 end;
 assignment_rollback_ok:=not exists(select 1 from public.position_assignments where decision_reference='AUTOTEST-ROLLBACK-ASSIGN');

 begin
  ant_id:=public.create_antenna_structure('OS-04','Centre','AUTOTEST LOCALITE','AUTOTEST-ROLLBACK-ANTENNE');
  select count(*) into ant_slots from public.position_slots where body_id=ant_id;
  antenna_ok:=ant_id is not null and ant_slots=13
    and exists(select 1 from public.position_slots s join public.position_definitions pd on pd.id=s.position_id where s.body_id=ant_id and pd.role_key='antenna_chief')
    and exists(select 1 from public.position_slots s join public.position_definitions pd on pd.id=s.position_id where s.body_id=ant_id and pd.role_key='volunteer');
  raise exception '__ROLLBACK_ANTENNA__';
 exception when others then
  if sqlerrm<>'__ROLLBACK_ANTENNA__' then raise; end if;
 end;
 antenna_rollback_ok:=not exists(select 1 from public.governance_bodies where decision_reference='AUTOTEST-ROLLBACK-ANTENNE');

 begin
  select id into test_meeting_id
  from public.create_my_team_meeting(ca_assignment,'AUTOTEST Réunion équipe',now()+interval '1 day',now()+interval '1 day 1 hour','Test de la chaîne hiérarchique','online',null);
  select count(*) into meeting_participants_count from public.meeting_participants mp where mp.meeting_id=test_meeting_id;
  meeting_ok:=meeting_participants_count>=2
    and exists(select 1 from public.meeting_participants mp where mp.meeting_id=test_meeting_id and mp.user_id=candidate);
  raise exception '__ROLLBACK_MEETING__';
 exception when others then
  if sqlerrm<>'__ROLLBACK_MEETING__' then raise; end if;
 end;
 meeting_rollback_ok:=not exists(select 1 from public.meetings where title='AUTOTEST Réunion équipe');

 begin
  perform public.assign_profile_to_position_slot(ca_sg_slot,candidate,'AUTOTEST-ROLLBACK-SG',current_date);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',candidate,'role','authenticated','aal','aal2')::text,true);
  select id,correspondence_number into mail_id,mail_number
  from public.register_correspondence('incoming',(select id from public.governance_bodies where code='CA'),'AUTOTEST courrier entrant','Expéditeur test','Organisation test','EXT-TEST',null,null,null,'platform','normal','internal',null);
  select status into mail_status from public.archive_correspondence(mail_id,'AUTOTEST/ARCHIVE','Autotest');
  correspondence_ok:=mail_number like 'ARR-%' and mail_status='archived';
  perform set_config('request.jwt.claims',current_claims,true);
  raise exception '__ROLLBACK_MAIL__';
 exception when others then
  perform set_config('request.jwt.claims',current_claims,true);
  if sqlerrm<>'__ROLLBACK_MAIL__' then raise; end if;
 end;
 correspondence_rollback_ok:=not exists(select 1 from public.position_assignments where decision_reference='AUTOTEST-ROLLBACK-SG')
   and not exists(select 1 from public.institutional_correspondence where subject='AUTOTEST courrier entrant');

 begin
  perform public.assign_profile_to_position_slot(project_cp_slot,candidate,'AUTOTEST-ROLLBACK-CP',current_date);
  protection_scope_ok:=private.has_position_capability(
      'case.assigned.manage',candidate,
      (select pg.body_id from public.position_slots s join public.projects pr on pr.id=s.project_id join public.programs pg on pg.id=pr.program_id where s.id=project_cp_slot),
      (select project_id from public.position_slots where id=project_cp_slot)
    )
    and private.can_manage_sensitive_project((select project_id from public.position_slots where id=project_cp_slot),candidate);
  raise exception '__ROLLBACK_PROTECTION__';
 exception when others then
  if sqlerrm<>'__ROLLBACK_PROTECTION__' then raise; end if;
 end;

 return jsonb_build_object(
  'assignment',jsonb_build_object('functional',assignment_ok,'rollback_clean',assignment_rollback_ok),
  'antenna',jsonb_build_object('functional',antenna_ok,'slots_tested',ant_slots,'rollback_clean',antenna_rollback_ok),
  'meeting',jsonb_build_object('functional',meeting_ok,'participants_tested',meeting_participants_count,'rollback_clean',meeting_rollback_ok),
  'correspondence',jsonb_build_object('functional',correspondence_ok,'reference_tested',mail_number,'rollback_clean',correspondence_rollback_ok),
  'protection',jsonb_build_object('position_scope',protection_scope_ok,'pii_created',false),
  'all_passed',assignment_ok and assignment_rollback_ok and antenna_ok and antenna_rollback_ok and meeting_ok and meeting_rollback_ok and correspondence_ok and correspondence_rollback_ok and protection_scope_ok
 );
end $$;
