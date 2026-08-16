"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import FieldReportingPanel, {
  type ActivityTaskCountRow,
  type ActivityTaskRow,
  type TaskReportApprovalRow,
  type TaskReportAttendanceRow,
  type TaskReportEventRow,
  type TaskReportEvidenceRow,
  type TaskReportIndicatorRow,
  type TaskReportRow,
} from "@/components/FieldReportingPanel";
import type {
  OperationBody,
  OperationProfile,
  PortfolioActivityRow,
  ProjectMemberRow,
  ProjectProgramRow,
  ProjectRow,
} from "@/components/OperationsPanel";
import type { InstitutionalSignatureAsset } from "@/lib/institutional-signatures";

const collator = new Intl.Collator("fr", { numeric: true, sensitivity: "base" });

function byCode<T extends { code: string }>(a: T, b: T) {
  return collator.compare(a.code || "", b.code || "");
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ] || char,
  );
}

function cleanFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

type ReportingDatasetRow = {
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
  indicators: Array<{
    code?: string;
    label?: string;
    unit?: string;
    baseline?: number | null;
    target?: number | null;
    achieved?: number | null;
    verification_source?: string | null;
    notes?: string | null;
  }>;
  approved_at: string | null;
};

type Props = {
  profile: OperationProfile;
  programs: ProjectProgramRow[];
  projects: ProjectRow[];
  activities: PortfolioActivityRow[];
  projectMembers: ProjectMemberRow[];
  staffProfiles: OperationProfile[];
  bodies: OperationBody[];
  workforceAssignments: Array<{ profile_id: string | null; body_id: string | null; status: string }>;
  positionAssignments: Array<{ profile_id: string | null; body_id: string; status: string }>;
  institutionalMembers: Array<{ id: string; profile_id: string | null; status: string }>;
  bodyMemberships: Array<{ body_id: string; member_id: string; status: string }>;
  initialActivityTasks: ActivityTaskRow[];
  initialActivityTaskCounts: ActivityTaskCountRow[];
  initialTaskReports: TaskReportRow[];
  initialEvidence: TaskReportEvidenceRow[];
  initialAttendance: TaskReportAttendanceRow[];
  initialIndicators: TaskReportIndicatorRow[];
  initialApprovals: TaskReportApprovalRow[];
  initialEvents: TaskReportEventRow[];
  institutionalSignatureAssets: InstitutionalSignatureAsset[];
};

export default function HierarchicalProgramCycle(props: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [bodyId, setBodyId] = useState("");
  const [programId, setProgramId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [activityId, setActivityId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [activityTasks, setActivityTasks] = useState<ActivityTaskRow[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [dataset, setDataset] = useState<ReportingDatasetRow[]>([]);
  const [datasetLoaded, setDatasetLoaded] = useState(false);
  const [loadingDataset, setLoadingDataset] = useState(false);
  const [notice, setNotice] = useState("");

  const bodies = useMemo(
    () =>
      props.bodies
        .filter((item) => item.status === "active")
        .slice()
        .sort((a, b) => {
          const aSubsidiary = a.deployment_level === "subsidiary" ? 0 : 1;
          const bSubsidiary = b.deployment_level === "subsidiary" ? 0 : 1;
          return aSubsidiary - bSubsidiary || byCode(a, b);
        }),
    [props.bodies],
  );
  const programs = useMemo(
    () => props.programs.filter((item) => item.body_id === bodyId).slice().sort(byCode),
    [bodyId, props.programs],
  );
  const projects = useMemo(
    () => props.projects.filter((item) => item.program_id === programId).slice().sort(byCode),
    [programId, props.projects],
  );
  const activities = useMemo(
    () => props.activities.filter((item) => item.project_id === projectId).slice().sort(byCode),
    [projectId, props.activities],
  );

  const selectedBody = bodies.find((item) => item.id === bodyId);
  const selectedProgram = programs.find((item) => item.id === programId);
  const selectedProject = projects.find((item) => item.id === projectId);
  const selectedActivity = activities.find((item) => item.id === activityId);
  const selectedTask = activityTasks.find((item) => item.id === taskId);

  function resetReportingDataset() {
    setDataset([]);
    setDatasetLoaded(false);
    setTaskId("");
  }

  async function chooseActivity(value: string) {
    setActivityId(value);
    setTaskId("");
    setActivityTasks([]);
    setDataset([]);
    setDatasetLoaded(false);
    if (!value) return;
    setLoadingTasks(true);
    const { data, error } = await supabase
      .from("activity_tasks")
      .select("*")
      .eq("activity_id", value)
      .order("sequence_no", { ascending: true })
      .order("code", { ascending: true })
      .limit(2000);
    setLoadingTasks(false);
    if (error) {
      setNotice(error.message);
      return;
    }
    setActivityTasks((data || []) as ActivityTaskRow[]);
  }

  const reportLinkedTaskIds = useMemo(() => {
    const ids = new Set<string>();
    for (const task of props.initialActivityTasks) {
      if (!activityId || task.activity_id === activityId) ids.add(task.id);
    }
    return ids;
  }, [activityId, props.initialActivityTasks]);

  const scopedPrograms = programId ? props.programs.filter((item) => item.id === programId) : [];
  const scopedProjects = projectId ? props.projects.filter((item) => item.id === projectId) : [];
  const scopedActivities = activityId ? props.activities.filter((item) => item.id === activityId) : [];
  const scopedMembers = projectId
    ? props.projectMembers.filter((item) => item.project_id === projectId)
    : [];
  const scopedTasks = props.initialActivityTasks.filter(
    (item) => activityId && item.activity_id === activityId,
  );
  const scopedTaskCounts = props.initialActivityTaskCounts.filter(
    (item) => !activityId || item.activity_id === activityId,
  );
  const scopedReports = props.initialTaskReports.filter(
    (item) => reportLinkedTaskIds.has(item.task_id) && (!taskId || item.task_id === taskId),
  );
  const reportIds = new Set(scopedReports.map((item) => item.id));

  async function loadConsolidation() {
    if (!bodyId) {
      setNotice("Choisissez d’abord l’organe à consolider.");
      return;
    }
    setLoadingDataset(true);
    setNotice("");
    const { data, error } = await supabase.rpc("institutional_reporting_dataset", {
      target_body_id: bodyId || null,
      target_program_id: programId || null,
      target_project_id: projectId || null,
      target_activity_id: activityId || null,
      target_task_id: taskId || null,
      period_from: periodFrom || null,
      period_to: periodTo || null,
      include_non_approved: false,
    });
    setLoadingDataset(false);
    setDatasetLoaded(true);
    if (error) {
      setDataset([]);
      setNotice(error.message);
      return;
    }
    setDataset((data || []) as ReportingDatasetRow[]);
    setNotice(
      (data || []).length
        ? `${(data || []).length} rapport(s) approuvé(s) intégrés à la consolidation.`
        : "Aucun rapport approuvé ne correspond à cette sélection et à cette période.",
    );
  }

  const totals = useMemo(
    () =>
      dataset.reduce(
        (acc, row) => {
          acc.women += Number(row.women_count || 0);
          acc.men += Number(row.men_count || 0);
          acc.girls += Number(row.girls_count || 0);
          acc.boys += Number(row.boys_count || 0);
          acc.disability += Number(row.disability_count || 0);
          acc.vulnerable += Number(row.vulnerable_count || 0);
          acc.participants += Number(row.participant_total || 0);
          return acc;
        },
        { women: 0, men: 0, girls: 0, boys: 0, disability: 0, vulnerable: 0, participants: 0 },
      ),
    [dataset],
  );

  const indicatorTotals = useMemo(() => {
    const map = new Map<string, { code: string; label: string; unit: string; achieved: number; target: number }>();
    for (const row of dataset) {
      for (const indicator of Array.isArray(row.indicators) ? row.indicators : []) {
        const code = String(indicator.code || "IND");
        const unit = String(indicator.unit || "");
        const key = `${code}::${unit}`;
        const current = map.get(key) || {
          code,
          label: String(indicator.label || code),
          unit,
          achieved: 0,
          target: 0,
        };
        current.achieved += Number(indicator.achieved || 0);
        current.target += Number(indicator.target || 0);
        map.set(key, current);
      }
    }
    return Array.from(map.values()).sort((a, b) => collator.compare(a.code, b.code));
  }, [dataset]);

  function hierarchyTitle() {
    return [
      selectedBody && `${selectedBody.code} · ${selectedBody.name}`,
      selectedProgram && `${selectedProgram.code} · ${selectedProgram.name}`,
      selectedProject && `${selectedProject.code} · ${selectedProject.name}`,
      selectedActivity && `${selectedActivity.code} · ${selectedActivity.title}`,
      selectedTask && `Tâche ${selectedTask.sequence_no} · ${selectedTask.code} · ${selectedTask.title}`,
    ]
      .filter(Boolean)
      .join(" → ");
  }

  function consolidatedHtml() {
    const uniqueProjects = new Set(dataset.map((row) => row.project_id)).size;
    const uniqueActivities = new Set(dataset.map((row) => row.activity_id)).size;
    const uniqueTasks = new Set(dataset.map((row) => row.task_id)).size;
    const period = periodFrom || periodTo ? `${periodFrom || "Début"} au ${periodTo || "Aujourd’hui"}` : "Toutes les périodes approuvées";
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Consolidation AIAC</title><style>body{font:14px/1.55 Arial,sans-serif;color:#17202a;max-width:1000px;margin:auto;padding:32px}header{text-align:center;border-bottom:3px solid #0b6b3a;padding-bottom:16px}h1,h2{color:#0b6b3a}table{border-collapse:collapse;width:100%;margin:14px 0}th,td{border:1px solid #aab8b0;padding:7px;text-align:left;vertical-align:top}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.stats div{border:1px solid #cbd8d0;padding:10px}.muted{color:#52645b}@media print{.export{display:none}body{padding:0}}</style></head><body><header><b>AGENCE D’INTERVENTION ET D’ACTION COMMUNAUTAIRE — AIAC</b><h1>RAPPORT CONSOLIDÉ</h1><p>${escapeHtml(hierarchyTitle())}</p><p>${escapeHtml(period)}</p></header><h2>Vue d’ensemble</h2><div class="stats"><div><b>${dataset.length}</b><br>Rapports approuvés</div><div><b>${uniqueProjects}</b><br>Projets alimentés</div><div><b>${uniqueActivities}</b><br>Activités alimentées</div><div><b>${uniqueTasks}</b><br>Tâches documentées</div></div><h2>Statistiques de participation</h2><table><tr><th>Femmes</th><th>Hommes</th><th>Filles</th><th>Garçons</th><th>Total</th><th>Handicap</th><th>Vulnérabilité</th></tr><tr><td>${totals.women}</td><td>${totals.men}</td><td>${totals.girls}</td><td>${totals.boys}</td><td>${totals.participants}</td><td>${totals.disability}</td><td>${totals.vulnerable}</td></tr></table>${indicatorTotals.length ? `<h2>Indicateurs consolidés</h2><table><tr><th>Code</th><th>Indicateur</th><th>Unité</th><th>Cible cumulée</th><th>Réalisé cumulé</th></tr>${indicatorTotals.map((item) => `<tr><td>${escapeHtml(item.code)}</td><td>${escapeHtml(item.label)}</td><td>${escapeHtml(item.unit)}</td><td>${item.target}</td><td>${item.achieved}</td></tr>`).join("")}</table>` : ""}<h2>Détail des rapports approuvés</h2><table><tr><th>Programme / Projet</th><th>Activité / Tâche</th><th>Rapport</th><th>Date</th><th>Participants</th><th>Résumé / résultats</th></tr>${dataset.map((row) => `<tr><td><b>${escapeHtml(row.program_code)}</b><br>${escapeHtml(row.project_code)} · ${escapeHtml(row.project_name)}</td><td>${escapeHtml(row.activity_code)} · ${escapeHtml(row.activity_title)}<br><small>Tâche ${row.task_sequence_no} · ${escapeHtml(row.task_code)} · ${escapeHtml(row.task_title)}</small></td><td>${escapeHtml(row.report_number)}<br><small>${escapeHtml(row.report_title)}</small></td><td>${escapeHtml(row.execution_date)}</td><td>${row.participant_total}</td><td>${escapeHtml(row.summary || row.outcomes || "—")}</td></tr>`).join("")}</table><h2>Enseignements, difficultés et recommandations</h2>${dataset.map((row) => `<section><h3>${escapeHtml(row.report_number)} · ${escapeHtml(row.task_title)}</h3>${row.outcomes ? `<p><b>Résultats :</b> ${escapeHtml(row.outcomes)}</p>` : ""}${row.challenges ? `<p><b>Difficultés :</b> ${escapeHtml(row.challenges)}</p>` : ""}${row.recommendations ? `<p><b>Recommandations :</b> ${escapeHtml(row.recommendations)}</p>` : ""}</section>`).join("")}<p class="muted">Consolidation produite à partir des rapports approuvés de la plateforme AIAC selon la hiérarchie institutionnelle sélectionnée.</p><div class="export"><button onclick="window.print()">Imprimer / Enregistrer en PDF</button></div></body></html>`;
  }

  function download(contents: string, extension: "html" | "doc") {
    const name = cleanFileName(
      [selectedBody?.code, selectedProgram?.code, selectedProject?.code, selectedActivity?.code, selectedTask?.code, "consolidation"]
        .filter(Boolean)
        .join("-"),
    );
    const blob = new Blob([extension === "doc" ? `\ufeff${contents}` : contents], {
      type: extension === "doc" ? "application/msword;charset=utf-8" : "text/html;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${name || "aiac-consolidation"}.${extension}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function printConsolidation() {
    const popup = window.open("", "_blank");
    if (!popup) {
      setNotice("Autorisez les fenêtres contextuelles pour produire le PDF.");
      return;
    }
    popup.document.write(consolidatedHtml());
    popup.document.close();
  }

  return (
    <section className="fieldReporting hierarchicalCycle">
      <div className="portalPanel fieldHero">
        <div>
          <p className="eyebrow">Chaîne opérationnelle officielle AIAC</p>
          <h2>Cycle des programmes</h2>
          <p>
            Organe → Programme → Projet → Activité → Tâche → Saisie / rapport → Soumission → Validation → Consolidation.
          </p>
        </div>
      </div>

      {notice && (
        <div className="notice" role="status">
          {notice}
          <button type="button" onClick={() => setNotice("")}>×</button>
        </div>
      )}

      <div className="portalPanel">
        <h3>1. Choisir la chaîne de travail</h3>
        <p>
          Commencez toujours par l’organe. Chaque liste suivante est limitée au niveau parent sélectionné : aucun mélange entre organes, programmes, projets ou activités.
        </p>
        <div className="operationForm fieldReportForm">
          <label>
            Organe
            <select
              value={bodyId}
              onChange={(event) => {
                setBodyId(event.target.value);
                setProgramId("");
                setProjectId("");
                void chooseActivity("");
                resetReportingDataset();
              }}
            >
              <option value="">Choisir d’abord l’organe</option>
              {bodies.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code} · {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Programme
            <select
              value={programId}
              disabled={!bodyId}
              onChange={(event) => {
                setProgramId(event.target.value);
                setProjectId("");
                void chooseActivity("");
                resetReportingDataset();
              }}
            >
              <option value="">Choisir le programme</option>
              {programs.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code} · {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Projet
            <select
              value={projectId}
              disabled={!programId}
              onChange={(event) => {
                setProjectId(event.target.value);
                void chooseActivity("");
                resetReportingDataset();
              }}
            >
              <option value="">Choisir le projet</option>
              {projects.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code} · {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Activité
            <select
              value={activityId}
              disabled={!projectId}
              onChange={(event) => void chooseActivity(event.target.value)}
            >
              <option value="">Choisir l’activité</option>
              {activities.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code} · {item.title}
                </option>
              ))}
            </select>
          </label>
          <label className="wideField">
            Tâche — facultative pour la consolidation, obligatoire au moment de la saisie d’un rapport
            <select
              value={taskId}
              disabled={!activityId || loadingTasks}
              onChange={(event) => {
                setTaskId(event.target.value);
                setDataset([]);
                setDatasetLoaded(false);
              }}
            >
              <option value="">Toutes les tâches de l’activité</option>
              {activityTasks.map((item) => (
                <option key={item.id} value={item.id}>
                  Tâche {item.sequence_no} · {item.code} · {item.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        {bodyId && (
          <p className="evidencePolicyHint">
            <b>Contexte actif :</b> {hierarchyTitle() || selectedBody?.name}
          </p>
        )}
        {activityId && loadingTasks && <p>Chargement des tâches dans leur ordre officiel…</p>}
        {activityId && !loadingTasks && (
          <p>
            <b>{activityTasks.length}</b> tâche(s) accessible(s) dans cette activité, classées selon leur numéro d’ordre.
          </p>
        )}
      </div>

      {bodyId && (
        <div className="portalPanel">
          <h3>2. Consolidation et rapports de niveau supérieur</h3>
          <p>
            Choisissez une période puis produisez un dossier au niveau actuellement sélectionné : organe, programme, projet, activité ou tâche. Seuls les rapports approuvés sont consolidés.
          </p>
          <div className="compactForm">
            <label>
              Du
              <input type="date" value={periodFrom} onChange={(event) => setPeriodFrom(event.target.value)} />
            </label>
            <label>
              Au
              <input type="date" value={periodTo} onChange={(event) => setPeriodTo(event.target.value)} />
            </label>
            <button type="button" disabled={loadingDataset} onClick={loadConsolidation}>
              {loadingDataset ? "Consolidation…" : "Générer la consolidation"}
            </button>
          </div>
          {datasetLoaded && (
            <>
              <div className="statGrid operationStats">
                <article><b>{dataset.length}</b><span>Rapports approuvés</span></article>
                <article><b>{new Set(dataset.map((item) => item.task_id)).size}</b><span>Tâches documentées</span></article>
                <article><b>{totals.participants}</b><span>Participations</span></article>
                <article><b>{indicatorTotals.length}</b><span>Indicateurs consolidés</span></article>
              </div>
              <div className="reportActions exportActions">
                <button type="button" disabled={!dataset.length} onClick={printConsolidation}>PDF / impression</button>
                <button type="button" disabled={!dataset.length} onClick={() => download(consolidatedHtml(), "doc")}>Word</button>
                <button type="button" disabled={!dataset.length} onClick={() => download(consolidatedHtml(), "html")}>HTML5</button>
              </div>
            </>
          )}
        </div>
      )}

      {bodyId && (
        <div className="portalPanel">
          <h3>3. Saisie, soumission et validation dans le contexte sélectionné</h3>
          <p>
            Le module détaillé ci-dessous ne reçoit que la branche sélectionnée. Pour créer ou gérer un niveau, sélectionnez d’abord son parent dans la chaîne ci-dessus.
          </p>
        </div>
      )}

      {bodyId && (
        <FieldReportingPanel
          profile={props.profile}
          programs={scopedPrograms}
          projects={scopedProjects}
          activities={scopedActivities}
          projectMembers={scopedMembers}
          staffProfiles={props.staffProfiles}
          bodies={props.bodies.filter((item) => item.id === bodyId)}
          workforceAssignments={props.workforceAssignments.filter((item) => item.body_id === bodyId)}
          positionAssignments={props.positionAssignments.filter((item) => item.body_id === bodyId)}
          institutionalMembers={props.institutionalMembers}
          bodyMemberships={props.bodyMemberships.filter((item) => item.body_id === bodyId)}
          initialActivityTasks={scopedTasks}
          initialActivityTaskCounts={scopedTaskCounts}
          initialTaskReports={scopedReports}
          initialEvidence={props.initialEvidence.filter((item) => reportIds.has(item.report_id))}
          initialAttendance={props.initialAttendance.filter((item) => reportIds.has(item.report_id))}
          initialIndicators={props.initialIndicators.filter((item) => reportIds.has(item.report_id))}
          initialApprovals={props.initialApprovals.filter((item) => reportIds.has(item.report_id))}
          initialEvents={props.initialEvents.filter((item) => reportIds.has(item.report_id))}
          institutionalSignatureAssets={props.institutionalSignatureAssets}
        />
      )}

      {!bodyId && (
        <div className="portalPanel">
          <h3>Commencez par l’organe</h3>
          <p>
            Aucun programme, projet, activité ou tâche n’est affiché tant que l’organe propriétaire n’a pas été choisi. Cela évite de chercher dans l’ensemble du référentiel AIAC.
          </p>
        </div>
      )}
    </section>
  );
}
