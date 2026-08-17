import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import MyPositionWorkspace from "@/components/MyPositionWorkspace";
import InstitutionalSidebar from "@/components/InstitutionalSidebar";

export const dynamic = "force-dynamic";

export default async function MyPositionPage(){
 const supabase=await createClient();
 const{data:claimsData}=await supabase.auth.getClaims();
 const userId=claimsData?.claims?.sub;
 if(!userId)redirect("/connexion");
 const{data:profile}=await supabase.from("profiles").select("id,full_name,email,status,registration_state,must_reset_password,role").eq("id",userId).single();
 if(!profile)redirect("/connexion");
 if(profile.registration_state==="rejected")redirect("/compte-refuse");
 if(profile.status==="pending"||profile.registration_state!=="approved")redirect("/compte-en-attente");
 if(profile.status==="suspended")redirect("/compte-suspendu");
 if(profile.must_reset_password)redirect("/mettre-a-jour-mot-de-passe");
 if(["admin","super_admin"].includes(profile.role)){
  const{data:assurance}=await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if(assurance?.currentLevel!=="aal2")redirect("/mfa");
 }
 return <div className="portalShell"><InstitutionalSidebar profile={profile} active="poste"/><main className="portalMain"><MyPositionWorkspace/></main></div>;
}