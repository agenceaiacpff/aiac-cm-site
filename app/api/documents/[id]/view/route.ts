import { NextRequest,NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic="force-dynamic";

export async function GET(_request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const{id}=await params;
  const supabase=await createClient();
  const{data:claims}=await supabase.auth.getClaims();
  if(!claims?.claims?.sub)return NextResponse.json({error:'Authentification requise'},{status:401});

  const{data:payload,error}=await supabase.rpc('institutional_document_payload',{target_document_id:id,target_purpose:'view'});
  if(error)return NextResponse.json({error:error.message},{status:403});
  if(payload?.content_base64){
    const bytes=Buffer.from(payload.content_base64,'base64');
    return new NextResponse(bytes,{headers:{
      'Content-Type':payload.mime_type||'application/octet-stream',
      'Content-Disposition':`inline; filename*=UTF-8''${encodeURIComponent(payload.file_name||'document')}`,
      'Content-Length':String(bytes.length),
      'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'
    }});
  }

  const{data:doc}=await supabase.from('documents').select('file_url,file_name,mime_type,title').eq('id',id).maybeSingle();
  if(!doc||!doc.file_url||doc.file_url.startsWith('institutional-db://'))return NextResponse.json({error:'Original physique en attente de synchronisation dans le coffre'},{status:409});

  const{data:file,error:downloadError}=await supabase.storage.from('aiac-documents').download(doc.file_url);
  if(downloadError||!file)return NextResponse.json({error:'Lecture impossible'},{status:403});
  const bytes=Buffer.from(await file.arrayBuffer());
  return new NextResponse(bytes,{headers:{
    'Content-Type':doc.mime_type||file.type||'application/octet-stream',
    'Content-Disposition':`inline; filename*=UTF-8''${encodeURIComponent(doc.file_name||doc.title||'document')}`,
    'Content-Length':String(bytes.length),
    'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'
  }});
}
