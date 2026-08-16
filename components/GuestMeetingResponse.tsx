"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import styles from "@/components/GuestMeetingResponse.module.css";

const labels:Record<string,string>={accepted:"Je participe",tentative:"Peut-être",declined:"Je ne participe pas"};

export default function GuestMeetingResponse({token,initialResponse,disabledReason}:{token:string;initialResponse:string;disabledReason?:string|null}){
  const [response,setResponse]=useState(initialResponse);
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);

  async function answer(value:string){
    setBusy(true);setNotice("");
    const supabase=createClient();
    const {data,error}=await supabase.rpc("respond_to_guest_meeting",{p_token:token,p_response:value});
    if(error||!data)setNotice(error?.message||"Cette invitation n’est plus disponible.");
    else{setResponse(value);setNotice("Votre réponse a été enregistrée et transmise à l’organisateur.");}
    setBusy(false);
  }

  return <div className={styles.response}>
    <h2>Votre réponse</h2>
    {disabledReason?<p role="status">{disabledReason}</p>:<><div>{Object.entries(labels).map(([value,label])=><button type="button" key={value} className={response===value?styles.selected:""} disabled={busy} onClick={()=>answer(value)}>{label}</button>)}</div>{notice&&<p role="status">{notice}</p>}</>}
  </div>;
}
