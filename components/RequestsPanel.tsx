"use client";

import { Dispatch, FormEvent, SetStateAction, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import ListToolbar, { exportCsv, paginate } from "@/components/ListToolbar";
import { requestStatus, WorkflowEvent } from "@/components/OperationsPanel";

export type RequestRow = { id:string; subject:string; description:string; request_type:string; status:string; priority:string; created_at:string; updated_at?:string; created_by?:string; assigned_to?:string|null; project_id?:string|null };

const requestTypes:Record<string,string>={support:"Demande d’appui",partnership:"Partenariat",volunteering:"Bénévolat",training:"Formation",complaint:"Plainte ou signalement",other:"Autre"};
const eventLabels:Record<string,string>={comment:"Commentaire",status_change:"Statut modifié",assignment:"Affectation modifiée",priority_change:"Priorité modifiée",project_change:"Projet modifié"};

export default function RequestsPanel({profileId,requests,setRequests,initialEvents}:{profileId:string;requests:RequestRow[];setRequests:Dispatch<SetStateAction<RequestRow[]>>;initialEvents:WorkflowEvent[]}){
  const supabase=useMemo(()=>createClient(),[]);
  const [events,setEvents]=useState(initialEvents);
  const [query,setQuery]=useState("");
  const [status,setStatus]=useState("all");
  const [page,setPage]=useState(1);
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const filtered=requests.filter(item=>`${item.subject} ${item.description} ${requestTypes[item.request_type]||item.request_type}`.toLowerCase().includes(query.toLowerCase())&&(status==="all"||item.status===status));
  const paged=paginate(filtered,page,6);

  async function createRequest(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);const form=event.currentTarget;const data=new FormData(form);
    const {data:created,error}=await supabase.from("requests").insert({created_by:profileId,request_type:data.get("type"),subject:data.get("subject"),description:data.get("description")}).select().single();
    if(error||!created)setNotice(error?.message||"Création impossible");else{setRequests(items=>[created as RequestRow,...items]);form.reset();setNotice("Votre demande a été enregistrée et transmise à l’équipe.");}
    setBusy(false);
  }

  async function addComment(event:FormEvent<HTMLFormElement>,requestId:string){
    event.preventDefault();setBusy(true);const form=event.currentTarget;const body=String(new FormData(form).get("body")||"").trim();
    const {data:created,error}=await supabase.from("request_events").insert({request_id:requestId,actor_id:profileId,event_type:"comment",body}).select().single();
    if(error||!created)setNotice(error?.message||"Commentaire impossible");else{setEvents(items=>[created as WorkflowEvent,...items]);form.reset();setNotice("Votre commentaire a été ajouté à la demande.");}
    setBusy(false);
  }

  return <section>
    {notice&&<div className="notice" role="status">{notice}<button onClick={()=>setNotice("")}>×</button></div>}
    <div className="portalPanel"><h2>Nouvelle demande</h2><form className="inlineForm" onSubmit={createRequest}><select name="type">{Object.entries(requestTypes).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><input name="subject" placeholder="Objet" required/><textarea name="description" placeholder="Décrivez précisément votre besoin" required/><button disabled={busy}>Enregistrer la demande</button></form></div>
    <div className="portalPanel"><h2>Suivi détaillé</h2><ListToolbar query={query} onQuery={setQuery} status={status} onStatus={setStatus} options={Object.entries(requestStatus).map(([value,label])=>({value,label}))} count={filtered.length} page={paged.page} pages={paged.pages} onPage={setPage} onExport={()=>exportCsv("mes-demandes-aiac.csv",["Objet","Type","État","Priorité","Créée le"],filtered.map(item=>[item.subject,requestTypes[item.request_type],requestStatus[item.status],item.priority,item.created_at]))} placeholder="Objet, description ou type"/>
      {paged.items.length?paged.items.map(request=><details className="workflowCard" key={request.id}><summary><span><b>{request.subject}</b><small>{requestTypes[request.request_type]||request.request_type} · {new Date(request.created_at).toLocaleDateString("fr-FR")}</small></span><span className={`operationBadge ${request.status}`}>{requestStatus[request.status]||request.status}</span></summary><div className="workflowBody"><p>{request.description}</p><form className="commentForm" onSubmit={event=>addComment(event,request.id)}><textarea name="body" minLength={1} maxLength={5000} placeholder="Répondre ou ajouter une précision" required/><button disabled={busy}>Ajouter</button></form><div className="eventTimeline"><h3>Historique</h3>{events.filter(item=>item.request_id===request.id).sort((a,b)=>b.created_at.localeCompare(a.created_at)).map(item=><div className="eventItem" key={item.id}><b>{eventLabels[item.event_type]||item.event_type}</b><p>{item.body||`${item.from_value||"—"} → ${item.to_value||"—"}`}</p><small>{new Date(item.created_at).toLocaleString("fr-FR")}</small></div>)}</div></div></details>):<p>Aucune demande correspondant aux critères.</p>}
    </div>
  </section>;
}
