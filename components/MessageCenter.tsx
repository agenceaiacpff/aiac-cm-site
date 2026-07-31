"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AccountProfile } from "@/components/AccountsPanel";
import type { GovernanceBodyRow } from "@/components/InstitutionalPanel";

export type ConversationRow={
  id:string;title:string;updated_at:string;created_by:string;request_id:string|null;
  sensitivity:string;status:string;organization_unit_id:string|null;assigned_to:string|null;
};
export type MessageRecipient={id:string;full_name:string;role:string;body_name:string|null;position_title:string|null};
type Message={id:string;conversation_id:string;sender_id:string;body:string;created_at:string};
type Member={conversation_id:string;user_id:string;member_role:string;joined_at:string};
type Attachment={message_id:string;document_id:string;documents:{id:string;title:string;file_name:string|null}|null};

const MAX_ATTACHMENT_SIZE=15*1024*1024;
const attachmentMimeByExtension:Record<string,string>={
  pdf:"application/pdf",doc:"application/msword",docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls:"application/vnd.ms-excel",xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt:"application/vnd.ms-powerpoint",pptx:"application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt:"application/vnd.oasis.opendocument.text",ods:"application/vnd.oasis.opendocument.spreadsheet",odp:"application/vnd.oasis.opendocument.presentation",
  rtf:"application/rtf",txt:"text/plain",csv:"text/csv",md:"text/markdown",json:"application/json",
  jpg:"image/jpeg",jpeg:"image/jpeg",png:"image/png",webp:"image/webp",gif:"image/gif",bmp:"image/bmp",
  tif:"image/tiff",tiff:"image/tiff",heic:"image/heic",heif:"image/heif",
  zip:"application/zip",rar:"application/vnd.rar","7z":"application/x-7z-compressed",tar:"application/x-tar",gz:"application/gzip",
  mp3:"audio/mpeg",m4a:"audio/mp4",aac:"audio/aac",wav:"audio/wav",ogg:"audio/ogg",flac:"audio/flac",
  mp4:"video/mp4",webm:"video/webm",mov:"video/quicktime",mkv:"video/x-matroska"
};
const attachmentAccept=Object.keys(attachmentMimeByExtension).map(extension=>`.${extension}`).join(",");

const sensitivityLabels:Record<string,string>={
  standard:"Standard",confidential:"Confidentiel",restricted:"Accès restreint",
  gbv_protection:"VBG / protection",hr:"Ressources humaines",
  medical_psychosocial:"Médical / psychosocial",whistleblowing:"Signalement interne"
};

export default function MessageCenter({profile,initialConversations,recipients,bodies}:{
  profile:AccountProfile;initialConversations:ConversationRow[];recipients:MessageRecipient[];bodies:GovernanceBodyRow[];
}){
  const supabase=useMemo(()=>createClient(),[]);
  const [conversations,setConversations]=useState(initialConversations);
  const [activeId,setActiveId]=useState<string|null>(initialConversations[0]?.id||null);
  const [messages,setMessages]=useState<Message[]>([]);
  const [members,setMembers]=useState<Member[]>([]);
  const [attachments,setAttachments]=useState<Attachment[]>([]);
  const [query,setQuery]=useState("");
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const active=conversations.find(item=>item.id===activeId)||null;
  const myMembership=members.find(item=>item.user_id===profile.id);
  const canManage=myMembership?.member_role==="manager";
  const names=useMemo(()=>Object.fromEntries([...recipients.map(item=>[item.id,item.full_name]),[profile.id,profile.full_name||"Moi"]]),[recipients,profile]);
  const bodyNames=useMemo(()=>Object.fromEntries(bodies.map(item=>[item.id,item.name])),[bodies]);
  const filtered=conversations.filter(item=>`${item.title} ${sensitivityLabels[item.sensitivity]||item.sensitivity}`.toLowerCase().includes(query.toLowerCase()));

  async function refreshConversation(id:string){
    const [{data:messageRows},{data:memberRows},{data:attachmentRows}]=await Promise.all([
      supabase.from("messages").select("id,conversation_id,sender_id,body,created_at").eq("conversation_id",id).order("created_at"),
      supabase.from("conversation_members").select("conversation_id,user_id,member_role,joined_at").eq("conversation_id",id).order("joined_at"),
      supabase.from("message_attachments").select("message_id,document_id,documents(id,title,file_name)").in("message_id",(await supabase.from("messages").select("id").eq("conversation_id",id)).data?.map(row=>row.id)||[])
    ]);
    setMessages((messageRows||[]) as Message[]);
    setMembers((memberRows||[]) as Member[]);
    setAttachments((attachmentRows||[]) as unknown as Attachment[]);
    await supabase.rpc("mark_conversation_read",{target_conversation:id});
  }

  useEffect(()=>{
    if(!activeId)return;
    refreshConversation(activeId);
    const channel=supabase.channel(`conversation:${activeId}`)
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"messages",filter:`conversation_id=eq.${activeId}`},payload=>setMessages(old=>[...old,payload.new as Message]))
      .subscribe();
    return()=>{supabase.removeChannel(channel);};
  },[activeId,supabase]);

  async function createConversation(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);const form=event.currentTarget;const d=new FormData(form);
    const assignedTo=String(d.get("recipient_id")||"")||null;
    const payload={title:String(d.get("title")||"").trim(),created_by:profile.id,assigned_to:assignedTo,
      sensitivity:String(d.get("sensitivity")||"standard"),organization_unit_id:String(d.get("organization_unit_id")||"")||null};
    const {data,error}=await supabase.from("conversations").insert(payload).select().single();
    if(error||!data){setNotice(error?.message||"Création impossible");setBusy(false);return;}
    setConversations([data as ConversationRow,...conversations]);setActiveId(data.id);form.reset();
    setNotice("Conversation créée. Seuls les participants désignés peuvent la consulter.");setBusy(false);
  }

  async function sendMessage(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!activeId)return;setBusy(true);const form=event.currentTarget;const d=new FormData(form);
    const body=String(d.get("body")||"").trim();const file=d.get("file");
    if(!body&&(!(file instanceof File)||!file.size)){setNotice("Ajoutez un message ou une pièce jointe.");setBusy(false);return;}
    let path:string|null=null;let mimeType:string|null=null;
    if(file instanceof File&&file.size){
      if(file.size>MAX_ATTACHMENT_SIZE){setNotice("Le fichier dépasse la limite de 15 Mo. Aucun message n’a été envoyé.");setBusy(false);return;}
      const extension=file.name.split(".").pop()?.toLowerCase()||"";
      mimeType=attachmentMimeByExtension[extension]||null;
      if(!mimeType){setNotice("Ce format n’est pas autorisé. Utilisez un document, une image, une archive, un fichier audio ou une vidéo courante.");setBusy(false);return;}
      const safe=file.name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9._-]/g,"-");
      path=`${profile.id}/${crypto.randomUUID()}-${safe}`;
      const uploaded=await supabase.storage.from("aiac-documents").upload(path,file,{contentType:mimeType,upsert:false});
      if(uploaded.error){setNotice(`Pièce jointe refusée : ${uploaded.error.message}. Aucun message n’a été envoyé.`);setBusy(false);return;}
    }
    const classification=active?.sensitivity==="standard"?"internal":active?.sensitivity==="confidential"?"confidential":"restricted";
    const {error}=await supabase.rpc("send_message_with_attachment",{
      p_conversation_id:activeId,p_body:body,p_storage_path:path,
      p_file_name:file instanceof File&&file.size?file.name:null,p_mime_type:mimeType,
      p_size_bytes:file instanceof File&&file.size?file.size:null,p_classification:path?classification:null
    });
    if(error){if(path)await supabase.storage.from("aiac-documents").remove([path]);setNotice(`Envoi impossible : ${error.message}`);setBusy(false);return;}
    form.reset();await refreshConversation(activeId);setBusy(false);
  }

  async function addParticipant(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!activeId)return;setBusy(true);const form=event.currentTarget;const d=new FormData(form);
    const {error}=await supabase.from("conversation_members").insert({conversation_id:activeId,user_id:String(d.get("user_id")),member_role:String(d.get("member_role")),added_by:profile.id});
    if(error)setNotice(error.message);else{form.reset();await refreshConversation(activeId);setNotice("Participant ajouté avec un accès explicite.");}setBusy(false);
  }
  async function removeParticipant(userId:string){if(!activeId)return;setBusy(true);const {error}=await supabase.from("conversation_members").delete().eq("conversation_id",activeId).eq("user_id",userId);if(error)setNotice(error.message);else await refreshConversation(activeId);setBusy(false);}
  async function toggleArchive(){if(!active)return;setBusy(true);const next=active.status==="archived"?"active":"archived";const {error}=await supabase.from("conversations").update({status:next}).eq("id",active.id);if(error)setNotice(error.message);else setConversations(rows=>rows.map(row=>row.id===active.id?{...row,status:next}:row));setBusy(false);}
  async function openAttachment(documentId:string){
    const response=await fetch(`/api/documents/${documentId}/download`,{cache:"no-store"});const payload=await response.json();
    if(!response.ok){setNotice(payload.error||"Téléchargement refusé");return;}window.open(payload.url,"_blank","noopener,noreferrer");
  }

  return <section className="messageLayout secureMessages">
    {notice&&<div className="notice spanAll" role="status">{notice}<button onClick={()=>setNotice("")}>×</button></div>}
    <div className="portalPanel conversationList"><h2>Conversations privées</h2>
      <form className="conversationCreate" onSubmit={createConversation}>
        <input name="title" placeholder="Objet de la conversation" required/>
        <select name="recipient_id" required><option value="">Destinataire responsable</option>{recipients.filter(item=>item.id!==profile.id).map(item=><option value={item.id} key={item.id}>{item.full_name}{item.position_title?` · ${item.position_title}`:""}{item.body_name?` · ${item.body_name}`:""}</option>)}</select>
        <select name="sensitivity" defaultValue="standard">{Object.entries(sensitivityLabels).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select>
        <select name="organization_unit_id"><option value="">Aucun organe particulier</option>{bodies.map(item=><option value={item.id} key={item.id}>{item.code} · {item.name}</option>)}</select>
        <button disabled={busy}>Nouvelle conversation</button>
      </form>
      <input className="messageSearch" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Rechercher une conversation"/>
      <p className="privacyHint">Aucun personnel ni super-administrateur n’est ajouté automatiquement.</p>
      {filtered.map(item=><button key={item.id} className={activeId===item.id?"selected":""} onClick={()=>setActiveId(item.id)}><b>{item.title}</b><small>{sensitivityLabels[item.sensitivity]} · {item.status==="archived"?"Archivée":"Active"}</small></button>)}
    </div>
    <div className="portalPanel messagePanel"><div className="panelTitleRow"><div><h2>{active?.title||"Messages"}</h2>{active&&<small>{sensitivityLabels[active.sensitivity]}{active.organization_unit_id?` · ${bodyNames[active.organization_unit_id]}`:""}</small>}</div>{canManage&&active&&<button onClick={toggleArchive} disabled={busy}>{active.status==="archived"?"Rouvrir":"Archiver"}</button>}</div>
      <div className="messageStream">{messages.map(item=><div key={item.id} className={`message ${item.sender_id===profile.id?"mine":""}`}><b>{names[item.sender_id]||"Participant"}</b><p>{item.body}</p>{attachments.filter(row=>row.message_id===item.id).map(row=><button className="attachmentLink" key={row.document_id} onClick={()=>openAttachment(row.document_id)}>📎 {row.documents?.file_name||row.documents?.title||"Pièce jointe"}</button>)}<small>{new Date(item.created_at).toLocaleString("fr-FR")}</small></div>)}{!active&&<p>Créez ou sélectionnez une conversation.</p>}</div>
      {active&&active.status==="active"&&<form className="sendForm" onSubmit={sendMessage}><textarea name="body" placeholder="Votre message"/><input name="file" type="file" accept={attachmentAccept}/><small>Documents, tableaux, présentations, images, archives, audio ou vidéo — 15 Mo maximum.</small><button disabled={busy}>Envoyer</button></form>}
      {active&&<div className="conversationAccess"><h3>Accès à la conversation</h3>{members.map(member=><div className="listRow" key={member.user_id}><div><b>{names[member.user_id]||"Participant"}</b><small>{member.member_role}</small></div>{canManage&&member.user_id!==profile.id&&<button onClick={()=>removeParticipant(member.user_id)} disabled={busy}>Retirer</button>}</div>)}{canManage&&<form className="conversationCreate" onSubmit={addParticipant}><select name="user_id" required><option value="">Ajouter une personne</option>{recipients.filter(row=>!members.some(member=>member.user_id===row.id)).map(row=><option value={row.id} key={row.id}>{row.full_name} · {row.position_title||row.role}</option>)}</select><select name="member_role"><option value="participant">Participant</option><option value="manager">Responsable</option><option value="observer">Observateur</option></select><button disabled={busy}>Ajouter</button></form>}</div>}
    </div>
  </section>;
}
