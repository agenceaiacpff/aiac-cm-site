"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type BodyRow = { body_id: string; body_code: string; body_name: string };
type ProgramRow = { program_id: string; program_code: string; program_name: string; program_status: string };
type ProjectRow = { project_id: string; project_code: string; project_name: string; project_status: string };
type ActivityRow = { activity_id: string; activity_code: string; activity_title: string; activity_status: string };
type TaskRow = {
  task_id: string;
  activity_id: string;
  task_code: string;
  task_title: string;
  task_sequence_no: number;
  task_status: string;
};

type Indicator = {
  code?: string;
  label?: string;
  unit?: string;
  baseline?: number | null;
  target?: number | null;
  achieved?: number | null;
  verification_source?: string | null;
  notes?: string | null;
};

type ReportDatasetRow = {
  body_id: string;
  body_code: string;
  body_name: string;
  program_id: string;
  program_code: string;
  program_name: string;
  project_id: string;
  project_code: string;
  project_name: string;
  activity_id: string;
  activity_code: string;
  activity_title: string;
  task_id: string;
  task_code: string;
  task_title: string;
  task_sequence_no: number;
  report_id: string;
  report_number: string;
  report_title: string;
  report_status: string;
  execution_date: string;
  period_start: string | null;
  period_end: string | null;
  summary: string;
  outcomes: string | null;
  challenges: string | null;
  recommendations: string | null;
  women_count: number;
  men_count: number;
  girls_count: number;
  boys_count: number;
  disability_count: number;
  vulnerable_count: number;
  participant_total: number;
  indicators: Indicator[];
  approved_at: string | null;
};

type FullReport = {
  id: string;
  report_number: string;
  title: string | null;
  summary: string;
  status: string;
  execution_date: string;
  rich_content_html: string | null;
  reporter_id: string;
  reporter_signature_name: string | null;
  reporter_signature_asset_path: string | null;
  reporter_signed_at: string | null;
  current_hash: string | null;
};

type Approval = {
  actor_id: string;
  actor_name: string;
  actor_job_title: string | null;
  authority_name: string | null;
  decision: string;
  comment: string | null;
  signature_asset_path: string | null;
  signed_at: string;
  decision_reference: string | null;
  decision_date: string | null;
  mandate_reference: string | null;
  validation_reference: string | null;
};

const statusLabels: Record<string, string> = {
  draft: "Brouillon",
  submitted: "Soumis",
  returned: "Retourné",
  approved: "Approuvé",
  archived: "Archivé",
};

function esc(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char] || char);
}

function sanitizeStoredHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object[\s\S]*?<\/object>/gi, "")
    .replace(/<embed[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "");
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

function printShell(title: string, body: string) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    @page{size:A4;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#17202a;background:#eef3ef;margin:0;padding:20px;line-height:1.48}.printbar{position:sticky;top:0;z-index:5;background:#fff;border:1px solid #ccd8d0;border-radius:10px;padding:10px;margin:0 auto 15px;max-width:1000px;display:flex;gap:8px}.printbar button{padding:9px 14px;font-weight:700;cursor:pointer}.page{background:#fff;max-width:1000px;margin:auto;padding:24px 34px;box-shadow:0 2px 14px #0002}.letterhead{width:100%;max-height:190px;object-fit:contain}.docmeta{display:flex;justify-content:space-between;gap:18px;margin:15px 0}.right{text-align:right}h1{text-align:center;text-transform:uppercase;font-size:22px}h2{font-size:17px;margin-top:24px;color:#174f35;border-bottom:1px solid #cddbd2;padding-bottom:5px}.subtitle{text-align:center;font-weight:700}.statusline{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin:12px 0}.badge{border:1px solid #52645b;border-radius:999px;padding:5px 9px;font-size:11px;font-weight:700}.ok{background:#edf7f0}.taskbox,.note,.validation,.approvalCertificate{border:1px solid #aebfb5;padding:12px;margin:14px 0;border-radius:7px}.grid4{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}.metric{border:1px solid #cbd8d0;padding:10px;text-align:center}.metric strong{display:block;font-size:20px}table{border-collapse:collapse;width:100%;margin:12px 0}th,td{border:1px solid #aeb9b2;padding:7px;text-align:left;vertical-align:top}.check{font-weight:700}.signatureGrid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:18px}.signatureBlock{text-align:center;border-top:1px solid #cfd8d2;padding-top:10px}.signatureBlock img{max-width:260px;max-height:150px;object-fit:contain}.metaGrid{display:grid;grid-template-columns:1fr 1fr;gap:8px 18px}.muted{color:#5d6a63}.toolbar{display:none!important}@media print{body{background:#fff;padding:0}.printbar{display:none}.page{box-shadow:none;max-width:none;padding:0}.approvalCertificate{break-inside:avoid}}@media(max-width:700px){.grid4,.signatureGrid,.metaGrid{grid-template-columns:1fr}.docmeta{display:block}.right{text-align:left}}
  </style></head><body><div class="printbar"><button onclick="window.print()">Imprimer / Enregistrer en PDF</button><button onclick="window.close()">Fermer</button></div>${body}</body></html>`;
}

export default function InstitutionalReportsCenter() {
  const supabase = useMemo(() => createClient(), []);
  const [bodies, setBodies] = useState<BodyRow[]>([]);
  const [programs, setPrograms] = useState<ProgramRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [bodyId, setBodyId] = useState("");
  const [programId, setProgramId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [activityId, setActivityId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<ReportDatasetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyReport, setBusyReport] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      setLoading(true);
      const [{ data: bodyRows }, { data: reportRows, error }] = await Promise.all([
        supabase.rpc("institutional_reporting_bodies"),
        supabase.rpc("institutional_reporting_dataset", {
          target_body_id: null,
          target_program_id: null,
          target_project_id: null,
          target_activity_id: null,
          target_task_id: null,
          period_from: null,
          period_to: null,
          include_non_approved: true,
        }),
      ]);
      if (cancelled) return;
      setBodies((bodyRows || []) as BodyRow[]);
      if (error) setNotice(error.message);
      else setRows((reportRows || []) as ReportDatasetRow[]);
      setLoading(false);
    }
    void initialize();
    return () => { cancelled = true; };
  }, [supabase]);

  async function chooseBody(value: string) {
    setBodyId(value); setProgramId(""); setProjectId(""); setActivityId(""); setTaskId("");
    setPrograms([]); setProjects([]); setActivities([]); setTasks([]);
    if (!value) return;
    const { data, error } = await supabase.rpc("institutional_reporting_programs", { target_body_id: value });
    if (error) setNotice(error.message); else setPrograms((data || []) as ProgramRow[]);
  }

  async function chooseProgram(value: string) {
    setProgramId(value); setProjectId(""); setActivityId(""); setTaskId("");
    setProjects([]); setActivities([]); setTasks([]);
    if (!value) return;
    const { data, error } = await supabase.rpc("institutional_reporting_projects", { target_program_id: value });
    if (error) setNotice(error.message); else setProjects((data || []) as ProjectRow[]);
  }

  async function chooseProject(value: string) {
    setProjectId(value); setActivityId(""); setTaskId(""); setActivities([]); setTasks([]);
    if (!value) return;
    const { data, error } = await supabase.rpc("institutional_reporting_activities", { target_project_id: value });
    if (error) setNotice(error.message); else setActivities((data || []) as ActivityRow[]);
  }

  async function chooseActivity(value: string) {
    setActivityId(value); setTaskId(""); setTasks([]);
    if (!value) return;
    const { data, error } = await supabase.rpc("institutional_reporting_tasks", { target_activity_id: value });
    if (error) setNotice(error.message); else setTasks((data || []) as TaskRow[]);
  }

  async function loadReports(includeNonApproved = true) {
    setLoading(true); setNotice("");
    const { data, error } = await supabase.rpc("institutional_reporting_dataset", {
      target_body_id: bodyId || null,
      target_program_id: programId || null,
      target_project_id: projectId || null,
      target_activity_id: activityId || null,
      target_task_id: taskId || null,
      period_from: periodFrom || null,
      period_to: periodTo || null,
      include_non_approved: includeNonApproved,
    });
    if (error) setNotice(error.message); else setRows((data || []) as ReportDatasetRow[]);
    setLoading(false);
    return error ? [] : ((data || []) as ReportDatasetRow[]);
  }

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("fr");
    return rows.filter((row) => {
      if (statusFilter !== "all" && row.report_status !== statusFilter) return false;
      if (!needle) return true;
      return [row.report_number,row.report_title,row.summary,row.program_code,row.program_name,row.project_code,row.project_name,row.activity_code,row.activity_title,row.task_code,row.task_title]
        .some((value) => String(value || "").toLocaleLowerCase("fr").includes(needle));
    });
  }, [query, rows, statusFilter]);

  const selectedBody = bodies.find((item) => item.body_id === bodyId);
  const selectedProgram = programs.find((item) => item.program_id === programId);
  const selectedProject = projects.find((item) => item.project_id === projectId);
  const selectedActivity = activities.find((item) => item.activity_id === activityId);
  const selectedTask = tasks.find((item) => item.task_id === taskId);

  function scopeLabel() {
    if (selectedTask) return `Tâche ${selectedTask.task_sequence_no} · ${selectedTask.task_code} · ${selectedTask.task_title}`;
    if (selectedActivity) return `Activité ${selectedActivity.activity_code} · ${selectedActivity.activity_title}`;
    if (selectedProject) return `Projet ${selectedProject.project_code} · ${selectedProject.project_name}`;
    if (selectedProgram) return `Programme ${selectedProgram.program_code} · ${selectedProgram.program_name}`;
    if (selectedBody) return `Organe ${selectedBody.body_code} · ${selectedBody.body_name}`;
    return "Ensemble des rapports institutionnels accessibles";
  }

  function scopeType() {
    if (selectedTask) return "TÂCHE";
    if (selectedActivity) return "ACTIVITÉ";
    if (selectedProject) return "PROJET";
    if (selectedProgram) return "PROGRAMME";
    if (selectedBody) return "ORGANE";
    return "INSTITUTION";
  }

  async function signedUrl(path: string | null | undefined) {
    if (!path) return "";
    const { data } = await supabase.storage.from("aiac-signatures").createSignedUrl(path, 900);
    return data?.signedUrl || "";
  }

  async function individualHtml(reportId: string) {
    const [{ data: reportData, error: reportError }, { data: approvalRows, error: approvalError }] = await Promise.all([
      supabase.from("task_reports").select("*").eq("id", reportId).single(),
      supabase.from("task_report_approvals").select("*").eq("report_id", reportId).order("created_at", { ascending: false }).limit(1),
    ]);
    if (reportError) throw new Error(reportError.message);
    if (approvalError) throw new Error(approvalError.message);
    const report = reportData as FullReport;
    const approval = ((approvalRows || [])[0] || null) as Approval | null;
    const [reporterSignature, reviewerSignature] = await Promise.all([
      signedUrl(report.reporter_signature_asset_path),
      signedUrl(approval?.signature_asset_path),
    ]);
    const validation = approval ? `<section class="approvalCertificate"><h2>Validation institutionnelle</h2><div class="metaGrid"><div><b>Autorité de validation :</b><br>${esc(approval.authority_name || "Conseil d’administration")}</div><div><b>Référence de validation :</b><br>${esc(approval.validation_reference || approval.decision_reference || "—")}</div><div><b>Décision enregistrée par :</b><br>${esc(approval.actor_name)}</div><div><b>Qualité :</b><br>${esc(approval.actor_job_title || "Membre habilité")}</div><div><b>Date de décision :</b><br>${esc(fmtDate(approval.decision_date || approval.signed_at))}</div><div><b>PV d’habilitation :</b><br>${esc(approval.mandate_reference || "—")}</div></div>${approval.comment ? `<p><b>Observation :</b> ${esc(approval.comment)}</p>` : ""}<div class="signatureGrid"><div class="signatureBlock"><b>Rapport signé par</b><br>${esc(report.reporter_signature_name || "Auteur du rapport")}<br>${reporterSignature ? `<img src="${esc(reporterSignature)}" alt="Signature de l’auteur">` : "<p class=\"muted\">Signature enregistrée dans le dossier numérique.</p>"}<div>${esc(fmtDate(report.reporter_signed_at))}</div></div><div class="signatureBlock"><b>Décision du Conseil d’administration enregistrée par</b><br>${esc(approval.actor_name)}<br>${reviewerSignature ? `<img src="${esc(reviewerSignature)}" alt="Signature du membre habilité">` : "<p class=\"muted\">Signature enregistrée dans le dossier numérique.</p>"}<div>${esc(fmtDate(approval.signed_at))}</div></div></div><p class="muted"><b>Empreinte du rapport validé :</b> ${esc(report.current_hash || "—")}</p></section>` : `<section class="approvalCertificate"><h2>Statut du dossier</h2><p>Ce rapport n’a pas encore de décision d’approbation enregistrée.</p></section>`;
    const stored = report.rich_content_html?.trim()
      ? sanitizeStoredHtml(report.rich_content_html)
      : `<main class="page"><h1>${esc(report.title || report.report_number)}</h1><p><b>Rapport :</b> ${esc(report.report_number)}</p><p><b>Date :</b> ${esc(fmtDate(report.execution_date))}</p><h2>Résumé</h2><p>${esc(report.summary)}</p></main>`;
    const body = stored.includes("class=\"page\"")
      ? stored.replace(/<\/main>\s*$/i, `${validation}</main>`)
      : `<main class="page">${stored}${validation}</main>`;
    return { title: report.report_number, html: printShell(report.report_number, body) };
  }

  async function openIndividual(reportId: string, autoPrint: boolean) {
    setBusyReport(reportId); setNotice("");
    try {
      const result = await individualHtml(reportId);
      const popup = window.open("", "_blank", "noopener,noreferrer");
      if (!popup) throw new Error("Le navigateur a bloqué la fenêtre d’impression. Autorisez les fenêtres contextuelles pour ce site.");
      popup.document.open(); popup.document.write(result.html); popup.document.close();
      if (autoPrint) window.setTimeout(() => popup.print(), 700);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Impossible d’ouvrir le rapport.");
    }
    setBusyReport("");
  }

  async function downloadIndividualWord(reportId: string) {
    setBusyReport(reportId); setNotice("");
    try {
      const result = await individualHtml(reportId);
      const blob = new Blob([result.html], { type: "application/msword;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `${result.title}.doc`; anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Impossible de générer le document Word.");
    }
    setBusyReport("");
  }

  function consolidatedHtml(approvedRows: ReportDatasetRow[]) {
    const participants = approvedRows.reduce((sum, row) => sum + Number(row.participant_total || 0), 0);
    const projectCount = new Set(approvedRows.map((row) => row.project_id)).size;
    const activityCount = new Set(approvedRows.map((row) => row.activity_id)).size;
    const taskCount = new Set(approvedRows.map((row) => row.task_id)).size;
    const indicatorMap = new Map<string, { code: string; label: string; unit: string; target: number; achieved: number }>();
    approvedRows.forEach((row) => (Array.isArray(row.indicators) ? row.indicators : []).forEach((indicator) => {
      const code = String(indicator.code || "IND");
      const unit = String(indicator.unit || "");
      const key = `${code}::${unit}`;
      const current = indicatorMap.get(key) || { code, label: String(indicator.label || code), unit, target: 0, achieved: 0 };
      current.target += Number(indicator.target || 0);
      current.achieved += Number(indicator.achieved || 0);
      indicatorMap.set(key, current);
    }));
    const indicators = Array.from(indicatorMap.values());
    const period = periodFrom || periodTo ? `${periodFrom || "Début"} au ${periodTo || "Aujourd’hui"}` : "Toutes les périodes disponibles";
    const detailRows = approvedRows.map((row) => `<tr><td><b>${esc(row.report_number)}</b><br>${esc(fmtDate(row.execution_date))}</td><td>${esc(row.program_code)}<br>${esc(row.project_code)}<br>${esc(row.activity_code)}<br>${esc(row.task_code)}</td><td>${esc(row.summary)}${row.outcomes ? `<br><b>Résultats :</b> ${esc(row.outcomes)}` : ""}${row.challenges ? `<br><b>Difficultés :</b> ${esc(row.challenges)}` : ""}${row.recommendations ? `<br><b>Recommandations :</b> ${esc(row.recommendations)}` : ""}</td></tr>`).join("");
    const indicatorTable = indicators.length ? `<h2>Indicateurs consolidés</h2><table><thead><tr><th>Code</th><th>Indicateur</th><th>Unité</th><th>Cible cumulée</th><th>Réalisé cumulé</th></tr></thead><tbody>${indicators.map((item) => `<tr><td>${esc(item.code)}</td><td>${esc(item.label)}</td><td>${esc(item.unit)}</td><td>${item.target}</td><td>${item.achieved}</td></tr>`).join("")}</tbody></table>` : "";
    const content = `<main class="page"><h1>Rapport consolidé de ${esc(scopeType().toLowerCase())}</h1><div class="subtitle">${esc(scopeLabel())}</div><p style="text-align:center"><b>Période :</b> ${esc(period)}</p><div class="grid4"><div class="metric"><strong>${approvedRows.length}</strong><span>rapports approuvés</span></div><div class="metric"><strong>${projectCount}</strong><span>projets documentés</span></div><div class="metric"><strong>${activityCount}</strong><span>activités documentées</span></div><div class="metric"><strong>${taskCount}</strong><span>tâches documentées</span></div><div class="metric"><strong>${participants}</strong><span>participations déclarées</span></div></div>${indicatorTable}<h2>Rapports sources approuvés</h2><table><thead><tr><th>Rapport / date</th><th>Chaîne programme → tâche</th><th>Synthèse</th></tr></thead><tbody>${detailRows}</tbody></table><div class="note"><b>Traçabilité :</b> cette consolidation est générée uniquement à partir des rapports approuvés présents dans le système AIAC au moment de l’édition.</div></main>`;
    return printShell(`Rapport consolidé - ${scopeType()}`, content);
  }

  async function generateConsolidated(format: "print" | "word") {
    const approvedRows = await loadReports(false);
    if (!approvedRows.length) {
      setNotice("Aucun rapport approuvé n’alimente encore ce niveau pour la période sélectionnée.");
      return;
    }
    const html = consolidatedHtml(approvedRows);
    if (format === "print") {
      const popup = window.open("", "_blank", "noopener,noreferrer");
      if (!popup) { setNotice("Le navigateur a bloqué la fenêtre d’impression."); return; }
      popup.document.open(); popup.document.write(html); popup.document.close();
      window.setTimeout(() => popup.print(), 700);
      return;
    }
    const blob = new Blob([html], { type: "application/msword;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `AIAC_Rapport_${scopeType()}_${new Date().toISOString().slice(0,10)}.doc`;
    anchor.click(); URL.revokeObjectURL(url);
  }

  return (
    <section id="centre-rapports" className="portalPanel">
      <div className="panelTitle">
        <div>
          <p className="eyebrow">Pilotage institutionnel</p>
          <h2>Centre des rapports</h2>
          <p>Consultez tous les rapports auxquels votre fonction donne accès, imprimez le rapport validé et produisez des consolidations par organe, programme, projet, activité ou tâche.</p>
        </div>
        <span className="operationBadge approved">{rows.filter((row) => row.report_status === "approved").length} approuvé(s)</span>
      </div>

      {notice && <div className="notice" role="status">{notice}</div>}

      <div className="operationForm fieldReportForm">
        <label>Organe<select value={bodyId} onChange={(event) => void chooseBody(event.target.value)}><option value="">Tous les organes</option>{bodies.map((item) => <option key={item.body_id} value={item.body_id}>{item.body_code} · {item.body_name}</option>)}</select></label>
        <label>Programme<select value={programId} disabled={!bodyId} onChange={(event) => void chooseProgram(event.target.value)}><option value="">Tous les programmes</option>{programs.map((item) => <option key={item.program_id} value={item.program_id}>{item.program_code} · {item.program_name}</option>)}</select></label>
        <label>Projet<select value={projectId} disabled={!programId} onChange={(event) => void chooseProject(event.target.value)}><option value="">Tous les projets</option>{projects.map((item) => <option key={item.project_id} value={item.project_id}>{item.project_code} · {item.project_name}</option>)}</select></label>
        <label>Activité<select value={activityId} disabled={!projectId} onChange={(event) => void chooseActivity(event.target.value)}><option value="">Toutes les activités</option>{activities.map((item) => <option key={item.activity_id} value={item.activity_id}>{item.activity_code} · {item.activity_title}</option>)}</select></label>
        <label className="wideField">Tâche<select value={taskId} disabled={!activityId} onChange={(event) => setTaskId(event.target.value)}><option value="">Toutes les tâches</option>{tasks.map((item) => <option key={item.task_id} value={item.task_id}>Tâche {item.task_sequence_no} · {item.task_code} · {item.task_title}</option>)}</select></label>
        <label>Du<input type="date" value={periodFrom} onChange={(event) => setPeriodFrom(event.target.value)} /></label>
        <label>Au<input type="date" value={periodTo} onChange={(event) => setPeriodTo(event.target.value)} /></label>
        <label>Statut<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Tous les statuts</option><option value="approved">Approuvés</option><option value="submitted">Soumis</option><option value="returned">Retournés</option><option value="draft">Brouillons</option></select></label>
        <label className="wideField">Rechercher<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Numéro, programme, projet, activité, tâche, contenu…" /></label>
      </div>

      <div className="reportActions exportActions">
        <button type="button" disabled={loading} onClick={() => void loadReports(true)}>{loading ? "Chargement…" : "Afficher les rapports"}</button>
        <button type="button" disabled={loading} onClick={() => void generateConsolidated("print")}>Générer / Imprimer rapport {scopeType().toLowerCase()}</button>
        <button type="button" disabled={loading} onClick={() => void generateConsolidated("word")}>Rapport {scopeType().toLowerCase()} Word</button>
      </div>
      <p className="evidencePolicyHint"><b>Niveau de consolidation :</b> {scopeLabel()}</p>

      <div className="statGrid operationStats">
        <article><b>{filteredRows.length}</b><span>rapports affichés</span></article>
        <article><b>{filteredRows.filter((row) => row.report_status === "approved").length}</b><span>approuvés</span></article>
        <article><b>{new Set(filteredRows.map((row) => row.project_id)).size}</b><span>projets couverts</span></article>
        <article><b>{new Set(filteredRows.map((row) => row.task_id)).size}</b><span>tâches documentées</span></article>
      </div>

      <div className="reportSubsection">
        <h3>Registre des rapports accessibles</h3>
        {loading && <p>Chargement du registre…</p>}
        {!loading && !filteredRows.length && <p>Aucun rapport ne correspond à cette sélection.</p>}
        {!loading && filteredRows.map((row) => (
          <article className="reviewCard" key={row.report_id}>
            <div className="panelTitle"><div><h3>{row.report_number}</h3><p>{row.report_title}</p></div><span className={`operationBadge ${row.report_status}`}>{statusLabels[row.report_status] || row.report_status}</span></div>
            <p><b>Chaîne :</b> {row.program_code} → {row.project_code} → {row.activity_code} → {row.task_code}</p>
            <p><b>Date d’exécution :</b> {fmtDate(row.execution_date)}{row.approved_at ? <> · <b>Approuvé le :</b> {fmtDate(row.approved_at)}</> : null}</p>
            <p>{row.summary}</p>
            <div className="reportActions">
              <button type="button" disabled={busyReport === row.report_id} onClick={() => void openIndividual(row.report_id, false)}>Voir le rapport</button>
              <button type="button" disabled={busyReport === row.report_id} onClick={() => void openIndividual(row.report_id, true)}>Imprimer / PDF</button>
              <button type="button" disabled={busyReport === row.report_id} onClick={() => void downloadIndividualWord(row.report_id)}>Word</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
