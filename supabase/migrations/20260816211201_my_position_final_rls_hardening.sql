-- Final Mon poste write-path hardening.
-- Sensitive writes now pass through SECURITY DEFINER RPCs that enforce scope,
-- MFA where required, notifications, recalculation and audit.

drop policy if exists position_assignments_insert_admin on public.position_assignments;
drop policy if exists position_assignments_update_admin on public.position_assignments;
drop policy if exists position_assignments_delete_admin on public.position_assignments;

drop policy if exists correspondence_insert on public.institutional_correspondence;
drop policy if exists correspondence_update on public.institutional_correspondence;
drop policy if exists correspondence_delete on public.institutional_correspondence;

drop policy if exists correspondence_events_insert on public.institutional_correspondence_events;

drop policy if exists gender_analysis_delete on public.gender_analysis_records;
drop policy if exists case_files_delete on public.case_files;
drop policy if exists beneficiaries_delete on public.beneficiaries;
