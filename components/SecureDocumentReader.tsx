"use client";

import DOMPurify from "dompurify";
import Link from "next/link";
import { useEffect,useMemo,useRef,useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Payload={id:string;title:string;file_name:string;classification:string;html_content:string;can_download:boolean;viewer_name:string;secure_view_only:boolean};
type SheetPreview={name:string;html:string};

function extension(name:string){return name.toLowerCase().split('.').pop()||'';}

export default function SecureDocumentReader({documentId}:{documentId:string}){
 const supabase=useMemo(()=>createClient(),[]);
 const[data,setData]=useState<Payload|null>(null);
 const[notice,setNotice]=useState('');
 const[officeLoading,setOfficeLoading]=useState(false);
 const[officeError,setOfficeError]=useState('');
 const[sheets,setSheets]=useState<SheetPreview[]>([]);
 const[activeSheet,setActiveSheet]=useState(0);
 const docxHost=useRef<HTMLDivElement|null>(null);

 useEffect(()=>{void(async()=>{const{data:d,error}=await supabase.rpc('institutional_document_secure_preview',{target_document_id:documentId});if(error)setNotice(error.message);else setData(d as Payload);})();},[documentId,supabase]);

 // Never fetch the physical Office original for a protected document merely to display it.
 // Protected documents are rendered from the server-generated HTML preview only.
 useEffect(()=>{
  if(!data||data.secure_view_only)return;
  const ext=extension(data.file_name||'');
  if(ext!=='docx'&&ext!=='xlsx'&&ext!=='xls')return;
  let cancelled=false;
  setOfficeLoading(true);setOfficeError('');setSheets([]);setActiveSheet(0);
  void(async()=>{
   try{
    const response=await fetch(`/api/documents/${documentId}/view`,{cache:'no-store'});
    if(!response.ok){let msg=`Lecture impossible (${response.status})`;try{const j=await response.json();if(j?.error)msg=j.error;}catch{}throw new Error(msg);}
    const buffer=await response.arrayBuffer();
    if(cancelled)return;
    if(ext==='docx'){
      const host=docxHost.current;
      if(!host)throw new Error('Zone de rendu Word indisponible');
      host.innerHTML='';
      const docx=await import('docx-preview');
      await docx.renderAsync(buffer,host,host,{
        className:'aiacDocx',inWrapper:true,hideWrapperOnPrint:false,
        ignoreWidth:false,ignoreHeight:false,ignoreFonts:false,
        breakPages:true,ignoreLastRenderedPageBreak:false,
        renderHeaders:true,renderFooters:true,renderFootnotes:true,renderEndnotes:true,
        useBase64URL:true
      });
    }else{
      const XLSX=await import('xlsx');
      const wb=XLSX.read(buffer,{type:'array',cellStyles:true,cellDates:true,cellFormula:true});
      const rendered=wb.SheetNames.map(name=>({name,html:XLSX.utils.sheet_to_html(wb.Sheets[name],{id:`aiac-sheet-${name.replace(/[^a-zA-Z0-9_-]/g,'-')}`} )}));
      if(!cancelled)setSheets(rendered);
    }
   }catch(err){if(!cancelled)setOfficeError(err instanceof Error?err.message:String(err));}
   finally{if(!cancelled)setOfficeLoading(false);}
  })();
  return()=>{cancelled=true;};
 },[data,documentId]);

 useEffect(()=>{
  if(!data?.secure_view_only)return;
  const block=(e:Event)=>{e.preventDefault();e.stopPropagation();};
  const key=(e:KeyboardEvent)=>{
    const k=e.key.toLowerCase();
    if((e.ctrlKey||e.metaKey)&&['p','s','c','x','v','a','u'].includes(k)){e.preventDefault();e.stopPropagation();}
  };
  const events:Array<keyof DocumentEventMap>=['contextmenu','copy','cut','paste','dragstart','selectstart'];
  events.forEach(name=>document.addEventListener(name,block,true));
  window.addEventListener('keydown',key,true);
  return()=>{
    events.forEach(name=>document.removeEventListener(name,block,true));
    window.removeEventListener('keydown',key,true);
  };
 },[data?.secure_view_only]);

 if(notice)return <main className="secureReader"><p>{notice}</p><Link href="/espace/poste?section=resources">Retour aux ressources</Link></main>;
 if(!data)return <main className="secureReader"><p>Chargement sécurisé…</p></main>;

 const ext=extension(data.file_name||'');
 const isDocx=ext==='docx';
 const isExcel=ext==='xlsx'||ext==='xls';
 const safe=DOMPurify.sanitize(data.html_content||'');
 const active=sheets[activeSheet];
 const protectedOffice=data.secure_view_only&&(isDocx||isExcel);

 return <main className={`secureReader ${data.secure_view_only?'protected':''}`}>
  <style>{`html,body{margin:0;background:#eef2f7;color:#172033}.secureReader{max-width:1280px;margin:0 auto;padding:24px;font-family:Arial,sans-serif;color:#172033}.secureReader *{box-sizing:border-box}.readerTop{position:sticky;top:0;z-index:20;background:#fff;color:#172033;border:1px solid #dbe2ea;border-radius:14px;padding:14px 18px;display:flex;gap:12px;justify-content:space-between;align-items:center;box-shadow:0 8px 25px #0001}.readerTop small{color:#526274}.readerActions{display:flex;gap:8px;flex-wrap:wrap}.readerActions a,.readerActions button{padding:9px 12px;border-radius:9px;border:0;background:#123b6d;color:white;text-decoration:none;cursor:pointer}.paper{position:relative;margin-top:18px;background:#fff;color:#172033;border:1px solid #dce3ea;padding:28px;min-height:70vh;box-shadow:0 8px 30px #0001;overflow:auto}.paper table{border-collapse:collapse;width:100%;margin:12px 0;color:#172033}.paper td,.paper th{border:1px solid #bbb;padding:6px;vertical-align:top;color:#172033}.paper pre{white-space:pre-wrap;font-family:inherit}.protected .paper,.protected .content{user-select:none!important;-webkit-user-select:none!important;-webkit-touch-callout:none!important}.watermarks{pointer-events:none;position:absolute;inset:0;overflow:hidden;z-index:10}.watermarks span{position:absolute;transform:rotate(-28deg);font-size:24px;font-weight:700;color:rgba(120,0,0,.08);white-space:nowrap}.content{position:relative;z-index:5}.protectedPreview{position:relative;color:#172033}.protectedPreview img{max-width:100%;height:auto}.protectedPreview table{display:table;max-width:100%}.docxHost{overflow:auto;background:#e9edf2;padding:18px;min-height:65vh}.docxHost .docx-wrapper{background:transparent!important;padding:0!important}.docxHost section.aiacDocx{margin:0 auto 22px!important;box-shadow:0 2px 12px #0002!important}.sheetTabs{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 12px}.sheetTabs button{border:1px solid #c9d3df;background:#f6f8fb;color:#173b63;padding:8px 10px;border-radius:8px;cursor:pointer}.sheetTabs button.active{background:#173b63;color:#fff}.xlsxViewport{overflow:auto;max-height:72vh;border:1px solid #dbe2ea;background:#fff;color:#172033}.xlsxViewport table{width:auto;min-width:100%;border-collapse:collapse;font-size:13px}.xlsxViewport td,.xlsxViewport th{white-space:nowrap;border:1px solid #cfd6df;padding:5px 8px;min-width:80px;color:#172033}.officeStatus{padding:18px;text-align:center;color:#42566e}.officeError{padding:12px;border:1px solid #e0aaaa;background:#fff5f5;color:#8f1f1f;border-radius:10px}@media print{html,body,.secureReader{display:none!important;visibility:hidden!important}.protected *{display:none!important}}`}</style>
  <header className="readerTop"><div><b>{data.title}</b><div><small>{data.file_name} · {data.classification}{data.secure_view_only?' · consultation protégée':''}</small></div></div><div className="readerActions"><Link href="/espace/poste?section=resources">Retour</Link>{data.can_download&&<button onClick={()=>window.open(`/api/documents/${documentId}/download`,'_blank','noopener,noreferrer')}>Télécharger l’original</button>}</div></header>
  <section className="paper">
   {data.secure_view_only&&<div className="watermarks" aria-hidden="true">{Array.from({length:24},(_,i)=><span key={i} style={{left:`${(i%4)*27-10}%`,top:`${Math.floor(i/4)*18+4}%`}}>AIAC · {data.viewer_name} · consultation tracée</span>)}</div>}
   <div className="content">
    {protectedOffice&&(safe?<div className="protectedPreview" dangerouslySetInnerHTML={{__html:safe}}/>:<p className="officeError">Aucun aperçu sécurisé n’est disponible pour ce document. L’original n’est pas exposé en consultation protégée.</p>)}
    {!data.secure_view_only&&isDocx&&<><div ref={docxHost} className="docxHost"/>{officeLoading&&<p className="officeStatus">Rendu fidèle du document Word…</p>}{officeError&&<p className="officeError">{officeError}</p>}</>}
    {!data.secure_view_only&&isExcel&&<>{officeLoading&&<p className="officeStatus">Ouverture du classeur Excel…</p>}{officeError&&<p className="officeError">{officeError}</p>}{sheets.length>0&&<><div className="sheetTabs">{sheets.map((s,i)=><button key={s.name} className={i===activeSheet?'active':''} onClick={()=>setActiveSheet(i)}>{s.name}</button>)}</div><div className="xlsxViewport" dangerouslySetInnerHTML={{__html:DOMPurify.sanitize(active?.html||'')}}/></>}</>}
    {!isDocx&&!isExcel&&(safe?<div className={data.secure_view_only?'protectedPreview':''} dangerouslySetInnerHTML={{__html:safe}}/>:(data.secure_view_only?<p className="officeError">Aucun aperçu sécurisé n’est disponible pour ce document.</p>:<iframe title={data.title} src={`/api/documents/${documentId}/view`} style={{width:'100%',height:'75vh',border:0}}/>))}
   </div>
  </section>
  {data.secure_view_only&&<p><small>Consultation protégée et journalisée : filigrane nominatif, sélection, copie, couper/coller, clic droit, glisser-déposer, raccourcis d’impression et d’enregistrement neutralisés. Une application web ne peut pas empêcher de façon absolue une photographie externe ou une capture effectuée au niveau du système d’exploitation.</small></p>}
 </main>;
}
