"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import OperationsPanel, { BeneficiaryRow, DocumentRow, ProjectMemberRow, ProjectRow, TaskRow, WorkflowEvent } from "@/components/OperationsPanel";
import AccountsPanel, { AccountProfile, AccountStatusHistory, roleLabels } from "@/components/AccountsPanel";
import AnnouncementsPanel, { AnnouncementRow } from "@/components/AnnouncementsPanel";
import RequestsPanel, { RequestRow } from "@/components/RequestsPanel";
import NotificationsPanel, { NotificationRow } from "@/components/NotificationsPanel";
import ListToolbar, { exportCsv, paginate } from "@/components/ListToolbar";

type Conversation={id:string;title:string;updated_at:string};
type Message={id:string;conversation_id:string;sender_id:string;body:string;created_at:string};
type AuditLog={id:string;actor_id:string|null;action:string;entity_type:string;entity_id:string|null;details:Record<string,unknown>;created_at:string};

export default function PortalClient({
  profile,initialRequests,initialConversations,initialNotifications,staffProfiles,initialAuditLogs,
  initialProjects,initialProjectMembers,initialTasks,initialDocuments,initialBeneficiaries,
  initialRequestEvents,initialTaskEvents,initialAccountHistory,initialAnnouncements,initialAnnouncementReadIds,
}:{
  profile:AccountProfile;initialRequests:RequestRow[];initialConversations:Conversation[];initialNotifications:NotificationRow[];
  staffProfiles:AccountProfile[];initialAuditLogs:AuditLog[];initialProjects:ProjectRow[];initialProjectMembers:ProjectMemberRow[];
  initialTasks:TaskRow[];initialDocuments:DocumentRow[];initialBeneficiaries:BeneficiaryRow[];initialRequestEvents:WorkflowEvent[];
  initialTaskEvents:WorkflowEvent[];initialAccountHistory:AccountStatusHistory[];initialAnnouncements:AnnouncementRow[];initialAnnouncementReadIds:string[];
}){
  const supabase=useMemo(()=>createClient(),[]);
  const router=useRouter();
  const [tab,setTab]=useState("accueil");
  const [requests,setRequests]=useState(initialRequests);
  const [conversations,setConversations]=useState(initialConversations);
  const [notifications,setNotifications]=useState(initialNotifications);
  const [activeConversation,setActiveConversation]=useState<string|null>(initialConversations[0]?.id||null);
  const [messages,setMessages]=useState<Message[]>([]);
  const [notice,setNotice]=useState("");
  const [auditQuery,setAuditQuery]=useState("");
  const [auditType,setAuditType]=useState("all");
  const [auditPage,setAuditPage]=useState(1);
  const isStaff=["staff","manager","admin","super_admin"].includes(profile.role);
  const isAdmin=["admin","super_admin"].includes(profile.role);
  const isSuperAdmin=profile.role==="super_admin";

  useEffect(()=>{const requested=new URLSearchParams(window.location.search).get("tab");if(requested&&["annonces","notifications","demandes","messages"].includes(requested))setTab(requested);},[]);

  async function refreshMessages(id:string){const {data}=await supabase.from("messages").select("*").eq("conversation_id",id).order("created_at");setMessages((data||[]) as Message[]);}
  useEffect(()=>{if(!activeConversation)return;refreshMessages(activeConversation);const channel=supabase.channel(`conversation:${activeConversation}`).on("postgres_changes",{event:"INSERT",schema:"public",table:"messages",filter:`conversation_id=eq.${activeConversation}`},payload=>setMessages(old=>[...old,payload.new as Message])).subscribe();return()=>{supabase.removeChannel(channel);};},[activeConversation,supabase]);

  async function createConversation(event:FormEvent<HTMLFormElement>){
    event.preventDefault();const form=event.currentTarget;const data=new FormData(form);const title=String(data.get("title")||"");const recipientId=String(data.get("recipient_id")||"");
    const {data:created,error}=await supabase.from("conversations").insert({title,created_by:profile.id}).select().single();
    if(error||!created){setNotice(error?.message||"Création impossible");return;}
    if(isSuperAdmin&&recipientId){const member=await supabase.from("conversation_members").insert({conversation_id:created.id,user_id:recipientId});if(member.error){setNotice(member.error.message);return;}}
    setConversations([created as Conversation,...conversations]);setActiveConversation(created.id);setTab("messages");form.reset();
  }

  async function sendMessage(event:FormEvent<HTMLFormElement>){event.preventDefault();if(!activeConversation)return;const form=event.currentTarget;const body=String(new FormData(form).get("body")||"").trim();if(!body)return;const {error}=await supabase.from("messages").insert({conversation_id:activeConversation,sender_id:profile.id,body});if(error)setNotice(error.message);else form.reset();}
  async function updateProfile(event:FormEvent<HTMLFormElement>){event.preventDefault();const data=new FormData(event.currentTarget);const {error}=await supabase.from("profiles").update({full_name:data.get("full_name"),phone:data.get("phone"),organization:data.get("organization")}).eq("id",profile.id);setNotice(error?error.message:"Profil mis à jour.");}
  async function logout(){await supabase.auth.signOut();router.push("/connexion");router.refresh();}

  const auditTypes=Array.from(new Set(initialAuditLogs.map(item=>item.entity_type))).sort();
  const filteredAudit=initialAuditLogs.filter(item=>`${item.action} ${item.entity_type} ${item.entity_id||""} ${item.actor_id||""}`.toLowerCase().includes(auditQuery.toLowerCase())&&(auditType==="all"||item.entity_type===auditType));
  const pagedAudit=paginate(filteredAudit,auditPage,15);

  const navItems=[["accueil","Tableau de bord"],["demandes","Mes demandes"],["messages","Messagerie"],["notifications","Notifications"],["annonces","Annonces"],["profil","Mon profil"],...(isStaff?[["operations","Gestion opérationnelle"]]:[]),...(isAdmin?[["administration","Administration"]]:[]),...(isSuperAdmin?[["audit","Journal d’audit"]]:[])];

  return <div className="portalShell">
    <aside className="portalSidebar"><a href="/" className="portalBrand"><img src="/aiac-logo.bmp" alt="AIAC"/><span><b>AIAC</b><small>Portail communautaire</small></span></a><nav>{navItems.map(([id,label])=><button key={id} className={tab===id?"active":""} onClick={()=>setTab(id)}>{label}{id==="notifications"&&notifications.some(item=>!item.read_at)&&<i className="navDot"/>}</button>)}</nav><button className="logout" onClick={logout}>Se déconnecter</button></aside>
    <main className="portalMain"><header><div><p className="eyebrow">{roleLabels[profile.role]||profile.role}</p><h1>Bonjour, {profile.full_name||"membre AIAC"}</h1></div><span className={`status ${profile.status}`}>{profile.status==="active"?"Compte actif":profile.status==="suspended"?"Compte suspendu":"Validation en attente"}</span></header>
      {notice&&<div className="notice" role="status">{notice}<button onClick={()=>setNotice("")}>×</button></div>}
      {tab==="accueil"&&<section><div className="statGrid"><article><b>{requests.length}</b><span>Demandes</span></article><article><b>{conversations.length}</b><span>Conversations</span></article><article><b>{notifications.filter(item=>!item.read_at).length}</b><span>Notifications non lues</span></article><article><b>{initialAnnouncements.filter(item=>item.status==="published"&&!initialAnnouncementReadIds.includes(item.id)).length}</b><span>Annonces à lire</span></article></div><div className="portalPanel"><h2>Bienvenue dans votre espace AIAC</h2><p>Soumettez et suivez vos demandes, échangez avec l’équipe, consultez les annonces et gérez votre profil depuis cet espace sécurisé.</p></div></section>}
      {tab==="demandes"&&<RequestsPanel profileId={profile.id} requests={requests} setRequests={setRequests} initialEvents={initialRequestEvents}/>}
      {tab==="messages"&&<section className="messageLayout"><div className="portalPanel conversationList"><h2>Conversations</h2><form className="conversationCreate" onSubmit={createConversation}><input name="title" placeholder="Objet de la conversation" required/>{isSuperAdmin&&<select name="recipient_id" defaultValue=""><option value="">Aucun participant supplémentaire</option>{staffProfiles.filter(item=>item.id!==profile.id&&item.status==="active").map(item=><option value={item.id} key={item.id}>{item.full_name||item.email}</option>)}</select>}<button>Nouvelle</button></form><p className="privacyHint">Seuls les participants autorisés peuvent consulter cette conversation.</p>{conversations.map(item=><button key={item.id} className={activeConversation===item.id?"selected":""} onClick={()=>setActiveConversation(item.id)}>{item.title}</button>)}</div><div className="portalPanel messagePanel"><h2>Messages</h2><div className="messageStream">{messages.map(item=><div key={item.id} className={`message ${item.sender_id===profile.id?"mine":""}`}><p>{item.body}</p><small>{new Date(item.created_at).toLocaleString("fr-FR")}</small></div>)}{!activeConversation&&<p>Créez ou sélectionnez une conversation.</p>}</div>{activeConversation&&<form className="sendForm" onSubmit={sendMessage}><textarea name="body" placeholder="Votre message" required/><button>Envoyer</button></form>}</div></section>}
      {tab==="notifications"&&<NotificationsPanel notifications={notifications} setNotifications={setNotifications}/>}
      {tab==="annonces"&&<AnnouncementsPanel profileId={profile.id} isAdmin={isAdmin} initialAnnouncements={initialAnnouncements} initialReadIds={initialAnnouncementReadIds}/>}
      {tab==="profil"&&<section className="portalPanel"><h2>Mon profil</h2><form className="inlineForm" onSubmit={updateProfile}><label>Nom complet<input name="full_name" defaultValue={profile.full_name||""} required/></label><label>E-mail<input value={profile.email||""} disabled/></label><label>Téléphone<input name="phone" defaultValue={profile.phone||""}/></label><label>Organisation<input name="organization" defaultValue={profile.organization||""}/></label><button>Enregistrer</button></form>{isAdmin&&<div className="securityBox"><h3>Sécurité renforcée active</h3><p>Les actions administratives sensibles exigent une session MFA de niveau AAL2.</p><a href="/mfa">Vérifier mon authentification</a></div>}</section>}
      {tab==="operations"&&isStaff&&<OperationsPanel profile={profile} initialProjects={initialProjects} initialMembers={initialProjectMembers} initialTasks={initialTasks} initialDocuments={initialDocuments} initialBeneficiaries={initialBeneficiaries} initialRequests={requests} initialRequestEvents={initialRequestEvents} initialTaskEvents={initialTaskEvents} staffProfiles={staffProfiles}/>}
      {tab==="administration"&&isAdmin&&<AccountsPanel currentProfile={profile} initialProfiles={staffProfiles} initialHistory={initialAccountHistory}/>}
      {tab==="audit"&&isSuperAdmin&&<section className="portalPanel"><h2>Journal d’audit de sécurité</h2><p>Registre en lecture seule des changements sensibles.</p><ListToolbar query={auditQuery} onQuery={setAuditQuery} status={auditType} onStatus={setAuditType} options={auditTypes.map(value=>({value,label:value}))} count={filteredAudit.length} page={pagedAudit.page} pages={pagedAudit.pages} onPage={setAuditPage} onExport={()=>exportCsv("audit-aiac.csv",["Action","Entité","Identifiant","Acteur","Date"],filteredAudit.map(item=>[item.action,item.entity_type,item.entity_id,item.actor_id,item.created_at]))} placeholder="Action, entité, identifiant ou acteur"/>{pagedAudit.items.length?pagedAudit.items.map(log=><div className="listRow auditRow" key={log.id}><div><b>{log.action}</b><small>{log.entity_type} · {log.entity_id||"—"} · acteur {log.actor_id||"système"}</small></div><time>{new Date(log.created_at).toLocaleString("fr-FR")}</time></div>):<p>Aucune opération correspondant aux critères.</p>}</section>}
    </main>
  </div>;
}
