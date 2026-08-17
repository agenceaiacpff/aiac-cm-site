"use client";

import { ChangeEvent,useEffect,useMemo,useState } from "react";
import JSZip from "jszip";
import { createClient } from "@/lib/supabase/client";

type Pending={name:string;blob:Blob;type:string;size:number};
const mime:Record<string,string>={pdf:"application/pdf",docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",doc:"application/msword",xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",xls:"application/vnd.ms-excel",pptx:"application/vnd.openxmlformats-officedocument.presentationml.presentation",ppt:"application/vnd.ms-powerpoint",txt:"text/plain",csv:"text/csv",json:"application/json",zip:"application/zip",png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",webp:"image/webp",bmp:"image/bmp"};
const technicalPackageFiles=new Set(["MANIFEST_COFFRE_24.json","LISEZ_MOI_IMPORT_COFFRE_24.txt"]);
function baseName(path:string){return path.split('/').filter(Boolean).pop()||path;}
function safeName(name:string){return name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]/g,'-');}
function typeFor(name:string,provided=''){return provided||mime[name.split('.').pop()?.toLowerCase()||'']||'application/octet-stream';}
function errText(err:unknown){if(err&&typeof err==='object'&&'message' in err)return String((err as {message?:unknown}).message||'Erreur inconnue');return String(err||'Erreur inconnue');}
async function sha(blob:Blob){const b=await blob.arrayBuffer();return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b))).map(x=>x.toString(16).padStart(2,'0')).join('');}

export default function InstitutionalLibraryImporter({onDone}:{onDone?:()=>void}){
 const supabase=useMemo(()=>createClient(),[]);
 const[allowed,setAllowed]=useState(false);
 const[items,setItems]=useState<Pending[]>([]);
 const[busy,setBusy]=useState(false);
 const[progress,setProgress]=useState('');
 const[notice,setNotice]=useState('');
 useEffect(()=>{void(async()=>{const{data:{user}}=await supabase.auth.getUser();if(!user)return;const{data}=await supabase.from('profiles').select('role').eq('id',user.id).single();setAllowed(data?.role==='super_admin');})();},[supabase]);
 if(!allowed)return null;

 async function choose(e:ChangeEvent<HTMLInputElement>){
  setNotice('');
  const selected=Array.from(e.target.files||[]);
  const out:Pending[]=[];
  for(const f of selected){
   if(f.name.toLowerCase().endsWith('.zip')){
    try{
     const zip=await JSZip.loadAsync(f);
     for(const entry of Object.values(zip.files)){
      if(entry.dir||entry.name.includes('__MACOSX/')||baseName(entry.name).startsWith('.'))continue;
      const name=baseName(entry.name);
      if(technicalPackageFiles.has(name))continue;
      const blob=await entry.async('blob');
      if(!blob.size)continue;
      out.push({name,blob,type:typeFor(name),size:blob.size});
     }
    }catch{setNotice(`ZIP illisible : ${f.name}`);}
   }else if(!technicalPackageFiles.has(f.name)){
    out.push({name:f.name,blob:f,type:typeFor(f.name,f.type),size:f.size});
   }
  }
  const seen=new Set<string>();
  setItems(out.filter(x=>{const k=`${x.name}:${x.size}`;if(seen.has(k))return false;seen.add(k);return true;}));
 }

 async function previewDocx(documentId:string,blob:Blob){
  try{
   const mammoth=await import('mammoth');
   const result=await mammoth.convertToHtml({arrayBuffer:await blob.arrayBuffer()});
   if(result.value)await supabase.rpc('set_institutional_document_preview',{target_document_id:documentId,target_html:`<article class="aiac-doc">${result.value}</article>`});
  }catch{/* L'original reste consultable/téléchargeable selon les droits. */}
 }

 async function sync(){
  if(!items.length)return;
  setBusy(true);setNotice('');
  let ok=0,created=0,failed=0;
  const errors:string[]=[];
  const{data:{user}}=await supabase.auth.getUser();
  if(!user){setBusy(false);setNotice('Session expirée : reconnectez-vous avant l’import.');return;}

  for(let i=0;i<items.length;i++){
   const item=items[i];
   setProgress(`${i+1}/${items.length} · ${item.name}`);
   const path=`${user.id}/institutional-library/${crypto.randomUUID()}-${safeName(item.name)}`;
   let uploaded=false;
   try{
    if(item.type==='application/octet-stream')throw new Error(`Type de fichier non reconnu : ${item.name}`);
    const digest=await sha(item.blob);
    const up=await supabase.storage.from('aiac-documents').upload(path,item.blob,{contentType:item.type,upsert:false});
    if(up.error)throw up.error;
    uploaded=true;

    const{data:meta,error:finalizeError}=await supabase.rpc('finalize_institutional_storage_import',{
     target_file_name:item.name,
     target_storage_path:path,
     target_mime_type:item.type,
     target_size_bytes:item.size,
     target_checksum_sha256:digest
    });
    if(finalizeError)throw finalizeError;
    const info=(meta||{}) as {document_id?:string;created?:boolean};
    if(!info.document_id)throw new Error('Finalisation documentaire incomplète');
    if(info.created)created++;
    if(item.name.toLowerCase().endsWith('.docx'))await previewDocx(info.document_id,item.blob);
    ok++;
   }catch(err){
    failed++;
    const message=errText(err);
    if(errors.length<8)errors.push(`${item.name} : ${message}`);
    console.error(err);
    if(uploaded){try{await supabase.storage.from('aiac-documents').remove([path]);}catch{/* nettoyage best effort */}}
   }
  }
  setBusy(false);setProgress('');
  const detail=errors.length?`\n${errors.join('\n')}`:'';
  setNotice(`${ok} fichier(s) synchronisé(s)${created?` · ${created} nouveau(x) document(s) relié(s) au catalogue`:''}${failed?` · ${failed} échec(s)`:''}.${detail}`);
  if(ok>0)setItems([]);
  onDone?.();
 }

 return <details className="pwNested"><summary>Super-administration · Importer / synchroniser la bibliothèque AIAC</summary><div className="pwInset"><p>Sélectionnez plusieurs fichiers ou un/plusieurs ZIP. Les noms déjà catalogués sont reliés automatiquement à leur fiche et conservent leurs droits par poste.</p><input type="file" multiple accept=".zip,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.json,.png,.jpg,.jpeg,.webp,.bmp" onChange={e=>void choose(e)} disabled={busy}/>{items.length>0&&<><p><b>{items.length}</b> fichier(s) prêt(s) à synchroniser.</p><div className="pwScroll" style={{maxHeight:220}}><ul>{items.slice(0,250).map((x,i)=><li key={`${x.name}-${i}`}>{x.name} · {(x.size/1024).toFixed(0)} Ko</li>)}</ul></div><button onClick={()=>void sync()} disabled={busy}>{busy?'Synchronisation…':'Importer dans le coffre'}</button></>}{progress&&<p>{progress}</p>}{notice&&<p className="pwWarning" style={{whiteSpace:'pre-wrap'}}>{notice}</p>}</div></details>;
}
