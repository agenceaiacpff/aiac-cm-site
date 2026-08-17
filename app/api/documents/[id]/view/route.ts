import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic="force-dynamic";

export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const supabase=await createClient();
  const {data:claims}=await supabase.auth.getClaims();
  const userId=claims?.claims?.sub;
  if(!userId)return NextResponse.json({error:"Authentification requise"},{status:401});

  const {data:cap,error:capError}=await supabase.rpc("document_access_capabilities",{target_document_id:id});
  if(capError||!cap?.can_view)return NextResponse.json({error:"Consultation non autorisée pour votre fonction"},{status:403});

  // A protected viewer must never receive the physical original merely to render it.
  // The secure reader uses institutional_document_secure_preview instead.
  if(cap?.secure_view_only&&!cap?.can_download){
    return NextResponse.json({error:"Original non exposé en consultation protégée"},{status:403,headers:{"Cache-Control":"private, no-store"}});
  }

  const {data:blob,error:blobError}=await supabase.rpc("institutional_document_payload",{target_document_id:id,target_purpose:"view"});
  if(!blobError&&blob?.content_base64){
    const bytes=Buffer.from(blob.content_base64,"base64");
    return new NextResponse(bytes,{headers:{
      "Content-Type":blob.mime_type||"application/octet-stream",
      "Content-Disposition":`inline; filename*=UTF-8''${encodeURIComponent(blob.file_name||"document")}`,
      "Content-Length":String(bytes.length),
      "Cache-Control":"private, no-store",
      "X-Content-Type-Options":"nosniff",
      "Content-Security-Policy":"default-src 'none'; sandbox"
    }});
  }

  const {data:document,error}=await supabase.from("documents").select("id,title,file_name,file_url,current_version,mime_type").eq("id",id).single();
  if(error||!document)return NextResponse.json({error:"Document introuvable ou accès refusé"},{status:404});
  if(!document.file_url||document.file_url.startsWith("institutional-db://"))return NextResponse.json({error:"Original physique en attente de synchronisation dans le coffre"},{status:409});

  const {data:version}=await supabase.from("document_versions").select("id,storage_path,file_name,version_number,mime_type,size_bytes,checksum_sha256").eq("document_id",id).order("version_number",{ascending:false}).limit(1).maybeSingle();
  const path=version?.storage_path||document.file_url;
  const filename=version?.file_name||document.file_name||document.title;
  const {data:file,error:downloadError}=await supabase.storage.from("aiac-documents").download(path);
  if(downloadError||!file)return NextResponse.json({error:"Impossible de lire l’original depuis le coffre"},{status:502});

  const bytes=Buffer.from(await file.arrayBuffer());
  if(version?.size_bytes&&bytes.length!==Number(version.size_bytes))return NextResponse.json({error:"Contrôle d’intégrité échoué : taille différente"},{status:502});
  if(version?.checksum_sha256){
    const digest=createHash("sha256").update(bytes).digest("hex");
    if(digest!==version.checksum_sha256)return NextResponse.json({error:"Contrôle d’intégrité échoué : empreinte SHA-256 différente"},{status:502});
  }

  const forwarded=request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||null;
  await supabase.from("document_access_logs").insert({document_id:id,version_id:version?.id||null,user_id:userId,action:"view_original",source_ip:forwarded,user_agent:request.headers.get("user-agent"),details:{version_number:version?.version_number||document.current_version,source:"secure_view_route",integrity_checked:true}});

  return new NextResponse(bytes,{headers:{
    "Content-Type":version?.mime_type||document.mime_type||file.type||"application/octet-stream",
    "Content-Disposition":`inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
    "Content-Length":String(bytes.length),
    "Cache-Control":"private, no-store",
    "X-Content-Type-Options":"nosniff"
  }});
}
