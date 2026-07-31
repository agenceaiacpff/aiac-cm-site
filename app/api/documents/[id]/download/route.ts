import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic="force-dynamic";

export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const supabase=await createClient();
  const {data:claims}=await supabase.auth.getClaims();
  const userId=claims?.claims?.sub;
  if(!userId)return NextResponse.json({error:"Authentification requise"},{status:401});

  const {data:document,error}=await supabase.from("documents")
    .select("id,title,file_name,file_url,current_version")
    .eq("id",id).single();
  if(error||!document)return NextResponse.json({error:"Document introuvable ou accès refusé"},{status:404});

  const {data:version}=await supabase.from("document_versions")
    .select("id,storage_path,file_name,version_number")
    .eq("document_id",id).order("version_number",{ascending:false}).limit(1).maybeSingle();
  const path=version?.storage_path||document.file_url;
  const filename=version?.file_name||document.file_name||document.title;
  const {data:signed,error:signedError}=await supabase.storage.from("aiac-documents")
    .createSignedUrl(path,60,{download:filename});
  if(signedError||!signed)return NextResponse.json({error:"Impossible de préparer le téléchargement"},{status:403});

  const forwarded=request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||null;
  await supabase.from("document_access_logs").insert({
    document_id:id,version_id:version?.id||null,user_id:userId,action:"download",
    source_ip:forwarded,user_agent:request.headers.get("user-agent"),
    details:{version_number:version?.version_number||document.current_version}
  });
  return NextResponse.json({url:signed.signedUrl,expires_in:60},{headers:{"Cache-Control":"private, no-store"}});
}
