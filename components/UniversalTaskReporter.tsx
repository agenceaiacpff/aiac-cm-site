"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  defaultReportTitle,
  reportTemplateHtml,
  reportTypes,
  type ReportType,
} from "@/lib/report-templates";

type StructureRow = {
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
  activity_status: string;
};

type ReportingTask = {
  task_id: string;
  activity_id: string;
  task_code: string;
  task_title: string;
  task_description: string | null;
  expected_output: string | null;
  task_sequence_no: number;
  assigned_to: string | null;
  due_date: string | null;
  requires_evidence: boolean;
  requires_attendance: boolean;
  task_status: string;
};

const collator = new Intl.Collator("fr", { numeric: true, sensitivity: "base" });

function uniqueRows<T>(rows: T[], key: (row: T) => string) {
  return Array.from(new Map(rows.map((row) => [key(row), row])).values());
}

export default function UniversalTaskReporter() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [structure, setStructure] = useState<StructureRow[]>([]);
  const [tasks, setTasks] = useState<ReportingTask[]>([]);
  const [bodyId, setBodyId] = useState("");
  const [programId, setProgramId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [activityId, setActivityId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [loadingStructure, setLoadingStructure] = useState(true);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.rpc("institutional_reporting_structure_catalog");
      if (cancelled) return;
      setLoadingStructure(false);
      if (error) {
        setNotice(error.message);
        return;
      }
      const incoming = (data || []) as StructureRow[];
      setStructure(incoming);

      const params = new URLSearchParams(window.location.search);
      const requestedBody = params.get("body") || "";
      const requestedProgram = params.get("program") || "";
      const requestedProject = params.get("project") || "";
      const requestedActivity = params.get("activity") || "";
      if (requestedBody && incoming.some((row) => row.body_id === requestedBody)) setBodyId(requestedBody);
      if (requestedProgram && incoming.some((row) => row.program_id === requestedProgram)) setProgramId(requestedProgram);
      if (requestedProject && incoming.some((row) => row.project_id === requestedProject)) setProjectId(requestedProject);
      if (requestedActivity && incoming.some((row) => row.activity_id === requestedActivity)) setActivityId(requestedActivity);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    if (!activityId) {
      setTasks([]);
      setTaskId("");
      return;
    }
    let cancelled = false;
    setLoadingTasks(true);
    setTasks([]);
    setTaskId("");
    void (async () => {
      const { data, error } = await supabase.rpc("institutional_reporting_tasks", {
        target_activity_id: activityId,
      });
      if (cancelled) return;
      setLoadingTasks(false);
      if (error) {
        setNotice(error.message);
        return;
      }
      const incoming = (data || []) as ReportingTask[];
      setTasks(incoming);
      const requestedTask = new URLSearchParams(window.location.search).get("task") || "";
      if (requestedTask && incoming.some((row) => row.task_id === requestedTask)) setTaskId(requestedTask);
    })();
    return () => {
      cancelled = true;
    };
  }, [activityId, supabase]);

  const bodies = useMemo(
    () =>
      uniqueRows(structure, (row) => row.body_id)
        .map((row) => ({ id: row.body_id, code: row.body_code, name: row.body_name }))
        .sort((a, b) => collator.compare(a.code, b.code)),
    [structure],
  );
  const programs = useMemo(
    () =>
      uniqueRows(
        structure.filter((row) => row.body_id === bodyId),
        (row) => row.program_id,
      )
        .map((row) => ({ id: row.program_id, code: row.program_code, name: row.program_name }))
        .sort((a, b) => collator.compare(a.code, b.code)),
    [bodyId, structure],
  );
  const projects = useMemo(
    () =>
      uniqueRows(
        structure.filter((row) => row.program_id === programId),
        (row) => row.project_id,
      )
        .map((row) => ({ id: row.project_id, code: row.project_code, name: row.project_name }))
        .sort((a, b) => collator.compare(a.code, b.code)),
    [programId, structure],
  );
  const activities = useMemo(
    () =>
      uniqueRows(
        structure.filter((row) => row.project_id === projectId),
        (row) => row.activity_id,
      )
        .map((row) => ({ id: row.activity_id, code: row.activity_code, title: row.activity_title }))
        .sort((a, b) => collator.compare(a.code, b.code)),
    [projectId, structure],
  );
  const selectedTask = tasks.find((row) => row.task_id === taskId) || null;

  async function createReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!taskId || !bodyId || !programId || !projectId || !activityId) {
      setNotice("Choisissez la chaîne complète jusqu’à la tâche à rapporter.");
      return;
    }
    setBusy(true);
    setNotice("");
    const data = new FormData(event.currentTarget);
    const reportType = String(data.get("report_type") || "task_execution") as ReportType;
    const payload = {
      task_id: taskId,
      reporter_id: (await supabase.auth.getUser()).data.user?.id,
      body_id: bodyId,
      report_type: reportType,
      title: String(data.get("title") || "").trim() || defaultReportTitle(reportType),
      period_start: data.get("period_start") || null,
      period_end: data.get("period_end") || null,
      rich_content_html: reportTemplateHtml(reportType),
      execution_date: String(data.get("execution_date") || ""),
      location: String(data.get("location") || "").trim() || null,
      summary: String(data.get("summary") || "").trim(),
      women_count: 0,
      men_count: 0,
      girls_count: 0,
      boys_count: 0,
      disability_count: 0,
      vulnerable_count: 0,
      status: "draft",
    };
    if (!payload.reporter_id) {
      setBusy(false);
      setNotice("Votre session n’est plus valide. Reconnectez-vous.");
      return;
    }
    const { data: created, error } = await supabase
      .from("task_reports")
      .insert(payload)
      .select("id,report_number")
      .single();
    setBusy(false);
    if (error || !created) {
      setNotice(error?.message || "Impossible de créer le rapport.");
      return;
    }
    const params = new URLSearchParams({
      body: bodyId,
      program: programId,
      project: projectId,
      activity: activityId,
      task: taskId,
      report: created.id,
      mode: "report",
    });
    router.push(`/espace/terrain/complet?${params.toString()}`);
  }

  return (
    <div className="portalPanel">
      <div className="panelTitle">
        <div>
          <p className="eyebrow">Saisie terrain et institutionnelle</p>
          <h2>Rapporter une tâche</h2>
          <p>
            Toute personne AIAC disposant d’un compte actif et approuvé peut renseigner une tâche officielle. L’affectation indique le responsable, mais elle ne bloque pas le droit de rapporter.
          </p>
        </div>
      </div>

      {notice && <div className="notice" role="status">{notice}</div>}
      {loadingStructure ? (
        <p>Chargement du catalogue de reporting…</p>
      ) : (
        <form className="operationForm fieldReportForm" onSubmit={createReport}>
          <label>
            Organe
            <select
              value={bodyId}
              onChange={(event) => {
                setBodyId(event.target.value);
                setProgramId("");
                setProjectId("");
                setActivityId("");
              }}
              required
            >
              <option value="">Choisir l’organe</option>
              {bodies.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}
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
                setActivityId("");
              }}
              required
            >
              <option value="">Choisir le programme</option>
              {programs.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}
            </select>
          </label>
          <label>
            Projet
            <select
              value={projectId}
              disabled={!programId}
              onChange={(event) => {
                setProjectId(event.target.value);
                setActivityId("");
              }}
              required
            >
              <option value="">Choisir le projet</option>
              {projects.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}
            </select>
          </label>
          <label>
            Activité
            <select
              value={activityId}
              disabled={!projectId}
              onChange={(event) => setActivityId(event.target.value)}
              required
            >
              <option value="">Choisir l’activité</option>
              {activities.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.title}</option>)}
            </select>
          </label>
          <label className="wideField">
            Tâche à rapporter
            <select
              value={taskId}
              disabled={!activityId || loadingTasks}
              onChange={(event) => setTaskId(event.target.value)}
              required
            >
              <option value="">{loadingTasks ? "Chargement des tâches…" : "Choisir la tâche"}</option>
              {tasks.map((item) => (
                <option key={item.task_id} value={item.task_id}>
                  Tâche {item.task_sequence_no} · {item.task_code} · {item.task_title}
                </option>
              ))}
            </select>
          </label>

          {selectedTask && (
            <div className="wideField evidencePolicyHint">
              <b>Tâche {selectedTask.task_sequence_no} · {selectedTask.task_code} · {selectedTask.task_title}</b>
              {selectedTask.task_description && <p>{selectedTask.task_description}</p>}
              {selectedTask.expected_output && <p><b>Résultat attendu :</b> {selectedTask.expected_output}</p>}
              <p>
                Échéance : {selectedTask.due_date || "non définie"} · Preuve {selectedTask.requires_evidence ? "requise" : "facultative"} · Présence {selectedTask.requires_attendance ? "requise" : "facultative"}
              </p>
            </div>
          )}

          <label>
            Type de rapport
            <select name="report_type" defaultValue="task_execution">
              {Object.entries(reportTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            Date de référence
            <input name="execution_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
          </label>
          <label>
            Début de période
            <input name="period_start" type="date" />
          </label>
          <label>
            Fin de période
            <input name="period_end" type="date" />
          </label>
          <label className="wideField">
            Titre du rapport
            <input name="title" placeholder="Facultatif — le titre du modèle sera utilisé si vide" />
          </label>
          <label>
            Lieu
            <input name="location" placeholder="Localité / site" />
          </label>
          <label className="wideField">
            Résumé de ce qui a été réalisé
            <textarea
              name="summary"
              minLength={5}
              maxLength={15000}
              required
              placeholder="Décrivez brièvement l’exécution de cette tâche. Le dossier complet s’ouvrira ensuite pour les résultats, indicateurs, bénéficiaires, pièces et signature."
            />
          </label>
          <button disabled={busy || !taskId}>
            {busy ? "Création du rapport…" : "Créer le brouillon et continuer le rapport"}
          </button>
        </form>
      )}
    </div>
  );
}
