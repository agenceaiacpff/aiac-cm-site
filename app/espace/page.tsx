import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PortalClient from "@/components/PortalClient";

export const dynamic = "force-dynamic";

export default async function Espace() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect("/connexion");
  const [{ data: profile },{ data: requests },{ data: conversations },{ data: notifications }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id",userId).single(),
    supabase.from("requests").select("id,subject,request_type,status,priority,created_at").order("created_at",{ascending:false}),
    supabase.from("conversations").select("id,title,updated_at").order("updated_at",{ascending:false}),
    supabase.from("notifications").select("*").order("created_at",{ascending:false})
  ]);
  if (!profile) redirect("/connexion");
  if (profile.status === "pending") redirect("/compte-en-attente");
  if (profile.status === "suspended") redirect("/compte-suspendu");
  const isAdmin = ["admin","super_admin"].includes(profile.role);
  const isSuperAdmin = profile.role === "super_admin";
  if (isAdmin) {
    const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assurance?.currentLevel !== "aal2") redirect("/mfa");
  }
  const [{ data: profiles }, { data: auditLogs }] = await Promise.all([
    isAdmin ? supabase.from("profiles").select("id,full_name,email,role,status,phone,organization").order("full_name") : Promise.resolve({ data: [] }),
    isSuperAdmin ? supabase.from("audit_logs").select("id,actor_id,action,entity_type,entity_id,details,created_at").order("created_at",{ascending:false}).limit(200) : Promise.resolve({ data: [] })
  ]);
  return <PortalClient profile={profile} initialRequests={requests||[]} initialConversations={conversations||[]} initialNotifications={notifications||[]} staffProfiles={profiles||[]} initialAuditLogs={auditLogs||[]} />;
}
