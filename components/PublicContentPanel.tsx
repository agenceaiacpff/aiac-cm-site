"use client";

import { FormEvent, useCallback, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { PartnershipRow, ProgramRow } from "@/components/InstitutionalPanel";
import type { ProjectRow } from "@/components/OperationsPanel";
import { categoryEntries, categoryFromType, contentCategories, GuestbookEntry, makeSlug, PublicBody, PublicContentItem, PublicContentMedia, PublicContentStatus } from "@/lib/public-content";
import RichHtmlEditor, { ImportedMetadata } from "@/components/RichHtmlEditor";

const statusLabels:Record<PublicContentStatus,string>={draft:"Brouillon",review:"À valider",published:"Publié",archived:"Archivé"};
const accept="image/*,video/mp4,video/webm,video/quicktime,audio/*,.pdf,.doc,.docx,.xls,.xlsx";

function mediaType(file:File):PublicContentMedia["media_type"]{
  if(file.type.startsWith("image/"))return "image";
  if(file.type.startsWith("video/"))return "video";
  if(file.type.startsWith("audio/"))return "audio";
  return "document";
}
function cleanFileName(name:string){return name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9._-]+/g,"-").replace(/^-+|-+$/g,"").slice(-140)||"fichier";}

export default function PublicContentPanel({
  profileId,bodies,initialItems,initialMedia,initialGuestbook,projects,programs,partnerships
}:{
  profileId:string;bodies:PublicBody[];initialItems:PublicContentItem[];initialMedia:PublicContentMedia[];initialGuestbook:GuestbookEntry[];
  projects:ProjectRow[];programs:ProgramRow[];partnerships:PartnershipRow[];
}){
  const supabase=useMemo(()=>createClient(),[]);
  const [view,setView]=useState("project");
  const [items,setItems]=useState(initialItems);
  const [media,setMedia]=useState(initialMedia);
  const [guestbook,setGuestbook]=useState(initialGuestbook);
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const [filterBody,setFilterBody]=useState("all");
  const [richHtml,setRichHtml]=useState("");
  const [contentFormat,setContentFormat]=useState<"html"|"html_document">("html");
  const [source,setSource]=useState<Pick<ImportedMetadata,"fileName"|"mimeType">|null>(null);
  const [editorReset,setEditorReset]=useState(0);
  const formRef=useRef<HTMLFormElement>(null);
  const bodyNames=useMemo(()=>Object.fromEntries(bodies.map(item=>[item.id,`${item.code} · ${item.name}`])),[bodies]);
  const visibleItems=items.filter(item=>(view==="all"||item.content_type===view)&&(filterBody==="all"||item.body_id===filterBody));
  const updateEditor=useCallback((html:string)=>setRichHtml(html),[]);
  const imported=useCallback((metadata:ImportedMetadata)=>{
    setSource({fileName:metadata.fileName,mimeType:metadata.mimeType});
    setContentFormat(metadata.contentFormat);
    const form=formRef.current;if(!form)return;
    const title=form.elements.namedItem("title") as HTMLInputElement|null;const summary=form.elements.namedItem("summary") as HTMLTextAreaElement|null;
    if(title&&!title.value)title.value=metadata.title.slice(0,240);
    if(summary&&!summary.value)summary.value=metadata.summary.slice(0,1200);
  },[]);

  async function upload(bodyId:string,contentId:string,file:File){
    const path=`${bodyId}/${contentId}/${crypto.randomUUID()}-${cleanFileName(file.name)}`;
    const {error}=await supabase.storage.from("aiac-public-media").upload(path,file,{cacheControl:"3600",upsert:false,contentType:file.type||undefined});
    if(error)throw error;
    return path;
  }

  async function createPublication(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setNotice("");
    const form=event.currentTarget;const d=new FormData(form);
    const bodyId=String(d.get("body_id")||"");const title=String(d.get("title")||"").trim();
    const type=String(d.get("content_type")) as PublicContentItem["content_type"];
    const richText=new DOMParser().parseFromString(richHtml,"text/html").body.textContent?.replace(/\s+/g," ").trim()||"";
    if(richText.length<10){setNotice("Ajoutez au moins dix caractères dans le contenu complet ou importez un fichier.");setBusy(false);return;}
    const payload={
      body_id:bodyId,content_type:type,subtype:String(d.get("subtype")||"").trim()||null,title,slug:makeSlug(title),
      summary:String(d.get("summary")||"").trim(),content:richHtml,content_format:contentFormat,location:String(d.get("location")||"").trim()||null,
      activity_date:d.get("activity_date")||null,starts_at:d.get("starts_at")?new Date(String(d.get("starts_at"))).toISOString():null,
      ends_at:d.get("ends_at")?new Date(String(d.get("ends_at"))).toISOString():null,status:String(d.get("status")) as PublicContentStatus,
      project_id:String(d.get("project_id")||"")||null,program_id:String(d.get("program_id")||"")||null,
      partnership_id:String(d.get("partnership_id")||"")||null,external_url:String(d.get("external_url")||"").trim()||null,
      source_file_name:source?.fileName||null,source_mime_type:source?.mimeType||null,source_imported_at:source?new Date().toISOString():null,
      is_featured:d.get("is_featured")==="on",created_by:profileId
    };
    const {data:item,error}=await supabase.from("public_content_items").insert(payload).select().single();
    if(error||!item){setNotice(error?.message||"La publication n’a pas pu être créée.");setBusy(false);return;}
    const created=item as PublicContentItem;
    try{
      const cover=(d.get("cover") as File);let coverPath:string|null=null;let documentPath:string|null=null;
      if(cover?.size)coverPath=await upload(bodyId,created.id,cover);
      const files=(d.getAll("media") as File[]).filter(file=>file.size>0);
      const rows:Omit<PublicContentMedia,"id"|"created_at">[]=[];
      for(let index=0;index<files.length;index++){
        const file=files[index];const path=await upload(bodyId,created.id,file);const kind=mediaType(file);
        if(kind==="document"&&!documentPath)documentPath=path;
        rows.push({content_id:created.id,media_type:kind,storage_path:path,external_url:null,title:file.name.replace(/\.[^.]+$/,"")||title,caption:payload.summary,alt_text:kind==="image"?`${title} — ${file.name}`:null,occurred_on:payload.activity_date?String(payload.activity_date):null,sort_order:index,created_by:profileId});
      }
      if(rows.length){const {data:newMedia,error:mediaError}=await supabase.from("public_content_media").insert(rows).select();if(mediaError)throw mediaError;setMedia([...((newMedia||[]) as PublicContentMedia[]),...media]);}
      if(coverPath||documentPath){const {data:updated,error:updateError}=await supabase.from("public_content_items").update({cover_image_path:coverPath,document_path:documentPath}).eq("id",created.id).select().single();if(updateError)throw updateError;setItems([updated as PublicContentItem,...items]);}else setItems([created,...items]);
      form.reset();setSource(null);setContentFormat("html");setEditorReset(value=>value+1);setView(type);setNotice("Contenu riche enregistré. Les éléments publiés sont immédiatement visibles sur le site officiel et la page de l’organe.");
    }catch(error){setItems([created,...items]);setNotice(`Le contenu est enregistré, mais un média a échoué : ${error instanceof Error?error.message:"erreur inconnue"}`);}
    setBusy(false);
  }

  async function changeStatus(item:PublicContentItem,status:PublicContentStatus){
    setBusy(true);const {data,error}=await supabase.from("public_content_items").update({status}).eq("id",item.id).select().single();
    if(error||!data)setNotice(error?.message||"Mise à jour impossible.");else{setItems(items.map(row=>row.id===item.id?data as PublicContentItem:row));setNotice(status==="published"?"Publication mise en ligne.":"Statut mis à jour.");}
    setBusy(false);
  }

  async function moderate(entry:GuestbookEntry,status:"published"|"rejected"){
    setBusy(true);const {data,error}=await supabase.from("guestbook_entries").update({status}).eq("id",entry.id).select().single();
    if(error||!data)setNotice(error?.message||"Modération impossible.");else{setGuestbook(guestbook.map(row=>row.id===entry.id?data as GuestbookEntry:row));setNotice(status==="published"?"Témoignage publié.":"Témoignage refusé.");}
    setBusy(false);
  }

  if(!bodies.length)return <section className="portalPanel"><h2>Publications du site</h2><p>Aucun organe subsidiaire ne vous est actuellement attribué. Un super-administrateur doit vous rattacher à un poste, un mandat ou une affectation dans l’organe concerné.</p></section>;

  return <section className="operationsWorkspace">
    <div className="panelHeading"><div><p className="eyebrow">Site officiel et organes subsidiaires</p><h2>Centre de publications</h2><p>Chaque contenu publié alimente automatiquement la rubrique de l’organe et le flux général AIAC, classé du plus récent au plus ancien.</p></div><a className="secondaryButton" href="/publications/projets" target="_blank">Voir le site public</a></div>
    {notice&&<div className="notice" role="status">{notice}<button onClick={()=>setNotice("")}>×</button></div>}
    <nav className="operationNav" aria-label="Types de contenu">
      <button className={view==="all"?"active":""} onClick={()=>setView("all")}>Tous</button>
      {categoryEntries.map(([,category])=><button key={category.type} className={view===category.type?"active":""} onClick={()=>setView(category.type)}>{category.label}</button>)}
      <button className={view==="guestbook"?"active":""} onClick={()=>setView("guestbook")}>Livre d’or</button>
    </nav>

    {view!=="guestbook"&&<>
      <form ref={formRef} className="portalPanel publicContentForm" onSubmit={createPublication}>
        <h3>Créer un contenu</h3>
        <label>Organe subsidiaire<select name="body_id" required>{bodies.map(body=><option key={body.id} value={body.id}>{body.code} · {body.name}</option>)}</select></label>
        <label>Rubrique<select name="content_type" defaultValue={view==="all"?"project":view} required>{categoryEntries.map(([,category])=><option key={category.type} value={category.type}>{category.label}</option>)}</select></label>
        <label>Sous-type<input name="subtype" placeholder="Programme, rapport narratif, formation, recrutement…"/></label>
        <label className="wideField">Titre<input name="title" minLength={3} maxLength={240} required/></label>
        <label className="wideField">Présentation courte<textarea name="summary" minLength={10} maxLength={1200} placeholder="Texte affiché sur la carte avant l’ouverture" required/></label>
        <div className="richEditorWide"><span className="richEditorLabel">Contenu complet avec mise en forme</span><RichHtmlEditor onChange={updateEditor} onImported={imported} resetToken={editorReset}/></div>
        <label>Lieu<input name="location" placeholder="Yaoundé, Maroua…"/></label>
        <label>Date de l’activité<input name="activity_date" type="date"/></label>
        <label>Début / rendez-vous<input name="starts_at" type="datetime-local"/></label>
        <label>Fin<input name="ends_at" type="datetime-local"/></label>
        <label>Projet lié<select name="project_id"><option value="">Aucun</option>{projects.map(item=><option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
        <label>Programme lié<select name="program_id"><option value="">Aucun</option>{programs.map(item=><option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
        <label>Partenariat lié<select name="partnership_id"><option value="">Aucun</option>{partnerships.map(item=><option key={item.id} value={item.id}>{item.agreement_reference||item.relationship_type}</option>)}</select></label>
        <label>Lien vidéo / externe<input name="external_url" type="url" placeholder="https://…"/></label>
        <label>Image de couverture<input name="cover" type="file" accept="image/*"/></label>
        <label>Photos, vidéos, sons ou documents<input name="media" type="file" accept={accept} multiple/><small>50 Mo maximum par fichier. Pour une vidéo plus lourde, utilisez le lien externe.</small></label>
        <label>État<select name="status" defaultValue="draft"><option value="draft">Brouillon</option><option value="review">Soumettre à validation</option><option value="published">Publier maintenant</option></select></label>
        <label className="consentCheck"><input name="is_featured" type="checkbox"/> Mettre en avant</label>
        <button disabled={busy}>{busy?"Enregistrement…":"Enregistrer le contenu"}</button>
      </form>

      <div className="portalPanel">
        <div className="panelHeading"><h3>Contenus ({visibleItems.length})</h3><select value={filterBody} onChange={event=>setFilterBody(event.target.value)}><option value="all">Tous mes organes</option>{bodies.map(body=><option key={body.id} value={body.id}>{body.code} · {body.name}</option>)}</select></div>
        {visibleItems.length===0&&<p>Aucun contenu dans cette rubrique.</p>}
        {visibleItems.map(item=><article className="publicAdminCard" key={item.id}>
          <div><span className={`operationBadge ${item.status}`}>{statusLabels[item.status]}</span><small>{bodyNames[item.body_id]||"Organe"} · {contentCategories[categoryFromType(item.content_type)].label}</small><h3>{item.title}</h3><p>{item.summary}</p><small>{media.filter(row=>row.content_id===item.id).length} média(s){item.location?` · ${item.location}`:""}{item.source_file_name?` · Importé depuis ${item.source_file_name}`:""}</small></div>
          <div className="announcementActions">{item.status!=="published"&&<button disabled={busy} onClick={()=>changeStatus(item,"published")}>Publier</button>}{item.status==="published"&&<a className="secondaryButton" target="_blank" href={`/publications/${categoryFromType(item.content_type)}/${item.slug}`}>Ouvrir</a>}{item.status!=="archived"&&<button className="secondaryButton" disabled={busy} onClick={()=>changeStatus(item,"archived")}>Archiver</button>}</div>
        </article>)}
      </div>
    </>}

    {view==="guestbook"&&<div className="portalPanel"><h3>Modération du livre d’or</h3><p>Les nouveaux témoignages restent invisibles jusqu’à leur approbation.</p>{guestbook.length===0&&<p>Aucun témoignage à modérer.</p>}{guestbook.map(entry=><article className="publicAdminCard" key={entry.id}><div><span className={`operationBadge ${entry.status}`}>{entry.status}</span><small>{entry.body_id?bodyNames[entry.body_id]:"AIAC — site général"}</small><h3>{entry.author_name}{entry.organization?` · ${entry.organization}`:""}</h3><p>{entry.message}</p></div><div className="announcementActions">{entry.status!=="published"&&<button disabled={busy} onClick={()=>moderate(entry,"published")}>Publier</button>}{entry.status!=="rejected"&&<button className="secondaryButton" disabled={busy} onClick={()=>moderate(entry,"rejected")}>Refuser</button>}</div></article>)}</div>}
  </section>;
}
