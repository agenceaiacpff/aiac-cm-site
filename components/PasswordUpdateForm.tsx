"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function PasswordUpdateForm() {
  const router = useRouter();
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setMessage("");
    const data=new FormData(event.currentTarget);
    const password=String(data.get("password")||"");
    const confirmation=String(data.get("confirmation")||"");
    if(password!==confirmation){setMessage("Les deux mots de passe ne correspondent pas.");setBusy(false);return;}
    const supabase=createClient();
    const updated=await supabase.auth.updateUser({password});
    if(updated.error){setMessage(updated.error.message);setBusy(false);return;}
    const completed=await supabase.rpc("complete_forced_password_reset");
    if(completed.error){setMessage(completed.error.message);setBusy(false);return;}
    router.push("/espace");router.refresh();
  }

  return <form className="authForm" onSubmit={submit}>
    <label>Nouveau mot de passe<input name="password" type="password" minLength={12} autoComplete="new-password" required/></label>
    <label>Confirmer le mot de passe<input name="confirmation" type="password" minLength={12} autoComplete="new-password" required/></label>
    <small>Utilisez au moins 12 caractères avec des lettres, des chiffres et un caractère spécial.</small>
    <button disabled={busy}>{busy?"Mise à jour…":"Enregistrer le nouveau mot de passe"}</button>
    {message&&<p className="formMessage" role="status">{message}</p>}
  </form>;
}
