import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const allowedOrigins=new Set(["https://www.aiac-cm.org","https://aiac-cm.org","http://localhost:3000"]);
function cors(origin:string|null){return{"Access-Control-Allow-Origin":origin&&allowedOrigins.has(origin)?origin:"https://www.aiac-cm.org","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"};}
function json(origin:string|null,body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...cors(origin),"Content-Type":"application/json","Cache-Control":"no-store"}});}
function escapeHtml(value:unknown){return String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[char]||char);}
function paragraph(value:unknown){return escapeHtml(value).replace(/\r?\n/g,"<br>");}

type Meeting={id:string;code:string;title:string;description:string|null;agenda:string|null;status:string;modality:string;starts_at:string;ends_at:string;timezone:string;venue:string|null;meeting_url:string|null;access_instructions:string|null;organizer_id:string};
type Recipient={kind:"internal"|"guest";rowId:string;email:string;name:string;response:string;url:string};

Deno.serve(async(request)=>{
  const origin=request.headers.get("origin");
  if(request.method==="OPTIONS")return new Response("ok",{headers:cors(origin)});
  if(request.method!=="POST")return json(origin,{error:"Méthode non autorisée"},405);
  const supabaseUrl=Deno.env.get("SUPABASE_URL");const anonKey=Deno.env.get("SUPABASE_ANON_KEY");const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");const authorization=request.headers.get("Authorization");
  if(!supabaseUrl||!anonKey||!serviceKey||!authorization)return json(origin,{error:"Configuration ou authentification manquante"},401);
  const userClient=createClient(supabaseUrl,anonKey,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
  const service=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false}});
  const {data:authData,error:authError}=await userClient.auth.getUser();
  if(authError||!authData.user)return json(origin,{error:"Session invalide"},401);
  let payload:Record<string,unknown>;try{payload=await request.json();}catch{return json(origin,{error:"Corps JSON invalide"},400);}
  const meetingId=String(payload.meeting_id||"");const kind=String(payload.kind||"invitation");
  if(!/^[0-9a-f-]{36}$/i.test(meetingId)||!["invitation","reminder","update","cancelled"].includes(kind))return json(origin,{error:"Demande invalide"},400);
  const {data:meeting,error:meetingError}=await userClient.from("meetings").select("*").eq("id",meetingId).single();
  if(meetingError||!meeting)return json(origin,{error:"Réunion inaccessible"},404);
  const {data:profile}=await userClient.from("profiles").select("role").eq("id",authData.user.id).single();
  const {data:assurance}=await userClient.auth.mfa.getAuthenticatorAssuranceLevel();
  const administrator=["admin","super_admin"].includes(String(profile?.role||""))&&assurance?.currentLevel==="aal2";
  if(meeting.organizer_id!==authData.user.id&&!administrator)return json(origin,{error:"Gestion de la réunion non autorisée"},403);
  const item=meeting as Meeting;
  const resendKey=Deno.env.get("RESEND_API_KEY");
  if(!resendKey)return json(origin,{ok:true,configured:false,sent:0,failed:0,message:"Les notifications du site ont été envoyées. L’envoi par e-mail sera actif dès que la clé RESEND_API_KEY sera configurée dans Supabase."});
  const siteUrl=(Deno.env.get("SITE_URL")||"https://www.aiac-cm.org").replace(/\/$/,"");const from=Deno.env.get("AIAC_EMAIL_FROM")||"AIAC <notifications@aiac-cm.org>";
  const [{data:participantRows,error:participantError},{data:guestRows,error:guestError}]=await Promise.all([
    service.from("meeting_participants").select("meeting_id,user_id,participant_role,response_status,email_status,notify_by_email").eq("meeting_id",meetingId),
    service.from("meeting_guests").select("id,full_name,email,response_status,email_status,invitation_token").eq("meeting_id",meetingId),
  ]);
  if(participantError||guestError)return json(origin,{error:participantError?.message||guestError?.message||"Invités inaccessibles"},500);
  const userIds=(participantRows||[]).filter(row=>row.participant_role!=="organizer"&&row.notify_by_email).map(row=>row.user_id);
  const {data:profiles,error:profilesError}=userIds.length?await service.from("profiles").select("id,email,full_name").in("id",userIds):{data:[],error:null};
  if(profilesError)return json(origin,{error:profilesError.message},500);
  const directory=new Map((profiles||[]).map(row=>[row.id,row]));const recipients:Recipient[]=[];
  for(const row of participantRows||[]){const person=directory.get(row.user_id);if(!person?.email||row.participant_role==="organizer"||!row.notify_by_email||row.response_status==="declined"&&kind==="reminder"||kind==="invitation"&&row.email_status==="sent")continue;recipients.push({kind:"internal",rowId:row.user_id,email:person.email,name:person.full_name||person.email,response:row.response_status,url:`${siteUrl}/espace?tab=reunions&meeting=${meetingId}`});}
  for(const row of guestRows||[]){if(row.response_status==="declined"&&kind==="reminder"||kind==="invitation"&&row.email_status==="sent")continue;recipients.push({kind:"guest",rowId:row.id,email:row.email,name:row.full_name,url:`${siteUrl}/reunions/invitation/${row.invitation_token}`,response:row.response_status});}
  if(recipients.length>250)return json(origin,{error:"Le nombre de destinataires dépasse la limite de 250 par envoi"},400);
  const dateFormat=new Intl.DateTimeFormat("fr-FR",{dateStyle:"full",timeStyle:"short",timeZone:item.timezone||"Africa/Douala"});
  const subjectPrefix=kind==="cancelled"?"Réunion annulée":kind==="reminder"?"Rappel de réunion":kind==="update"?"Mise à jour de réunion":"Invitation à une réunion";
  let sent=0;let failed=0;
  for(const recipient of recipients){
    const joinButton=item.meeting_url&&kind!=="cancelled"?`<p style="margin:24px 0"><a href="${escapeHtml(item.meeting_url)}" style="background:#047857;border-radius:8px;color:#fff;display:inline-block;font-weight:700;padding:12px 18px;text-decoration:none">Participer à la réunion en ligne</a></p>`:"";
    const html=`<!doctype html><html lang="fr"><body style="background:#f1f5f9;font-family:Arial,sans-serif;margin:0;padding:24px"><main style="background:#fff;border-radius:14px;margin:auto;max-width:680px;padding:28px"><p style="color:#0369a1;font-size:12px;font-weight:700;text-transform:uppercase">${escapeHtml(item.code)} · AIAC</p><h1 style="color:#0f172a;font-size:28px">${escapeHtml(item.title)}</h1><p>Bonjour ${escapeHtml(recipient.name)},</p><p>${kind==="cancelled"?"Cette réunion a été annulée.":kind==="reminder"?"Nous vous rappelons cette réunion à laquelle vous êtes convié(e).":kind==="update"?"Les informations de cette réunion ont été mises à jour.":"Vous êtes invité(e) à participer à cette réunion."}</p><table style="border-collapse:collapse;width:100%"><tr><td style="border-bottom:1px solid #e2e8f0;padding:9px"><b>Début</b></td><td style="border-bottom:1px solid #e2e8f0;padding:9px">${escapeHtml(dateFormat.format(new Date(item.starts_at)))}</td></tr><tr><td style="border-bottom:1px solid #e2e8f0;padding:9px"><b>Fin</b></td><td style="border-bottom:1px solid #e2e8f0;padding:9px">${escapeHtml(dateFormat.format(new Date(item.ends_at)))}</td></tr>${item.venue?`<tr><td style="padding:9px"><b>Lieu</b></td><td style="padding:9px">${escapeHtml(item.venue)}</td></tr>`:""}</table>${item.description?`<p>${paragraph(item.description)}</p>`:""}${item.agenda?`<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px"><b>Ordre du jour</b><p>${paragraph(item.agenda)}</p></div>`:""}${item.access_instructions?`<p><b>Instructions :</b><br>${paragraph(item.access_instructions)}</p>`:""}${joinButton}<p><a href="${escapeHtml(recipient.url)}">Consulter la convocation et répondre</a></p><p style="color:#64748b;font-size:12px">Message automatique du portail AIAC.</p></main></body></html>`;
    let errorMessage="";
    try{const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${resendKey}`,"Content-Type":"application/json"},body:JSON.stringify({from,to:[recipient.email],subject:`${subjectPrefix} — ${item.title}`,html})});if(!response.ok){const detail=await response.text();throw new Error(detail.slice(0,600));}sent++;}catch(error){failed++;errorMessage=error instanceof Error?error.message:"Échec d’envoi";}
    const update={email_status:errorMessage?"failed":"sent",email_sent_at:errorMessage?null:new Date().toISOString(),email_error:errorMessage||null};
    if(recipient.kind==="internal")await service.from("meeting_participants").update(update).eq("meeting_id",meetingId).eq("user_id",recipient.rowId);else await service.from("meeting_guests").update(update).eq("id",recipient.rowId);
  }
  return json(origin,{ok:failed===0,configured:true,sent,failed,message:`${sent} e-mail(s) envoyé(s)${failed?` · ${failed} échec(s)`:""}.`});
});
