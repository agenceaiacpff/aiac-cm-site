"use client";

import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {createClient} from "@/lib/supabase/client";

type StartAlert={id:string;code:string;title:string;description:string|null;agenda:string|null;starts_at:string;ends_at:string;timezone:string;venue:string|null;modality:string;meeting_url:string|null;access_instructions:string|null;organizer_id:string;organizer_name:string;organizer_email:string|null};
type IncomingNotification={id:string;title:string;category?:string|null;read_at?:string|null};

function formatDate(value:string){return new Date(value).toLocaleString("fr-FR",{dateStyle:"full",timeStyle:"short",timeZone:"Africa/Douala"});}

export default function PortalNotificationRuntime({profileId}:{profileId:string}){
 const supabase=useMemo(()=>createClient(),[]);
 const [alert,setAlert]=useState<StartAlert|null>(null);
 const audioRef=useRef<AudioContext|null>(null);
 const pendingSound=useRef(false);
 const closeTimer=useRef<number|null>(null);

 const unlockAudio=useCallback(()=>{
   if(typeof window==="undefined")return;
   try{
     if(!audioRef.current)audioRef.current=new AudioContext();
     void audioRef.current.resume();
     if(pendingSound.current){pendingSound.current=false;window.setTimeout(()=>playChime(),80);}
   }catch{}
 },[]);

 function playChime(){
   if(typeof window==="undefined")return;
   try{
     const ctx=audioRef.current;
     if(!ctx||ctx.state!=="running"){pendingSound.current=true;return;}
     const start=ctx.currentTime+0.02;
     const notes=[523.25,659.25,783.99,659.25,783.99];
     notes.forEach((frequency,index)=>{
       const oscillator=ctx.createOscillator();
       const gain=ctx.createGain();
       const at=start+index*0.56;
       oscillator.type="sine";
       oscillator.frequency.setValueAtTime(frequency,at);
       gain.gain.setValueAtTime(0.0001,at);
       gain.gain.exponentialRampToValueAtTime(0.12,at+0.035);
       gain.gain.exponentialRampToValueAtTime(0.0001,at+0.48);
       oscillator.connect(gain);gain.connect(ctx.destination);
       oscillator.start(at);oscillator.stop(at+0.5);
     });
   }catch{}
 }

 const repairMeetingLabels=useCallback(()=>{
   if(typeof document==="undefined")return;
   document.querySelectorAll(".portalMain *").forEach(node=>{
     if(node.children.length===0&&node.textContent?.trim()==="E-mail non configuré")node.textContent="E-mail non requis / désactivé";
   });
 },[]);

 const paintMeetingBadge=useCallback((count:number)=>{
   if(typeof document==="undefined")return;
   const button=Array.from(document.querySelectorAll<HTMLButtonElement>(".portalSidebar nav button")).find(el=>(el.textContent||"").includes("Réunions et agenda"));
   if(!button)return;
   let badge=button.querySelector<HTMLElement>(".navBadge");
   if(count>0){
     if(!badge){badge=document.createElement("i");badge.className="navBadge aiacMeetingRuntimeBadge";button.appendChild(badge);}
     const next=count>99?"99+":String(count);
     if(badge.textContent!==next)badge.textContent=next;
     if(badge.style.display!=="inline-flex")badge.style.display="inline-flex";
   }else if(badge&&badge.style.display!=="none")badge.style.display="none";
 },[]);

 const refreshMeetingBadge=useCallback(async()=>{
   const [{count:notificationCount},{count:pendingCount}]=await Promise.all([
     supabase.from("notifications").select("id",{count:"exact",head:true}).in("category",["meeting","meeting_start"]).is("read_at",null),
     supabase.from("meeting_participants").select("meeting_id",{count:"exact",head:true}).eq("user_id",profileId).eq("response_status","pending"),
   ]);
   paintMeetingBadge(Math.max(Number(notificationCount||0),Number(pendingCount||0)));
   repairMeetingLabels();
 },[paintMeetingBadge,profileId,repairMeetingLabels,supabase]);

 const refreshStartAlert=useCallback(async()=>{
   const {data,error}=await supabase.rpc("get_pending_meeting_start_alert");
   if(error||!Array.isArray(data)||!data.length)return;
   const item=data[0] as StartAlert;
   setAlert(current=>current?.id===item.id?current:item);
   await supabase.rpc("ack_meeting_start_alert",{target_meeting:item.id,p_dismissed:false});
   if(closeTimer.current)window.clearTimeout(closeTimer.current);
   closeTimer.current=window.setTimeout(()=>setAlert(current=>current?.id===item.id?null:current),15000);
 },[supabase]);

 const closeAlert=useCallback(async()=>{
   const current=alert;setAlert(null);
   if(closeTimer.current)window.clearTimeout(closeTimer.current);
   if(current)await supabase.rpc("ack_meeting_start_alert",{target_meeting:current.id,p_dismissed:true});
 },[alert,supabase]);

 useEffect(()=>{
   const unlock=()=>unlockAudio();
   window.addEventListener("pointerdown",unlock,{passive:true});window.addEventListener("keydown",unlock);
   void refreshMeetingBadge();void refreshStartAlert();
   const polling=window.setInterval(()=>{void refreshMeetingBadge();void refreshStartAlert();repairMeetingLabels();},30000);
   const channel=supabase.channel(`portal-global-notifications:${profileId}`)
     .on("postgres_changes",{event:"INSERT",schema:"public",table:"notifications",filter:`user_id=eq.${profileId}`},(payload:any)=>{
       const incoming=payload.new as IncomingNotification;
       playChime();
       void refreshMeetingBadge();
       if(incoming.category==="meeting_start")window.setTimeout(()=>void refreshStartAlert(),250);
     })
     .on("postgres_changes",{event:"UPDATE",schema:"public",table:"notifications",filter:`user_id=eq.${profileId}`},()=>void refreshMeetingBadge())
     .on("postgres_changes",{event:"*",schema:"public",table:"meeting_participants",filter:`user_id=eq.${profileId}`},()=>void refreshMeetingBadge())
     .subscribe();
   return()=>{
     window.removeEventListener("pointerdown",unlock);window.removeEventListener("keydown",unlock);
     window.clearInterval(polling);
     if(closeTimer.current)window.clearTimeout(closeTimer.current);
     void supabase.removeChannel(channel);
   };
 },[profileId,refreshMeetingBadge,refreshStartAlert,repairMeetingLabels,supabase,unlockAudio]);

 if(!alert)return null;
 return <>
   <div className="aiacMeetingStartAlert" role="alertdialog" aria-live="assertive" aria-label="Réunion en cours">
     <button className="aiacMeetingStartClose" type="button" onClick={()=>void closeAlert()} aria-label="Fermer">×</button>
     <div className="aiacMeetingStartEyebrow">C’est l’heure de la réunion · {alert.code}</div>
     <h2>{alert.title}</h2>
     <div className="aiacMeetingStartGrid">
       <div><b>Début</b><span>{formatDate(alert.starts_at)}</span></div>
       <div><b>Fin prévue</b><span>{formatDate(alert.ends_at)}</span></div>
       <div><b>Organisateur</b><span>{alert.organizer_name}{alert.organizer_email?` · ${alert.organizer_email}`:""}</span></div>
       <div><b>Format / lieu</b><span>{alert.modality}{alert.venue?` · ${alert.venue}`:""}</span></div>
     </div>
     {alert.description&&<p>{alert.description}</p>}
     {alert.agenda&&<div className="aiacMeetingStartAgenda"><b>Ordre du jour</b><p>{alert.agenda}</p></div>}
     {alert.access_instructions&&<p><b>Instructions :</b> {alert.access_instructions}</p>}
     <div className="aiacMeetingStartActions">
       {alert.meeting_url&&<a href={alert.meeting_url} target="_blank" rel="noreferrer">Se connecter maintenant</a>}
       <button type="button" onClick={()=>void closeAlert()}>Fermer</button>
     </div>
     <small>Ce message se ferme automatiquement après 15 secondes. Vous pouvez le fermer immédiatement.</small>
   </div>
   <style jsx global>{`
    .aiacMeetingStartAlert{position:fixed;z-index:10000;left:50%;top:18px;transform:translateX(-50%);width:min(760px,calc(100vw - 28px));max-height:calc(100vh - 36px);overflow:auto;background:#fff;border:2px solid #166534;border-radius:18px;padding:22px 24px;box-shadow:0 24px 70px rgba(0,0,0,.28);color:#122018}
    .aiacMeetingStartClose{position:absolute;right:12px;top:10px;width:36px;height:36px;border-radius:50%;border:0;background:#eef2f0;font-size:25px;cursor:pointer}
    .aiacMeetingStartEyebrow{font-size:12px;font-weight:900;letter-spacing:.05em;text-transform:uppercase;color:#166534;padding-right:42px}.aiacMeetingStartAlert h2{margin:8px 42px 15px 0;font-size:25px}.aiacMeetingStartGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 16px;margin:12px 0}.aiacMeetingStartGrid>div{background:#f6f8f7;border-radius:10px;padding:10px}.aiacMeetingStartGrid b,.aiacMeetingStartGrid span{display:block}.aiacMeetingStartGrid span{margin-top:4px}.aiacMeetingStartAgenda{background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px;margin:12px 0}.aiacMeetingStartAgenda p{white-space:pre-wrap;margin-bottom:0}.aiacMeetingStartActions{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0 8px}.aiacMeetingStartActions a,.aiacMeetingStartActions button{border:0;border-radius:9px;padding:11px 15px;font-weight:800;text-decoration:none;cursor:pointer}.aiacMeetingStartActions a{background:#166534;color:white}.aiacMeetingStartActions button{background:#e5e7eb;color:#111827}@media(max-width:640px){.aiacMeetingStartGrid{grid-template-columns:1fr}.aiacMeetingStartAlert{top:8px;padding:18px}}
   `}</style>
 </>;
}
