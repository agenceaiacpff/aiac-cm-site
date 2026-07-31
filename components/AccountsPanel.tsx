"use client";

import { FormEvent, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import ListToolbar, { exportCsv, paginate } from "@/components/ListToolbar";
import type { GovernanceBodyRow } from "@/components/InstitutionalPanel";

export type AccountProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  status: string;
  phone: string | null;
  organization: string | null;
  registration_state: string;
  validated_at: string | null;
  validated_by: string | null;
  rejection_reason: string | null;
};

export type PositionDefinitionRow={id:string;code:string;title:string;institutional_level:string;body_id:string|null;authority_scope:string|null;status:string};
export type PositionAssignmentRow={id:string;position_id:string;body_id:string;profile_id:string|null;member_id:string|null;territory:string|null;decision_reference:string;start_date:string;end_date:string|null;status:string;appointed_by:string};
export type AccountReviewRow={id:string;profile_id:string;reviewer_id:string;decision:string;reason:string;body_id:string|null;position_assignment_id:string|null;created_at:string};

export type AccountStatusHistory = {
  id: string;
  profile_id: string;
  actor_id: string | null;
  old_status: string;
  new_status: string;
  reason: string;
  created_at: string;
};

export const roleLabels: Record<string, string> = {
  member: "Membre",
  beneficiary: "Bénéficiaire",
  volunteer: "Bénévole",
  staff: "Personnel AIAC",
  manager: "Responsable d’organe",
  partner: "Partenaire",
  admin: "Administrateur",
  super_admin: "Super-administrateur",
};

const statusLabels: Record<string, string> = { pending: "En attente", active: "Actif", suspended: "Suspendu" };

export default function AccountsPanel({
  currentProfile,
  initialProfiles,
  initialHistory,
  initialBodies,
  initialPositions,
  initialPositionAssignments,
  initialReviews,
}: {
  currentProfile: AccountProfile;
  initialProfiles: AccountProfile[];
  initialHistory: AccountStatusHistory[];
  initialBodies: GovernanceBodyRow[];
  initialPositions: PositionDefinitionRow[];
  initialPositionAssignments: PositionAssignmentRow[];
  initialReviews: AccountReviewRow[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [profiles, setProfiles] = useState(initialProfiles);
  const [history, setHistory] = useState(initialHistory);
  const [assignments,setAssignments]=useState(initialPositionAssignments);
  const [reviews,setReviews]=useState(initialReviews);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const isSuperAdmin = currentProfile.role === "super_admin";

  const filtered = profiles.filter((item) => {
    const haystack = `${item.full_name || ""} ${item.email || ""} ${item.organization || ""} ${roleLabels[item.role] || item.role}`.toLowerCase();
    return haystack.includes(query.toLowerCase()) && (status === "all" || item.status === status);
  });
  const paged = paginate(filtered, page);

  async function setRole(id: string, role: string) {
    setBusy(true);
    const { error } = await supabase.from("profiles").update({ role }).eq("id", id);
    if (error) setNotice(error.message);
    else {
      setProfiles((items) => items.map((item) => item.id === id ? { ...item, role } : item));
      setNotice("Fonction mise à jour et enregistrée dans le journal d’audit.");
    }
    setBusy(false);
  }

  async function changeStatus(event: FormEvent<HTMLFormElement>, account: AccountProfile) {
    event.preventDefault();
    setBusy(true);
    const form = event.currentTarget;
    const data = new FormData(form);
    const newStatus = String(data.get("status"));
    const reason = String(data.get("reason") || "").trim();
    const { error } = await supabase.rpc("change_account_status", { target_id: account.id, new_status: newStatus, reason });
    if (error) {
      setNotice(error.message);
    } else {
      const created: AccountStatusHistory = {
        id: crypto.randomUUID(), profile_id: account.id, actor_id: currentProfile.id,
        old_status: account.status, new_status: newStatus, reason, created_at: new Date().toISOString(),
      };
      setProfiles((items) => items.map((item) => item.id === account.id ? { ...item, status: newStatus } : item));
      setHistory((items) => [created, ...items]);
      form.reset();
      setNotice("Statut modifié avec motif, traçabilité et révocation de session si nécessaire.");
    }
    setBusy(false);
  }

  async function reviewRegistration(event:FormEvent<HTMLFormElement>,account:AccountProfile){
    event.preventDefault();setBusy(true);const form=event.currentTarget;const data=new FormData(form);
    const decision=String(data.get("decision"));const reason=String(data.get("reason")||"").trim();const bodyId=String(data.get("body_id")||"")||null;
    const {error}=await supabase.rpc("review_account_registration",{target_id:account.id,decision_name:decision,reason,assigned_body_id:bodyId});
    if(error)setNotice(error.message);else{
      setProfiles(rows=>rows.map(row=>row.id===account.id?{...row,registration_state:decision,status:decision==="approved"?"active":"pending",rejection_reason:decision==="rejected"?reason:null}:row));
      setReviews(rows=>[{id:crypto.randomUUID(),profile_id:account.id,reviewer_id:currentProfile.id,decision,reason,body_id:bodyId,position_assignment_id:null,created_at:new Date().toISOString()},...rows]);
      form.reset();setNotice(decision==="approved"?"Inscription approuvée. Le compte peut maintenant accéder au portail.":"Inscription refusée et sessions révoquées.");
    }setBusy(false);
  }

  async function assignPosition(event:FormEvent<HTMLFormElement>,account:AccountProfile){
    event.preventDefault();setBusy(true);const form=event.currentTarget;const data=new FormData(form);
    const payload={position_id:String(data.get("position_id")),body_id:String(data.get("body_id")),profile_id:account.id,territory:String(data.get("territory")||"").trim()||null,decision_reference:String(data.get("decision_reference")||"").trim(),start_date:data.get("start_date"),appointed_by:currentProfile.id};
    const {data:created,error}=await supabase.from("position_assignments").insert(payload).select().single();
    if(error||!created)setNotice(error?.message||"Affectation impossible");else{setAssignments(rows=>[created as PositionAssignmentRow,...rows]);form.reset();setNotice("Poste rattaché à l’organe, au territoire et à la décision de nomination.");}setBusy(false);
  }

  return (
    <section className="portalPanel">
      <h2>Gestion sécurisée des comptes</h2>
      <p>Chaque changement de statut exige un motif. Seul un super-administrateur peut gérer un autre super-administrateur.</p>
      {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice("")}>×</button></div>}
      <ListToolbar
        query={query} onQuery={setQuery} status={status} onStatus={setStatus}
        options={Object.entries(statusLabels).map(([value, label]) => ({ value, label }))}
        count={filtered.length} page={paged.page} pages={paged.pages} onPage={setPage}
        onExport={() => exportCsv("comptes-aiac.csv", ["Nom", "E-mail", "Organisation", "Fonction", "Statut"], filtered.map((item) => [item.full_name, item.email, item.organization, roleLabels[item.role] || item.role, statusLabels[item.status] || item.status]))}
        placeholder="Nom, e-mail, organisation ou fonction"
      />
      {paged.items.map((account) => {
        const protectedSuper = account.role === "super_admin" && !isSuperAdmin;
        const ownSuper = account.id === currentProfile.id && account.role === "super_admin";
        const accountHistory = history.filter((entry) => entry.profile_id === account.id).slice(0, 5);
        return (
          <details className="workflowCard" key={account.id}>
            <summary>
              <span><b>{account.full_name || account.email}</b><small>{account.email} · {roleLabels[account.role] || account.role}</small></span>
              <span className={`status ${account.status}`}>{statusLabels[account.status] || account.status}</span>
            </summary>
            <div className="workflowBody">
              <label>Fonction
                <select value={account.role} disabled={busy || protectedSuper || ownSuper} onChange={(event) => setRole(account.id, event.target.value)}>
                  {Object.entries(roleLabels).filter(([value]) => isSuperAdmin || value !== "super_admin").map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              {account.registration_state!=="approved"&&<form className="operationForm compact" onSubmit={event=>reviewRegistration(event,account)}>
                <select name="decision"><option value="approved">Approuver l’inscription</option><option value="rejected">Refuser l’inscription</option></select>
                <select name="body_id"><option value="">Rattachement à définir ultérieurement</option>{initialBodies.map(body=><option value={body.id} key={body.id}>{body.code} · {body.name}</option>)}</select>
                <input name="reason" minLength={5} maxLength={1000} placeholder="Motif obligatoire de la décision" required/>
                <button disabled={busy||protectedSuper||ownSuper}>Décider</button>
              </form>}
              {account.registration_state==="approved"&&<form className="statusReasonForm" onSubmit={(event) => changeStatus(event, account)}>
                <select name="status" defaultValue={account.status} disabled={busy || protectedSuper || ownSuper}>
                  {Object.entries(statusLabels).filter(([value])=>value!=="pending").map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <input name="reason" minLength={5} maxLength={1000} placeholder="Motif obligatoire du changement" required disabled={busy || protectedSuper || ownSuper}/>
                <button disabled={busy || protectedSuper || ownSuper}>Appliquer</button>
              </form>}
              <div className="eventTimeline"><h3>Postes et habilitations institutionnelles</h3>
                {assignments.filter(row=>row.profile_id===account.id).map(row=>{const position=initialPositions.find(item=>item.id===row.position_id);const body=initialBodies.find(item=>item.id===row.body_id);return <div className="eventItem" key={row.id}><b>{position?.title||"Poste"}</b><p>{body?.code} · {body?.name}{row.territory?` · ${row.territory}`:""}</p><small>{row.decision_reference} · depuis le {new Date(row.start_date).toLocaleDateString("fr-FR")}</small></div>})}
                {isSuperAdmin&&<form className="operationForm compact" onSubmit={event=>assignPosition(event,account)}><select name="position_id" required><option value="">Poste officiel</option>{initialPositions.filter(row=>row.status==="active").map(row=><option value={row.id} key={row.id}>{row.code} · {row.title}</option>)}</select><select name="body_id" required><option value="">Organe / niveau</option>{initialBodies.filter(row=>row.status==="active").map(row=><option value={row.id} key={row.id}>{row.code} · {row.name}</option>)}</select><input name="territory" placeholder="Région, antenne ou territoire"/><input name="decision_reference" minLength={2} placeholder="Décision / délégation de référence" required/><label>Début<input name="start_date" type="date" defaultValue={new Date().toISOString().slice(0,10)} required/></label><button disabled={busy}>Affecter le poste</button></form>}
              </div>
              <div className="eventTimeline">
                <h3>Historique des statuts</h3>
                {accountHistory.length ? accountHistory.map((entry) => (
                  <div key={entry.id} className="eventItem">
                    <b>{statusLabels[entry.old_status]} → {statusLabels[entry.new_status]}</b>
                    <p>{entry.reason}</p>
                    <small>{new Date(entry.created_at).toLocaleString("fr-FR")}</small>
                  </div>
                )) : <p>Aucun changement de statut enregistré.</p>}
              </div>
              <div className="eventTimeline"><h3>Décisions d’inscription</h3>{reviews.filter(row=>row.profile_id===account.id).map(row=><div className="eventItem" key={row.id}><b>{row.decision==="approved"?"Inscription approuvée":"Inscription refusée"}</b><p>{row.reason}</p><small>{new Date(row.created_at).toLocaleString("fr-FR")}</small></div>)}</div>
            </div>
          </details>
        );
      })}
    </section>
  );
}
