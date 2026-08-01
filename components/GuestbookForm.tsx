"use client";

import { FormEvent, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function GuestbookForm({bodyId,bodyName}:{bodyId:string|null;bodyName:string|null}){
  const supabase=useMemo(()=>createClient(),[]);const [notice,setNotice]=useState("");const [busy,setBusy]=useState(false);
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setNotice("");const form=event.currentTarget;const d=new FormData(form);const {error}=await supabase.from("guestbook_entries").insert({body_id:bodyId,author_name:String(d.get("author_name")||"").trim(),organization:String(d.get("organization")||"").trim()||null,message:String(d.get("message")||"").trim(),status:"pending"});if(error)setNotice(error.message);else{form.reset();setNotice("Merci. Votre message a été reçu et sera affiché après modération.");}setBusy(false);}
  return <form className="guestbookForm" onSubmit={submit}><h2>Signer le livre d’or{bodyName?` de ${bodyName}`:" de l’AIAC"}</h2><p>Votre témoignage sera vérifié avant sa publication.</p><label>Votre nom<input name="author_name" minLength={2} maxLength={120} required/></label><label>Organisation (facultatif)<input name="organization" maxLength={160}/></label><label>Votre message<textarea name="message" minLength={10} maxLength={2000} required/></label><button disabled={busy}>{busy?"Envoi…":"Envoyer mon témoignage"}</button>{notice&&<p className="publicNotice" role="status">{notice}</p>}</form>;
}
