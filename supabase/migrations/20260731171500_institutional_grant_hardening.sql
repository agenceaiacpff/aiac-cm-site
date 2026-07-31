-- Les privilèges par défaut du schéma public incluent des opérations techniques
-- qui ne doivent jamais être accessibles depuis les sessions du site.
revoke all on public.governance_bodies,public.institutional_members,public.body_memberships,public.workforce_assignments from public,anon,authenticated;
revoke all on public.programs,public.partners,public.partnerships from public,anon,authenticated;
revoke all on public.case_files,public.case_notes,public.case_actions from public,anon,authenticated;
revoke all on public.activities,public.activity_reports from public,anon,authenticated;

grant select,insert,update,delete on public.governance_bodies,public.institutional_members,public.body_memberships,public.workforce_assignments to authenticated;
grant select,insert,update,delete on public.programs,public.partners,public.partnerships to authenticated;
grant select,insert,update,delete on public.case_files,public.case_actions to authenticated;
grant select,insert,delete on public.case_notes to authenticated;
grant select,insert,update,delete on public.activities,public.activity_reports to authenticated;
