"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import RichHtmlEditor from "@/components/RichHtmlEditor";
import type {
  OperationBody,
  OperationProfile,
  PortfolioActivityRow,
  ProjectMemberRow,
  ProjectProgramRow,
  ProjectRow,
} from "@/components/OperationsPanel";
import styles from "./ProgramCycleManagementConsole.module.css";

type NodeType = "program" | "project" | "activity" | "task" | "report";
type SearchRow = {
  node_type: NodeType;
  id: string;
  code: string;
  label: string;
  status: string;
  parent_label: string;
  child_count: number | string;
  report_count: number | string;
  can_manage: boolean;
  can_delete: boolean;
  details: Record<string, unknown>;
};

type ReportEditRow = {
  id: string;
  report_number: string;
  reporter_id: string;
  status: string;
  report_type: string;
  title: string | null;
  execution_date: string;
  period_start: string | null;
  period_end: string | null;
  started_at: string | null;
  ended_at: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  summary: string;
  objectives: string | null;
  methodology: string | null;
  outcomes: string | null;
  challenges: string | null;
  recommendations: string | null;
  success_story: string | null;
  safeguarding_notes: string | null;
  rich_content_html: string;
  women_count: number;
  men_count: number;
  girls_count: number;
  boys_count: number;
  disability_count: number;
  vulnerable_count: number;
};

type Props = {
  profile: OperationProfile;
  programs: ProjectProgramRow[];
  projects: ProjectRow[];
  activities: PortfolioActivityRow[];
  projectMembers: ProjectMemberRow[];
  staffProfiles: OperationProfile[];
  bodies: OperationBody[];
};

const typeLabels: Record<NodeType, string> = {
  program: "Programme",
  project: "Projet",
  activity: "Activité",
  task: "Tâche",
  report: "Rapport",
};
const programStatuses = ["planned", "active", "on_hold", "completed", "cancelled"];
const projectStatuses = ["planned", "active", "on_hold", "completed", "cancelled"];
const activityStatuses = ["planned", "confirmed", "in_progress", "completed", "cancelled", "postponed"];
const taskStatuses = ["planned", "active", "completed", "cancelled"];
const activityTypes = ["meeting", "training", "workshop", "awareness", "field_visit", "distribution", "advocacy", "monitoring", "event", "other"];

function text(value: unknown) {
  return value === null || value === undefined ? "" : String(value);
}
function isoLocal(value: unknown) {
  if (!value) return "";
  const date = new Date(String(value));
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}
function formValue(data: FormData, name: string) {
  return String(data.get(name) ?? "").trim();
}

export default function ProgramCycleManagementConsole({
  profile,
  programs,
  projects,
  activities,
  projectMembers,
  staffProfiles,
  bodies,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const isSuperAdmin = profile.role === "super_admin";
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | NodeType>("all");
  const [rows, setRows] = useState<SearchRow[]>([]);
  const [selected, setSelected] = useState<SearchRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [reopenReason, setReopenReason] = useState("");
  const [localMembers, setLocalMembers] = useState(projectMembers);
  const [reportEdit, setReportEdit] = useState<ReportEditRow | null>(null);
  const [reportRichHtml, setReportRichHtml] = useState("");

  const profileNames = useMemo(
    () => Object.fromEntries([profile, ...staffProfiles].map((item) => [item.id, item.full_name || item.email || "Compte AIAC"])),
    [profile, staffProfiles],
  );

  const search = useCallback(async (nextQuery = query, nextType = typeFilter) => {
    setLoading(true);
    setError("");
    const { data, error: searchError } = await supabase.rpc("program_cycle_management_search", {
      search_text: nextQuery,
      target_type: nextType,
      result_limit: 120,
    });
    setLoading(false);
    if (searchError) {
      setError(searchError.message);
      return;
    }
    setRows((data || []) as SearchRow[]);
  }, [query, supabase, typeFilter]);

  useEffect(() => {
    void search("", "all");
  }, [search]);

  useEffect(() => {
    setDeleteReason("");
    setDeleteConfirmation("");
    setReopenReason("");
    setReportEdit(null);
    setReportRichHtml("");
    if (!selected || selected.node_type !== "report" || !selected.can_manage) return;
    let cancelled = false;
    void (async () => {
      const { data, error: reportError } = await supabase
        .from("task_reports")
        .select("id,report_number,reporter_id,status,report_type,title,execution_date,period_start,period_end,started_at,ended_at,location,latitude,longitude,summary,objectives,methodology,outcomes,challenges,recommendations,success_story,safeguarding_notes,rich_content_html,women_count,men_count,girls_count,boys_count,disability_count,vulnerable_count")
        .eq("id", selected.id)
        .single();
      if (cancelled) return;
      if (reportError || !data) {
        setError(reportError?.message || "Rapport inaccessible.");
        return;
      }
      setReportEdit(data as ReportEditRow);
      setReportRichHtml((data as ReportEditRow).rich_content_html || "");
    })();
    return () => { cancelled = true; };
  }, [selected, supabase]);

  async function runSearch(event: FormEvent) {
    event.preventDefault();
    await search();
  }

  function selectRow(row: SearchRow) {
    setSelected(row);
    setNotice("");
    setError("");
  }

  async function saveStructure(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || selected.node_type === "report") return;
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const patch: Record<string, unknown> = {};
    const include = (name: string) => { patch[name] = formValue(data, name); };

    if (selected.node_type === "program") {
      ["body_id", "code", "name", "description", "thematic_area", "manager_id", "status", "start_date", "end_date", "budget_amount"].forEach(include);
    } else if (selected.node_type === "project") {
      ["program_id", "code", "name", "description", "status", "location", "start_date", "end_date", "budget_amount"].forEach(include);
    } else if (selected.node_type === "activity") {
      ["project_id", "code", "title", "activity_type", "description", "status", "location", "starts_at", "ends_at", "expected_participants", "budget_amount", "manager_id"].forEach(include);
      if (patch.starts_at) patch.starts_at = new Date(String(patch.starts_at)).toISOString();
      if (patch.ends_at) patch.ends_at = new Date(String(patch.ends_at)).toISOString();
    } else if (selected.node_type === "task") {
      ["activity_id", "code", "title", "description", "expected_output", "sequence_no", "assigned_to", "due_date", "status"].forEach(include);
      patch.requires_evidence = data.get("requires_evidence") === "on";
      patch.requires_attendance = data.get("requires_attendance") === "on";
    }

    const { error: updateError } = await supabase.rpc("update_program_cycle_item", {
      target_type: selected.node_type,
      target_id: selected.id,
      p_patch: patch,
    });
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setNotice(`${typeLabels[selected.node_type]} modifié et journalisé.`);
    await search();
    router.refresh();
  }

  async function saveReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reportEdit || !selected) return;
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const patch: Record<string, unknown> = {
      report_type: formValue(data, "report_type"),
      title: formValue(data, "title"),
      execution_date: formValue(data, "execution_date"),
      period_start: formValue(data, "period_start"),
      period_end: formValue(data, "period_end"),
      started_at: formValue(data, "started_at") ? new Date(formValue(data, "started_at")).toISOString() : "",
      ended_at: formValue(data, "ended_at") ? new Date(formValue(data, "ended_at")).toISOString() : "",
      location: formValue(data, "location"),
      latitude: formValue(data, "latitude"),
      longitude: formValue(data, "longitude"),
      summary: formValue(data, "summary"),
      objectives: formValue(data, "objectives"),
      methodology: formValue(data, "methodology"),
      outcomes: formValue(data, "outcomes"),
      challenges: formValue(data, "challenges"),
      recommendations: formValue(data, "recommendations"),
      success_story: formValue(data, "success_story"),
      safeguarding_notes: formValue(data, "safeguarding_notes"),
      rich_content_html: reportRichHtml,
      women_count: Number(formValue(data, "women_count") || 0),
      men_count: Number(formValue(data, "men_count") || 0),
      girls_count: Number(formValue(data, "girls_count") || 0),
      boys_count: Number(formValue(data, "boys_count") || 0),
      disability_count: Number(formValue(data, "disability_count") || 0),
      vulnerable_count: Number(formValue(data, "vulnerable_count") || 0),
    };
    const { data: updated, error: updateError } = await supabase.rpc("update_editable_task_report_content", {
      target_report_id: selected.id,
      p_patch: patch,
    });
    setBusy(false);
    if (updateError || !updated) {
      setError(updateError?.message || "Modification impossible.");
      return;
    }
    setReportEdit(updated as ReportEditRow);
    setNotice("Rapport modifiable corrigé et trace d’audit enregistrée.");
    await search();
    router.refresh();
  }

  async function reopenReport() {
    if (!selected || selected.node_type !== "report") return;
    if (reopenReason.trim().length < 8) {
      setError("Indiquez un motif de réouverture d’au moins 8 caractères.");
      return;
    }
    setBusy(true);
    const { data, error: reopenError } = await supabase.rpc("superadmin_reopen_task_report", {
      target_report_id: selected.id,
      reason: reopenReason.trim(),
    });
    setBusy(false);
    if (reopenError || !data) {
      setError(reopenError?.message || "Réouverture impossible.");
      return;
    }
    setNotice("Rapport rouvert pour correction. La version signée précédente reste conservée dans l’historique.");
    await search();
    router.refresh();
  }

  async function deleteSelected() {
    if (!selected) return;
    if (deleteReason.trim().length < 8) {
      setError("Indiquez un motif de suppression d’au moins 8 caractères.");
      return;
    }
    setBusy(true);
    setError("");
    const { data, error: deleteError } = await supabase.rpc("superadmin_delete_program_cycle_item", {
      target_type: selected.node_type,
      target_id: selected.id,
      confirmation: deleteConfirmation.trim(),
      reason: deleteReason.trim(),
    });
    if (deleteError || !data) {
      setBusy(false);
      setError(deleteError?.message || "Suppression impossible.");
      return;
    }
    const result = data as { storage_paths?: unknown };
    const paths = Array.isArray(result.storage_paths)
      ? result.storage_paths.filter((item): item is string => typeof item === "string" && item.length > 0)
      : [];
    let cleanupWarning = "";
    if (paths.length) {
      const removed = await supabase.storage.from("aiac-task-reports").remove(paths);
      if (removed.error) cleanupWarning = ` Données supprimées, mais ${paths.length} fichier(s) doivent encore être purgés du stockage.`;
    }
    setBusy(false);
    setNotice(`Suppression administrative effectuée et journalisée.${cleanupWarning}`);
    setSelected(null);
    await search();
    router.refresh();
  }

  async function changeMemberRole(member: ProjectMemberRow, role: string) {
    setBusy(true);
    const { data, error: memberError } = await supabase
      .from("project_members")
      .update({ member_role: role })
      .eq("project_id", member.project_id)
      .eq("user_id", member.user_id)
      .select()
      .single();
    setBusy(false);
    if (memberError || !data) {
      setError(memberError?.message || "Modification du rôle impossible.");
      return;
    }
    setLocalMembers((items) => items.map((item) => item.project_id === member.project_id && item.user_id === member.user_id ? data as ProjectMemberRow : item));
    setNotice("Rôle du collaborateur modifié. La personne concernée a été notifiée.");
  }

  async function removeMember(member: ProjectMemberRow) {
    setBusy(true);
    const { error: memberError } = await supabase
      .from("project_members")
      .delete()
      .eq("project_id", member.project_id)
      .eq("user_id", member.user_id);
    setBusy(false);
    if (memberError) {
      setError(memberError.message);
      return;
    }
    setLocalMembers((items) => items.filter((item) => !(item.project_id === member.project_id && item.user_id === member.user_id)));
    setNotice("Collaborateur retiré du projet et notification générée.");
  }

  const selectedProjectMembers = selected?.node_type === "project"
    ? localMembers.filter((item) => item.project_id === selected.id)
    : [];
  const d = selected?.details || {};

  return (
    <section className={styles.console} id="administration-cycle-programmes">
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Recherche, correction et administration</p>
          <h2>Centre de gestion du cycle</h2>
          <p>Recherchez un code ou un intitulé dans toute la chaîne. Les boutons affichés dépendent des droits réels en base. Le super-administrateur MFA dispose des commandes exceptionnelles de réouverture et de suppression.</p>
        </div>
        {isSuperAdmin && <span className={styles.superBadge}>Super-admin · contrôle global</span>}
      </div>

      <form className={styles.searchBar} onSubmit={runSearch}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher code, programme, projet, activité, tâche ou rapport…" aria-label="Rechercher dans le cycle" />
        <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as "all" | NodeType)}>
          <option value="all">Tous les niveaux</option>
          {Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <button disabled={loading}>{loading ? "Recherche…" : "Rechercher"}</button>
      </form>

      {notice && <div className={styles.notice} role="status">{notice}</div>}
      {error && <div className={styles.error} role="alert">{error}</div>}

      <div className={styles.layout}>
        <div className={styles.results}>
          <div className={styles.resultHeader}><b>{rows.length} résultat(s)</b><span>120 maximum par recherche</span></div>
          {rows.map((row) => (
            <button key={`${row.node_type}-${row.id}`} type="button" className={`${styles.row} ${selected?.id === row.id ? styles.selected : ""}`} onClick={() => selectRow(row)}>
              <span className={styles.type}>{typeLabels[row.node_type]}</span>
              <span className={styles.rowText}><b>{row.code} · {row.label}</b><small>{row.parent_label} · {row.child_count} descendant(s) direct(s) · {row.report_count} rapport(s)</small></span>
              <span className={styles.status}>{row.status}</span>
            </button>
          ))}
          {!loading && rows.length === 0 && <p className={styles.empty}>Aucun résultat. Essayez un code court, un mot du titre ou choisissez un autre niveau.</p>}
        </div>

        <div className={styles.detail}>
          {!selected ? <div className={styles.empty}>Sélectionnez un élément pour afficher ses commandes.</div> : (
            <>
              <div className={styles.detailHeader}>
                <div><span className={styles.type}>{typeLabels[selected.node_type]}</span><h3>{selected.code} · {selected.label}</h3><p>{selected.parent_label}</p></div>
                <span className={styles.status}>{selected.status}</span>
              </div>

              {selected.node_type === "report" ? (
                <div className={styles.actions}>
                  <a href={`/espace/terrain/complet?report=${selected.id}`} className={styles.primary}>Ouvrir le rapport</a>
                  {isSuperAdmin && !["draft", "returned"].includes(selected.status) && (
                    <div className={styles.adminBox}>
                      <h4>Rouvrir pour correction</h4>
                      <p>La version signée et son empreinte restent conservées. Le rapport repasse à « À corriger ».</p>
                      <textarea value={reopenReason} onChange={(event) => setReopenReason(event.target.value)} placeholder="Motif administratif obligatoire" />
                      <button type="button" disabled={busy} onClick={reopenReport}>Rouvrir le rapport</button>
                    </div>
                  )}
                </div>
              ) : selected.can_manage ? (
                <form className={styles.editForm} key={`${selected.node_type}-${selected.id}`} onSubmit={saveStructure}>
                  {selected.node_type === "program" && <>
                    <label>Organe<select name="body_id" defaultValue={text(d.body_id)} disabled={!isSuperAdmin}>{bodies.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
                    <label>Code<input name="code" defaultValue={text(d.code)} required /></label><label>Nom<input name="name" defaultValue={text(d.name)} required /></label>
                    <label>État<select name="status" defaultValue={text(d.status)}>{programStatuses.map((value) => <option key={value}>{value}</option>)}</select></label>
                    <label>Responsable<select name="manager_id" defaultValue={text(d.manager_id)}><option value="">À définir</option>{staffProfiles.map((item) => <option key={item.id} value={item.id}>{item.full_name || item.email}</option>)}</select></label>
                    <label>Axe<input name="thematic_area" defaultValue={text(d.thematic_area)} /></label><label>Début<input name="start_date" type="date" defaultValue={text(d.start_date)} /></label><label>Fin<input name="end_date" type="date" defaultValue={text(d.end_date)} /></label><label>Budget XAF<input name="budget_amount" type="number" min="0" defaultValue={text(d.budget_amount)} /></label>
                    <label className={styles.wide}>Description<textarea name="description" defaultValue={text(d.description)} /></label>
                  </>}
                  {selected.node_type === "project" && <>
                    <label>Programme<select name="program_id" defaultValue={text(d.program_id)} disabled={!isSuperAdmin}>{programs.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
                    <label>Code<input name="code" defaultValue={text(d.code)} required /></label><label>Nom<input name="name" defaultValue={text(d.name)} required /></label>
                    <label>État<select name="status" defaultValue={text(d.status)}>{projectStatuses.map((value) => <option key={value}>{value}</option>)}</select></label><label>Zone<input name="location" defaultValue={text(d.location)} /></label>
                    <label>Début<input name="start_date" type="date" defaultValue={text(d.start_date)} /></label><label>Fin<input name="end_date" type="date" defaultValue={text(d.end_date)} /></label><label>Budget XAF<input name="budget_amount" type="number" min="0" defaultValue={text(d.budget_amount)} /></label>
                    <label className={styles.wide}>Description<textarea name="description" defaultValue={text(d.description)} /></label>
                  </>}
                  {selected.node_type === "activity" && <>
                    <label>Projet<select name="project_id" defaultValue={text(d.project_id)} disabled={!isSuperAdmin}>{projects.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
                    <label>Code<input name="code" defaultValue={text(d.code)} required /></label><label>Intitulé<input name="title" defaultValue={text(d.title)} required /></label>
                    <label>Type<select name="activity_type" defaultValue={text(d.activity_type)}>{activityTypes.map((value) => <option key={value}>{value}</option>)}</select></label><label>État<select name="status" defaultValue={text(d.status)}>{activityStatuses.map((value) => <option key={value}>{value}</option>)}</select></label>
                    <label>Responsable<select name="manager_id" defaultValue={text(d.manager_id)}><option value="">À définir</option>{staffProfiles.map((item) => <option key={item.id} value={item.id}>{item.full_name || item.email}</option>)}</select></label><label>Lieu<input name="location" defaultValue={text(d.location)} /></label>
                    <label>Début<input name="starts_at" type="datetime-local" defaultValue={isoLocal(d.starts_at)} required /></label><label>Fin<input name="ends_at" type="datetime-local" defaultValue={isoLocal(d.ends_at)} /></label><label>Participants attendus<input name="expected_participants" type="number" min="0" defaultValue={text(d.expected_participants)} /></label><label>Budget XAF<input name="budget_amount" type="number" min="0" defaultValue={text(d.budget_amount)} /></label>
                    <label className={styles.wide}>Description<textarea name="description" defaultValue={text(d.description)} /></label>
                  </>}
                  {selected.node_type === "task" && <>
                    <label>Activité<select name="activity_id" defaultValue={text(d.activity_id)} disabled={!isSuperAdmin}>{activities.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.title}</option>)}</select></label>
                    <label>Code<input name="code" defaultValue={text(d.code)} required /></label><label>Intitulé<input name="title" defaultValue={text(d.title)} required /></label><label>Ordre<input name="sequence_no" type="number" min="1" defaultValue={text(d.sequence_no)} required /></label>
                    <label>Responsable<select name="assigned_to" defaultValue={text(d.assigned_to)}><option value="">Équipe autorisée</option>{staffProfiles.map((item) => <option key={item.id} value={item.id}>{item.full_name || item.email}</option>)}</select></label><label>Échéance<input name="due_date" type="date" defaultValue={text(d.due_date)} /></label><label>État<select name="status" defaultValue={text(d.status)}>{taskStatuses.map((value) => <option key={value}>{value}</option>)}</select></label>
                    <label className={styles.check}><input name="requires_evidence" type="checkbox" defaultChecked={Boolean(d.requires_evidence)} /> Preuve obligatoire</label><label className={styles.check}><input name="requires_attendance" type="checkbox" defaultChecked={Boolean(d.requires_attendance)} /> Présence obligatoire</label>
                    <label className={styles.wide}>Description<textarea name="description" defaultValue={text(d.description)} /></label><label className={styles.wide}>Résultat attendu<textarea name="expected_output" defaultValue={text(d.expected_output)} /></label>
                  </>}
                  <button className={styles.primary} disabled={busy}>Enregistrer les modifications</button>
                </form>
              ) : <p className={styles.readOnly}>Vous pouvez consulter cet élément mais votre fonction ne vous autorise pas à le modifier.</p>}

              {selected.node_type === "report" && reportEdit && selected.can_manage && (
                <form className={styles.reportForm} onSubmit={saveReport}>
                  <h4>Correction du contenu du rapport</h4>
                  {reportEdit.reporter_id !== profile.id && <p className={styles.adminNotice}>Correction administrative : chaque changement sera attribué au super-administrateur dans l’historique.</p>}
                  <label>Type<input name="report_type" defaultValue={reportEdit.report_type} /></label><label>Titre<input name="title" defaultValue={reportEdit.title || ""} required /></label>
                  <label>Date de référence<input name="execution_date" type="date" defaultValue={reportEdit.execution_date} required /></label><label>Début période<input name="period_start" type="date" defaultValue={reportEdit.period_start || ""} /></label><label>Fin période<input name="period_end" type="date" defaultValue={reportEdit.period_end || ""} /></label>
                  <label>Début horaire<input name="started_at" type="datetime-local" defaultValue={isoLocal(reportEdit.started_at)} /></label><label>Fin horaire<input name="ended_at" type="datetime-local" defaultValue={isoLocal(reportEdit.ended_at)} /></label><label>Lieu<input name="location" defaultValue={reportEdit.location || ""} /></label><label>Latitude<input name="latitude" type="number" step="0.000001" defaultValue={reportEdit.latitude ?? ""} /></label><label>Longitude<input name="longitude" type="number" step="0.000001" defaultValue={reportEdit.longitude ?? ""} /></label>
                  <label className={styles.wide}>Résumé<textarea name="summary" defaultValue={reportEdit.summary} required /></label>
                  <div className={styles.wide}><b>Corps complet</b><RichHtmlEditor initialHtml={reportEdit.rich_content_html || ""} resetToken={`${reportEdit.id}-${reportEdit.status}`} onChange={setReportRichHtml} allowInlineImages htmlImportMode="editable" /></div>
                  {[["objectives","Objectifs"],["methodology","Méthodologie"],["outcomes","Résultats"],["challenges","Difficultés"],["recommendations","Recommandations"],["success_story","Histoire de réussite"],["safeguarding_notes","Note confidentielle"]].map(([name,label]) => <label className={styles.wide} key={name}>{label}<textarea name={name} defaultValue={text(reportEdit[name as keyof ReportEditRow])} /></label>)}
                  {[["women_count","Femmes"],["men_count","Hommes"],["girls_count","Filles"],["boys_count","Garçons"],["disability_count","Handicap"],["vulnerable_count","Vulnérabilité"]].map(([name,label]) => <label key={name}>{label}<input name={name} type="number" min="0" defaultValue={text(reportEdit[name as keyof ReportEditRow])} /></label>)}
                  <button className={styles.primary} disabled={busy}>Enregistrer la correction</button>
                </form>
              )}

              {selected.node_type === "project" && selected.can_manage && (
                <div className={styles.teamBox}>
                  <h4>Équipe du projet</h4>
                  {selectedProjectMembers.length === 0 ? <p>Aucun membre explicitement rattaché.</p> : selectedProjectMembers.map((member) => (
                    <div className={styles.member} key={`${member.project_id}-${member.user_id}`}>
                      <span><b>{profileNames[member.user_id] || member.user_id}</b><small>{member.member_role}</small></span>
                      <select value={member.member_role} disabled={busy} onChange={(event) => void changeMemberRole(member, event.target.value)}><option value="lead">Responsable</option><option value="officer">Agent</option><option value="contributor">Contributeur</option><option value="viewer">Observateur</option></select>
                      <button type="button" className={styles.dangerButton} disabled={busy} onClick={() => void removeMember(member)}>Retirer</button>
                    </div>
                  ))}
                </div>
              )}

              {isSuperAdmin && selected.can_delete && (
                <div className={styles.dangerZone}>
                  <h4>Suppression super-administrateur</h4>
                  <p>La suppression est bloquée tant que l’élément possède des descendants. Pour un rapport, les versions, signatures et événements sont retirés de la base après confirmation explicite et l’action est inscrite au journal d’audit.</p>
                  <label>Motif<textarea value={deleteReason} onChange={(event) => setDeleteReason(event.target.value)} placeholder="Pourquoi cette suppression est-elle nécessaire ?" /></label>
                  <label>Confirmation<input value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} placeholder={`Saisir exactement : ${selected.code}`} /></label>
                  <button type="button" className={styles.dangerButton} disabled={busy || deleteConfirmation !== selected.code} onClick={() => void deleteSelected()}>Supprimer définitivement</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
