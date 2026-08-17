"use client";

import Link from "next/link";
import { useEffect,useMemo,useState } from "react";
import { createClient } from "@/lib/supabase/client";
import MultiDocumentUploader from "@/components/MultiDocumentUploader";

type Props={analysisId:string;profileId:string;bodyId:string;projectId:string|null;canManage?:boolean};
export default function GenderDocumentsPanel({analysisId,profileId,bodyId,projectId,canManage=true}:Props){const supabase=useMemo(()=>createClient(),[]);const[rows,setRows]=useState<any[]>([]);const[notice,setNotice]=useState('');async function load(){const{data,error}=await supabase.from('gender_analysis_documents').select('document_id,created_at,documents(id,title,file_name,classification)').eq('analysis_id',analysisId).order('created_at');if(error)setNotice(error.message);else setRows(data||[]);}useEffect(()=>{void load();},[analysisId]);return <div className="pwNested"><h4>Pièces jointes de l’analyse</h4>{canManage&&<MultiDocumentUploader profileId={profileId} analysisId={analysisId} bodyId={bodyId} projectId={projectId} onDone={()=>void load()} label="Ajouter plusieurs fichiers à cette analyse"/>}{notice&&<p className="pwWarning">{notice}</p>}{rows.map(r=><div className="pwAdminRow" key={r.document_id}><b>{r.documents?.title||r.documents?.file_name}</b><div className="pwButtons"><Link href={`/espace/documents/${r.document_id}/lecture`}>Consulter</Link><button onClick={()=>window.open(`/api/documents/${r.document_id}/download`,'_blank','noopener,noreferrer')}>Télécharger</button></div></div>)}</div>}
