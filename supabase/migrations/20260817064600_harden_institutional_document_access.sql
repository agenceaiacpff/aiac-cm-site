-- AIAC institutional library hardening — 2026-08-17
-- Visibility remains driven by the existing document <-> role/accreditation matrix.

UPDATE public.documents
SET secure_view_only = true
WHERE institutional_library = true;

UPDATE public.institutional_document_role_access a
SET can_download = (a.role_key = 'pca'),
    can_manage = false,
    can_upload_version = false
FROM public.documents d
WHERE d.id = a.document_id
  AND d.institutional_library = true;

-- Previously validated exception: the procedure manual remains CA-download-only.
UPDATE public.documents
SET download_policy='ca_only', secure_view_only=true
WHERE id IN (
  'cc737b26-9c5b-4dae-9d64-92019d82f6fa'::uuid,
  '15059d3a-00f1-4ad0-9b65-c5819b3b0ba9'::uuid
);

CREATE OR REPLACE FUNCTION private.can_access_document(target_id uuid, uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
 SELECT private.is_active_user(uid) AND EXISTS(
   SELECT 1 FROM public.documents d
   WHERE d.id=target_id AND (
     (d.institutional_library AND (
       EXISTS(SELECT 1 FROM public.document_access_grants g WHERE g.document_id=d.id AND g.user_id=uid AND (g.expires_at IS NULL OR g.expires_at>now()))
       OR EXISTS(
         SELECT 1 FROM public.institutional_document_role_access r
         JOIN public.position_assignments pa ON pa.profile_id=uid AND pa.status='active' AND pa.start_date<=current_date AND (pa.end_date IS NULL OR pa.end_date>=current_date)
         JOIN public.position_definitions pd ON pd.id=pa.position_id AND pd.role_key=r.role_key
         WHERE r.document_id=d.id AND r.can_view
       )
     ))
     OR
     (NOT d.institutional_library AND (
       d.owner_id=uid
       OR EXISTS(SELECT 1 FROM public.document_access_grants g WHERE g.document_id=d.id AND g.user_id=uid AND (g.expires_at IS NULL OR g.expires_at>now()))
       OR EXISTS(
         SELECT 1 FROM public.institutional_document_role_access r
         JOIN public.position_assignments pa ON pa.profile_id=uid AND pa.status='active' AND pa.start_date<=current_date AND (pa.end_date IS NULL OR pa.end_date>=current_date)
         JOIN public.position_definitions pd ON pd.id=pa.position_id AND pd.role_key=r.role_key
         WHERE r.document_id=d.id AND r.can_view
       )
       OR (d.conversation_id IS NOT NULL AND private.is_conversation_member(d.conversation_id,uid))
       OR (d.case_id IS NOT NULL AND private.can_access_case(d.case_id,uid))
       OR (d.project_id IS NOT NULL AND private.is_project_member(d.project_id,uid))
       OR (d.request_id IS NOT NULL AND private.can_access_request(d.request_id,uid))
       OR (d.body_id IS NOT NULL AND d.classification IN ('internal','confidential') AND private.has_position_in_body(d.body_id,uid))
       OR (d.classification='internal' AND d.visibility='staff' AND private.is_staff(uid))
     ))
   )
 );
$function$;

CREATE OR REPLACE FUNCTION private.can_download_document(target_id uuid, uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
 SELECT private.can_access_document(target_id,uid) AND EXISTS(
   SELECT 1 FROM public.documents d WHERE d.id=target_id AND (
     (d.institutional_library AND (
       (d.download_policy='ca_only' AND private.is_active_ca_member(uid))
       OR (d.download_policy='standard' AND (
         EXISTS(
           SELECT 1 FROM public.institutional_document_role_access r
           JOIN public.position_assignments pa ON pa.profile_id=uid AND pa.status='active' AND pa.start_date<=current_date AND (pa.end_date IS NULL OR pa.end_date>=current_date)
           JOIN public.position_definitions pd ON pd.id=pa.position_id AND pd.role_key=r.role_key
           WHERE r.document_id=d.id AND r.can_download
         )
         OR EXISTS(SELECT 1 FROM public.document_access_grants g WHERE g.document_id=d.id AND g.user_id=uid AND g.can_download AND (g.expires_at IS NULL OR g.expires_at>now()))
       ))
     ))
     OR
     (NOT d.institutional_library AND (
       (d.download_policy='standard' AND (
         d.owner_id=uid
         OR EXISTS(SELECT 1 FROM public.document_access_grants g WHERE g.document_id=d.id AND g.user_id=uid AND g.can_download AND (g.expires_at IS NULL OR g.expires_at>now()))
         OR EXISTS(
           SELECT 1 FROM public.institutional_document_role_access r
           JOIN public.position_assignments pa ON pa.profile_id=uid AND pa.status='active' AND pa.start_date<=current_date AND (pa.end_date IS NULL OR pa.end_date>=current_date)
           JOIN public.position_definitions pd ON pd.id=pa.position_id AND pd.role_key=r.role_key
           WHERE r.document_id=d.id AND r.can_download
         )
         OR private.can_manage_document(d.id,uid)
       ))
       OR (d.download_policy='ca_only' AND private.is_active_ca_member(uid))
     ))
   )
 );
$function$;

CREATE OR REPLACE FUNCTION private.enforce_institutional_document_security()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  IF NEW.institutional_library IS TRUE THEN NEW.secure_view_only := TRUE; END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_enforce_institutional_document_security ON public.documents;
CREATE TRIGGER trg_enforce_institutional_document_security
BEFORE INSERT OR UPDATE OF institutional_library,secure_view_only ON public.documents
FOR EACH ROW EXECUTE FUNCTION private.enforce_institutional_document_security();

CREATE OR REPLACE FUNCTION private.enforce_institutional_role_security()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE is_institutional boolean;
BEGIN
  SELECT d.institutional_library INTO is_institutional FROM public.documents d WHERE d.id=NEW.document_id;
  IF coalesce(is_institutional,false) THEN
    NEW.can_download := (NEW.role_key='pca');
    NEW.can_manage := FALSE;
    NEW.can_upload_version := FALSE;
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_enforce_institutional_role_security ON public.institutional_document_role_access;
CREATE TRIGGER trg_enforce_institutional_role_security
BEFORE INSERT OR UPDATE OF document_id,role_key,can_download,can_manage,can_upload_version ON public.institutional_document_role_access
FOR EACH ROW EXECUTE FUNCTION private.enforce_institutional_role_security();

-- Preview source is not directly readable: consultation must pass through the audited RPC.
REVOKE ALL ON TABLE public.institutional_document_previews FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.institutional_document_secure_preview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.institutional_document_secure_preview(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.document_access_capabilities(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.document_access_capabilities(uuid) TO authenticated;
