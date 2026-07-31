"use client";

import { Dispatch, SetStateAction, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import ListToolbar, { exportCsv, paginate } from "@/components/ListToolbar";

export type NotificationRow={id:string;title:string;body:string;href:string|null;read_at:string|null;created_at:string};

export default function NotificationsPanel({notifications,setNotifications}:{notifications:NotificationRow[];setNotifications:Dispatch<SetStateAction<NotificationRow[]>>}){
  const supabase=useMemo(()=>createClient(),[]);
  const [query,setQuery]=useState("");
  const [status,setStatus]=useState("all");
  const [page,setPage]=useState(1);
  const [notice,setNotice]=useState("");
  const filtered=notifications.filter(item=>`${item.title} ${item.body}`.toLowerCase().includes(query.toLowerCase())&&(status==="all"||(status==="unread"?!item.read_at:Boolean(item.read_at))));
  const paged=paginate(filtered,page,10);

  async function markRead(ids:string[]){
    const readAt=new Date().toISOString();
    const {error}=await supabase.from("notifications").update({read_at:readAt}).in("id",ids);
    if(error)setNotice(error.message);else setNotifications(items=>items.map(item=>ids.includes(item.id)?{...item,read_at:readAt}:item));
  }

  const unreadIds=notifications.filter(item=>!item.read_at).map(item=>item.id);
  return <section className="portalPanel"><div className="panelHeading"><div><h2>Notifications</h2><p>Alertes liées aux demandes, tâches, messages et annonces.</p></div>{unreadIds.length>0&&<button onClick={()=>markRead(unreadIds)}>Tout marquer comme lu</button>}</div>{notice&&<div className="notice" role="status">{notice}<button onClick={()=>setNotice("")}>×</button></div>}<ListToolbar query={query} onQuery={setQuery} status={status} onStatus={setStatus} options={[{value:"unread",label:"Non lues"},{value:"read",label:"Lues"}]} count={filtered.length} page={paged.page} pages={paged.pages} onPage={setPage} onExport={()=>exportCsv("notifications-aiac.csv",["Titre","Message","État","Date"],filtered.map(item=>[item.title,item.body,item.read_at?"Lue":"Non lue",item.created_at]))} placeholder="Titre ou contenu"/>{paged.items.length?paged.items.map(item=><div className={`listRow ${item.read_at?"":"unread"}`} key={item.id}><div><b>{item.title}</b><small>{item.body} · {new Date(item.created_at).toLocaleString("fr-FR")}</small></div>{!item.read_at&&<button onClick={()=>markRead([item.id])}>Lu</button>}</div>):<p>Aucune notification correspondant aux critères.</p>}</section>;
}
