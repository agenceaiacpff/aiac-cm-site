import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProgramCyclePortal from "@/components/ProgramCyclePortal";

export const dynamic = "force-dynamic";

export default async function ProgramCyclePage() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect("/connexion");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).single();
  if (!profile) redirect("/connexion");
  if (profile.registration_state === "rejected") redirect("/compte-refuse");
  if (profile.status === "pending" || profile.registration_state !== "approved") redirect("/compte-en-attente");
  if (profile.status === "suspended") redirect("/compte-suspendu");
  if (profile.must_reset_password) redirect("/mettre-a-jour-mot-de-passe");

  const isAdmin = ["admin", "super_admin"].includes(profile.role);
  const isStaff = ["staff", "manager", "admin", "super_admin"].includes(profile.role);
  const canFieldReport = isStaff || profile.role === "volunteer";
  if (!canFieldReport) redirect("/espace");

  if (isAdmin) {
    const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assurance?.currentLevel !== "aal2") redirect("/mfa");
  }

  const [
    { data: staffProfiles },
    { data: bodies },
    { data: programs },
    { data: projects },
    { data: activities },
    { data: projectMembers },
    { data: institutionalMembers },
    { data: bodyMemberships },
    { data: workforceAssignments },
    { data: positionAssignments },
    { data: activityTaskCounts },
    { data: taskReports },
    { data: institutionalSignatureAssets },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id,full_name,email,role,status,phone,organization,avatar_url,registration_state,validated_at,validated_by,rejection_reason,must_reset_password,email_verified_at")
      .order("full_name"),
    supabase.from("governance_bodies").select("*").eq("status", "active").order("code", { ascending: true }),
    supabase.from("programs").select("*").order("code", { ascending: true }),
    supabase
      .from("projects")
      .select("id,code,name,description,program_id,status,location,start_date,end_date,budget_amount,budget_currency,created_by,updated_at")
      .order("code", { ascending: true }),
    supabase.from("activities").select("*").order("code", { ascending: true }),
    supabase.from("project_members").select("project_id,user_id,member_role,joined_at"),
    supabase.from("institutional_members").select("*").order("full_name"),
    supabase.from("body_memberships").select("*").order("start_date", { ascending: false }),
    supabase.from("workforce_assignments").select("*").order("start_date", { ascending: false }),
    supabase
      .from("position_assignments")
      .select("id,position_id,body_id,profile_id,member_id,territory,decision_reference,start_date,end_date,status,appointed_by")
      .order("start_date", { ascending: false }),
    supabase.rpc("list_activity_task_counts"),
    supabase.from("task_reports").select("*").order("updated_at", { ascending: false }),
    supabase.from("institutional_signature_assets").select("*").order("created_at", { ascending: false }),
  ]);

  const reportedTaskIds = Array.from(new Set((taskReports || []).map((item) => item.task_id)));
  const [
    { data: activityTasks },
    { data: evidence },
    { data: attendance },
    { data: indicators },
    { data: approvals },
    { data: events },
  ] = await Promise.all([
    reportedTaskIds.length
      ? supabase.from("activity_tasks").select("*").in("id", reportedTaskIds).order("sequence_no", { ascending: true })
      : Promise.resolve({ data: [] }),
    supabase.from("task_report_evidence").select("*").order("created_at"),
    supabase.from("task_report_attendance").select("*").order("created_at"),
    supabase.from("task_report_indicator_values").select("*").order("created_at"),
    supabase.from("task_report_approvals").select("*").order("created_at"),
    supabase.from("task_report_events").select("*").order("created_at"),
  ]);

  return (
    <ProgramCyclePortal
      profile={profile}
      programs={programs || []}
      projects={projects || []}
      activities={activities || []}
      projectMembers={projectMembers || []}
      staffProfiles={staffProfiles || []}
      bodies={bodies || []}
      workforceAssignments={workforceAssignments || []}
      positionAssignments={positionAssignments || []}
      institutionalMembers={institutionalMembers || []}
      bodyMemberships={bodyMemberships || []}
      initialActivityTasks={activityTasks || []}
      initialActivityTaskCounts={activityTaskCounts || []}
      initialTaskReports={taskReports || []}
      initialEvidence={evidence || []}
      initialAttendance={attendance || []}
      initialIndicators={indicators || []}
      initialApprovals={approvals || []}
      initialEvents={events || []}
      institutionalSignatureAssets={institutionalSignatureAssets || []}
    />
  );
}
