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
    supabase.from("requests").select("id,subject,request_type,status,priority,created_at,created_by,assigned_to,project_id").order("created_at",{ascending:false}),
    supabase.from("conversations").select("id,title,updated_at").order("updated_at",{ascending:false}),
    supabase.from("notifications").select("*").order("created_at",{ascending:false})
  ]);
  if (!profile) redirect("/connexion");
  if (profile.status === "pending") redirect("/compte-en-attente");
  if (profile.status === "suspended") redirect("/compte-suspendu");
  const isAdmin = ["admin","super_admin"].includes(profile.role);
  const isSuperAdmin = profile.role === "super_admin";
  const isStaff = ["staff","manager","admin","super_admin"].includes(profile.role);
  if (isAdmin) {
    const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assurance?.currentLevel !== "aal2") redirect("/mfa");
  }
  const [{ data: profiles }, { data: auditLogs }, { data: projects }, { data: projectMembers }, { data: tasks }, { data: documents }, { data: beneficiaries }] = await Promise.all([
    isStaff ? supabase.from("profiles").select("id,full_name,email,role,status,phone,organization").order("full_name") : Promise.resolve({ data: [] }),
    isSuperAdmin ? supabase.from("audit_logs").select("id,actor_id,action,entity_type,entity_id,details,created_at").order("created_at",{ascending:false}).limit(200) : Promise.resolve({ data: [] }),
    isStaff ? supabase.from("projects").select("id,code,name,description,status,location,start_date,end_date,budget_amount,budget_currency,created_by,updated_at").order("updated_at",{ascending:false}) : Promise.resolve({ data: [] }),
    isStaff ? supabase.from("project_members").select("project_id,user_id,member_role,joined_at") : Promise.resolve({ data: [] }),
    isStaff ? supabase.from("tasks").select("id,title,description,request_id,project_id,created_by,assigned_to,status,priority,due_at,completed_at,created_at").order("created_at",{ascending:false}) : Promise.resolve({ data: [] }),
    isStaff ? supabase.from("documents").select("id,owner_id,request_id,project_id,title,file_url,file_name,mime_type,size_bytes,visibility,created_at").order("created_at",{ascending:false}) : Promise.resolve({ data: [] }),
    isStaff ? supabase.from("beneficiaries").select("id,reference_code,project_id,full_name,gender,birth_date,phone,locality,support_notes,consent_at,status,assigned_to,created_at").order("created_at",{ascending:false}) : Promise.resolve({ data: [] })
  ]);
  return <PortalClient profile={profile} initialRequests={requests||[]} initialConversations={conversations||[]} initialNotifications={notifications||[]} staffProfiles={profiles||[]} initialAuditLogs={auditLogs||[]} initialProjects={projects||[]} initialProjectMembers={projectMembers||[]} initialTasks={tasks||[]} initialDocuments={documents||[]} initialBeneficiaries={beneficiaries||[]} />;
}
