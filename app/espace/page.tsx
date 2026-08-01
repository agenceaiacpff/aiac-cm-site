import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PortalClient from "@/components/PortalClient";

export const dynamic = "force-dynamic";

export default async function Espace() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect("/connexion");
  const [{ data: profile },{ data: requests },{ data: conversations },{ data: notifications },{ data: unreadMessageCounts }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id",userId).single(),
    supabase.from("requests").select("id,subject,description,request_type,status,priority,created_at,updated_at,created_by,assigned_to,project_id,body_id,region,due_at,first_responded_at,resolved_at,closed_at,archived_at,archived_by,archive_reason,reopened_count,last_reopened_at,last_reopened_by").order("created_at",{ascending:false}),
    supabase.from("conversations").select("id,title,updated_at,created_by,request_id,sensitivity,status,organization_unit_id,assigned_to").order("updated_at",{ascending:false}),
    supabase.from("notifications").select("*").order("created_at",{ascending:false}),
    supabase.rpc("get_unread_message_counts")
  ]);
  if (!profile) redirect("/connexion");
  if (profile.registration_state === "rejected") redirect("/compte-refuse");
  if (profile.status === "pending" || profile.registration_state !== "approved") redirect("/compte-en-attente");
  if (profile.status === "suspended") redirect("/compte-suspendu");
  if (profile.must_reset_password) redirect("/mettre-a-jour-mot-de-passe");
  const isAdmin = ["admin","super_admin"].includes(profile.role);
  const isSuperAdmin = profile.role === "super_admin";
  const isStaff = ["staff","manager","admin","super_admin"].includes(profile.role);
  if (isAdmin) {
    const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assurance?.currentLevel !== "aal2") redirect("/mfa");
  }
  const [{ data: profiles }, { data: auditLogs }, { data: projects }, { data: projectMembers }, { data: tasks }, { data: documents }, { data: beneficiaries }, { data: requestEvents }, { data: taskEvents }, { data: accountHistory }, { data: announcements }, { data: announcementReads }, { data: bodies }, { data: institutionalMembers }, { data: bodyMemberships }, { data: workforceAssignments }, { data: programs }, { data: partners }, { data: partnerships }, { data: caseFiles }, { data: caseNotes }, { data: caseActions }, { data: activities }, { data: activityReports }, { data: positionDefinitions }, { data: positionAssignments }, { data: accountReviews }, { data: messageRecipients }, { data: documentFolders }, { data: documentVersions }, { data: documentApprovals }, { data: documentGrants }, { data: sessionActivity }, { data: documentAccessLogs }, { data: permissions }, { data: permissionOverrides }, { data: accountScopes }, { data: interventions }] = await Promise.all([
    isStaff ? supabase.from("profiles").select("id,full_name,email,role,status,phone,organization,registration_state,validated_at,validated_by,rejection_reason,must_reset_password,email_verified_at").order("full_name") : Promise.resolve({ data: [] }),
    isSuperAdmin ? supabase.from("audit_logs").select("id,actor_id,action,entity_type,entity_id,details,old_data,new_data,source_ip,user_agent,created_at").order("created_at",{ascending:false}).limit(500) : Promise.resolve({ data: [] }),
    isStaff ? supabase.from("projects").select("id,code,name,description,program_id,status,location,start_date,end_date,budget_amount,budget_currency,created_by,updated_at").order("updated_at",{ascending:false}) : Promise.resolve({ data: [] }),
    isStaff ? supabase.from("project_members").select("project_id,user_id,member_role,joined_at") : Promise.resolve({ data: [] }),
    isStaff ? supabase.from("tasks").select("id,title,description,request_id,project_id,created_by,assigned_to,status,priority,due_at,completed_at,created_at,updated_at").order("created_at",{ascending:false}) : Promise.resolve({ data: [] }),
    isStaff ? supabase.from("documents").select("id,owner_id,request_id,project_id,title,file_url,file_name,mime_type,size_bytes,visibility,created_at,folder_id,body_id,beneficiary_id,case_id,partner_id,activity_id,member_id,conversation_id,classification,document_status,current_version,retention_until,archived_at,updated_at").order("updated_at",{ascending:false}) : Promise.resolve({ data: [] }),
    isStaff ? supabase.from("beneficiaries").select("id,reference_code,project_id,full_name,gender,birth_date,phone,locality,support_notes,consent_at,status,assigned_to,created_at").order("created_at",{ascending:false}) : Promise.resolve({ data: [] }),
    supabase.from("request_events").select("id,request_id,actor_id,event_type,body,from_value,to_value,visibility,metadata,created_at").order("created_at",{ascending:false}),
    isStaff ? supabase.from("task_events").select("id,task_id,actor_id,event_type,body,from_value,to_value,created_at").order("created_at",{ascending:false}) : Promise.resolve({ data: [] }),
    isAdmin ? supabase.from("account_status_history").select("id,profile_id,actor_id,old_status,new_status,reason,created_at").order("created_at",{ascending:false}).limit(500) : Promise.resolve({ data: [] }),
    supabase.from("announcements").select("id,title,body,audience,status,published_at,expires_at,created_by,created_at").order("created_at",{ascending:false}),
    supabase.from("announcement_reads").select("announcement_id").eq("user_id",userId),
    isStaff ? supabase.from("governance_bodies").select("*").order("name") : Promise.resolve({ data: [] }),
    isStaff ? supabase.from("institutional_members").select("*").order("full_name") : Promise.resolve({ data: [] }),
    isStaff ? supabase.from("body_memberships").select("*").order("start_date",{ascending:false}) : Promise.resolve({ data: [] }),
    isStaff ? supabase.from("workforce_assignments").select("*").order("start_date",{ascending:false}) : Promise.resolve({ data: [] }),
    isStaff ? supabase.from("programs").select("*").order("updated_at",{ascending:false}) : Promise.resolve({ data: [] }),
    isStaff ? supabase.from("partners").select("*").order("legal_name") : Promise.resolve({ data: [] }),
    isStaff ? supabase.from("partnerships").select("*").order("created_at",{ascending:false}) : Promise.resolve({ data: [] }),
    isStaff ? supabase.from("case_files").select("*").order("updated_at",{ascending:false}) : Promise.resolve({ data: [] }),
    isStaff ? supabase.from("case_notes").select("*").order("event_at",{ascending:false}) : Promise.resolve({ data: [] }),
    isStaff ? supabase.from("case_actions").select("*").order("due_at",{ascending:true}) : Promise.resolve({ data: [] }),
    isStaff ? supabase.from("activities").select("*").order("starts_at",{ascending:false}) : Promise.resolve({ data: [] }),
    isStaff ? supabase.from("activity_reports").select("*").order("submitted_at",{ascending:false}) : Promise.resolve({ data: [] }),
    isAdmin ? supabase.from("position_definitions").select("id,code,title,institutional_level,body_id,authority_scope,status").order("code") : Promise.resolve({data:[]}),
    isAdmin ? supabase.from("position_assignments").select("id,position_id,body_id,profile_id,member_id,territory,decision_reference,start_date,end_date,status,appointed_by").order("start_date",{ascending:false}) : Promise.resolve({data:[]}),
    isAdmin ? supabase.from("account_reviews").select("id,profile_id,reviewer_id,decision,reason,body_id,position_assignment_id,created_at").order("created_at",{ascending:false}) : Promise.resolve({data:[]}),
    supabase.rpc("list_message_recipients"),
    isStaff ? supabase.from("document_folders").select("*").order("name") : Promise.resolve({data:[]}),
    isStaff ? supabase.from("document_versions").select("*").order("version_number",{ascending:false}) : Promise.resolve({data:[]}),
    isStaff ? supabase.from("document_approvals").select("*").order("requested_at",{ascending:false}) : Promise.resolve({data:[]}),
    isStaff ? supabase.from("document_access_grants").select("*").order("created_at",{ascending:false}) : Promise.resolve({data:[]}),
    isSuperAdmin ? supabase.from("session_activity").select("*").order("last_seen_at",{ascending:false}).limit(500) : Promise.resolve({data:[]}),
    isSuperAdmin ? supabase.from("document_access_logs").select("*").order("created_at",{ascending:false}).limit(500) : Promise.resolve({data:[]}),
    isSuperAdmin ? supabase.from("permissions").select("code,domain,name,description,sensitive").order("domain").order("name") : Promise.resolve({data:[]}),
    isSuperAdmin ? supabase.from("user_permission_overrides").select("*").order("created_at",{ascending:false}) : Promise.resolve({data:[]}),
    isAdmin ? supabase.from("account_scope_assignments").select("*").order("created_at",{ascending:false}) : Promise.resolve({data:[]}),
    isStaff ? supabase.from("request_interventions").select("*").order("created_at",{ascending:false}) : Promise.resolve({data:[]})
  ]);
  return <PortalClient profile={profile} initialRequests={requests||[]} initialConversations={conversations||[]} initialNotifications={notifications||[]} initialUnreadMessageCounts={unreadMessageCounts||[]} staffProfiles={profiles||[]} initialAuditLogs={auditLogs||[]} initialProjects={projects||[]} initialProjectMembers={projectMembers||[]} initialTasks={tasks||[]} initialDocuments={documents||[]} initialBeneficiaries={beneficiaries||[]} initialRequestEvents={requestEvents||[]} initialTaskEvents={taskEvents||[]} initialAccountHistory={accountHistory||[]} initialAnnouncements={announcements||[]} initialAnnouncementReadIds={(announcementReads||[]).map(item=>item.announcement_id)} initialBodies={bodies||[]} initialInstitutionalMembers={institutionalMembers||[]} initialBodyMemberships={bodyMemberships||[]} initialWorkforceAssignments={workforceAssignments||[]} initialPrograms={programs||[]} initialPartners={partners||[]} initialPartnerships={partnerships||[]} initialCaseFiles={caseFiles||[]} initialCaseNotes={caseNotes||[]} initialCaseActions={caseActions||[]} initialActivities={activities||[]} initialActivityReports={activityReports||[]} initialPositionDefinitions={positionDefinitions||[]} initialPositionAssignments={positionAssignments||[]} initialAccountReviews={accountReviews||[]} messageRecipients={messageRecipients||[]} initialDocumentFolders={documentFolders||[]} initialDocumentVersions={documentVersions||[]} initialDocumentApprovals={documentApprovals||[]} initialDocumentGrants={documentGrants||[]} initialSessionActivity={sessionActivity||[]} initialDocumentAccessLogs={documentAccessLogs||[]} initialPermissions={permissions||[]} initialPermissionOverrides={permissionOverrides||[]} initialAccountScopes={accountScopes||[]} initialInterventions={interventions||[]} />;
}
