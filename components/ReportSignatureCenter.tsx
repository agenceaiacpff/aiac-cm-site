"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Profile={id:string;full_name:string|null;email:string|null};
type Report={id:string;report_number:string;reporter_id:string;status:string;title:string|null;summary:string;validation_authority_type:string;updated_at:string};
type Asset={asset_type:"signature"|"composite_signature"|"nominal_seal"|"round_seal";storage_path:string;status:string;is_default:boolean};

export default function ReportSignatureCenter({profile}:{profile:Profile}){
 const supabase=useMemo(()=>createClient(),[]);
 const [reports,setReports]=useState<Report[]>([]);
 const [assets,setAssets]=useState<Asset[]>([]);
 const [busy,setBusy]=useState("");
 const [notice,setNotice]=useState("");
 const signerName=profile.full_name||profile.email||"Compte AIAC";
 const active=assets.filter(a=>a.status==="active"&&a.is_default);
 const hasSignature=active.some(a=>a.asset_type==="signature"||a.asset_type==="composite_signature");
 const hasNominal=active.some(a=>a.asset_type==="nominal_seal");
 const hasRound=active.some(a=>a.asset_type==="round_seal");

 async function reload(){
  const [{data:r,error},{data:a}]=await Promise.all([
   supabase.from("task_reports").select("id,report_number,reporter_id,status,title,summary,validation_authority_type,updated_at").in("status",["draft","returned","submitted"]).order("updated_at",{ascending:false}).limit(80),
   supabase.from("institutional_signature_assets").select("asset_type,storage_path,status,is_default").eq("profile_id",profile.id).eq("status","active").eq("is_default",true)
  ]);
  if(error)setNotice(error.message);else setReports((r||[]) as Report[]);
  setAssets((a||[]) as Asset[]);
 }
 useEffect(()=>{void reload();},[]);

 function choices(data:FormData){return{
  include_nominal_seal:data.get("nominal_seal")==="on",
  include_round_seal:data.get("round_seal")==="on",
  signature_block_side:String(data.get("signature_block_side")||"right")
 };}
 async function submit(event:FormEvent<HTMLFormElement>,report:Report){
  event.preventDefault();setBusy(report.id);setNotice("");const data=new FormData(event.currentTarget);const c=choices(data);
  const {error}=await supabase.rpc("submit_task_report_with_signature_options",{target_report_id:report.id,signature_name:signerName,signature_asset_path:null,...c});
  if(error)setNotice(error.message);else{setNotice(`${report.report_number} a été signé et soumis avec les éléments sélectionnés.`);await reload();}
  setBusy("");
 }
 async function review(event:FormEvent<HTMLFormElement>,report:Report,decision:"approved"|"returned"){
  event.preventDefault();setBusy(report.id);setNotice("");const data=new FormData(event.currentTarget);const c=choices(data);const comment=String(data.get("comment")||"").trim();
  const {error}=await supabase.rpc("review_task_report_with_signature_options",{target_report_id:report.id,decision,review_comment:comment,signature_name:signerName,signature_asset_path:null,require_evidence:data.get("require_evidence")==="on",...c});
  if(error)setNotice(error.message);else{setNotice(decision==="approved"?`${report.report_number} a été validé avec les éléments de signature sélectionnés.`:`${report.report_number} a été retourné pour correction.`);await reload();}
  setBusy("");
 }
 const own=reports.filter(r=>r.reporter_id===profile.id&&["draft","returned"].includes(r.status));
 const reviewable=reports.filter(r=>r.reporter_id!==profile.id&&r.status==="submitted"&&r.validation_authority_type!=="collective_body");
 if(!own.length&&!reviewable.length)return null;
 const Picker=({prefix}:{prefix:string})=><fieldset className="securityBox"><legend><b>Éléments à apposer avec cette signature</b></legend><p>La signature officielle est toujours apposée. Les cachets ne sont ajoutés que si vous les laissez cochés pour cette signature.</p><label><input type="checkbox" checked readOnly/> Signature officielle</label>{hasNominal?<label><input name="nominal_seal" type="checkbox" defaultChecked/> Cachet nominatif</label>:<small>Cachet nominatif : aucun actif enregistré.</small>}{hasRound?<label><input name="round_seal" type="checkbox" defaultChecked/> Cachet rond</label>:<small>Cachet rond : aucun actif enregistré.</small>}<label>Position du bloc<select name="signature_block_side" defaultValue="right"><option value="right">À droite de la feuille</option><option value="left">À gauche de la feuille</option></select></label><small>Ordre automatique : signature en haut, cachet nominatif en bas. Si le bloc est à droite, le cachet rond se place à gauche entre les deux ; si le bloc est à gauche, le cachet rond se place à droite.</small><input type="hidden" value={prefix}/></fieldset>;
 return <section className="portalPanel"><div className="panelTitle"><div><p className="eyebrow">Signature institutionnelle</p><h2>Signer avec les éléments officiels</h2><p>Cette règle est commune à tous les signataires. Chaque décision conserve exactement les éléments cochés au moment de la signature.</p></div></div>{notice&&<div className="notice" role="status">{notice}</div>}{!hasSignature&&<div className="notice">Aucune signature officielle active n’est enregistrée pour votre compte.</div>}
 {own.map(r=><article className="reviewCard" key={r.id}><h3>{r.report_number} · {r.title||"Rapport"}</h3><p>{r.summary}</p><form className="reviewForm" onSubmit={e=>submit(e,r)}><Picker prefix={`submit-${r.id}`}/><button className="approveButton" disabled={!hasSignature||busy===r.id}>{busy===r.id?"Signature…":"Signer et soumettre"}</button></form></article>)}
 {reviewable.map(r=><article className="reviewCard" key={r.id}><h3>{r.report_number} · {r.title||"Rapport"}</h3><p>{r.summary}</p><form className="reviewForm" onSubmit={e=>review(e,r,"approved")}><Picker prefix={`approve-${r.id}`}/><textarea name="comment" placeholder="Observation — facultative en cas d’approbation"/><button className="approveButton" disabled={!hasSignature||busy===r.id}>{busy===r.id?"Validation…":"Valider et signer"}</button></form><details><summary>Retourner pour correction</summary><form className="reviewForm returnForm" onSubmit={e=>review(e,r,"returned")}><Picker prefix={`return-${r.id}`}/><textarea name="comment" minLength={5} required placeholder="Corrections demandées"/><label><input name="require_evidence" type="checkbox"/> Exiger une preuve à la prochaine soumission</label><button disabled={!hasSignature||busy===r.id}>Retourner et signer la décision</button></form></details></article>)}
 </section>;
}
