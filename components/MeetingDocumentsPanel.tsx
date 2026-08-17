"use client";

import Link from "next/link";
import { useEffect,useMemo,useState } from "react";
import { createClient } from "@/lib/supabase/client";
import MultiDocumentUploader from "@/components/MultiDocumentUploader";

type Props={meetingId:string;profileId:string;canManage:boolean};
type Row={document_id:string;shared_at:string;documents:any};
export default function MeetingDocumentsPanel({meetingId,profileId,canManage}:Props){const supabase=useMemo(()=>createClient(),[]);const[rows,setRows]=useState<Row[]>([]);const[notice,setNotice]=useState('');async function load(){const{data,error}=await supabase.from('meeting_documents').select('document_id,shared_at,documents(id,title,file_name,mime_type,classification)').eq('meeting_id',meetingId).order('shared_at');if(error)setNotice(error.message);else setRows((data||[]) as unknown as Row[]);}useEffect(()=>{void load();},[meetingId]);return <section className="pwInset"><h4>Documents partagés avec la réunion</h4><p>Les documents chargés ici deviennent accessibles aux participants internes de cette réunion selon leurs droits.</p>{canManage&&<MultiDocumentUploader profileId={profileId} meetingId={meetingId} onDone={()=>void load()} label="Ajouter plusieurs documents à la réunion"/>}{notice&&<p className="pwWarning">{notice}</p>}{rows.length?<div className="pwAdminRows">{rows.map(r=>{const d=r.documents||{};return <div className="pwAdminRow" key={r.document_id}><b>{d.title||d.file_name||'Document'}</b><small>{d.file_name||''} · {new Date(r.shared_at).toLocaleString('fr-FR')}</small><div className="pwButtons"><Link href={`/espace/documents/${r.document_id}/lecture`}>Consulter</Link><button onClick={()=>window.open(`/api/documents/${r.document_id}/download`,'_blank','noopener,noreferrer')}>Télécharger</button></div></div>})}</div>:<p>Aucun document partagé pour cette réunion.</p>}</section>}
