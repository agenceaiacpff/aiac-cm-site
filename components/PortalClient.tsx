"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Profile = { id:string; full_name:string|null; email:string|null; role:string; status:string; phone:string|null; organization:string|null };
type RequestRow = { id:string; subject:string; request_type:string; status:string; priority:string; created_at:string };
type Conversation = { id:string; title:string; updated_at:string };
type Message = { id:string; conversation_id:string; sender_id:string; body:string; created_at:string };
type Notification = { id:string; title:string; body:string; href:string|null; read_at:string|null; created_at:string };
type AuditLog = { id:string; actor_id:string|null; action:string; entity_type:string; entity_id:string|null; details:Record<string,unknown>; created_at:string };

const labels: Record<string,string> = { member:"Membre", beneficiary:"Bénéficiaire", volunteer:"Bénévole", staff:"Personnel AIAC", manager:"Responsable d’organe", partner:"Partenaire", admin:"Administrateur", super_admin:"Super-administrateur" };

export default function PortalClient({ profile, initialRequests, initialConversations, initialNotifications, staffProfiles, initialAuditLogs }:{ profile:Profile; initialRequests:RequestRow[]; initialConversations:Conversation[]; initialNotifications:Notification[]; staffProfiles:Profile[]; initialAuditLogs:AuditLog[] }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [tab,setTab] = useState("accueil");
  const [requests,setRequests] = useState(initialRequests);
  const [conversations,setConversations] = useState(initialConversations);
  const [notifications,setNotifications] = useState(initialNotifications);
  const [activeConversation,setActiveConversation] = useState<string|null>(initialConversations[0]?.id || null);
  const [messages,setMessages] = useState<Message[]>([]);
  const [notice,setNotice] = useState("");
  const isStaff = ["staff","manager","admin","super_admin"].includes(profile.role);
  const isAdmin = ["admin","super_admin"].includes(profile.role);
  const isSuperAdmin = profile.role === "super_admin";

  async function refreshMessages(id:string) {
    const { data } = await supabase.from("messages").select("*").eq("conversation_id",id).order("created_at");
    setMessages((data || []) as Message[]);
  }

  useEffect(() => {
    if (!activeConversation) return;
    refreshMessages(activeConversation);
    const channel = supabase.channel(`conversation:${activeConversation}`).on("postgres_changes", { event:"INSERT", schema:"public", table:"messages", filter:`conversation_id=eq.${activeConversation}` }, payload => setMessages(old => [...old, payload.new as Message])).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeConversation, supabase]);

  async function createRequest(e:FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f=new FormData(e.currentTarget);
    const { data,error }=await supabase.from("requests").insert({ created_by:profile.id, request_type:f.get("type"), subject:f.get("subject"), description:f.get("description") }).select().single();
    if(error) setNotice(error.message); else { setRequests([data as RequestRow,...requests]); e.currentTarget.reset(); setNotice("Votre demande a été enregistrée."); }
  }

  async function createConversation(e:FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f=new FormData(e.currentTarget); const title=String(f.get("title")||""); const recipientId=String(f.get("recipient_id")||"");
    const { data,error }=await supabase.from("conversations").insert({ title, created_by:profile.id }).select().single();
    if(error || !data) { setNotice(error?.message || "Création impossible"); return; }
    if(isSuperAdmin && recipientId) {
      const { error: memberError }=await supabase.from("conversation_members").insert({ conversation_id:data.id, user_id:recipientId });
      if(memberError) setNotice(memberError.message);
    }
    setConversations([data as Conversation,...conversations]); setActiveConversation(data.id); setTab("messages"); e.currentTarget.reset();
  }

  async function sendMessage(e:FormEvent<HTMLFormElement>) {
    e.preventDefault(); if(!activeConversation) return; const f=new FormData(e.currentTarget); const body=String(f.get("body")||"").trim(); if(!body)return;
    const { error }=await supabase.from("messages").insert({ conversation_id:activeConversation, sender_id:profile.id, body });
    if(error)setNotice(error.message); else e.currentTarget.reset();
  }

  async function updateProfile(e:FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f=new FormData(e.currentTarget);
    const { error }=await supabase.from("profiles").update({ full_name:f.get("full_name"), phone:f.get("phone"), organization:f.get("organization") }).eq("id",profile.id);
    setNotice(error ? error.message : "Profil mis à jour.");
  }

  async function setRole(id:string, role:string) {
    const { error }=await supabase.from("profiles").update({ role }).eq("id",id);
    setNotice(error ? error.message : "Fonction mise à jour."); if(!error)router.refresh();
  }

  async function setStatus(id:string, status:string) {
    const { error }=await supabase.from("profiles").update({ status }).eq("id",id);
    setNotice(error ? error.message : "Statut du compte mis à jour."); if(!error)router.refresh();
  }

  async function logout(){ await supabase.auth.signOut(); router.push("/connexion"); router.refresh(); }

  return <div className="portalShell">
    <aside className="portalSidebar"><a href="/" className="portalBrand"><img src="/aiac-logo.bmp" alt="AIAC"/><span><b>AIAC</b><small>Portail communautaire</small></span></a><nav>
      {[["accueil","Tableau de bord"],["demandes","Mes demandes"],["messages","Messagerie"],["notifications","Notifications"],["profil","Mon profil"],...(isStaff?[["travail","Espace de travail"]]:[]),...(isAdmin?[["administration","Administration"]]:[]),...(isSuperAdmin?[["audit","Journal d’audit"]]:[])].map(([id,label])=><button key={id} className={tab===id?"active":""} onClick={()=>setTab(id)}>{label}</button>)}
    </nav><button className="logout" onClick={logout}>Se déconnecter</button></aside>
    <main className="portalMain"><header><div><p className="eyebrow">{labels[profile.role] || profile.role}</p><h1>Bonjour, {profile.full_name || "membre AIAC"}</h1></div><span className={`status ${profile.status}`}>{profile.status === "active" ? "Compte actif" : "Validation en attente"}</span></header>
      {notice&&<div className="notice" role="status">{notice}<button onClick={()=>setNotice("")}>×</button></div>}
      {tab==="accueil"&&<section><div className="statGrid"><article><b>{requests.length}</b><span>Demandes</span></article><article><b>{conversations.length}</b><span>Conversations</span></article><article><b>{notifications.filter(n=>!n.read_at).length}</b><span>Notifications non lues</span></article></div><div className="portalPanel"><h2>Bienvenue dans votre espace AIAC</h2><p>Vous pouvez soumettre et suivre vos demandes, échanger avec l’équipe, recevoir des informations et gérer votre profil depuis un espace sécurisé.</p></div></section>}
      {tab==="demandes"&&<section><div className="portalPanel"><h2>Nouvelle demande</h2><form className="inlineForm" onSubmit={createRequest}><select name="type"><option value="support">Demande d’appui</option><option value="partnership">Partenariat</option><option value="volunteering">Bénévolat</option><option value="training">Formation</option><option value="complaint">Plainte ou signalement</option><option value="other">Autre</option></select><input name="subject" placeholder="Objet" required/><textarea name="description" placeholder="Décrivez précisément votre besoin" required/><button>Enregistrer la demande</button></form></div><div className="portalPanel"><h2>Suivi</h2>{requests.length?requests.map(r=><div className="listRow" key={r.id}><div><b>{r.subject}</b><small>{r.request_type} · {new Date(r.created_at).toLocaleDateString("fr-FR")}</small></div><span>{r.status}</span></div>):<p>Aucune demande pour le moment.</p>}</div></section>}
      {tab==="messages"&&<section className="messageLayout"><div className="portalPanel conversationList"><h2>Conversations</h2><form className="conversationCreate" onSubmit={createConversation}><input name="title" placeholder="Objet de la conversation" required/>{isSuperAdmin&&<select name="recipient_id" defaultValue=""><option value="">Aucun participant supplémentaire</option>{staffProfiles.filter(p=>p.id!==profile.id&&p.status==="active").map(p=><option value={p.id} key={p.id}>{p.full_name||p.email}</option>)}</select>}<button>Nouvelle</button></form><p className="privacyHint">Seuls les participants autorisés peuvent consulter cette conversation.</p>{conversations.map(c=><button key={c.id} className={activeConversation===c.id?"selected":""} onClick={()=>setActiveConversation(c.id)}>{c.title}</button>)}</div><div className="portalPanel messagePanel"><h2>Messages</h2><div className="messageStream">{messages.map(m=><div key={m.id} className={`message ${m.sender_id===profile.id?"mine":""}`}><p>{m.body}</p><small>{new Date(m.created_at).toLocaleString("fr-FR")}</small></div>)}{!activeConversation&&<p>Créez ou sélectionnez une conversation.</p>}</div>{activeConversation&&<form className="sendForm" onSubmit={sendMessage}><textarea name="body" placeholder="Votre message" required/><button>Envoyer</button></form>}</div></section>}
      {tab==="notifications"&&<section className="portalPanel"><h2>Notifications</h2>{notifications.map(n=><div className={`listRow ${n.read_at?"":"unread"}`} key={n.id}><div><b>{n.title}</b><small>{n.body}</small></div><button onClick={async()=>{await supabase.from("notifications").update({read_at:new Date().toISOString()}).eq("id",n.id);setNotifications(notifications.map(x=>x.id===n.id?{...x,read_at:new Date().toISOString()}:x));}}>Lu</button></div>)}</section>}
      {tab==="profil"&&<section className="portalPanel"><h2>Mon profil</h2><form className="inlineForm" onSubmit={updateProfile}><label>Nom complet<input name="full_name" defaultValue={profile.full_name||""} required/></label><label>E-mail<input value={profile.email||""} disabled/></label><label>Téléphone<input name="phone" defaultValue={profile.phone||""}/></label><label>Organisation<input name="organization" defaultValue={profile.organization||""}/></label><button>Enregistrer</button></form>{isAdmin&&<div className="securityBox"><h3>Sécurité renforcée active</h3><p>Les actions administratives sensibles exigent une session MFA de niveau AAL2.</p><a href="/mfa">Vérifier mon authentification</a></div>}</section>}
      {tab==="travail"&&<section className="portalPanel"><h2>Espace de travail AIAC</h2><p>Consultez les demandes qui vous sont affectées, échangez avec les bénéficiaires et suivez les interventions.</p>{requests.map(r=><div className="listRow" key={r.id}><div><b>{r.subject}</b><small>{r.request_type}</small></div><span>{r.status}</span></div>)}</section>}
      {tab==="administration"&&<section className="portalPanel"><h2>Gestion sécurisée des comptes</h2><p>Les nouveaux comptes doivent être approuvés. Seul un super-administrateur peut nommer ou modifier un autre super-administrateur.</p>{staffProfiles.map(p=>{const protectedSuper=p.role==="super_admin"&&!isSuperAdmin;const ownSuper=p.id===profile.id&&p.role==="super_admin";return <div className="listRow adminRow" key={p.id}><div><b>{p.full_name||p.email}</b><small>{p.email} · {labels[p.role]||p.role}</small></div><div className="adminControls"><select aria-label={`Fonction de ${p.full_name||p.email}`} value={p.role} disabled={protectedSuper||ownSuper} onChange={e=>setRole(p.id,e.target.value)}>{Object.entries(labels).filter(([value])=>isSuperAdmin||value!=="super_admin").map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><select aria-label={`Statut de ${p.full_name||p.email}`} value={p.status} disabled={protectedSuper||ownSuper} onChange={e=>setStatus(p.id,e.target.value)}><option value="pending">En attente</option><option value="active">Actif</option><option value="suspended">Suspendu</option></select></div></div>})}</section>}
      {tab==="audit"&&isSuperAdmin&&<section className="portalPanel"><h2>Journal d’audit de sécurité</h2><p>Ce registre en lecture seule conserve les changements sensibles effectués dans le portail.</p>{initialAuditLogs.length?initialAuditLogs.map(log=><div className="listRow auditRow" key={log.id}><div><b>{log.action}</b><small>{log.entity_type} · {log.entity_id||"—"} · acteur {log.actor_id||"système"}</small></div><time>{new Date(log.created_at).toLocaleString("fr-FR")}</time></div>):<p>Aucune opération sensible enregistrée depuis l’activation du journal.</p>}</section>}
    </main>
  </div>;
}
