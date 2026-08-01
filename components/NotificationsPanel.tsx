"use client";

import { Dispatch, KeyboardEvent, SetStateAction, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import ListToolbar, { exportCsv, paginate } from "@/components/ListToolbar";

export type NotificationRow={id:string;title:string;body:string;href:string|null;read_at:string|null;created_at:string;category?:string;entity_type?:string|null;entity_id?:string|null};

export default function NotificationsPanel({notifications,setNotifications,onOpen}:{notifications:NotificationRow[];setNotifications:Dispatch<SetStateAction<NotificationRow[]>>;onOpen:(href:string)=>void}){
  const supabase=useMemo(()=>createClient(),[]);
  const [query,setQuery]=useState("");
  const [status,setStatus]=useState("all");
  const [page,setPage]=useState(1);
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const filtered=notifications.filter(item=>`${item.title} ${item.body}`.toLowerCase().includes(query.toLowerCase())&&(status==="all"||(status==="unread"?!item.read_at:Boolean(item.read_at))));
  const paged=paginate(filtered,page,10);

  async function markRead(ids:string[]){
    if(!ids.length)return true;
    setBusy(true);
    const readAt=new Date().toISOString();
    const {data,error}=await supabase.from("notifications").update({read_at:readAt}).in("id",ids).select("id,read_at");
    if(error){setNotice(error.message);setBusy(false);return false;}
    if(!data?.length){setNotice("La notification n’a pas pu être marquée comme lue.");setBusy(false);return false;}
    const updates=new Map(data.map(item=>[item.id,item.read_at]));
    setNotifications(items=>items.map(item=>updates.has(item.id)?{...item,read_at:updates.get(item.id)||readAt}:item));
    setBusy(false);return true;
  }

  async function openNotification(item:NotificationRow){
    if(!item.read_at&&!(await markRead([item.id])))return;
    if(item.href)onOpen(item.href);
  }

  function openWithKeyboard(event:KeyboardEvent<HTMLDivElement>,item:NotificationRow){
    if(event.key==="Enter"||event.key===" "){event.preventDefault();void openNotification(item);}
  }

  const unreadIds=notifications.filter(item=>!item.read_at).map(item=>item.id);
  return <section className="portalPanel"><div className="panelHeading"><div><h2>Notifications</h2><p>Alertes liées aux demandes, tâches, messages et annonces.</p></div>{unreadIds.length>0&&<button disabled={busy} onClick={()=>void markRead(unreadIds)}>Tout marquer comme lu</button>}</div>{notice&&<div className="notice" role="status">{notice}<button onClick={()=>setNotice("")}>×</button></div>}<ListToolbar query={query} onQuery={setQuery} status={status} onStatus={setStatus} options={[{value:"unread",label:"Non lues"},{value:"read",label:"Lues"}]} count={filtered.length} page={paged.page} pages={paged.pages} onPage={setPage} onExport={()=>exportCsv("notifications-aiac.csv",["Titre","Message","État","Date"],filtered.map(item=>[item.title,item.body,item.read_at?"Lue":"Non lue",item.created_at]))} placeholder="Titre ou contenu"/>{paged.items.length?paged.items.map(item=><div className={`listRow notificationRow ${item.read_at?"":"unread"}`} key={item.id} role="button" tabIndex={0} onClick={()=>void openNotification(item)} onKeyDown={event=>openWithKeyboard(event,item)}><div><b>{item.title}</b><small>{item.body} · {new Date(item.created_at).toLocaleString("fr-FR")}</small></div>{!item.read_at&&<button disabled={busy} onClick={event=>{event.stopPropagation();void markRead([item.id]);}}>Lu</button>}</div>):<p>Aucune notification correspondant aux critères.</p>}</section>;
}
