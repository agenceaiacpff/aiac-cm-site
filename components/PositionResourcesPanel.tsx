"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Doc={id:string;title:string;file_name:string|null;mime_type:string|null;classification:string;category:string|null;resource_code:string|null;required:boolean;can_download:boolean;secure_view_only:boolean;source_reference:string|null;physical_available:boolean;preview_available:boolean};

export default function PositionResourcesPanel(){
 const supabase=useMemo(()=>createClient(),[]);const[rows,setRows]=useState<Doc[]>([]);const[q,setQ]=useState("");const[category,setCategory]=useState("all");const[loading,setLoading]=useState(true);const[notice,setNotice]=useState("");
 useEffect(()=>{void(async()=>{const{data,error}=await supabase.rpc("my_institutional_documents");if(error)setNotice(error.message);else setRows((data||[]) as Doc[]);setLoading(false);})();},[supabase]);
 const cats=useMemo(()=>Array.from(new Set(rows.map(r=>r.category||"Documents"))).sort(),[rows]);
 const filtered=useMemo(()=>{const n=q.trim().toLowerCase();return rows.filter(r=>(category==="all"||(r.category||"Documents")===category)&&(!n||`${r.title} ${r.file_name||""} ${r.resource_code||""} ${r.category||""}`.toLowerCase().includes(n)));},[rows,q,category]);
 function download(id:string){window.open(`/api/documents/${id}/download`,"_blank","noopener,noreferrer");}
 if(loading)return <section className="portalPanel"><h2>Documents ressources</h2><p>Chargement des documents liés à vos fonctions…</p></section>;
 return <section className="portalPanel"><div className="pwToolbar"><div><h2>Documents ressources de mon poste</h2><p>Le coffre présente uniquement les ressources auxquelles vos fonctions actives donnent accès.</p></div><div className="pwFilters"><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Titre, catégorie, code…"/><select value={category} onChange={e=>setCategory(e.target.value)}><option value="all">Toutes les catégories</option>{cats.map(c=><option key={c}>{c}</option>)}</select></div></div>{notice&&<p className="pwWarning">{notice}</p>}<div className="pwAdminRows">{filtered.length?filtered.map(d=><article className="pwAdminRow" key={d.id}><div className="pwDetail"><p><b>{d.title}</b>{d.required?" · requis":""}</p><p><small>{d.category||"Document"} · {d.classification} · {d.file_name}</small></p><div className="pwButtons"><Link href={`/espace/documents/${d.id}/lecture`}>Consulter</Link>{d.can_download&&d.physical_available&&<button onClick={()=>download(d.id)}>Télécharger l’original</button>}{d.can_download&&!d.physical_available&&<span className="pwTag">Original à synchroniser</span>}{d.secure_view_only&&!d.can_download&&<span className="pwTag">Consultation protégée · téléchargement interdit</span>}</div></div></article>):<p>Aucun document ne correspond à la recherche.</p>}</div><p className="pwWarning"><b>Manuel de procédures :</b> lecture sécurisée pour les collaborateurs habilités ; téléchargement réservé aux membres actifs du Conseil d’administration.</p></section>;
}
