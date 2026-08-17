import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const allowedOrigins=new Set(["https://www.aiac-cm.org","https://aiac-cm.org","http://localhost:3000"]);
function cors(origin:string|null){return{"Access-Control-Allow-Origin":origin&&allowedOrigins.has(origin)?origin:"https://aiac-cm.org","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-aiac-worker-token","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"};}
function json(origin:string|null,body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...cors(origin),"Content-Type":"application/json","Cache-Control":"no-store"}});}
function esc(value:unknown){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]||c));}
function para(value:unknown){return esc(value).replace(/\r?\n/g,"<br>");}

type Outbox={id:string;recipient_user_id:string|null;recipient_email:string;recipient_name:string|null;kind:string;entity_type:string;entity_id:string|null;subject:string;payload:Record<string,unknown>;attempts:number};

function messageFor(kind:string,p:Record<string,unknown>){
 if(kind==="invitation")return "Vous êtes invité(e) à participer à cette réunion.";
 if(kind==="update")return "Les informations de cette réunion ont été mises à jour. Vérifiez la nouvelle date, l’heure, le lieu et les consignes.";
 if(kind==="cancelled")return "Cette réunion a été annulée.";
 if(kind==="reminder_30")return "Rappel : cette réunion commence dans environ 30 minutes.";
 if(kind==="reminder_5")return "Rappel : cette réunion commence dans 5 minutes.";
 if(kind==="meeting_start")return "C’est l’heure : la réunion commence maintenant.";
 if(kind==="document_added")return `Un nouveau document${p.document_name?` (« ${String(p.document_name)} »)`:""} a été ajouté au dossier de la réunion. Merci de le consulter avant la réunion.`;
 if(kind==="task_due")return "Cette tâche arrive à échéance maintenant.";
 if(kind==="task_start")return "C’est l’heure prévue pour cette tâche.";
 return "Ceci est un rappel automatique AIAC.";
}

function render(row:Outbox){
 const p=row.payload||{};const tz=String(p.timezone||"Africa/Douala");
 const fmt=new Intl.DateTimeFormat("fr-FR",{dateStyle:"full",timeStyle:"short",timeZone:tz});
 const starts=p.starts_at?fmt.format(new Date(String(p.starts_at))):"";const ends=p.ends_at?fmt.format(new Date(String(p.ends_at))):"";
 const isMeeting=row.entity_type==="meeting";const title=String(p.title||row.subject);const site=String(p.site_url||"https://aiac-cm.org/espace");
 const detailRows=[starts?`<tr><td style="padding:9px;border-bottom:1px solid #e2e8f0"><b>${isMeeting?"Début":"Heure"}</b></td><td style="padding:9px;border-bottom:1px solid #e2e8f0">${esc(starts)}</td></tr>`:"",ends?`<tr><td style="padding:9px;border-bottom:1px solid #e2e8f0"><b>Fin</b></td><td style="padding:9px;border-bottom:1px solid #e2e8f0">${esc(ends)}</td></tr>`:"",p.venue?`<tr><td style="padding:9px"><b>Lieu</b></td><td style="padding:9px">${esc(p.venue)}</td></tr>`:""] .join("");
 const join=p.meeting_url&&row.kind!=="cancelled"?`<p style="margin:22px 0"><a href="${esc(p.meeting_url)}" style="display:inline-block;padding:12px 18px;background:#047857;color:white;border-radius:9px;text-decoration:none;font-weight:700">Se connecter à la réunion</a></p>`:"";
 return `<!doctype html><html lang="fr"><body style="margin:0;background:#f1f5f9;padding:24px;font-family:Arial,sans-serif;color:#0f172a"><main style="max-width:700px;margin:auto;background:white;border-radius:16px;padding:28px"><div style="font-size:12px;text-transform:uppercase;font-weight:800;color:#0369a1">AIAC${p.code?` · ${esc(p.code)}`:""}</div><h1 style="font-size:26px">${esc(title)}</h1><p>Bonjour ${esc(row.recipient_name||"membre AIAC")},</p><p>${esc(messageFor(row.kind,p))}</p>${detailRows?`<table style="width:100%;border-collapse:collapse;margin:18px 0">${detailRows}</table>`:""}${p.description?`<p>${para(p.description)}</p>`:""}${p.agenda?`<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px"><b>Ordre du jour</b><p>${para(p.agenda)}</p></div>`:""}${p.access_instructions?`<p><b>Instructions :</b><br>${para(p.access_instructions)}</p>`:""}${join}<p><a href="${esc(site)}" style="color:#0369a1;font-weight:700">${isMeeting?"Consulter la réunion et répondre":"Ouvrir mon agenda"}</a></p><p style="font-size:12px;color:#64748b">Notification automatique du portail officiel AIAC.</p></main></body></html>`;
}

async function flush(service:any,resendKey:string,from:string){
 const {data:rows,error:claimError}=await service.rpc("claim_notification_email_batch",{p_limit:50});
 if(claimError)throw new Error(claimError.message);
 let sent=0,failed=0;
 for(const row of (rows||[]) as Outbox[]){
   let errorMessage="";
   try{
     const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${resendKey}`,"Content-Type":"application/json"},body:JSON.stringify({from,to:[row.recipient_email],subject:row.subject,html:render(row)})});
     if(!response.ok){const detail=await response.text();throw new Error(`${response.status} ${detail}`.slice(0,1500));}
     sent++;
   }catch(error){failed++;errorMessage=error instanceof Error?error.message:"Échec d’envoi";}
   await service.rpc("complete_notification_email",{p_id:row.id,p_success:!errorMessage,p_error:errorMessage||null});
 }
 return{claimed:(rows||[]).length,sent,failed};
}

Deno.serve(async request=>{
 const origin=request.headers.get("origin");
 if(request.method==="OPTIONS")return new Response("ok",{headers:cors(origin)});
 if(request.method!=="POST")return json(origin,{error:"Méthode non autorisée"},405);
 const supabaseUrl=Deno.env.get("SUPABASE_URL");
 const publishableKeys=JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}");
 const secretKeys=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}");
 const anonKey=Deno.env.get("SUPABASE_ANON_KEY")||publishableKeys.default;
 const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||secretKeys.default;
 if(!supabaseUrl||!serviceKey)return json(origin,{error:"Configuration Supabase manquante"},500);
 const service=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false}});
 let payload:Record<string,unknown>;try{payload=await request.json();}catch{return json(origin,{error:"Corps JSON invalide"},400);}
 const workerMode=String(payload.action||"")==="flush_outbox";
 if(workerMode){
   const token=request.headers.get("x-aiac-worker-token")||"";
   const {data:valid,error}=await service.rpc("validate_notification_worker_token",{p_token:token});
   if(error||valid!==true)return json(origin,{error:"Worker non autorisé"},401);
 }else{
   const authorization=request.headers.get("Authorization");
   if(!authorization||!anonKey)return json(origin,{error:"Authentification requise"},401);
   const userClient=createClient(supabaseUrl,anonKey,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
   const {data:authData,error:authError}=await userClient.auth.getUser();
   if(authError||!authData.user)return json(origin,{error:"Session invalide"},401);
   const meetingId=String(payload.meeting_id||"");const kind=String(payload.kind||"invitation");
   if(!/^[0-9a-f-]{36}$/i.test(meetingId)||!["invitation","reminder","update","cancelled"].includes(kind))return json(origin,{error:"Demande invalide"},400);
   const {data:queued,error:queueError}=await userClient.rpc("queue_meeting_email_kind",{target_meeting:meetingId,target_kind:kind});
   if(queueError)return json(origin,{error:queueError.message},403);
   payload.queued=queued;
 }
 const resendKey=Deno.env.get("RESEND_API_KEY");
 if(!resendKey)return json(origin,{ok:false,configured:false,sent:0,failed:0,message:"RESEND_API_KEY n’est pas configurée : les e-mails restent dans la file d’attente."},503);
 const from=Deno.env.get("AIAC_EMAIL_FROM")||"AIAC <notifications@aiac-cm.org>";
 try{
   const result=await flush(service,resendKey,from);
   return json(origin,{ok:result.failed===0,configured:true,...result,message:`${result.sent} e-mail(s) envoyé(s)${result.failed?` · ${result.failed} échec(s)`:""}.`});
 }catch(error){return json(origin,{error:error instanceof Error?error.message:"Échec du worker"},500);}
});
