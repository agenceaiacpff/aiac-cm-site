with ctx as (
  select
    (select id from public.governance_bodies where code='CA' limit 1) as ca_id,
    (select id from public.profiles where lower(email)='pca@aiac-cm.org' limit 1) as pca_id,
    (select id from public.profiles where lower(email)='lydie@aiac-cm.org' limit 1) as armelle_id
), upserted as (
  insert into public.report_validation_mandates(
    authority_body_id,subject_profile_id,mandate_code,pv_reference,resolution_reference,title,
    authority_name,adopted_on,effective_from,scope_summary,document_text,
    signed_pdf_file_name,signed_pdf_sha256,signed_docx_file_name,signed_docx_sha256,status,created_by
  )
  select ca_id,pca_id,
    'HAB-RPT-PCA-2026-08-16',
    'AIAC/CA/GOUV/PV/HAB-RPT-PCA/2026-08-16',
    'AIAC/CA/RES/HAB-RPT-PCA/2026-08-16',
    'Habilitation permanente pour la validation courante des rapports soumis par le PCA',
    'Conseil d’administration',date '2026-08-16',date '2026-08-16',
    'Les trois membres du Conseil d’administration autres que le PCA peuvent examiner individuellement les rapports courants du PCA et enregistrer, au nom du Conseil d’administration, une décision d’approbation ou de retour pour correction. Le PCA est exclu de l’auto-validation. Les rapports annuels institutionnels, financiers, d’audit et autres décisions réservées demeurent soumis à une délibération collégiale spécifique.',
    'PV de réunion extraordinaire du Conseil d’administration du 16 août 2026. Quorum déclaré atteint : 2 membres présents sur 4 membres en fonction. Résolution adoptée à 2 voix pour, 0 contre, 0 abstention. Autorité de validation : Conseil d’administration. Habilitation permanente des trois membres non-PCA, avec prise d’effet immédiate pour TCHOUANDEM Epse GUETCHOU Armelle Lydie, cosignataire. Le même PV est réutilisable pour les rapports courants du PCA tant qu’il demeure actif. Chaque rapport reçoit une référence de validation distincte VAL-CA-AAAA-NNNN, la date de la validation et la signature officielle du membre ayant enregistré la décision.',
    'AIAC_PV_CA_Habilitation_validation_rapports_PCA_16-08-2026_SIGNE.pdf',
    '976b169b0ccc7f05f08b95de0735fc794e3e4f4de7d0c2762da293746063ea7d',
    'AIAC_PV_CA_Habilitation_validation_rapports_PCA_16-08-2026_SIGNE.docx',
    'a6558cda19b7055978583af7a1a00094ca00079aa1fee07aa280157a8d8ccde8',
    'active',pca_id
  from ctx
  where ca_id is not null and pca_id is not null
  on conflict (pv_reference) do update set
    resolution_reference=excluded.resolution_reference,title=excluded.title,authority_name=excluded.authority_name,
    adopted_on=excluded.adopted_on,effective_from=excluded.effective_from,scope_summary=excluded.scope_summary,
    document_text=excluded.document_text,signed_pdf_file_name=excluded.signed_pdf_file_name,
    signed_pdf_sha256=excluded.signed_pdf_sha256,signed_docx_file_name=excluded.signed_docx_file_name,
    signed_docx_sha256=excluded.signed_docx_sha256,status='active',updated_at=now()
  returning id
)
insert into public.report_validation_mandate_members(mandate_id,profile_id,status,accepted_at,acceptance_reference)
select u.id,c.armelle_id,'accepted',now(),'Cosignature du PV AIAC/CA/GOUV/PV/HAB-RPT-PCA/2026-08-16'
from upserted u cross join ctx c
where c.armelle_id is not null
on conflict (mandate_id,profile_id) do update set
  status='accepted',
  accepted_at=coalesce(public.report_validation_mandate_members.accepted_at,excluded.accepted_at),
  acceptance_reference=excluded.acceptance_reference;
