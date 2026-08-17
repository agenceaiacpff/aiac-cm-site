import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SecureDocumentReader from "@/components/SecureDocumentReader";

// Production entry point for the secure Office reader.
export const dynamic="force-dynamic";
export default async function Page({params}:{params:Promise<{id:string}>}){
  const{id}=await params;
  const supabase=await createClient();
  const{data:{user}}=await supabase.auth.getUser();
  if(!user)redirect('/connexion');
  return <>
    <style>{`.secureReader,.readerTop,.paper,.content,.docxHost,.xlsxViewport{color:#172033!important}.readerTop b,.readerTop small{color:#172033!important}.paper p,.paper h1,.paper h2,.paper h3,.paper h4,.paper h5,.paper h6,.paper li,.paper td,.paper th{color:inherit}.xlsxViewport td,.xlsxViewport th{color:#172033!important;background-color:#fff}`}</style>
    <SecureDocumentReader documentId={id}/>
  </>;
}
