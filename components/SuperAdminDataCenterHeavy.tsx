"use client";

import { FormEvent, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ControlRow = {
  id: string;
  reference: string;
  name: string;
  description?: string | null;
  status?: string | null;
  parentId?: string | null;
  sequenceNo?: number | null;
};
type ResourceGroup = { id: string; label: string; purpose: string; rows: ControlRow[] };

type ProgramInput = { id: string; code: string; name: string; description: string | null; status: string; body_id: string };
type ProjectInput = { id: string; code: string; name: string; description: string | null; status: string; program_id: string | null };
type ActivityInput = { id: string; code: string; title: string; description: string | null; status: string; project_id: string | null; program_id?: string | null };
type TaskInput = { id: string; code: string; title: string; description: string | null; status: string; activity_id: string; sequence_no: number };
type ReportInput = { id: string; report_number: string; title: string | null; summary: string; status: string; task_id: string };
type BodyInput = { id: string; code: string; name: string; description: string | null; status: string; body_type?: string; deployment_level?: string };

const resourceTables: Record<string, string> = {
  governance_body: "governance_bodies",
  institutional_member: "institutional_members",
  workforce_assignment: "workforce_assignments",
  partner: "partners",
  program: "programs",
  project: "projects",
  activity: "activities",
  activity_task: "activity_tasks",
  task_report: "task_reports",
  public_content: "public_content_items",
  document: "documents",
};
const hierarchyResources = new Set(["program", "project", "activity", "activity_task", "task_report"]);
const technicalFields = new Set([
  "id", "created_at", "updated_at", "created_by", "current_hash", "revision",
  "report_number", "reporter_id", "reporter_signature_name", "reporter_signature_asset_path",
  "reporter_signed_at", "submitted_at", "approved_at", "approved_by", "returned_at",
  "public_content_id", "published_at", "published_by", "file_url", "file_name", "mime_type", "size_bytes",
]);

function natural(a: string, b: string) {
  return a.localeCompare(b, "fr", { numeric: true, sensitivity: "base" });
}
function mapRow(row: { id: string; code?: string; name?: string; title?: string | null; description?: string | null; status?: string | null; report_number?: string; summary?: string | null; sequence_no?: number }) : ControlRow {
  return {
    id: row.id,
    reference: row.code || row.report_number || row.id.slice(0, 8),
    name: row.name || row.title || row.report_number || row.id,
    description: row.description ?? row.summary ?? null,
    status: row.status || null,
    sequenceNo: row.sequence_no ?? null,
  };
}

export default function SuperAdminDataCenter({
  programs,
  projects,
  activities,
  tasks,
  reports,
  publications,
  documents,
  bodies,
  members,
  workforce,
  partners,
}: {
  programs: ProgramInput[];
  projects: ProjectInput[];
  activities: ActivityInput[];
  tasks: TaskInput[];
  reports: ReportInput[];
  publications: Array<{ id: string; slug: string; title: string; summary: string; status: string }>;
  documents: Array<{ id: string; title: string; file_name: string | null; document_status: string }>;
  bodies: BodyInput[];
  members: Array<{ id: string; member_number: string; full_name: string; notes: string | null; status: string }>;
  workforce: Array<{ id: string; job_title: string; assignment_type: string; notes: string | null; status: string }>;
  partners: Array<{ id: string; code: string; legal_name: string; notes: string | null; status: string }>;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [resource, setResource] = useState("program");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");
  const [advancedRows, setAdvancedRows] = useState<Record<string, Record<string, unknown>>>({});
  const [advancedLoadingId, setAdvancedLoadingId] = useState("");
  const [bodyId, setBodyId] = useState("");
  const [programId, setProgramId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [activityId, setActivityId] = useState("");
  const [remoteTasks, setRemoteTasks] = useState<ControlRow[]>(() => tasks.map(mapRow));
  const [taskLoading, setTaskLoading] = useState(false);

  const sortedBodies = useMemo(
    () => [...bodies].filter((x) => x.status !== "archived").sort((a, b) => natural(a.code, b.code)),
    [bodies],
  );
  const filteredPrograms = useMemo(
    () => [...programs].filter((x) => !bodyId || x.body_id === bodyId).sort((a, b) => natural(a.code, b.code)),
    [programs, bodyId],
  );
  const filteredProjects = useMemo(
    () => [...projects].filter((x) => !programId || x.program_id === programId).sort((a, b) => natural(a.code, b.code)),
    [projects, programId],
  );
  const filteredActivities = useMemo(
    () => [...activities].filter((x) => !projectId || x.project_id === projectId).sort((a, b) => natural(a.code, b.code)),
    [activities, projectId],
  );

  function clearAfter(level: "body" | "program" | "project" | "activity") {
    if (level === "body") { setProgramId(""); setProjectId(""); setActivityId(""); setRemoteTasks([]); }
    if (level === "program") { setProjectId(""); setActivityId(""); setRemoteTasks([]); }
    if (level === "project") { setActivityId(""); setRemoteTasks([]); }
    if (level === "activity") setRemoteTasks([]);
    setQuery("");
  }

  async function chooseActivity(id: string) {
    setActivityId(id);
    setRemoteTasks([]);
    setQuery("");
    if (!id) return;
    setTaskLoading(true);
    const { data, error } = await supabase
      .from("activity_tasks")
      .select("id,activity_id,code,title,description,status,sequence_no")
      .eq("activity_id", id)
      .order("sequence_no", { ascending: true })
      .order("code", { ascending: true })
      .limit(1000);
    if (error) setNotice(error.message);
    else setRemoteTasks(((data || []) as TaskInput[]).map(mapRow));
    setTaskLoading(false);
  }

  const groups: ResourceGroup[] = [
    { id: "governance_body", label: "Organes", purpose: "Gouvernance et rattachements institutionnels", rows: sortedBodies.map(mapRow) },
    { id: "program", label: "Programmes", purpose: "Programmes du seul organe sélectionné", rows: filteredPrograms.map(mapRow) },
    { id: "project", label: "Projets", purpose: "Projets du seul programme sélectionné", rows: filteredProjects.map(mapRow) },
    { id: "activity", label: "Activités", purpose: "Activités du seul projet sélectionné", rows: filteredActivities.map(mapRow) },
    { id: "activity_task", label: "Tâches", purpose: "Tâches de la seule activité sélectionnée, dans leur ordre d’exécution", rows: remoteTasks },
    { id: "task_report", label: "Rapports", purpose: "Rapports rattachés à la chaîne sélectionnée", rows: reports.map(mapRow) },
    { id: "institutional_member", label: "Membres", purpose: "Membres institutionnels", rows: members.map((r) => ({ id: r.id, reference: r.member_number, name: r.full_name, description: r.notes, status: r.status })) },
    { id: "workforce_assignment", label: "Affectations", purpose: "Postes et affectations", rows: workforce.map((r) => ({ id: r.id, reference: r.assignment_type, name: r.job_title, description: r.notes, status: r.status })) },
    { id: "partner", label: "Partenaires", purpose: "Répertoire des partenaires", rows: partners.map((r) => ({ id: r.id, reference: r.code, name: r.legal_name, description: r.notes, status: r.status })) },
    { id: "public_content", label: "Publications", purpose: "Contenus du site officiel", rows: publications.map((r) => ({ id: r.id, reference: r.slug, name: r.title, description: r.summary, status: r.status })) },
    { id: "document", label: "Documents", purpose: "Documents privés et versionnés", rows: documents.map((r) => ({ id: r.id, reference: r.file_name || r.id.slice(0, 8), name: r.title, status: r.document_status })) },
  ];
  const current = groups.find((group) => group.id === resource) || groups[0];

  const reportTaskIds = useMemo(() => new Set(remoteTasks.map((x) => x.id)), [remoteTasks]);
  const scopedRows = useMemo(() => {
    let rows = current.rows;
    if (resource === "task_report" && activityId) rows = reports.filter((r) => reportTaskIds.has(r.task_id)).map(mapRow);
    const needle = query.trim().toLowerCase();
    if (needle) rows = rows.filter((row) => `${row.reference} ${row.name} ${row.description || ""} ${row.status || ""}`.toLowerCase().includes(needle));
    return [...rows].sort((a, b) => {
      if (resource === "activity_task") return (a.sequenceNo || 0) - (b.sequenceNo || 0) || natural(a.reference, b.reference);
      return natural(a.reference, b.reference);
    }).slice(0, 250);
  }, [activityId, current.rows, query, remoteTasks, reportTaskIds, reports, resource]);

  async function save(event: FormEvent<HTMLFormElement>, row: ControlRow) {
    event.preventDefault();
    setBusyId(row.id); setNotice("");
    const data = new FormData(event.currentTarget);
    const changes = { name: String(data.get("name") || "").trim(), description: String(data.get("description") || "").trim(), status: String(data.get("status") || "").trim() };
    const { error } = await supabase.rpc("super_admin_update_resource", { resource_type: resource, target_id: row.id, changes });
    setNotice(error ? error.message : `« ${row.reference} » a été modifié et journalisé.`);
    setBusyId("");
  }
  async function loadAllFields(row: ControlRow) {
    setAdvancedLoadingId(row.id); setNotice("");
    const table = resourceTables[resource];
    const { data, error } = await supabase.from(table).select("*").eq("id", row.id).single();
    if (error) setNotice(error.message);
    else setAdvancedRows((items) => ({ ...items, [row.id]: data as Record<string, unknown> }));
    setAdvancedLoadingId("");
  }
  async function saveAllFields(event: FormEvent<HTMLFormElement>, row: ControlRow) {
    event.preventDefault();
    const original = advancedRows[row.id];
    if (!original) return;
    setBusyId(row.id); setNotice("");
    const formData = new FormData(event.currentTarget);
    const changes: Record<string, unknown> = {};
    try {
      Object.entries(original).forEach(([key, originalValue]) => {
        if (technicalFields.has(key) || !formData.has(key)) return;
        const entered = String(formData.get(key) ?? "");
        if (typeof originalValue === "boolean") changes[key] = entered === "true";
        else if (typeof originalValue === "number") changes[key] = entered === "" ? null : Number(entered);
        else if (originalValue && typeof originalValue === "object") changes[key] = entered.trim() ? JSON.parse(entered) : null;
        else changes[key] = entered === "" ? null : entered;
      });
    } catch {
      setNotice("Un champ JSON n’est pas correctement formaté."); setBusyId(""); return;
    }
    const { data, error } = await supabase.rpc("super_admin_update_resource", { resource_type: resource, target_id: row.id, changes });
    if (error) setNotice(error.message);
    else {
      setAdvancedRows((items) => ({ ...items, [row.id]: data as Record<string, unknown> }));
      setNotice(`Tous les champs métier de « ${row.reference} » ont été enregistrés et journalisés.`);
    }
    setBusyId("");
  }
  async function remove(row: ControlRow) {
    const typed = window.prompt(`Suppression définitive et journalisée. Tapez exactement ${row.reference} pour confirmer.`);
    if (typed !== row.reference) { if (typed !== null) setNotice("Confirmation incorrecte : aucune suppression effectuée."); return; }
    setBusyId(row.id); setNotice("");
    const { error } = await supabase.rpc("super_admin_delete_resource", { resource_type: resource, target_id: row.id });
    setNotice(error ? `${error.message}. Supprimez d’abord les éléments enfants encore liés.` : `« ${row.reference} » a été supprimé et journalisé.`);
    setBusyId("");
  }

  const needsBody = hierarchyResources.has(resource);
  const needsProgram = ["project", "activity", "activity_task", "task_report"].includes(resource);
  const needsProject = ["activity", "activity_task", "task_report"].includes(resource);
  const needsActivity = ["activity_task", "task_report"].includes(resource);
  const ready = (!needsBody || bodyId) && (!needsProgram || programId) && (!needsProject || projectId) && (!needsActivity || activityId);

  return (
    <section className="operationsWorkspace superAdminDataCenter">
      <div className="portalPanel controlHero">
        <div>
          <p className="eyebrow">MFA obligatoire · actions journalisées</p>
          <h2>Contrôle des données par chaîne institutionnelle</h2>
          <p>
            Pour les programmes, projets, activités, tâches et rapports, la navigation suit désormais obligatoirement :
            <b> Organe → Programme → Projet → Activité → Tâche → Rapport</b>. Un niveau n’affiche jamais les données d’un autre parent.
          </p>
        </div>
      </div>
      {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice("")}>×</button></div>}

      <div className="operationNav controlResourceNav">
        {groups.map((group) => (
          <button key={group.id} className={resource === group.id ? "active" : ""} onClick={() => { setResource(group.id); setQuery(""); setAdvancedRows({}); }}>
            {group.label}
          </button>
        ))}
      </div>

      {needsBody && (
        <div className="portalPanel">
          <h3>Chemin de sélection</h3>
          <div className="compactForm">
            <label>
              1 · Organe
              <select value={bodyId} onChange={(e) => { setBodyId(e.target.value); clearAfter("body"); }}>
                <option value="">Choisir l’organe</option>
                {sortedBodies.map((x) => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}
              </select>
            </label>
            {needsProgram && <label>
              2 · Programme
              <select value={programId} disabled={!bodyId} onChange={(e) => { setProgramId(e.target.value); clearAfter("program"); }}>
                <option value="">Choisir le programme</option>
                {filteredPrograms.map((x) => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}
              </select>
            </label>}
            {needsProject && <label>
              3 · Projet
              <select value={projectId} disabled={!programId} onChange={(e) => { setProjectId(e.target.value); clearAfter("project"); }}>
                <option value="">Choisir le projet</option>
                {filteredProjects.map((x) => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}
              </select>
            </label>}
            {needsActivity && <label>
              4 · Activité
              <select value={activityId} disabled={!projectId} onChange={(e) => { clearAfter("activity"); void chooseActivity(e.target.value); }}>
                <option value="">Choisir l’activité</option>
                {filteredActivities.map((x) => <option key={x.id} value={x.id}>{x.code} · {x.title}</option>)}
              </select>
            </label>}
          </div>
          {!ready && <p className="privacyHint">Sélectionnez les niveaux dans l’ordre pour afficher uniquement les données appartenant à cette branche.</p>}
        </div>
      )}

      <div className="portalPanel">
        <div className="panelTitle">
          <div><h3>{current.label}</h3><p>{current.purpose}</p></div>
          <input value={query} onChange={(e) => setQuery(e.target.value)} disabled={needsBody && !ready} placeholder={`Rechercher dans ${current.label.toLowerCase()}`} />
        </div>
        {taskLoading ? <p>Chargement des tâches dans l’ordre…</p> : needsBody && !ready ? (
          <p>Aucune donnée chargée tant que le chemin requis n’est pas sélectionné.</p>
        ) : scopedRows.length === 0 ? <p>Aucun élément correspondant dans cette branche.</p> : scopedRows.map((row) => (
          <details className="workflowCard adminResourceCard" key={row.id}>
            <summary>
              <span>
                <b>{resource === "activity_task" && row.sequenceNo ? `${row.sequenceNo}. ` : ""}{row.reference} · {row.name}</b>
                <small>{row.status || "Sans statut"}</small>
              </span>
              <span>Consulter / modifier</span>
            </summary>
            <div className="workflowBody">
              <form className="operationForm" onSubmit={(event) => save(event, row)}>
                <label className="wideField">Nom ou titre<input name="name" defaultValue={row.name} required /></label>
                <label className="wideField">Description ou résumé<textarea name="description" defaultValue={row.description || ""} /></label>
                <label>Statut<input name="status" defaultValue={row.status || ""} /></label>
                <button disabled={busyId === row.id}>Enregistrer les modifications</button>
                <button type="button" className="dangerButton" disabled={busyId === row.id} onClick={() => void remove(row)}>Supprimer définitivement</button>
              </form>
              <div className="advancedAdminEditor">
                {!advancedRows[row.id] ? (
                  <button type="button" className="secondaryButton" disabled={advancedLoadingId === row.id} onClick={() => void loadAllFields(row)}>
                    {advancedLoadingId === row.id ? "Chargement…" : "Voir et modifier toutes les informations métier"}
                  </button>
                ) : (
                  <form className="advancedFieldsForm" onSubmit={(event) => saveAllFields(event, row)}>
                    <h4>Toutes les informations métier</h4>
                    <p>Les identifiants techniques, empreintes et fichiers physiques restent protégés. Tous les champs métier sont visibles ci-dessous.</p>
                    {Object.entries(advancedRows[row.id]).filter(([key]) => !technicalFields.has(key)).map(([key, value]) => (
                      <label key={key}>{key}{typeof value === "boolean" ? (
                        <select name={key} defaultValue={String(value)}><option value="true">Oui</option><option value="false">Non</option></select>
                      ) : typeof value === "number" ? (
                        <input name={key} type="number" defaultValue={value} />
                      ) : (
                        <textarea name={key} defaultValue={value && typeof value === "object" ? JSON.stringify(value, null, 2) : String(value ?? "")} />
                      )}</label>
                    ))}
                    <button disabled={busyId === row.id}>Enregistrer tous les champs</button>
                  </form>
                )}
              </div>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
