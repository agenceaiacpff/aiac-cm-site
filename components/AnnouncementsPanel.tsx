"use client";

import { FormEvent, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import ListToolbar, { exportCsv, paginate } from "@/components/ListToolbar";
import { roleLabels } from "@/components/AccountsPanel";

export type AnnouncementRow = {
  id: string;
  title: string;
  body: string;
  audience: string[];
  status: string;
  published_at: string | null;
  expires_at: string | null;
  created_by: string;
  created_at: string;
};

const announcementStatus: Record<string, string> = { draft: "Brouillon", published: "Publiée", archived: "Archivée" };

export default function AnnouncementsPanel({
  profileId,
  isAdmin,
  initialAnnouncements,
  initialReadIds,
}: {
  profileId: string;
  isAdmin: boolean;
  initialAnnouncements: AnnouncementRow[];
  initialReadIds: string[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [announcements, setAnnouncements] = useState(initialAnnouncements);
  const [readIds, setReadIds] = useState(new Set(initialReadIds));
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const filtered = announcements.filter((item) => {
    const audience = item.audience.map((role) => roleLabels[role] || role).join(" ");
    return `${item.title} ${item.body} ${audience}`.toLowerCase().includes(query.toLowerCase())
      && (status === "all" || item.status === status);
  });
  const paged = paginate(filtered, page, 6);

  async function createAnnouncement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = event.currentTarget;
    const data = new FormData(form);
    const audience = data.getAll("audience").map(String);
    const payload = {
      title: String(data.get("title") || "").trim(),
      body: String(data.get("body") || "").trim(),
      audience,
      status: String(data.get("status") || "draft"),
      expires_at: data.get("expires_at") ? new Date(String(data.get("expires_at"))).toISOString() : null,
      created_by: profileId,
    };
    const { data: created, error } = await supabase.from("announcements").insert(payload).select().single();
    if (error || !created) setNotice(error?.message || "Création impossible");
    else {
      setAnnouncements((items) => [created as AnnouncementRow, ...items]);
      form.reset();
      setNotice(payload.status === "published" ? "Annonce publiée et notifications envoyées au public ciblé." : "Brouillon enregistré.");
    }
    setBusy(false);
  }

  async function updateStatus(id: string, nextStatus: string) {
    setBusy(true);
    const { data, error } = await supabase.from("announcements").update({ status: nextStatus }).eq("id", id).select().single();
    if (error || !data) setNotice(error?.message || "Mise à jour impossible");
    else {
      setAnnouncements((items) => items.map((item) => item.id === id ? data as AnnouncementRow : item));
      setNotice(nextStatus === "published" ? "Annonce publiée et distribuée." : "État de l’annonce mis à jour.");
    }
    setBusy(false);
  }

  async function markRead(id: string) {
    const { error } = await supabase.from("announcement_reads").upsert({ announcement_id: id, user_id: profileId, read_at: new Date().toISOString() });
    if (!error) setReadIds((items) => new Set([...items, id]));
    else setNotice(error.message);
  }

  return (
    <section>
      {isAdmin && (
        <div className="portalPanel">
          <h2>Créer une annonce</h2>
          <form className="operationForm" onSubmit={createAnnouncement}>
            <input name="title" minLength={3} maxLength={180} placeholder="Titre de l’annonce" required/>
            <textarea name="body" minLength={5} maxLength={10000} placeholder="Message à diffuser" required/>
            <fieldset className="audiencePicker">
              <legend>Public ciblé — aucun choix signifie tous les comptes actifs</legend>
              {Object.entries(roleLabels).map(([value, label]) => <label key={value}><input type="checkbox" name="audience" value={value}/>{label}</label>)}
            </fieldset>
            <label>Expiration facultative<input name="expires_at" type="datetime-local"/></label>
            <select name="status" defaultValue="draft"><option value="draft">Enregistrer en brouillon</option><option value="published">Publier maintenant</option></select>
            <button disabled={busy}>Enregistrer</button>
          </form>
        </div>
      )}
      <div className="portalPanel">
        <h2>Annonces AIAC</h2>
        {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice("")}>×</button></div>}
        <ListToolbar
          query={query} onQuery={setQuery} status={status} onStatus={setStatus}
          options={Object.entries(announcementStatus).map(([value, label]) => ({ value, label }))}
          count={filtered.length} page={paged.page} pages={paged.pages} onPage={setPage}
          onExport={() => exportCsv("annonces-aiac.csv", ["Titre", "État", "Public", "Publication", "Expiration"], filtered.map((item) => [item.title, announcementStatus[item.status], item.audience.length ? item.audience.map((role) => roleLabels[role] || role).join(", ") : "Tous", item.published_at, item.expires_at]))}
          placeholder="Titre, contenu ou public"
        />
        {paged.items.length ? paged.items.map((item) => (
          <article className={`announcementCard ${readIds.has(item.id) ? "" : "unread"}`} key={item.id}>
            <div className="announcementMeta">
              <span className={`operationBadge ${item.status}`}>{announcementStatus[item.status] || item.status}</span>
              <small>{item.audience.length ? item.audience.map((role) => roleLabels[role] || role).join(", ") : "Tous les comptes actifs"}</small>
            </div>
            <h3>{item.title}</h3>
            <p>{item.body}</p>
            <small>{item.published_at ? `Publiée le ${new Date(item.published_at).toLocaleString("fr-FR")}` : `Créée le ${new Date(item.created_at).toLocaleString("fr-FR")}`}{item.expires_at ? ` · expire le ${new Date(item.expires_at).toLocaleString("fr-FR")}` : ""}</small>
            <div className="announcementActions">
              {!readIds.has(item.id) && item.status === "published" && <button onClick={() => markRead(item.id)}>Marquer comme lue</button>}
              {isAdmin && item.status !== "published" && <button disabled={busy} onClick={() => updateStatus(item.id, "published")}>Publier</button>}
              {isAdmin && item.status === "published" && <button className="secondaryButton" disabled={busy} onClick={() => updateStatus(item.id, "archived")}>Archiver</button>}
            </div>
          </article>
        )) : <p>Aucune annonce correspondant aux critères.</p>}
      </div>
    </section>
  );
}
