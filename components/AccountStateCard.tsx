"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AccountStateCard({ suspended = false }: { suspended?: boolean }) {
  const router = useRouter();

  async function logout() {
    await createClient().auth.signOut();
    router.push("/connexion");
    router.refresh();
  }

  return (
    <main className="authPage">
      <section className="authCard accountStateCard">
        <img src="/aiac-logo.bmp" alt="AIAC" />
        <p className="eyebrow">Sécurité du portail AIAC</p>
        <h1>{suspended ? "Compte suspendu" : "Compte en attente"}</h1>
        <p>
          {suspended
            ? "Votre accès a été suspendu par l’administration. Contactez l’AIAC si vous pensez qu’il s’agit d’une erreur."
            : "Votre adresse a été confirmée. Un administrateur doit maintenant valider votre compte avant l’accès à l’espace de travail."}
        </p>
        <button className="stateButton" onClick={logout}>Se déconnecter</button>
      </section>
    </main>
  );
}
