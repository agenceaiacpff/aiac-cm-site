create or replace function public.delete_gender_analysis_admin(target_id uuid,target_reason text)
returns boolean language plpgsql security definer set search_path=''
as $$
declare r public.gender_analysis_records%rowtype;
begin
 if not private.is_super_admin(auth.uid()) or not private.has_aal2() then
   raise exception 'Suppression réservée au super-administrateur avec MFA AAL2';
 end if;
 if char_length(btrim(coalesce(target_reason,'')))<5 then
   raise exception 'Motif de suppression obligatoire';
 end if;
 select * into r from public.gender_analysis_records where id=target_id for update;
 if not found then raise exception 'Analyse introuvable'; end if;
 perform private.write_audit(
   'gender_analysis.deleted_by_superadmin','gender_analysis',r.id,
   jsonb_build_object('reason',target_reason,'reference_code',r.reference_code,'body_id',r.body_id,'project_id',r.project_id)
 );
 delete from public.gender_analysis_records where id=r.id;
 return true;
end $$;
grant execute on function public.delete_gender_analysis_admin(uuid,text) to authenticated;

create or replace function public.delete_beneficiary_admin(target_id uuid,target_reason text)
returns boolean language plpgsql security definer set search_path=''
as $$
declare r public.beneficiaries%rowtype;
begin
 if not private.is_super_admin(auth.uid()) or not private.has_aal2() then
   raise exception 'Suppression réservée au super-administrateur avec MFA AAL2';
 end if;
 if char_length(btrim(coalesce(target_reason,'')))<5 then
   raise exception 'Motif de suppression obligatoire';
 end if;
 select * into r from public.beneficiaries where id=target_id for update;
 if not found then raise exception 'Bénéficiaire introuvable'; end if;
 if exists(select 1 from public.case_files c where c.beneficiary_id=r.id) then
   raise exception 'Suppression impossible : un ou plusieurs dossiers de cas référencent encore ce bénéficiaire';
 end if;
 perform private.write_audit(
   'beneficiary.deleted_by_superadmin','beneficiary',r.id,
   jsonb_build_object('reason',target_reason,'reference_code',r.reference_code,'project_id',r.project_id)
 );
 delete from public.beneficiaries where id=r.id;
 return true;
end $$;
grant execute on function public.delete_beneficiary_admin(uuid,text) to authenticated;

create or replace function public.delete_case_admin(target_id uuid,target_reason text)
returns boolean language plpgsql security definer set search_path=''
as $$
declare r public.case_files%rowtype;
begin
 if not private.is_super_admin(auth.uid()) or not private.has_aal2() then
   raise exception 'Suppression réservée au super-administrateur avec MFA AAL2';
 end if;
 if char_length(btrim(coalesce(target_reason,'')))<5 then
   raise exception 'Motif de suppression obligatoire';
 end if;
 select * into r from public.case_files where id=target_id for update;
 if not found then raise exception 'Dossier de cas introuvable'; end if;
 perform private.write_audit(
   'case.deleted_by_superadmin','case_file',r.id,
   jsonb_build_object('reason',target_reason,'case_number',r.case_number,'project_id',r.project_id,'body_id',r.body_id)
 );
 delete from public.case_files where id=r.id;
 return true;
end $$;
grant execute on function public.delete_case_admin(uuid,text) to authenticated;
