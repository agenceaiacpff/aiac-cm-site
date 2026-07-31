"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AccountStateCard({ state = "pending", suspended = false }: { state?: "pending"|"suspended"|"rejected"; suspended?: boolean }) {
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
        <h1>{(suspended||state==="suspended") ? "Compte suspendu" : state==="rejected" ? "Inscription non approuvée" : "Compte en attente"}</h1>
        <p>
          {(suspended||state==="suspended")
            ? "Votre accès a été suspendu par l’administration. Contactez l’AIAC si vous pensez qu’il s’agit d’une erreur."
            : state==="rejected"
            ? "Votre inscription n’a pas été approuvée par l’administration de l’AIAC. Contactez l’association si vous souhaitez demander un réexamen."
            : "Votre adresse a été confirmée. Un administrateur doit maintenant valider votre compte avant l’accès à l’espace de travail."}
        </p>
        <button className="stateButton" onClick={logout}>Se déconnecter</button>
      </section>
    </main>
  );
}
