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

type BodyOption = { body_id: string; body_code: string; body_name: string };
type ProgramOption = { program_id: string; program_code: string; program_name: string; program_status: string };
type ProjectOption = { project_id: string; project_code: string; project_name: string; project_status: string };
type ActivityOption = { activity_id: string; activity_code: string; activity_title: string; activity_status: string };
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
function queryParam(name: string) {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(name) || "";
}

export default function UniversalTaskReporter() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [bodies, setBodies] = useState<BodyOption[]>([]);
  const [programs, setPrograms] = useState<ProgramOption[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [activities, setActivities] = useState<ActivityOption[]>([]);
  const [tasks, setTasks] = useState<ReportingTask[]>([]);
  const [bodyId, setBodyId] = useState("");
  const [programId, setProgramId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [activityId, setActivityId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [taskQuery, setTaskQuery] = useState("");
  const [loadingBodies, setLoadingBodies] = useState(true);
  const [loadingPrograms, setLoadingPrograms] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.rpc("institutional_reporting_bodies");
      if (cancelled) return;
      setLoadingBodies(false);
      if (error) { setNotice(error.message); return; }
      const incoming = ((data || []) as BodyOption[]).sort((a, b) => collator.compare(a.body_code, b.body_code));
      setBodies(incoming);
      const requested = queryParam("body");
      if (requested && incoming.some((row) => row.body_id === requested)) setBodyId(requested);
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  useEffect(() => {
    setPrograms([]); setProjects([]); setActivities([]); setTasks([]);
    setProgramId(""); setProjectId(""); setActivityId(""); setTaskId(""); setTaskQuery("");
    if (!bodyId) return;
    let cancelled = false;
    setLoadingPrograms(true);
    void (async () => {
      const { data, error } = await supabase.rpc("institutional_reporting_programs", { target_body_id: bodyId });
      if (cancelled) return;
      setLoadingPrograms(false);
      if (error) { setNotice(error.message); return; }
      const incoming = ((data || []) as ProgramOption[]).sort((a, b) => collator.compare(a.program_code, b.program_code));
      setPrograms(incoming);
      const requested = queryParam("program");
      if (requested && incoming.some((row) => row.program_id === requested)) setProgramId(requested);
    })();
    return () => { cancelled = true; };
  }, [bodyId, supabase]);

  useEffect(() => {
    setProjects([]); setActivities([]); setTasks([]);
    setProjectId(""); setActivityId(""); setTaskId(""); setTaskQuery("");
    if (!programId) return;
    let cancelled = false;
    setLoadingProjects(true);
    void (async () => {
      const { data, error } = await supabase.rpc("institutional_reporting_projects", { target_program_id: programId });
      if (cancelled) return;
      setLoadingProjects(false);
      if (error) { setNotice(error.message); return; }
      const incoming = ((data || []) as ProjectOption[]).sort((a, b) => collator.compare(a.project_code, b.project_code));
      setProjects(incoming);
      const requested = queryParam("project");
      if (requested && incoming.some((row) => row.project_id === requested)) setProjectId(requested);
    })();
    return () => { cancelled = true; };
  }, [programId, supabase]);

  useEffect(() => {
    setActivities([]); setTasks([]); setActivityId(""); setTaskId(""); setTaskQuery("");
    if (!projectId) return;
    let cancelled = false;
    setLoadingActivities(true);
    void (async () => {
      const { data, error } = await supabase.rpc("institutional_reporting_activities", { target_project_id: projectId });
      if (cancelled) return;
      setLoadingActivities(false);
      if (error) { setNotice(error.message); return; }
      const incoming = ((data || []) as ActivityOption[]).sort((a, b) => collator.compare(a.activity_code, b.activity_code));
      setActivities(incoming);
      const requested = queryParam("activity");
      if (requested && incoming.some((row) => row.activity_id === requested)) setActivityId(requested);
    })();
    return () => { cancelled = true; };
  }, [projectId, supabase]);

  useEffect(() => {
    setTasks([]); setTaskId(""); setTaskQuery("");
    if (!activityId) return;
    let cancelled = false;
    setLoadingTasks(true);
    void (async () => {
      const { data, error } = await supabase.rpc("institutional_reporting_tasks", { target_activity_id: activityId });
      if (cancelled) return;
      setLoadingTasks(false);
      if (error) { setNotice(error.message); return; }
      const incoming = (data || []) as ReportingTask[];
      setTasks(incoming);
      const requested = queryParam("task");
      if (requested && incoming.some((row) => row.task_id === requested)) setTaskId(requested);
    })();
    return () => { cancelled = true; };
  }, [activityId, supabase]);

  const selectedBody = bodies.find((row) => row.body_id === bodyId) || null;
  const selectedProgram = programs.find((row) => row.program_id === programId) || null;
  const selectedProject = projects.find((row) => row.project_id === projectId) || null;
  const selectedActivity = activities.find((row) => row.activity_id === activityId) || null;
  const selectedTask = tasks.find((row) => row.task_id === taskId) || null;
  const visibleTasks = useMemo(() => {
    const q = taskQuery.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter((row) => `${row.task_sequence_no} ${row.task_code} ${row.task_title} ${row.task_description || ""} ${row.expected_output || ""}`.toLowerCase().includes(q));
  }, [taskQuery, tasks]);

  async function createReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!taskId || !bodyId || !programId || !projectId || !activityId) {
      setNotice("Choisissez la chaîne complète jusqu’à la tâche à rapporter.");
      return;
    }
    const data = new FormData(event.currentTarget);
    const periodStart = String(data.get("period_start") || "");
    const periodEnd = String(data.get("period_end") || "");
    if (periodStart && periodEnd && periodEnd < periodStart) {
      setNotice("La fin de période ne peut pas précéder le début de période.");
      return;
    }
    const summary = String(data.get("summary") || "").trim();
    if (summary.length < 5) {
      setNotice("Le résumé doit contenir au moins 5 caractères.");
      return;
    }

    setBusy(true);
    setNotice("");
    const reportType = String(data.get("report_type") || "task_execution") as ReportType;
    const { data: sessionData } = await supabase.auth.getSession();
    const reporterId = sessionData.session?.user?.id;
    if (!reporterId) {
      setBusy(false);
      setNotice("Votre session n’est plus valide. Reconnectez-vous.");
      return;
    }

    const payload = {
      task_id: taskId,
      reporter_id: reporterId,
      body_id: bodyId,
      report_type: reportType,
      title: String(data.get("title") || "").trim() || defaultReportTitle(reportType),
      period_start: periodStart || null,
      period_end: periodEnd || null,
      rich_content_html: reportTemplateHtml(reportType),
      execution_date: String(data.get("execution_date") || ""),
      location: String(data.get("location") || "").trim() || null,
      summary,
      women_count: 0, men_count: 0, girls_count: 0, boys_count: 0, disability_count: 0, vulnerable_count: 0,
      status: "draft",
    };

    const { data: created, error } = await supabase.from("task_reports").insert(payload).select("id,report_number").single();
    setBusy(false);
    if (error || !created) {
      setNotice(error?.message || "Impossible de créer le rapport.");
      return;
    }

    const params = new URLSearchParams({ body: bodyId, program: programId, project: projectId, activity: activityId, task: taskId, report: created.id, mode: "report" });
    router.push(`/espace/terrain/complet?${params.toString()}`);
  }

  return (
    <div className="portalPanel">
      <div className="panelTitle"><div><p className="eyebrow">Saisie terrain et institutionnelle</p><h2>Rapporter une tâche</h2><p>Toute personne AIAC disposant d’un compte actif et approuvé peut renseigner une tâche officielle. Les listes sont chargées progressivement pour éviter de charger tout le référentiel.</p></div></div>
      {notice && <div className="notice" role="status">{notice}</div>}
      <form className="operationForm fieldReportForm" onSubmit={createReport}>
        <label>Organe<select value={bodyId} disabled={loadingBodies} onChange={(event) => setBodyId(event.target.value)} required><option value="">{loadingBodies ? "Chargement des organes…" : `Choisir l’organe (${bodies.length})`}</option>{bodies.map((item) => <option key={item.body_id} value={item.body_id}>{item.body_code} · {item.body_name}</option>)}</select>{!loadingBodies && <small>{bodies.length} organes actifs disponibles.</small>}</label>
        <label>Programme<select value={programId} disabled={!bodyId || loadingPrograms || programs.length === 0} onChange={(event) => setProgramId(event.target.value)} required><option value="">{!bodyId ? "Choisir d’abord l’organe" : loadingPrograms ? "Chargement des programmes…" : programs.length ? `Choisir le programme (${programs.length})` : "Aucun programme configuré"}</option>{programs.map((item) => <option key={item.program_id} value={item.program_id}>{item.program_code} · {item.program_name}</option>)}</select>{bodyId && !loadingPrograms && programs.length === 0 && <small>{selectedBody?.body_code} · {selectedBody?.body_name} n’a encore aucun programme enregistré.</small>}</label>
        <label>Projet<select value={projectId} disabled={!programId || loadingProjects || projects.length === 0} onChange={(event) => setProjectId(event.target.value)} required><option value="">{!programId ? "Choisir d’abord le programme" : loadingProjects ? "Chargement des projets…" : projects.length ? `Choisir le projet (${projects.length})` : "Aucun projet configuré"}</option>{projects.map((item) => <option key={item.project_id} value={item.project_id}>{item.project_code} · {item.project_name}</option>)}</select>{programId && !loadingProjects && projects.length === 0 && <small>{selectedProgram?.program_code} · {selectedProgram?.program_name} n’a encore aucun projet enregistré.</small>}</label>
        <label>Activité<select value={activityId} disabled={!projectId || loadingActivities || activities.length === 0} onChange={(event) => setActivityId(event.target.value)} required><option value="">{!projectId ? "Choisir d’abord le projet" : loadingActivities ? "Chargement des activités…" : activities.length ? `Choisir l’activité (${activities.length})` : "Aucune activité configurée"}</option>{activities.map((item) => <option key={item.activity_id} value={item.activity_id}>{item.activity_code} · {item.activity_title}</option>)}</select>{projectId && !loadingActivities && activities.length === 0 && <small>{selectedProject?.project_code} · {selectedProject?.project_name} n’a encore aucune activité enregistrée.</small>}</label>

        <label className="wideField">Rechercher dans les tâches<input value={taskQuery} onChange={(event) => setTaskQuery(event.target.value)} disabled={!activityId || loadingTasks} placeholder="Code, numéro, titre, description ou résultat attendu…" /></label>
        <label className="wideField">Tâche à rapporter<select value={taskId} disabled={!activityId || loadingTasks || tasks.length === 0} onChange={(event) => setTaskId(event.target.value)} required><option value="">{!activityId ? "Choisir d’abord l’activité" : loadingTasks ? "Chargement des tâches…" : tasks.length ? `Choisir la tâche (${visibleTasks.length}/${tasks.length})` : "Aucune tâche planifiée ou active"}</option>{visibleTasks.map((item) => <option key={item.task_id} value={item.task_id}>Tâche {item.task_sequence_no} · {item.task_code} · {item.task_title}</option>)}</select>{activityId && !loadingTasks && tasks.length === 0 && <small>{selectedActivity?.activity_code} · {selectedActivity?.activity_title} n’a aucune tâche planifiée ou active à rapporter.</small>}{activityId && taskQuery && visibleTasks.length === 0 && <small>Aucune tâche ne correspond à cette recherche.</small>}</label>

        {selectedTask && <div className="wideField evidencePolicyHint"><b>Tâche {selectedTask.task_sequence_no} · {selectedTask.task_code} · {selectedTask.task_title}</b>{selectedTask.task_description && <p>{selectedTask.task_description}</p>}{selectedTask.expected_output && <p><b>Résultat attendu :</b> {selectedTask.expected_output}</p>}<p>Échéance : {selectedTask.due_date || "non définie"} · Preuve {selectedTask.requires_evidence ? "requise" : "facultative"} · Présence {selectedTask.requires_attendance ? "requise" : "facultative"}</p></div>}

        <label>Type de rapport<select name="report_type" defaultValue="task_execution">{Object.entries(reportTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Date de référence<input name="execution_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></label>
        <label>Début de période<input name="period_start" type="date" /></label><label>Fin de période<input name="period_end" type="date" /></label>
        <label className="wideField">Titre du rapport<input name="title" placeholder="Facultatif — le titre du modèle sera utilisé si vide" /></label>
        <label>Lieu<input name="location" placeholder="Localité / site" /></label>
        <label className="wideField">Résumé de ce qui a été réalisé<textarea name="summary" minLength={5} maxLength={15000} required placeholder="Décrivez brièvement l’exécution de cette tâche. Le dossier complet s’ouvrira ensuite pour les résultats, indicateurs, bénéficiaires, pièces et signature." /></label>
        <button disabled={busy || !taskId}>{busy ? "Création du rapport…" : "Créer le brouillon et continuer le rapport"}</button>
      </form>
    </div>
  );
}
