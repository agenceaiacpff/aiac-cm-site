"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "connexion" | "inscription" | "recuperation";

export default function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const supabase = createClient();
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") || "").trim();
    const password = String(data.get("password") || "");

    if (mode === "connexion") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage(error.message);
      else { router.push("/espace"); router.refresh(); }
    } else if (mode === "inscription") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            full_name: String(data.get("full_name") || "").trim(),
            phone: String(data.get("phone") || "").trim(),
            organization: String(data.get("organization") || "").trim()
          }
        }
      });
      setMessage(error ? error.message : "Compte créé. Consultez votre e-mail pour confirmer votre inscription.");
    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/espace/profil`
      });
      setMessage(error ? error.message : "Un lien de récupération vous a été envoyé par e-mail.");
    }
    setLoading(false);
  }

  return (
    <form className="authForm" onSubmit={submit}>
      {mode === "inscription" && <>
        <label>Nom complet<input name="full_name" required /></label>
        <label>Téléphone / WhatsApp<input name="phone" /></label>
        <label>Organisation, si applicable<input name="organization" /></label>
      </>}
      <label>Adresse e-mail<input name="email" type="email" required autoComplete="email" /></label>
      {mode !== "recuperation" && <label>Mot de passe<input name="password" type="password" minLength={8} required autoComplete={mode === "connexion" ? "current-password" : "new-password"} /></label>}
      <button disabled={loading}>{loading ? "Traitement…" : mode === "connexion" ? "Se connecter" : mode === "inscription" ? "Créer mon compte" : "Recevoir le lien"}</button>
      {message && <p className="formMessage" role="status">{message}</p>}
    </form>
  );
}
