export type InstitutionalSignatureAsset = {
  id: string;
  profile_id: string;
  body_id: string | null;
  asset_type: "signature" | "round_seal" | "nominal_seal" | "composite_signature";
  storage_path: string;
  file_name: string;
  mime_type: string;
  official_title: string | null;
  decision_reference: string | null;
  is_default: boolean;
  status: "active" | "revoked";
  valid_from: string;
  valid_until: string | null;
  uploaded_by: string;
  revoked_by: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
};

export const institutionalAssetLabels: Record<
  InstitutionalSignatureAsset["asset_type"],
  string
> = {
  signature: "Signature officielle",
  round_seal: "Cachet rond",
  nominal_seal: "Cachet nominatif",
  composite_signature: "Signature et cachet composés",
};

