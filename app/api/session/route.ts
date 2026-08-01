import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const roleLabels: Record<string, string> = {
  member: "Membre",
  beneficiary: "Bénéficiaire",
  volunteer: "Bénévole",
  staff: "Personnel AIAC",
  manager: "Responsable d’organe",
  partner: "Partenaire",
  admin: "Administrateur",
  super_admin: "Super-administrateur"
};

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) {
    return NextResponse.json({ authenticated: false }, { headers: { "Cache-Control": "private, no-store" } });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name,email,phone,organization,role,status,registration_state")
    .eq("id", userId)
    .maybeSingle();

  if (!profile || profile.status !== "active" || profile.registration_state !== "approved") {
    return NextResponse.json({ authenticated: false }, { headers: { "Cache-Control": "private, no-store" } });
  }

  return NextResponse.json({
    authenticated: true,
    profile: {
      fullName: profile.full_name || "Membre AIAC",
      email: profile.email || "",
      phone: profile.phone || "",
      organization: profile.organization || "",
      role: profile.role,
      roleLabel: roleLabels[profile.role] || profile.role
    },
    workspaceHref: "/espace"
  }, { headers: { "Cache-Control": "private, no-store" } });
}
