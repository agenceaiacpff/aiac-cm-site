import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import GuestMeetingResponse from "@/components/GuestMeetingResponse";
import styles from "./page.module.css";

export const dynamic="force-dynamic";

type GuestInvitation={guest_name:string;guest_organization:string|null;response_status:string;meeting_id:string;code:string;title:string;meeting_type:string;description:string|null;agenda:string|null;status:string;modality:string;starts_at:string;ends_at:string;timezone:string;venue:string|null;online_provider:string|null;meeting_url:string|null;access_instructions:string|null;registration_deadline:string|null};

const typeLabels:Record<string,string>={general_assembly:"Assemblée générale",board:"Conseil d’administration",expanded_board:"Conseil d’administration élargi",executive:"Bureau exécutif",subsidiary_body:"Organe subsidiaire",regional_coordination:"Coordination régionale",expanded_regional_coordination:"Coordination régionale élargie",branch:"Antenne",expanded_branch:"Antenne élargie",project:"Projet ou programme",team:"Équipe de travail",partner:"Partenaires",training:"Formation",public:"Réunion ouverte",other:"Autre réunion"};
const modalityLabels:Record<string,string>={online:"En ligne",in_person:"En présentiel",hybrid:"Hybride"};
function dateTime(value:string){return new Date(value).toLocaleString("fr-FR",{dateStyle:"full",timeStyle:"short",timeZone:"Africa/Douala"});}

export default async function GuestMeetingInvitation({params}:{params:Promise<{token:string}>}){
  const {token}=await params;
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token))notFound();
  const supabase=await createClient();
  const {data,error}=await supabase.rpc("get_guest_meeting_invitation_v2",{p_token:token});
  const invitation=(Array.isArray(data)?data[0]:data) as GuestInvitation|undefined;
  if(error||!invitation)notFound();
  const joinable=["scheduled","in_progress"].includes(invitation.status);
  const cancelled=invitation.status==="cancelled";
  const deadlinePassed=Boolean(invitation.registration_deadline&&new Date()>new Date(invitation.registration_deadline));
  const responseClosed=!joinable||deadlinePassed;
  const disabledReason=cancelled?"Cette réunion a été annulée.":!joinable?"Les réponses sont closes pour cette réunion.":deadlinePassed?"La date limite de réponse est dépassée.":null;
  return <main className={styles.page}><article className={styles.card}>
    <header><a href="/nouveau-site/index.html"><img src="/aiac-logo.bmp" alt="AIAC"/></a><div><small>Convocation personnelle · {invitation.code}</small><h1>{invitation.title}</h1><p>Bonjour {invitation.guest_name}{invitation.guest_organization?` · ${invitation.guest_organization}`:""}</p></div></header>
    {cancelled&&<div className={styles.cancelled}>Cette réunion a été annulée par l’organisateur.</div>}
    <dl><div><dt>Type</dt><dd>{typeLabels[invitation.meeting_type]||invitation.meeting_type}</dd></div><div><dt>Format</dt><dd>{modalityLabels[invitation.modality]||invitation.modality}</dd></div><div><dt>Début</dt><dd>{dateTime(invitation.starts_at)}</dd></div><div><dt>Fin</dt><dd>{dateTime(invitation.ends_at)}</dd></div>{invitation.registration_deadline&&<div><dt>Répondre avant</dt><dd>{dateTime(invitation.registration_deadline)}</dd></div>}{invitation.venue&&<div><dt>Lieu</dt><dd>{invitation.venue}</dd></div>}</dl>
    {invitation.description&&<section><h2>Présentation</h2><p>{invitation.description}</p></section>}
    {invitation.agenda&&<section className={styles.agenda}><h2>Ordre du jour</h2><p>{invitation.agenda}</p></section>}
    {invitation.access_instructions&&<section><h2>Instructions d’accès</h2><p>{invitation.access_instructions}</p></section>}
    {joinable&&invitation.meeting_url&&<a className={styles.join} href={invitation.meeting_url} target="_blank" rel="noreferrer">Participer à la réunion en ligne</a>}
    <GuestMeetingResponse token={token} initialResponse={invitation.response_status} disabledReason={responseClosed?disabledReason:null}/><footer>Ce lien est personnel. Ne le transmettez pas à une autre personne.</footer>
  </article></main>;
}
