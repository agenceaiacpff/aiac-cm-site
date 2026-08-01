"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import OperationsPanel, { BeneficiaryRow, InterventionRow, ProjectMemberRow, ProjectRow, TaskRow, WorkflowEvent } from "@/components/OperationsPanel";
import AccountsPanel, { AccountProfile, AccountReviewRow, AccountScopeRow, AccountStatusHistory, PermissionOverrideRow, PermissionRow, PositionAssignmentRow, PositionDefinitionRow, roleLabels } from "@/components/AccountsPanel";
import AnnouncementsPanel, { AnnouncementRow } from "@/components/AnnouncementsPanel";
import RequestsPanel, { RequestRow } from "@/components/RequestsPanel";
import NotificationsPanel, { NotificationRow } from "@/components/NotificationsPanel";
import InstitutionalPanel, { ActivityReportRow, ActivityRow, BodyMembershipRow, CaseActionRow, CaseFileRow, CaseNoteRow, GovernanceBodyRow, InstitutionalMemberRow, PartnerRow, PartnershipRow, ProgramRow, WorkforceAssignmentRow } from "@/components/InstitutionalPanel";
import MessageCenter, { ConversationRow, MessageRecipient } from "@/components/MessageCenter";
import DocumentVault, { DocumentApprovalRow, DocumentFolderRow, DocumentGrantRow, DocumentVersionRow, SecureDocumentRow } from "@/components/DocumentVault";
import AuditCenter, { AuditLogRow, DocumentAccessLogRow, SessionActivityRow } from "@/components/AuditCenter";

type UnreadMessageCountRow={conversation_id:string;unread_count:number};
const portalTabs=["accueil","annonces","notifications","demandes","messages","documents","operations","institution","administration","audit","profil"];

function countLabel(count:number){return count>99?"99+":String(count);}

export default function PortalClient({
  profile,initialRequests,initialConversations,initialNotifications,initialUnreadMessageCounts,staffProfiles,initialAuditLogs,
  initialProjects,initialProjectMembers,initialTasks,initialDocuments,initialBeneficiaries,
  initialRequestEvents,initialTaskEvents,initialAccountHistory,initialAnnouncements,initialAnnouncementReadIds,
  initialBodies,initialInstitutionalMembers,initialBodyMemberships,initialWorkforceAssignments,initialPrograms,
  initialPartners,initialPartnerships,initialCaseFiles,initialCaseNotes,initialCaseActions,initialActivities,initialActivityReports,
  initialPositionDefinitions,initialPositionAssignments,initialAccountReviews,messageRecipients,
  initialDocumentFolders,initialDocumentVersions,initialDocumentApprovals,initialDocumentGrants,initialSessionActivity,initialDocumentAccessLogs,
  initialPermissions,initialPermissionOverrides,initialAccountScopes,initialInterventions,
}:{
  profile:AccountProfile;initialRequests:RequestRow[];initialConversations:ConversationRow[];initialNotifications:NotificationRow[];initialUnreadMessageCounts:UnreadMessageCountRow[];
  staffProfiles:AccountProfile[];initialAuditLogs:AuditLogRow[];initialProjects:ProjectRow[];initialProjectMembers:ProjectMemberRow[];
  initialTasks:TaskRow[];initialDocuments:SecureDocumentRow[];initialBeneficiaries:BeneficiaryRow[];initialRequestEvents:WorkflowEvent[];
  initialTaskEvents:WorkflowEvent[];initialAccountHistory:AccountStatusHistory[];initialAnnouncements:AnnouncementRow[];initialAnnouncementReadIds:string[];
  initialBodies:GovernanceBodyRow[];initialInstitutionalMembers:InstitutionalMemberRow[];initialBodyMemberships:BodyMembershipRow[];initialWorkforceAssignments:WorkforceAssignmentRow[];initialPrograms:ProgramRow[];
  initialPartners:PartnerRow[];initialPartnerships:PartnershipRow[];initialCaseFiles:CaseFileRow[];initialCaseNotes:CaseNoteRow[];initialCaseActions:CaseActionRow[];initialActivities:ActivityRow[];initialActivityReports:ActivityReportRow[];
  initialPositionDefinitions:PositionDefinitionRow[];initialPositionAssignments:PositionAssignmentRow[];initialAccountReviews:AccountReviewRow[];messageRecipients:MessageRecipient[];
  initialDocumentFolders:DocumentFolderRow[];initialDocumentVersions:DocumentVersionRow[];initialDocumentApprovals:DocumentApprovalRow[];initialDocumentGrants:DocumentGrantRow[];initialSessionActivity:SessionActivityRow[];initialDocumentAccessLogs:DocumentAccessLogRow[];
  initialPermissions:PermissionRow[];initialPermissionOverrides:PermissionOverrideRow[];initialAccountScopes:AccountScopeRow[];initialInterventions:InterventionRow[];
}){
  const supabase=useMemo(()=>createClient(),[]);
  const router=useRouter();
  const [tab,setTab]=useState("accueil");
  const [requests,setRequests]=useState(initialRequests);
  const [notifications,setNotifications]=useState(initialNotifications);
  const [conversations,setConversations]=useState(initialConversations);
  const [unreadMessageCounts,setUnreadMessageCounts]=useState<Record<string,number>>(()=>Object.fromEntries(initialUnreadMessageCounts.map(item=>[item.conversation_id,Number(item.unread_count)])));
  const [requestedConversationId,setRequestedConversationId]=useState<string|null>(null);
  const [realtimeConnected,setRealtimeConnected]=useState(false);
  const [notice,setNotice]=useState("");
  const isStaff=["staff","manager","admin","super_admin"].includes(profile.role);
  const isAdmin=["admin","super_admin"].includes(profile.role);
  const isSuperAdmin=profile.role==="super_admin";

  const refreshUnreadMessageCounts=useCallback(async()=>{
    const {data,error}=await supabase.rpc("get_unread_message_counts");
    if(!error&&data)setUnreadMessageCounts(Object.fromEntries((data as UnreadMessageCountRow[]).map(item=>[item.conversation_id,Number(item.unread_count)])));
  },[supabase]);

  useEffect(()=>{const params=new URLSearchParams(window.location.search);const requested=params.get("tab");if(requested&&portalTabs.includes(requested))setTab(requested);setRequestedConversationId(params.get("conversation"));},[]);
  useEffect(()=>{
    const channel=supabase.channel(`portal-live:${profile.id}`)
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"notifications",filter:`user_id=eq.${profile.id}`},payload=>{
        const incoming=payload.new as NotificationRow;
        setNotifications(items=>[incoming,...items.filter(item=>item.id!==incoming.id)]);
        setNotice(`Nouvelle notification : ${incoming.title}`);
      })
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"notifications",filter:`user_id=eq.${profile.id}`},payload=>{
        const incoming=payload.new as NotificationRow;
        setNotifications(items=>items.map(item=>item.id===incoming.id?incoming:item));
      })
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"messages"},()=>{void refreshUnreadMessageCounts();})
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"message_reads",filter:`user_id=eq.${profile.id}`},()=>{void refreshUnreadMessageCounts();})
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"message_reads",filter:`user_id=eq.${profile.id}`},()=>{void refreshUnreadMessageCounts();})
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"conversations"},payload=>{
        const incoming=payload.new as ConversationRow;
        setConversations(items=>[incoming,...items.filter(item=>item.id!==incoming.id)]);
      })
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"conversations"},payload=>{
        const incoming=payload.new as ConversationRow;
        setConversations(items=>items.some(item=>item.id===incoming.id)?items.map(item=>item.id===incoming.id?incoming:item):[incoming,...items]);
      })
      .subscribe(status=>setRealtimeConnected(status==="SUBSCRIBED"));
    return()=>{void supabase.removeChannel(channel);};
  },[profile.id,refreshUnreadMessageCounts,supabase]);

  const unreadNotifications=notifications.filter(item=>!item.read_at).length;
  const unreadMessages=Object.values(unreadMessageCounts).reduce((total,count)=>total+count,0);
  const unreadAnnouncements=initialAnnouncements.filter(item=>item.status==="published"&&!initialAnnouncementReadIds.includes(item.id)).length;
  useEffect(()=>{document.title=unreadNotifications+unreadMessages>0?`(${unreadNotifications+unreadMessages}) Portail AIAC`:"Portail AIAC";},[unreadMessages,unreadNotifications]);

  function mergeConversation(incoming:ConversationRow){setConversations(items=>items.some(item=>item.id===incoming.id)?items.map(item=>item.id===incoming.id?incoming:item):[incoming,...items]);}
  function openNotification(href:string){window.location.assign(href);}
  async function updateProfile(event:FormEvent<HTMLFormElement>){event.preventDefault();const data=new FormData(event.currentTarget);const {error}=await supabase.from("profiles").update({full_name:data.get("full_name"),phone:data.get("phone"),organization:data.get("organization")}).eq("id",profile.id);setNotice(error?error.message:"Profil mis à jour.");}
  async function logout(){await supabase.auth.signOut();router.push("/connexion");router.refresh();}

  const navItems=[["accueil","Tableau de bord"],["demandes","Mes demandes"],["messages","Messagerie"],["notifications","Notifications"],["annonces","Annonces"],["profil","Mon profil"],...(isStaff?[["documents","Documents sécurisés"],["operations","Gestion opérationnelle"],["institution","Gestion institutionnelle"]]:[]),...(isAdmin?[["administration","Administration"]]:[]),...(isSuperAdmin?[["audit","Journal d’audit"]]:[])];
  const navCounts:Record<string,number>={messages:unreadMessages,notifications:unreadNotifications,annonces:unreadAnnouncements};

  return <div className="portalShell">
    <aside className="portalSidebar"><a href="/" className="portalBrand"><img src="/aiac-logo.bmp" alt="AIAC"/><span><b>AIAC</b><small>Portail communautaire</small></span></a><nav>{navItems.map(([id,label])=><button key={id} className={tab===id?"active":""} onClick={()=>setTab(id)}><span>{label}</span>{navCounts[id]>0&&<i className="navBadge" aria-label={`${navCounts[id]} éléments non lus`}>{countLabel(navCounts[id])}</i>}</button>)}</nav><button className="logout" onClick={logout}>Se déconnecter</button></aside>
    <main className="portalMain"><header><div><p className="eyebrow">{roleLabels[profile.role]||profile.role}</p><h1>Bonjour, {profile.full_name||"membre AIAC"}</h1></div><div className="portalHeaderStatus"><span className={`realtimeStatus ${realtimeConnected?"connected":"connecting"}`}>{realtimeConnected?"● Synchronisation en direct":"● Reconnexion…"}</span><span className={`status ${profile.status}`}>{profile.status==="active"?"Compte actif":profile.status==="suspended"?"Compte suspendu":"Validation en attente"}</span></div></header>
      {notice&&<div className="notice" role="status">{notice}<button onClick={()=>setNotice("")}>×</button></div>}
      {tab==="accueil"&&<section><div className="statGrid"><article><b>{requests.length}</b><span>Demandes</span></article><article><b>{conversations.length}</b><span>Conversations</span></article><article><b>{unreadNotifications}</b><span>Notifications non lues</span></article><article><b>{unreadMessages}</b><span>Messages non lus</span></article><article><b>{unreadAnnouncements}</b><span>Annonces à lire</span></article></div><div className="portalPanel"><h2>Bienvenue dans votre espace AIAC</h2><p>Soumettez et suivez vos demandes, échangez avec l’équipe, consultez les annonces et gérez votre profil depuis cet espace sécurisé.</p></div></section>}
      {tab==="demandes"&&<RequestsPanel profileId={profile.id} requests={requests} setRequests={setRequests} initialEvents={initialRequestEvents}/>}
      {tab==="messages"&&<MessageCenter profile={profile} initialConversations={conversations} initialActiveId={requestedConversationId} unreadCounts={unreadMessageCounts} onConversationRead={refreshUnreadMessageCounts} onConversationChange={mergeConversation} recipients={messageRecipients} bodies={initialBodies}/>}
      {tab==="documents"&&isStaff&&<DocumentVault profile={profile} staffProfiles={staffProfiles} initialDocuments={initialDocuments} initialFolders={initialDocumentFolders} initialVersions={initialDocumentVersions} initialApprovals={initialDocumentApprovals} initialGrants={initialDocumentGrants} bodies={initialBodies} projects={initialProjects} beneficiaries={initialBeneficiaries} cases={initialCaseFiles} partners={initialPartners} activities={initialActivities} members={initialInstitutionalMembers}/>}
      {tab==="notifications"&&<NotificationsPanel notifications={notifications} setNotifications={setNotifications} onOpen={openNotification}/>}
      {tab==="annonces"&&<AnnouncementsPanel profileId={profile.id} isAdmin={isAdmin} initialAnnouncements={initialAnnouncements} initialReadIds={initialAnnouncementReadIds}/>}
      {tab==="profil"&&<section className="portalPanel"><h2>Mon profil</h2><form className="inlineForm" onSubmit={updateProfile}><label>Nom complet<input name="full_name" defaultValue={profile.full_name||""} required/></label><label>E-mail<input value={profile.email||""} disabled/></label><label>Téléphone<input name="phone" defaultValue={profile.phone||""}/></label><label>Organisation<input name="organization" defaultValue={profile.organization||""}/></label><button>Enregistrer</button></form>{isAdmin&&<div className="securityBox"><h3>Sécurité renforcée active</h3><p>Les actions administratives sensibles exigent une session MFA de niveau AAL2.</p><a href="/mfa">Vérifier mon authentification</a></div>}</section>}
      {tab==="operations"&&isStaff&&<OperationsPanel profile={profile} initialProjects={initialProjects} initialPrograms={initialPrograms} initialMembers={initialProjectMembers} initialTasks={initialTasks} initialDocuments={initialDocuments} initialBeneficiaries={initialBeneficiaries} initialRequests={requests} initialRequestEvents={initialRequestEvents} initialTaskEvents={initialTaskEvents} initialInterventions={initialInterventions} staffProfiles={staffProfiles} bodies={initialBodies}/>}
      {tab==="institution"&&isStaff&&<InstitutionalPanel profile={profile} staffProfiles={staffProfiles} projects={initialProjects} projectMembers={initialProjectMembers} beneficiaries={initialBeneficiaries} initialBodies={initialBodies} initialInstitutionalMembers={initialInstitutionalMembers} initialBodyMemberships={initialBodyMemberships} initialWorkforceAssignments={initialWorkforceAssignments} initialPrograms={initialPrograms} initialPartners={initialPartners} initialPartnerships={initialPartnerships} initialCaseFiles={initialCaseFiles} initialCaseNotes={initialCaseNotes} initialCaseActions={initialCaseActions} initialActivities={initialActivities} initialActivityReports={initialActivityReports}/>}
      {tab==="administration"&&isAdmin&&<AccountsPanel currentProfile={profile} initialProfiles={staffProfiles} initialHistory={initialAccountHistory} initialBodies={initialBodies} initialPositions={initialPositionDefinitions} initialPositionAssignments={initialPositionAssignments} initialReviews={initialAccountReviews} initialPermissions={initialPermissions} initialPermissionOverrides={initialPermissionOverrides} initialAccountScopes={initialAccountScopes} initialSessions={initialSessionActivity}/>}
      {tab==="audit"&&isSuperAdmin&&<AuditCenter logs={initialAuditLogs} sessions={initialSessionActivity} documentAccess={initialDocumentAccessLogs} profiles={staffProfiles} documents={initialDocuments}/>}
    </main>
  </div>;
}
