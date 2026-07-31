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
  const isAdmin = ["admin","super_admin"].includes(profile.role);
  const { data: profiles } = isAdmin ? await supabase.from("profiles").select("id,full_name,email,role,status,phone,organization").order("full_name") : { data: [] };
  return <PortalClient profile={profile} initialRequests={requests||[]} initialConversations={conversations||[]} initialNotifications={notifications||[]} staffProfiles={profiles||[]} />;
}
