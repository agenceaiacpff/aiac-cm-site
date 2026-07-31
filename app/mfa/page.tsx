import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import MfaForm from "@/components/MfaForm";

export const dynamic = "force-dynamic";

export default async function MfaPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/connexion");

  return (
    <main className="authPage">
      <section className="authCard">
        <img src="/aiac-logo.bmp" alt="AIAC" />
        <p className="eyebrow">Protection renforcée</p>
        <h1>Authentification à deux facteurs</h1>
        <p>Cette étape est obligatoire pour les administrateurs et les super-administrateurs de l’AIAC.</p>
        <MfaForm />
      </section>
    </main>
  );
}
