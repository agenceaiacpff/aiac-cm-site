"use client";

import { useMemo, useState } from "react";
import ListToolbar, { exportCsv, paginate } from "@/components/ListToolbar";
import type { AccountProfile } from "@/components/AccountsPanel";
import type { SecureDocumentRow } from "@/components/DocumentVault";

export type AuditLogRow = {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown>;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  source_ip: string | null;
  user_agent: string | null;
  created_at: string;
};
export type SessionActivityRow = {
  id: string;
  user_id: string;
  session_identifier: string;
  source_ip: string | null;
  user_agent: string | null;
  first_seen_at: string;
  last_seen_at: string;
  revoked_at: string | null;
};
export type DocumentAccessLogRow = {
  id: string;
  document_id: string;
  version_id: string | null;
  user_id: string | null;
  action: string;
  source_ip: string | null;
  user_agent: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

const actionLabels: Record<string, string> = {
  insert: "Création",
  create: "Création",
  created: "Création",
  update: "Modification",
  updated: "Modification",
  delete: "Suppression",
  deleted: "Suppression",
};
const entityLabels: Record<string, string> = {
  governance_body: "Organe",
  governance_bodies: "Organe",
  program: "Programme",
  programs: "Programme",
  project: "Projet",
  projects: "Projet",
  activity: "Activité",
  activities: "Activité",
  activity_task: "Tâche",
  activity_tasks: "Tâche",
  task_report: "Rapport de tâche",
  task_reports: "Rapport de tâche",
  institutional_member: "Membre",
  institutional_members: "Membre",
  workforce_assignment: "Affectation",
  workforce_assignments: "Affectation",
  document: "Document",
  documents: "Document",
  public_content: "Publication",
  public_content_items: "Publication",
};
const fieldLabels: Record<string, string> = {
  code: "Code",
  name: "Nom",
  title: "Titre",
  description: "Description",
  status: "Statut",
  body_id: "Organe",
  program_id: "Programme",
  project_id: "Projet",
  activity_id: "Activité",
  task_id: "Tâche",
  manager_id: "Responsable",
  assigned_to: "Responsable de la tâche",
  sequence_no: "Numéro / ordre",
  expected_output: "Résultat attendu",
  starts_at: "Début",
  ends_at: "Fin",
  start_date: "Date de début",
  end_date: "Date de fin",
  due_date: "Échéance",
  location: "Lieu",
  budget_amount: "Budget",
  budget_currency: "Devise",
  summary: "Résumé",
  outcomes: "Résultats",
  challenges: "Difficultés",
  recommendations: "Recommandations",
  report_type: "Type de rapport",
  report_number: "Numéro de rapport",
};
const ignoredFields = new Set(["updated_at", "created_at"]);

function normalize(value: unknown) {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
function short(value: unknown, max = 160) {
  const text = normalize(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
function changedFields(log: AuditLogRow) {
  const before = log.old_data || {};
  const after = log.new_data || {};
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  return keys
    .filter((key) => !ignoredFields.has(key))
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map((key) => ({ key, before: before[key], after: after[key] }));
}
function entityReference(log: AuditLogRow) {
  const data = log.new_data || log.old_data || {};
  return String(
    data.code ||
      data.report_number ||
      data.member_number ||
      data.reference_code ||
      data.title ||
      data.name ||
      log.entity_id ||
      "—",
  );
}

export default function AuditCenter({
  logs,
  sessions,
  documentAccess,
  profiles,
  documents,
}: {
  logs: AuditLogRow[];
  sessions: SessionActivityRow[];
  documentAccess: DocumentAccessLogRow[];
  profiles: AccountProfile[];
  documents: SecureDocumentRow[];
}) {
  const [view, setView] = useState("changes");
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [page, setPage] = useState(1);
  const names = useMemo(
    () => Object.fromEntries(profiles.map((row) => [row.id, row.full_name || row.email || row.id])),
    [profiles],
  );
  const documentNames = useMemo(
    () => Object.fromEntries(documents.map((row) => [row.id, row.title])),
    [documents],
  );
  const types = useMemo(() => Array.from(new Set(logs.map((row) => row.entity_type))).sort(), [logs]);
  const filtered = logs.filter((row) => {
    const diffText = changedFields(row)
      .map((item) => `${item.key} ${normalize(item.before)} ${normalize(item.after)}`)
      .join(" ");
    return (
      `${row.action} ${row.entity_type} ${entityReference(row)} ${row.entity_id || ""} ${row.actor_id || ""} ${diffText}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (type === "all" || row.entity_type === type)
    );
  });
  const paged = paginate(filtered, page, 15);

  return (
    <section className="operationsWorkspace auditCenter">
      <div className="statGrid operationStats">
        <article><b>{logs.length}</b><span>Opérations tracées</span></article>
        <article><b>{sessions.length}</b><span>Sessions observées</span></article>
        <article><b>{documentAccess.length}</b><span>Accès documentaires</span></article>
        <article><b>{sessions.filter((row) => row.revoked_at).length}</b><span>Sessions révoquées</span></article>
      </div>
      <div className="operationNav">
        {[["changes", "Modifications détaillées"], ["sessions", "Connexions"], ["documents", "Documents"]].map(([id, label]) => (
          <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}>{label}</button>
        ))}
      </div>

      {view === "changes" && (
        <div className="portalPanel">
          <h2>Journal d’audit détaillé et non modifiable</h2>
          <p>
            Chaque opération affiche maintenant la ressource concernée, sa référence, l’auteur,
            les champs réellement touchés et la valeur avant/après. Les données complètes restent
            disponibles dans le détail technique.
          </p>
          <ListToolbar
            query={query}
            onQuery={(value) => { setQuery(value); setPage(1); }}
            status={type}
            onStatus={(value) => { setType(value); setPage(1); }}
            options={types.map((value) => ({ value, label: entityLabels[value] || value }))}
            count={filtered.length}
            page={paged.page}
            pages={paged.pages}
            onPage={setPage}
            onExport={() => exportCsv(
              "audit-aiac-detaille.csv",
              ["Action", "Entité", "Référence", "Identifiant", "Acteur", "Champs modifiés", "Avant", "Après", "Date"],
              filtered.map((row) => {
                const diff = changedFields(row);
                return [
                  actionLabels[row.action.toLowerCase()] || row.action,
                  entityLabels[row.entity_type] || row.entity_type,
                  entityReference(row),
                  row.entity_id,
                  names[row.actor_id || ""] || row.actor_id,
                  diff.map((item) => fieldLabels[item.key] || item.key).join(" | "),
                  diff.map((item) => `${fieldLabels[item.key] || item.key}: ${normalize(item.before)}`).join(" | "),
                  diff.map((item) => `${fieldLabels[item.key] || item.key}: ${normalize(item.after)}`).join(" | "),
                  row.created_at,
                ];
              }),
            )}
            placeholder="Référence, champ, ancienne/nouvelle valeur ou acteur"
          />
          {paged.items.map((log) => {
            const diff = changedFields(log);
            const action = actionLabels[log.action.toLowerCase()] || log.action;
            const entity = entityLabels[log.entity_type] || log.entity_type;
            return (
              <details className="workflowCard" key={log.id}>
                <summary>
                  <span>
                    <b>{action} · {entity} · {entityReference(log)}</b>
                    <small>
                      {names[log.actor_id || ""] || log.actor_id || "Système"}
                      {diff.length ? ` · ${diff.length} champ${diff.length > 1 ? "s" : ""} concerné${diff.length > 1 ? "s" : ""}` : ""}
                    </small>
                    {diff.length > 0 && (
                      <small>
                        {diff.slice(0, 4).map((item) => fieldLabels[item.key] || item.key).join(" · ")}
                        {diff.length > 4 ? ` · +${diff.length - 4}` : ""}
                      </small>
                    )}
                  </span>
                  <time>{new Date(log.created_at).toLocaleString("fr-FR")}</time>
                </summary>
                <div className="workflowBody auditDiff">
                  {diff.length === 0 ? (
                    <p>Aucune différence de champ métier détectée dans cette entrée.</p>
                  ) : (
                    <div style={{ overflowX: "auto", width: "100%" }}>
                      <table className="reportTable">
                        <thead><tr><th>Champ</th><th>Avant</th><th>Après</th></tr></thead>
                        <tbody>
                          {diff.map((item) => (
                            <tr key={item.key}>
                              <th>{fieldLabels[item.key] || item.key}</th>
                              <td>{short(item.before)}</td>
                              <td>{short(item.after)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <details style={{ width: "100%" }}>
                    <summary>Voir les données techniques complètes</summary>
                    <div className="auditDiff">
                      <div><h3>Avant</h3><pre>{JSON.stringify(log.old_data, null, 2) || "—"}</pre></div>
                      <div><h3>Après</h3><pre>{JSON.stringify(log.new_data, null, 2) || "—"}</pre></div>
                    </div>
                  </details>
                </div>
              </details>
            );
          })}
        </div>
      )}

      {view === "sessions" && (
        <div className="portalPanel">
          <h2>Historique des connexions et révocations</h2>
          {sessions.map((row) => (
            <div className="listRow" key={row.id}>
              <div>
                <b>{names[row.user_id] || row.user_id}</b>
                <small>{row.source_ip || "IP non disponible"} · {row.user_agent?.slice(0, 100) || "Appareil non renseigné"}</small>
              </div>
              <span>{row.revoked_at ? `Révoquée ${new Date(row.revoked_at).toLocaleString("fr-FR")}` : `Vue ${new Date(row.last_seen_at).toLocaleString("fr-FR")}`}</span>
            </div>
          ))}
        </div>
      )}

      {view === "documents" && (
        <div className="portalPanel">
          <h2>Consultations et téléchargements sensibles</h2>
          {documentAccess.map((row) => (
            <div className="listRow" key={row.id}>
              <div>
                <b>{row.action} · {documentNames[row.document_id] || row.document_id}</b>
                <small>{names[row.user_id || ""] || row.user_id || "Système"} · {row.source_ip || "IP non disponible"}</small>
              </div>
              <time>{new Date(row.created_at).toLocaleString("fr-FR")}</time>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
