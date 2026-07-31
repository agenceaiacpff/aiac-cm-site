import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PasswordUpdateForm from "@/components/PasswordUpdateForm";

export const dynamic="force-dynamic";

export default async function MettreAJourMotDePasse(){
  const supabase=await createClient();
  const {data}=await supabase.auth.getClaims();
  if(!data?.claims?.sub)redirect("/connexion");
  return <main className="authPage"><section className="authCard"><img src="/aiac-logo.bmp" alt="AIAC"/><p className="eyebrow">Sécurité du compte</p><h1>Définir un nouveau mot de passe</h1><p>Cette étape est obligatoire avant de poursuivre vers l’espace sécurisé.</p><PasswordUpdateForm/></section></main>;
}
