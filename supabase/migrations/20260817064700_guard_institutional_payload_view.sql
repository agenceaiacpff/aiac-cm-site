-- Prevent protected viewers from obtaining the physical original through the payload RPC.
DO $block$
BEGIN
  IF to_regprocedure('private.institutional_document_payload(uuid,text)') IS NULL
     AND to_regprocedure('public.institutional_document_payload(uuid,text)') IS NOT NULL THEN
    IF pg_get_function_result('public.institutional_document_payload(uuid,text)'::regprocedure) <> 'jsonb' THEN
      RAISE EXCEPTION 'Unexpected institutional_document_payload return type';
    END IF;
    ALTER FUNCTION public.institutional_document_payload(uuid,text) SET SCHEMA private;
  END IF;
END
$block$;

REVOKE ALL ON FUNCTION private.institutional_document_payload(uuid,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.institutional_document_payload(target_document_id uuid, target_purpose text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE is_protected boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentification requise'; END IF;
  IF NOT private.can_access_document(target_document_id,auth.uid()) THEN RAISE EXCEPTION 'Document inaccessible'; END IF;

  SELECT coalesce(d.secure_view_only,false) INTO is_protected
  FROM public.documents d WHERE d.id=target_document_id;

  IF coalesce(target_purpose,'')='view'
     AND is_protected
     AND NOT private.can_download_document(target_document_id,auth.uid()) THEN
    RAISE EXCEPTION 'Original non exposé en consultation protégée';
  END IF;

  IF coalesce(target_purpose,'')='download'
     AND NOT private.can_download_document(target_document_id,auth.uid()) THEN
    RAISE EXCEPTION 'Téléchargement non autorisé';
  END IF;

  RETURN private.institutional_document_payload(target_document_id,target_purpose);
END;
$function$;

REVOKE ALL ON FUNCTION public.institutional_document_payload(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.institutional_document_payload(uuid,text) TO authenticated;
