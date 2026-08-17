import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SecureDocumentReader from "@/components/SecureDocumentReader";

export const dynamic="force-dynamic";
export default async function Page({params}:{params:Promise<{id:string}>}){const{id}=await params;const supabase=await createClient();const{data:{user}}=await supabase.auth.getUser();if(!user)redirect('/connexion');return <SecureDocumentReader documentId={id}/>;}
