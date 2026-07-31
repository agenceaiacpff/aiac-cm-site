"use client";

import { FormEvent, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import ListToolbar, { exportCsv, paginate } from "@/components/ListToolbar";

export type AccountProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  status: string;
  phone: string | null;
  organization: string | null;
};

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
}: {
  currentProfile: AccountProfile;
  initialProfiles: AccountProfile[];
  initialHistory: AccountStatusHistory[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [profiles, setProfiles] = useState(initialProfiles);
  const [history, setHistory] = useState(initialHistory);
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
              <form className="statusReasonForm" onSubmit={(event) => changeStatus(event, account)}>
                <select name="status" defaultValue={account.status} disabled={busy || protectedSuper || ownSuper}>
                  {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <input name="reason" minLength={5} maxLength={1000} placeholder="Motif obligatoire du changement" required disabled={busy || protectedSuper || ownSuper}/>
                <button disabled={busy || protectedSuper || ownSuper}>Appliquer</button>
              </form>
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
            </div>
          </details>
        );
      })}
    </section>
  );
}
