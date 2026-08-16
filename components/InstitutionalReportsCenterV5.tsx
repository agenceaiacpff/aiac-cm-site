"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { makeSlug } from "@/lib/public-content";
import styles from "./InstitutionalReportsCenterV5.module.css";

type AnyRow = Record<string, unknown>;
type Body = { body_id:string; body_code:string; body_name:string };
type Program = { program_id:string; program_code:string; program_name:string; program_status:string };
type Project = { project_id:string; project_code:string; project_name:string; project_status:string };
type Activity = { activity_id:string; activity_code:string; activity_title:string; activity_status:string };
type Task = { task_id:string; activity_id:string; task_code:string; task_title:string; task_sequence_no:number; task_status:string };
type Indicator = { code?:string; label?:string; unit?:string; baseline?:number|null; target?:number|null; achieved?:number|null; verification_source?:string|null; notes?:string|null };
type Row = {
  body_id:string; body_code:string; body_name:string;
  program_id:string; program_code:string; program_name:string;
  project_id:string; project_code:string; project_name:string;
  activity_id:string; activity_code:string; activity_title:string;
  task_id:string; task_code:string; task_title:string; task_sequence_no:number;
  report_id:string; report_number:string; report_title:string; report_status:string;
  execution_date:string; period_start:string|null; period_end:string|null;
  summary:string; outcomes:string|null; challenges:string|null; recommendations:string|null;
  women_count:number; men_count:number; girls_count:number; boys_count:number;
  disability_count:number; vulnerable_count:number; participant_total:number;
  indicators:Indicator[]; approved_at:string|null;
};
type Assets = { signature:string; nominal:string; round:string };
type Bundle = { row:Row; report:AnyRow; approval:AnyRow|null; approvals:AnyRow[]; attendance:AnyRow[]; evidence:AnyRow[]; indicators:AnyRow[]; events:AnyRow[]; authorAssets:Assets; reviewerAssets:Assets };
type Preview = { title:string; html:string; audience:"interne"|"public" } | null;
type Scope = { program_count?:number; project_count?:number; activity_count?:number; task_count?:number; planned_tasks?:number; active_tasks?:number; completed_tasks?:number; cancelled_tasks?:number };

const statusLabel:Record<string,string> = { draft:"Brouillon", submitted:"Soumis", returned:"Retourné", approved:"Approuvé", archived:"Archivé" };
const taskStatusLabel:Record<string,string> = { planned:"Planifiée", active:"Active", completed:"Terminée", cancelled:"Annulée" };

function text(v:unknown){ return String(v ?? ""); }
function esc(v:unknown){ return text(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c] || c)); }
function date(v:unknown){ if(!v)return "—"; const s=text(v); const d=new Date(s.length===10?`${s}T12:00:00`:s); return Number.isNaN(d.getTime())?s:d.toLocaleDateString("fr-FR",{day:"2-digit",month:"long",year:"numeric"}); }
function fileName(v:string){ return v.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9._-]+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"").slice(0,115) || "rapport-aiac"; }
function safeRich(v:unknown){
  return text(v)
    .replace(/<script[\s\S]*?<\/script>/gi,"")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi,"")
    .replace(/<object[\s\S]*?<\/object>/gi,"")
    .replace(/<embed[^>]*>/gi,"")
    .replace(/<form[\s\S]*?<\/form>/gi,"")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi,"")
    .replace(/\son\w+\s*=\s*'[^']*'/gi,"")
    .replace(/javascript:/gi,"");
}
function redactSensitive(v:unknown){
  return text(v)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,"[courriel retiré]")
    .replace(/(?:\+?237[\s.-]?)?(?:6\d{2}|2\d{2})(?:[\s.-]?\d{2}){3}\b/g,"[téléphone retiré]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,"[identifiant technique retiré]")
    .replace(/\b[0-9a-f]{64}\b/gi,"[empreinte technique retirée]")
    .replace(/(?:Latitude|Longitude|Coordonnées? GPS)\s*:?\s*-?\d+(?:[.,]\d+)?/gi,"Coordonnée précise retirée");
}
function publicRich(v:unknown){
  return redactSensitive(safeRich(v))
    .replace(/<div[^>]*class=["'][^"']*toolbar[^"']*["'][^>]*>[\s\S]*?<\/div>/gi,"")
    .replace(/<strong>Réf\.\s*interne\s*:<\/strong>\s*[^<]*(?:<br\s*\/?>)?/gi,"")
    .replace(/<p[^>]*data-sensitive=["']true["'][^>]*>[\s\S]*?<\/p>/gi,"")
    .replace(/<div[^>]*data-sensitive=["']true["'][^>]*>[\s\S]*?<\/div>/gi,"");
}
function section(title:string,v:unknown){ const s=text(v).trim(); return s?`<section><h2>${esc(title)}</h2><p>${esc(s).replace(/\n/g,"<br>")}</p></section>`:""; }
function unique(values:string[]){ return Array.from(new Set(values.map(v=>v.trim()).filter(Boolean))); }
function number(v:unknown){ const n=Number(v||0); return Number.isFinite(n)?n:0; }
function bytesToBase64(bytes:Uint8Array){ let binary=""; const size=0x8000; for(let i=0;i<bytes.length;i+=size) binary+=String.fromCharCode(...bytes.subarray(i,i+size)); return btoa(binary); }
function base64Lines(v:string){ return (v.match(/.{1,76}/g)||[v]).join("\r\n"); }
function mimeExtension(mime:string){ if(mime.includes("png"))return "png"; if(mime.includes("gif"))return "gif"; if(mime.includes("webp"))return "webp"; if(mime.includes("svg"))return "svg"; return "jpg"; }
function extractResultText(html:unknown){
  const value=text(html).trim(); if(!value || typeof DOMParser==="undefined")return "";
  try{
    const doc=new DOMParser().parseFromString(`<div id="aiac-root">${value}</div>`,"text/html");
    const headings=Array.from(doc.querySelectorAll("h1,h2,h3"));
    const found=headings.find(h=>/résultat/i.test(h.textContent||"") && !/recommand/i.test(h.textContent||""));
    if(!found)return "";
    const parts:string[]=[]; let node=found.nextElementSibling;
    while(node && !/^H[1-3]$/.test(node.tagName)){ const t=(node.textContent||"").replace(/\s+/g," ").trim(); if(t)parts.push(t); node=node.nextElementSibling; }
    return parts.join(" ").slice(0,5000);
  }catch{return "";}
}

const reportCss = `
@page{size:A4;margin:12mm}*{box-sizing:border-box}html,body{margin:0;padding:0}body{font:14px/1.55 Arial,Helvetica,sans-serif;background:#edf2ef;color:#17202a}.version{max-width:1040px;margin:0 auto 10px;background:#164f35;color:#fff;padding:8px 12px;text-align:center;font-weight:800;letter-spacing:.02em}.document{max-width:1040px;margin:auto;background:#fff;padding:28px 36px;box-shadow:0 2px 14px #0002}.toolbar{display:none!important}.page{max-width:none!important;margin:0!important;padding:0!important;background:#fff!important;box-shadow:none!important}.letterhead{display:block;width:100%;max-height:185px;object-fit:contain;margin:0 auto 16px}.docmeta{display:flex;justify-content:space-between;gap:24px;border-top:1px solid #aebcb4;border-bottom:1px solid #aebcb4;padding:10px 0;margin:8px 0 18px}.right{text-align:right}.page h1,.document>h1{color:#154f34;text-align:center;font-size:26px;line-height:1.2;margin:18px 0 6px}.subtitle{text-align:center;font-weight:700;color:#496358;margin-bottom:12px}.statusline{display:flex;flex-wrap:wrap;gap:7px;justify-content:center;margin:12px 0}.badge{display:inline-block;border:1px solid #8da69a;border-radius:999px;padding:5px 9px;background:#f6faf7;font-size:12px;font-weight:800}.badge.ok{background:#e8f6ed;color:#155d38;border-color:#92c4a6}.taskbox,.note,.validation,.publicNote{border:1px solid #b9c9c0;border-radius:10px;background:#f7faf8;padding:13px 15px;margin:15px 0}.taskbox{border-left:5px solid #175a3a}.label{font-size:12px;text-transform:uppercase;font-weight:900;color:#175a3a;letter-spacing:.05em}.page h2,.document h2{font-size:18px;color:#15583a;border-bottom:2px solid #c6d6cd;padding-bottom:5px;margin:24px 0 11px}.page h3,.document h3{font-size:15px;color:#244d3b}.grid4,.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin:14px 0}.metric{border:1px solid #c6d5cd;border-radius:9px;background:#fbfdfc;padding:12px;text-align:center}.metric strong{display:block;color:#15583a;font-size:22px}.metric span{display:block;margin-top:4px}.page table,.document table{border-collapse:collapse;width:100%;font-size:12.5px;margin:12px 0}.page th,.page td,.document th,.document td{border:1px solid #aebbb4;padding:7px;vertical-align:top;text-align:left;overflow-wrap:anywhere}.page th,.document th{background:#edf4f0;color:#153e2b}.check{font-weight:800;color:#15613a}.validation{background:#edf7f1;border-color:#9bc2ab}.publicNote{background:#eef7f1}.annex{break-before:page;border-top:4px solid #175a3a;padding-top:10px;margin-top:28px}.muted{color:#627168}.signatureGrid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:34px;width:100%;margin:22px 0 32px;align-items:start;break-inside:avoid}.signatureRow{display:flex;width:100%}.signatureRow.left{justify-content:flex-start}.signatureRow.right{justify-content:flex-end}.signatureBox{position:relative;width:350px;max-width:100%;height:225px;text-align:center}.signer{position:absolute;top:0;left:0;right:0;font-weight:800;line-height:1.35}.hand{position:absolute;top:45px;left:60px;width:225px;height:70px;object-fit:contain}.nominal{position:absolute;bottom:20px;left:40px;width:265px;height:78px;object-fit:contain}.round{position:absolute;top:78px;width:105px;height:105px;object-fit:contain}.signatureRow.right .round{left:0}.signatureRow.left .round{right:0}.sigDate{position:absolute;bottom:-3px;left:0;right:0;font-size:11px}.evidenceImage{max-width:320px;max-height:230px;object-fit:contain;border:1px solid #cad5cf;border-radius:6px;margin:6px 0}.source{border:1px solid #cad6cf;border-radius:9px;padding:14px;margin:14px 0;break-inside:avoid}.sourceRich{margin-top:10px}.sourceRich img{max-width:100%;height:auto}.publicStatus{border:1px solid #a9c5b5;border-radius:10px;background:#f5faf7;padding:14px;margin-top:22px}.publicStatus p{margin:5px 0}@media(max-width:700px){.document{padding:18px}.docmeta{display:block}.right{text-align:left;margin-top:8px}.grid4,.metrics{grid-template-columns:1fr 1fr}.signatureGrid{grid-template-columns:1fr;gap:18px}.signatureRow.left,.signatureRow.right{justify-content:center}.signatureBox{height:210px;width:100%}.hand{left:16%;width:68%}.nominal{left:10%;width:80%}.round{width:88px;height:88px}}@media print{body{background:#fff}.document{max-width:none;padding:0;box-shadow:none}.version{margin-bottom:7mm}.source,.signatureGrid{break-inside:avoid}}
`;

function shell(title:string,body:string,audience:"interne"|"public"){
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${reportCss}</style></head><body><div class="version">${audience==="interne"?"VERSION INTERNE — DOSSIER COMPLET":"VERSION PUBLIQUE — DONNÉES SENSIBLES RETIRÉES UNIQUEMENT"}</div><div class="document">${body}</div></body></html>`;
}

export default function InstitutionalReportsCenterV5(){
  const supabase=useMemo(()=>createClient(),[]);
  const [bodies,setBodies]=useState<Body[]>([]),[programs,setPrograms]=useState<Program[]>([]),[projects,setProjects]=useState<Project[]>([]),[activities,setActivities]=useState<Activity[]>([]),[tasks,setTasks]=useState<Task[]>([]);
  const [bodyId,setBodyId]=useState(""),[programId,setProgramId]=useState(""),[projectId,setProjectId]=useState(""),[activityId,setActivityId]=useState(""),[taskId,setTaskId]=useState("");
  const [from,setFrom]=useState(""),[to,setTo]=useState(""),[filter,setFilter]=useState("all"),[q,setQ]=useState("");
  const [rows,setRows]=useState<Row[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(""),[notice,setNotice]=useState(""),[preview,setPreview]=useState<Preview>(null),[published,setPublished]=useState<Record<string,string>>({});

  useEffect(()=>{ let stop=false; void (async()=>{
    setLoading(true);
    const [{data:b},{data:r,error}]=await Promise.all([
      supabase.rpc("institutional_reporting_bodies"),
      supabase.rpc("institutional_reporting_dataset",{target_body_id:null,target_program_id:null,target_project_id:null,target_activity_id:null,target_task_id:null,period_from:null,period_to:null,include_non_approved:true}),
    ]);
    if(stop)return;
    const rr=(r||[]) as Row[]; setBodies((b||[]) as Body[]); setRows(error?[]:rr); if(error)setNotice(error.message);
    if(rr.length){ const {data:p}=await supabase.from("public_content_items").select("source_task_report_id,slug,status").in("source_task_report_id",rr.map(x=>x.report_id)); const map:Record<string,string>={}; for(const item of (p||[]) as AnyRow[]){ if(item.status==="published"&&item.source_task_report_id&&item.slug)map[text(item.source_task_report_id)]=`/publications/rapports/${text(item.slug)}`; } setPublished(map); }
    setLoading(false);
  })(); return()=>{stop=true}; },[supabase]);

  async function chooseBody(v:string){ setBodyId(v);setProgramId("");setProjectId("");setActivityId("");setTaskId("");setPrograms([]);setProjects([]);setActivities([]);setTasks([]); if(!v)return; const {data,error}=await supabase.rpc("institutional_reporting_programs",{target_body_id:v}); if(error)setNotice(error.message); else setPrograms((data||[]) as Program[]); }
  async function chooseProgram(v:string){ setProgramId(v);setProjectId("");setActivityId("");setTaskId("");setProjects([]);setActivities([]);setTasks([]); if(!v)return; const {data,error}=await supabase.rpc("institutional_reporting_projects",{target_program_id:v}); if(error)setNotice(error.message); else setProjects((data||[]) as Project[]); }
  async function chooseProject(v:string){ setProjectId(v);setActivityId("");setTaskId("");setActivities([]);setTasks([]); if(!v)return; const {data,error}=await supabase.rpc("institutional_reporting_activities",{target_project_id:v}); if(error)setNotice(error.message); else setActivities((data||[]) as Activity[]); }
  async function chooseActivity(v:string){ setActivityId(v);setTaskId("");setTasks([]); if(!v)return; const {data,error}=await supabase.rpc("institutional_reporting_tasks",{target_activity_id:v}); if(error)setNotice(error.message); else setTasks((data||[]) as Task[]); }

  async function load(includeNonApproved=true){
    if(from&&to&&to<from){setNotice("La date de fin ne peut pas être antérieure à la date de début.");return [] as Row[];}
    setLoading(true);setNotice("");
    const {data,error}=await supabase.rpc("institutional_reporting_dataset",{target_body_id:bodyId||null,target_program_id:programId||null,target_project_id:projectId||null,target_activity_id:activityId||null,target_task_id:taskId||null,period_from:from||null,period_to:to||null,include_non_approved:includeNonApproved});
    setLoading(false); if(error){setNotice(error.message);return [] as Row[];} const rr=(data||[]) as Row[]; setRows(rr); return rr;
  }

  const shown=useMemo(()=>{ const n=q.trim().toLowerCase(); return rows.filter(r=>(filter==="all"||r.report_status===filter)&&(!n||[r.report_number,r.report_title,r.summary,r.program_code,r.program_name,r.project_code,r.project_name,r.activity_code,r.activity_title,r.task_code,r.task_title].some(v=>text(v).toLowerCase().includes(n)))); },[rows,filter,q]);
  const sb=bodies.find(x=>x.body_id===bodyId),sp=programs.find(x=>x.program_id===programId),sj=projects.find(x=>x.project_id===projectId),sa=activities.find(x=>x.activity_id===activityId),st=tasks.find(x=>x.task_id===taskId);
  const scoped=Boolean(bodyId||programId||projectId||activityId||taskId);
  function scopeType(){return st?"TÂCHE":sa?"ACTIVITÉ":sj?"PROJET":sp?"PROGRAMME":sb?"ORGANE":"INSTITUTION";}
  function scopeName(){return st?`${st.task_code} · ${st.task_title}`:sa?`${sa.activity_code} · ${sa.activity_title}`:sj?`${sj.project_code} · ${sj.project_name}`:sp?`${sp.program_code} · ${sp.program_name}`:sb?`${sb.body_code} · ${sb.body_name}`:"AIAC";}

  async function pathImage(path:unknown,bucket="aiac-signatures"){
    const p=text(path).trim(); if(!p)return ""; if(p.startsWith("data:image/"))return p;
    try{ const {data}=await supabase.storage.from(bucket).createSignedUrl(p,1200); if(!data?.signedUrl)return ""; const response=await fetch(data.signedUrl); if(!response.ok)return ""; const bytes=new Uint8Array(await response.arrayBuffer()); const mime=response.headers.get("content-type")||"image/png"; return `data:${mime};base64,${bytesToBase64(bytes)}`; }catch{return "";}
  }
  async function assetSet(row:AnyRow,author:boolean):Promise<Assets>{
    const signature=author?row.reporter_signature_asset_path:row.signature_asset_path;
    const nominal=author?row.reporter_nominal_seal_asset_path:row.nominal_seal_asset_path;
    const round=author?row.reporter_round_seal_asset_path:row.round_seal_asset_path;
    const [s,n,r]=await Promise.all([pathImage(signature),pathImage(nominal),pathImage(round)]); return {signature:s,nominal:n,round:r};
  }
  async function bundle(id:string):Promise<Bundle>{
    const row=rows.find(x=>x.report_id===id)||shown.find(x=>x.report_id===id); if(!row)throw new Error("Rapport introuvable dans le registre courant.");
    const [{data:r,error:er},{data:ap,error:ea},{data:at,error:et},{data:ev,error:ee},{data:ind,error:ei},{data:events,error:ej}]=await Promise.all([
      supabase.from("task_reports").select("*").eq("id",id).single(),
      supabase.from("task_report_approvals").select("*").eq("report_id",id).order("created_at",{ascending:false}),
      supabase.from("task_report_attendance").select("*").eq("report_id",id).order("created_at"),
      supabase.from("task_report_evidence").select("*").eq("report_id",id).order("created_at"),
      supabase.from("task_report_indicator_values").select("*").eq("report_id",id).order("created_at"),
      supabase.from("task_report_events").select("*").eq("report_id",id).order("created_at"),
    ]);
    const error=er||ea||et||ee||ei||ej; if(error)throw new Error(error.message);
    const approvals=(ap||[]) as AnyRow[]; const approval=approvals.find(a=>a.decision==="approved")||approvals[0]||null;
    const [authorAssets,reviewerAssets]=await Promise.all([assetSet((r||{}) as AnyRow,true),approval?assetSet(approval,false):Promise.resolve({signature:"",nominal:"",round:""})]);
    return {row,report:(r||{}) as AnyRow,approval,approvals,attendance:(at||[]) as AnyRow[],evidence:(ev||[]) as AnyRow[],indicators:(ind||[]) as AnyRow[],events:(events||[]) as AnyRow[],authorAssets,reviewerAssets};
  }

  function signatureBox(name:string,job:string,assets:Assets,side:"left"|"right",signedAt:unknown){
    if(!name&&!assets.signature&&!assets.nominal&&!assets.round)return "";
    return `<div class="signatureRow ${side}"><div class="signatureBox"><div class="signer">${esc(name||"Signataire")}<br><span class="muted">${esc(job)}</span></div>${assets.signature?`<img class="hand" src="${assets.signature}" alt="Signature">`:""}${assets.nominal?`<img class="nominal" src="${assets.nominal}" alt="Cachet nominatif">`:""}${assets.round?`<img class="round" src="${assets.round}" alt="Cachet rond">`:""}<div class="sigDate">${signedAt?`Signé le ${esc(date(signedAt))}`:""}</div></div></div>`;
  }
  async function internalAnnex(b:Bundle){
    const r=b.report,a=b.approval;
    let attendance=""; if(b.attendance.length){ attendance=`<section class="annex"><h2>Présences et participants — accès interne</h2><table><thead><tr><th>Nom</th><th>Genre / âge</th><th>Téléphone / courriel</th><th>Organisation / rôle</th><th>Présence</th></tr></thead><tbody>${b.attendance.map(x=>`<tr><td>${esc(x.full_name)}</td><td>${esc(x.gender)} · ${esc(x.age_group)}</td><td>${esc(x.phone||"—")}<br>${esc(x.email||"—")}</td><td>${esc(x.organization||"—")}<br>${esc(x.role||"—")}</td><td>${x.present?"Présent(e)":"Non présent(e)"}</td></tr>`).join("")}</tbody></table></section>`; }
    let evidence=""; if(b.evidence.length){ const cards=await Promise.all(b.evidence.map(async x=>{ let image=""; if(text(x.mime_type).startsWith("image/")){ const src=await pathImage(x.storage_path,"aiac-task-reports"); if(src)image=`<br><img class="evidenceImage" src="${src}" alt="${esc(x.caption||x.file_name||"Preuve")}">`; } return `<tr><td>${esc(x.evidence_type)}</td><td>${esc(x.file_name)}</td><td>${esc(x.caption||"—")}${image}</td><td>${esc(x.classification||"—")}</td><td>${esc(x.sha256||"—")}</td></tr>`; })); evidence=`<section class="annex"><h2>Pièces et preuves — accès interne</h2><table><thead><tr><th>Type</th><th>Fichier</th><th>Description</th><th>Classification</th><th>Empreinte</th></tr></thead><tbody>${cards.join("")}</tbody></table></section>`; }
    const indicators=b.indicators.length?`<section class="annex"><h2>Indicateurs détaillés</h2><table><thead><tr><th>Code</th><th>Indicateur</th><th>Unité</th><th>Cible</th><th>Réalisé</th><th>Source</th></tr></thead><tbody>${b.indicators.map(x=>`<tr><td>${esc(x.indicator_code)}</td><td>${esc(x.indicator_label)}</td><td>${esc(x.unit)}</td><td>${esc(x.target_value)}</td><td>${esc(x.achieved_value)}</td><td>${esc(x.verification_source||"—")}</td></tr>`).join("")}</tbody></table></section>`:"";
    const events=b.events.length?`<section class="annex"><h2>Historique du dossier</h2><table><thead><tr><th>Date</th><th>Événement</th><th>Statut</th><th>Commentaire</th></tr></thead><tbody>${b.events.map(x=>`<tr><td>${esc(date(x.created_at))}</td><td>${esc(x.event_type)}</td><td>${esc(x.from_status||"—")} → ${esc(x.to_status||"—")}</td><td>${esc(x.comment||"—")}</td></tr>`).join("")}</tbody></table></section>`:"";
    const validation=`<section class="annex"><h2>Certification et validation</h2><div class="validation"><p><b>Statut :</b> ${esc(statusLabel[text(r.status)]||r.status)}</p><p><b>Autorité :</b> ${esc(a?.authority_name||r.validation_authority_type||"—")}</p><p><b>Référence de validation :</b> ${esc(a?.validation_reference||a?.decision_reference||"—")}</p><p><b>PV / mandat :</b> ${esc(a?.mandate_reference||"—")}</p><p><b>Décision enregistrée par :</b> ${esc(a?.actor_name||"—")}</p><p><b>Qualité :</b> ${esc(a?.actor_job_title||a?.actor_role||"—")}</p><p><b>Date :</b> ${esc(date(a?.decision_date||a?.signed_at||r.approved_at))}</p><p><b>Empreinte du rapport :</b> ${esc(r.current_hash||"—")}</p></div><div class="signatureGrid">${signatureBox(text(r.reporter_signature_name||"Rapporteur"),text(r.reporter_job_title||"Auteur / rapporteur"),b.authorAssets,"left",r.reporter_signed_at)}${signatureBox(text(a?.actor_name||""),text(a?.actor_job_title||a?.actor_role||"Validateur"),b.reviewerAssets,"right",a?.signed_at||a?.decision_date)}</div></section>`;
    return `${attendance}${evidence}${indicators}${events}${validation}`;
  }
  function fallbackBody(r:AnyRow){ return `<main class="page"><h1>${esc(r.title||"Rapport d’exécution")}</h1>${section("Résumé exécutif",r.summary)}${section("Objectifs",r.objectives)}${section("Méthodologie",r.methodology)}${section("Résultats",r.outcomes)}${section("Difficultés",r.challenges)}${section("Recommandations",r.recommendations)}${section("Histoire de réussite",r.success_story)}</main>`; }
  function publicStatus(b:Bundle){ const a=b.approval; return `<div class="publicStatus"><h2>Statut institutionnel</h2><p><b>Statut :</b> ${esc(statusLabel[text(b.report.status)]||b.report.status)}</p><p><b>Autorité :</b> ${esc(a?.authority_name||"Autorité AIAC compétente")}</p><p><b>Référence :</b> ${esc(a?.validation_reference||a?.decision_reference||"—")}</p><p><b>Date :</b> ${esc(date(a?.decision_date||a?.signed_at||b.report.approved_at))}</p></div>`; }
  async function individualHtml(b:Bundle,audience:"interne"|"public"){
    if(audience==="public"&&text(b.report.status)!=="approved")throw new Error("La version publique exige un rapport approuvé.");
    const raw=text(b.report.rich_content_html).trim(); const core=raw?(audience==="public"?publicRich(raw):safeRich(raw)):fallbackBody(b.report);
    if(audience==="public")return shell(`${b.row.report_number} public`,`${core}${publicStatus(b)}`,"public");
    return shell(`${b.row.report_number} interne`,`${core}${await internalAnnex(b)}`,"interne");
  }

  function show(title:string,html:string,audience:"interne"|"public"){setPreview({title,html,audience});}
  function downloadHtml(title:string,html:string){const url=URL.createObjectURL(new Blob([html],{type:"text/html;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download=`${fileName(title)}.html`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
  function printHtml(html:string){const frame=document.createElement("iframe");Object.assign(frame.style,{position:"fixed",right:"0",bottom:"0",width:"1px",height:"1px",border:"0",opacity:"0"});frame.srcdoc=html;document.body.appendChild(frame);frame.onload=()=>setTimeout(()=>{try{frame.contentWindow?.focus();frame.contentWindow?.print();}finally{setTimeout(()=>frame.remove(),60000);}},500);}
  async function wordHtml(title:string,html:string){
    const doc=new DOMParser().parseFromString(html,"text/html"); const images=Array.from(doc.querySelectorAll("img")); const parts:string[]=[]; let index=0;
    for(const image of images){ const src=image.getAttribute("src")||""; if(!src)continue; try{ let mime="image/jpeg",base64=""; if(src.startsWith("data:")){ const match=src.match(/^data:([^;,]+);base64,(.*)$/s); if(!match)continue; mime=match[1];base64=match[2].replace(/\s+/g,""); }else{ const absolute=new URL(src,window.location.href).toString(); const response=await fetch(absolute); if(!response.ok)continue; mime=response.headers.get("content-type")||"image/jpeg"; base64=bytesToBase64(new Uint8Array(await response.arrayBuffer())); } index+=1; const location=`word-media/image-${index}.${mimeExtension(mime)}`; image.setAttribute("src",location); parts.push(`Content-Location: ${location}\r\nContent-Transfer-Encoding: base64\r\nContent-Type: ${mime}\r\n\r\n${base64Lines(base64)}\r\n`); }catch{ continue; } }
    const boundary=`----=_AIAC_${Date.now()}`; const documentHtml=`<!doctype html>${doc.documentElement.outerHTML}`; const mainBase64=bytesToBase64(new TextEncoder().encode(documentHtml)); const mhtml=`MIME-Version: 1.0\r\nContent-Type: multipart/related; boundary="${boundary}"\r\n\r\n--${boundary}\r\nContent-Location: file:///C:/AIAC/report.html\r\nContent-Transfer-Encoding: base64\r\nContent-Type: text/html; charset="utf-8"\r\n\r\n${base64Lines(mainBase64)}\r\n${parts.map(p=>`--${boundary}\r\n${p}`).join("")}--${boundary}--\r\n`; const url=URL.createObjectURL(new Blob([mhtml],{type:"application/msword"})); const a=document.createElement("a"); a.href=url;a.download=`${fileName(title)}.doc`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
  }
  async function individual(id:string,audience:"interne"|"public",format:"preview"|"html"|"pdf"|"word"){
    setBusy(id);setNotice(""); try{const b=await bundle(id),html=await individualHtml(b,audience),title=`${b.row.report_number}_${audience}`; if(format==="preview")show(title,html,audience); else if(format==="html")downloadHtml(title,html); else if(format==="pdf")printHtml(html); else await wordHtml(title,html);}catch(e){setNotice(e instanceof Error?e.message:"Génération impossible.");} setBusy("");
  }
  async function publish(id:string){
    setBusy(id);setNotice(""); try{ const b=await bundle(id); if(text(b.report.status)!=="approved")throw new Error("Seul un rapport approuvé peut être publié."); const html=await individualHtml(b,"public"); const title=redactSensitive(b.report.title||b.row.report_title).slice(0,240)||`Rapport ${b.row.report_number}`; let summary=redactSensitive(b.report.summary).trim().slice(0,1200); if(summary.length<10)summary=`Version publique du rapport ${b.row.report_number}.`; const {data:u}=await supabase.auth.getUser(); const uid=u.user?.id; if(!uid)throw new Error("Session expirée."); const {data:old,error:oldError}=await supabase.from("public_content_items").select("id,slug").eq("source_task_report_id",id).maybeSingle(); if(oldError)throw new Error(oldError.message); let slug=text((old as AnyRow|null)?.slug||makeSlug(`${b.row.report_number}-${title}`)),contentId=""; const payload={body_id:b.row.body_id,content_type:"report",subtype:"Rapport public",title,slug,summary,content:html,content_format:"html_document",status:"published",project_id:b.row.project_id,program_id:b.row.program_id,activity_date:text(b.report.execution_date||b.row.execution_date),location:text(b.report.location||"").trim()||null,published_at:new Date().toISOString(),approved_by:uid,source_task_report_id:id}; if(old){const {error}=await supabase.from("public_content_items").update(payload).eq("id",text((old as AnyRow).id));if(error)throw new Error(error.message);contentId=text((old as AnyRow).id);}else{const {data,error}=await supabase.from("public_content_items").insert({...payload,created_by:uid}).select("id,slug").single();if(error)throw new Error(error.message);contentId=text((data as AnyRow).id);slug=text((data as AnyRow).slug);} const {error:linkError}=await supabase.rpc("link_task_report_publication",{target_report_id:id,target_content_id:contentId}); if(linkError)throw new Error(linkError.message); const path=`/publications/rapports/${slug}`; setPublished(v=>({...v,[id]:path})); setNotice(`Rapport publié dans « Rapports et publications » pour ${b.row.body_code} · ${b.row.body_name}.`); }catch(e){setNotice(e instanceof Error?e.message:"Publication impossible.");} setBusy("");
  }
  async function copy(id:string){const path=published[id];if(!path)return;const url=`${window.location.origin}${path}`;try{await navigator.clipboard.writeText(url);setNotice("Lien public copié.");}catch{setNotice(url);}}

  async function consolidatedHtml(audience:"interne"|"public"){
    const approved=await load(false); if(!approved.length)throw new Error("Aucun rapport approuvé n’alimente ce niveau pour la période choisie.");
    const ids=approved.map(x=>x.report_id); const [{data:full,error},{data:scope}]=await Promise.all([supabase.from("task_reports").select("*").in("id",ids),supabase.rpc("institutional_report_scope_summary",{target_body_id:bodyId||null,target_program_id:programId||null,target_project_id:projectId||null,target_activity_id:activityId||null,target_task_id:taskId||null})]); if(error)throw new Error(error.message); const fullRows=(full||[]) as AnyRow[]; const map=new Map(fullRows.map(x=>[text(x.id),x])); const s=(scope||{}) as Scope;
    const sum=(key:"women_count"|"men_count"|"girls_count"|"boys_count"|"disability_count"|"vulnerable_count")=>approved.reduce((n,r)=>n+number(r[key]),0); const women=sum("women_count"),men=sum("men_count"),girls=sum("girls_count"),boys=sum("boys_count"),disability=sum("disability_count"),vulnerable=sum("vulnerable_count");
    const results=unique(approved.map(r=>{const fullRow=map.get(r.report_id)||{};return text(r.outcomes).trim()||extractResultText(fullRow.rich_content_html);}).filter(Boolean)); const challenges=unique(approved.map(r=>text(r.challenges)).filter(Boolean)); const recommendations=unique(approved.map(r=>text(r.recommendations)).filter(Boolean));
    const indicatorMap=new Map<string,{code:string;label:string;unit:string;target:number;achieved:number}>(); for(const r of approved)for(const i of Array.isArray(r.indicators)?r.indicators:[]){const code=text(i.code||"IND"),unit=text(i.unit||""),key=`${code}::${unit}`,cur=indicatorMap.get(key)||{code,label:text(i.label||code),unit,target:0,achieved:0};cur.target+=number(i.target);cur.achieved+=number(i.achieved);indicatorMap.set(key,cur);} const inds=Array.from(indicatorMap.values());
    let out=`<main class="page"><h1>Rapport consolidé de ${esc(scopeType().toLowerCase())}</h1><div class="subtitle">${esc(scopeName())}</div><div class="note"><b>Période :</b> ${esc(from?date(from):"début des données")} au ${esc(to?date(to):"jour de génération")}</div><h2>Résumé exécutif de la consolidation</h2><p>Le périmètre comprend ${number(s.program_count)} programme(s), ${number(s.project_count)} projet(s), ${number(s.activity_count)} activité(s) et ${number(s.task_count)} tâche(s). ${approved.length} rapport(s) approuvé(s) alimentent cette édition.</p><h2>État de la programmation</h2><div class="metrics"><div class="metric"><strong>${number(s.planned_tasks)}</strong><span>Planifiées</span></div><div class="metric"><strong>${number(s.active_tasks)}</strong><span>Actives</span></div><div class="metric"><strong>${number(s.completed_tasks)}</strong><span>Terminées</span></div><div class="metric"><strong>${approved.length}</strong><span>Rapports approuvés</span></div></div><h2>Résultats et réalisations documentés</h2>${results.length?`<ul>${results.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`:`<p class="muted">Aucun résultat distinct n’a été renseigné dans le champ « Résultats » ni identifié dans une section de résultats du corps des rapports sources.</p>`}`;
    if(women+men+girls+boys>0)out+=`<h2>Participations agrégées</h2><div class="metrics"><div class="metric"><strong>${women}</strong><span>Femmes</span></div><div class="metric"><strong>${men}</strong><span>Hommes</span></div><div class="metric"><strong>${girls}</strong><span>Filles</span></div><div class="metric"><strong>${boys}</strong><span>Garçons</span></div></div><p><b>Handicap déclaré :</b> ${disability} · <b>Vulnérabilité déclarée :</b> ${vulnerable}</p>`;
    if(inds.length)out+=`<h2>Indicateurs consolidés</h2><table><thead><tr><th>Code</th><th>Indicateur</th><th>Unité</th><th>Cible cumulée</th><th>Réalisé cumulé</th></tr></thead><tbody>${inds.map(i=>`<tr><td>${esc(i.code)}</td><td>${esc(i.label)}</td><td>${esc(i.unit)}</td><td>${i.target}</td><td>${i.achieved}</td></tr>`).join("")}</tbody></table>`;
    out+=`<h2>Difficultés</h2>${challenges.length?`<ul>${challenges.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`:`<p class="muted">Aucune difficulté structurée n’a été enregistrée.</p>`}<h2>Recommandations</h2>${recommendations.length?`<ul>${recommendations.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`:`<p class="muted">Aucune recommandation structurée n’a été enregistrée.</p>`}<h2>Registre des rapports sources</h2><p class="muted">La colonne « Résumé » reprend uniquement le résumé exécutif de chaque rapport source. Elle n’est plus utilisée pour fabriquer artificiellement la section « Résultats » ci-dessus.</p><table><thead><tr><th>Rapport / date</th><th>Chaîne</th><th>Résumé exécutif</th></tr></thead><tbody>${approved.map(r=>`<tr><td><b>${esc(r.report_number)}</b><br>${esc(date(r.execution_date))}</td><td>${esc(r.project_code)} → ${esc(r.activity_code)} → ${esc(r.task_code)}</td><td>${esc(r.summary||"—")}</td></tr>`).join("")}</tbody></table>`;
    if(audience==="interne")out+=`<section class="annex"><h2>Corps complets des rapports sources approuvés</h2>${approved.map(r=>{const f=map.get(r.report_id)||{},rich=safeRich(f.rich_content_html);return `<article class="source"><h3>${esc(r.report_number)} · ${esc(r.report_title)}</h3><p><b>Chaîne :</b> ${esc(r.program_code)} → ${esc(r.project_code)} → ${esc(r.activity_code)} → ${esc(r.task_code)}</p>${rich?`<div class="sourceRich">${rich}</div>`:"<p class=\"muted\">Aucun corps HTML détaillé.</p>"}<p class="muted"><b>Empreinte :</b> ${esc(f.current_hash||"—")}</p></article>`;}).join("")}</section>`;
    out+=`</main>`; return shell(`AIAC Rapport ${scopeType()} ${audience}`,audience==="public"?redactSensitive(out):out,audience);
  }
  async function consolidatedAction(audience:"interne"|"public",format:"preview"|"html"|"pdf"|"word"){setNotice("");try{const html=await consolidatedHtml(audience),title=`AIAC_Rapport_${scopeType()}_${audience}_${new Date().toISOString().slice(0,10)}`;if(format==="preview")show(title,html,audience);else if(format==="html")downloadHtml(title,html);else if(format==="pdf")printHtml(html);else await wordHtml(title,html);}catch(e){setNotice(e instanceof Error?e.message:"Génération impossible.");}}

  return <section id="centre-rapports" className={`portalPanel ${styles.center}`}>
    <div className={styles.top}><div><p className="eyebrow">Pilotage institutionnel</p><h2>Centre des rapports</h2><p>Filtrez d’abord. Les deux grandes parties restent repliées tant que vous ne souhaitez pas les consulter.</p></div><span className={styles.count}>{rows.filter(r=>r.report_status==="approved").length} approuvé(s)</span></div>
    {notice&&<div className={styles.notice} role="status">{notice}</div>}
    <div className={styles.filters}>
      <label>Organe<select value={bodyId} onChange={e=>void chooseBody(e.target.value)}><option value="">Tous</option>{bodies.map(x=><option key={x.body_id} value={x.body_id}>{x.body_code} · {x.body_name}</option>)}</select></label>
      <label>Programme<select value={programId} disabled={!bodyId} onChange={e=>void chooseProgram(e.target.value)}><option value="">Tous</option>{programs.map(x=><option key={x.program_id} value={x.program_id}>{x.program_code} · {x.program_name}</option>)}</select></label>
      <label>Projet<select value={projectId} disabled={!programId} onChange={e=>void chooseProject(e.target.value)}><option value="">Tous</option>{projects.map(x=><option key={x.project_id} value={x.project_id}>{x.project_code} · {x.project_name}</option>)}</select></label>
      <label>Activité<select value={activityId} disabled={!projectId} onChange={e=>void chooseActivity(e.target.value)}><option value="">Toutes</option>{activities.map(x=><option key={x.activity_id} value={x.activity_id}>{x.activity_code} · {x.activity_title}</option>)}</select></label>
      <label className={styles.wide}>Tâche<select value={taskId} disabled={!activityId} onChange={e=>setTaskId(e.target.value)}><option value="">Toutes les tâches</option>{tasks.map(x=><option key={x.task_id} value={x.task_id}>{x.task_code} · {x.task_title} · {taskStatusLabel[x.task_status]||x.task_status}</option>)}</select></label>
      <label>Du<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>Au<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
      <label>Statut<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Tous</option><option value="approved">Approuvés</option><option value="submitted">Soumis</option><option value="returned">Retournés</option><option value="draft">Brouillons</option><option value="archived">Archivés</option></select></label>
      <label className={styles.wide}>Rechercher<input value={q} onChange={e=>setQ(e.target.value)} placeholder="Numéro, programme, projet, activité, tâche…"/></label>
    </div>
    <div className={styles.actions}><button className={styles.primary} disabled={loading} onClick={()=>void load(true)}>{loading?"Chargement…":"Afficher les rapports"}</button></div>
    <div className={styles.stats}><article><b>{shown.length}</b><span>rapports affichés</span></article><article><b>{shown.filter(r=>r.report_status==="approved").length}</b><span>approuvés</span></article><article><b>{new Set(shown.map(r=>r.project_id)).size}</b><span>projets couverts</span></article><article><b>{new Set(shown.map(r=>r.task_id)).size}</b><span>tâches documentées</span></article></div>

    <details className={styles.fold}><summary><span>1 · Registre des rapports individuels</span><span>{shown.length} rapport(s)</span></summary><div className={styles.foldBody}>{!loading&&!shown.length?<div className={styles.empty}>Aucun rapport ne correspond à la sélection.</div>:shown.map(r=><details className={styles.report} key={r.report_id}><summary><span className={styles.reportTitle}><b>{r.report_number} · {r.report_title}</b><small>{r.program_code} → {r.project_code} → {r.activity_code} → {r.task_code}</small></span><span className={styles.badge}>{statusLabel[r.report_status]||r.report_status}</span></summary><div className={styles.reportBody}><p><b>Date :</b> {date(r.execution_date)}{r.approved_at?<> · <b>Approuvé :</b> {date(r.approved_at)}</>:null}</p><p>{r.summary}</p><div className={styles.formatGroup}><h4>Version interne complète</h4><div className={styles.actions}><button disabled={busy===r.report_id} onClick={()=>void individual(r.report_id,"interne","preview")}>Aperçu HTML</button><button disabled={busy===r.report_id} onClick={()=>void individual(r.report_id,"interne","html")}>Télécharger HTML5</button><button disabled={busy===r.report_id} onClick={()=>void individual(r.report_id,"interne","pdf")}>PDF / Imprimer</button><button disabled={busy===r.report_id} onClick={()=>void individual(r.report_id,"interne","word")}>Word avec images</button></div></div><div className={styles.formatGroup}><h4>Version publique — même mise en page, données sensibles retirées</h4><div className={styles.actions}><button disabled={busy===r.report_id||r.report_status!=="approved"} onClick={()=>void individual(r.report_id,"public","preview")}>Aperçu HTML public</button><button disabled={busy===r.report_id||r.report_status!=="approved"} onClick={()=>void individual(r.report_id,"public","html")}>Télécharger HTML5 public</button><button disabled={busy===r.report_id||r.report_status!=="approved"} onClick={()=>void individual(r.report_id,"public","pdf")}>PDF public</button><button disabled={busy===r.report_id||r.report_status!=="approved"} onClick={()=>void individual(r.report_id,"public","word")}>Word public avec images</button><button className={styles.public} disabled={busy===r.report_id||r.report_status!=="approved"} onClick={()=>void publish(r.report_id)}>{published[r.report_id]?"Mettre à jour la publication publique":"Publier dans Rapports et publications"}</button>{published[r.report_id]&&<><a href={published[r.report_id]} target="_blank" rel="noreferrer">Ouvrir sur le site</a><button onClick={()=>void copy(r.report_id)}>Copier le lien public</button><a href={`/publications/rapports?organe=${encodeURIComponent(r.body_code)}`} target="_blank" rel="noreferrer">Voir les rapports de {r.body_code}</a></>}</div></div></div></details>)}</div></details>

    <details className={styles.fold}><summary><span>2 · Rapports consolidés par niveau</span><span>{scoped?scopeType():"Choisir un niveau"}</span></summary><div className={styles.foldBody}>{!scoped?<div className={styles.empty}>Choisissez un organe, programme, projet, activité ou tâche dans les filtres avant de générer une consolidation.</div>:<><p className={styles.scope}>Niveau : {scopeType()} · {scopeName()}</p><p className={styles.hint}>La section « Résultats et réalisations documentés » utilise désormais uniquement les vrais résultats renseignés ou la section de résultats du rapport source. Le résumé exécutif reste séparé dans le tableau des rapports sources.</p><div className={styles.formatGroup}><h4>Interne complet</h4><div className={styles.actions}><button onClick={()=>void consolidatedAction("interne","preview")}>Aperçu HTML</button><button onClick={()=>void consolidatedAction("interne","html")}>Télécharger HTML5</button><button onClick={()=>void consolidatedAction("interne","pdf")}>PDF / Imprimer</button><button onClick={()=>void consolidatedAction("interne","word")}>Word avec images</button></div></div><div className={styles.formatGroup}><h4>Public expurgé</h4><div className={styles.actions}><button onClick={()=>void consolidatedAction("public","preview")}>Aperçu HTML public</button><button onClick={()=>void consolidatedAction("public","html")}>Télécharger HTML5 public</button><button onClick={()=>void consolidatedAction("public","pdf")}>PDF public</button><button onClick={()=>void consolidatedAction("public","word")}>Word public</button></div></div></>}</div></details>

    {preview&&<div role="dialog" aria-modal="true" className={styles.previewBackdrop}><div className={styles.previewBar}><b>{preview.title} · {preview.audience}</b><button onClick={()=>downloadHtml(preview.title,preview.html)}>Télécharger HTML5</button><button onClick={()=>printHtml(preview.html)}>PDF / Imprimer</button><button onClick={()=>void wordHtml(preview.title,preview.html)}>Word</button><button onClick={()=>setPreview(null)}>Fermer</button></div><iframe title={preview.title} srcDoc={preview.html} className={styles.previewFrame} sandbox="allow-same-origin"/></div>}
  </section>;
}
