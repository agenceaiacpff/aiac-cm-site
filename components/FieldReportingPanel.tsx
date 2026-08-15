"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type {
  OperationBody,
  OperationProfile,
  PortfolioActivityRow,
  ProjectMemberRow,
  ProjectProgramRow,
  ProjectRow,
} from "@/components/OperationsPanel";
import RichHtmlEditor, { sanitizeRichHtml } from "@/components/RichHtmlEditor";
import {
  defaultReportTitle,
  pruneEmptyReportSections,
  reportTemplateHtml,
  reportTypes,
  type ReportType,
} from "@/lib/report-templates";
import { makeSlug } from "@/lib/public-content";

export type ActivityTaskRow = {
  id: string;
  activity_id: string;
  code: string;
  title: string;
  description: string | null;
  expected_output: string | null;
  sequence_no: number;
  assigned_to: string | null;
  due_date: string | null;
  requires_evidence: boolean;
  requires_attendance: boolean;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};
export type ActivityTaskCountRow = {
  activity_id: string;
  task_count: number | string;
};
export type TaskReportRow = {
  id: string;
  report_number: string;
  task_id: string;
  reporter_id: string;
  supervisor_id: string | null;
  body_id: string | null;
  execution_date: string;
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
  women_count: number;
  men_count: number;
  girls_count: number;
  boys_count: number;
  disability_count: number;
  vulnerable_count: number;
  status: string;
  revision: number;
  current_hash: string | null;
  reporter_signature_name: string | null;
  reporter_signature_asset_path: string | null;
  reporter_signed_at: string | null;
  submitted_at: string | null;
  returned_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  report_type: ReportType;
  title: string | null;
  period_start: string | null;
  period_end: string | null;
  rich_content_html: string;
  evidence_required_by_reviewer: boolean;
  evidence_requirement_comment: string | null;
  public_content_id: string | null;
  published_at: string | null;
  published_by: string | null;
  created_at: string;
  updated_at: string;
};
export type TaskReportEvidenceRow = {
  id: string;
  report_id: string;
  evidence_type: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  sha256: string | null;
  caption: string | null;
  taken_at: string | null;
  latitude: number | null;
  longitude: number | null;
  classification: string;
  uploaded_by: string;
  created_at: string;
};
export type TaskReportAttendanceRow = {
  id: string;
  report_id: string;
  participant_code: string | null;
  full_name: string;
  phone: string | null;
  email: string | null;
  gender: string;
  age_group: string;
  person_with_disability: boolean;
  vulnerable: boolean;
  organization: string | null;
  role: string | null;
  present: boolean;
  arrival_at: string | null;
  departure_at: string | null;
  signature_name: string | null;
  consent_at: string;
  recorded_by: string;
  created_at: string;
};
export type TaskReportIndicatorRow = {
  id: string;
  report_id: string;
  indicator_code: string;
  indicator_label: string;
  unit: string;
  baseline_value: number | null;
  target_value: number | null;
  achieved_value: number;
  verification_source: string | null;
  notes: string | null;
  recorded_by: string;
  created_at: string;
};
export type TaskReportApprovalRow = {
  id: string;
  report_id: string;
  revision: number;
  actor_id: string;
  decision: string;
  actor_name: string;
  actor_role: string;
  actor_job_title: string | null;
  actor_body_id: string | null;
  comment: string | null;
  signature_name: string;
  signature_asset_path: string | null;
  content_hash: string;
  signed_at: string;
  created_at: string;
};
export type TaskReportEventRow = {
  id: string;
  report_id: string;
  actor_id: string | null;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  comment: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

const reportStatuses: Record<string, string> = {
  draft: "Brouillon",
  submitted: "Soumis",
  returned: "À corriger",
  approved: "Approuvé",
  archived: "Archivé",
};
const taskStatuses: Record<string, string> = {
  planned: "Planifiée",
  active: "Active",
  completed: "Terminée",
  cancelled: "Annulée",
};
const portfolioStatuses: Record<string, string> = {
  planned: "Planifié",
  active: "Actif",
  confirmed: "Confirmé",
  in_progress: "En cours",
  on_hold: "En pause",
  completed: "Terminé",
  cancelled: "Annulé",
  postponed: "Reporté",
};
const decisionLabels: Record<string, string> = {
  submitted: "Soumis et signé par",
  returned: "Retourné par",
  approved: "Approuvé et signé par",
};
const eventLabels: Record<string, string> = {
  created: "Rapport créé",
  updated: "Brouillon mis à jour",
  evidence_added: "Preuve modifiée",
  attendance_added: "Présence modifiée",
  submitted: "Rapport soumis",
  resubmitted: "Rapport soumis à nouveau",
  returned: "Corrections demandées",
  approved: "Rapport approuvé",
  archived: "Rapport archivé",
  published: "Rapport public mis en ligne",
};

function cleanFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(-120);
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
function formatDate(value: string | null | undefined, withTime = false) {
  if (!value) return "—";
  return new Date(value).toLocaleString(
    "fr-FR",
    withTime
      ? { dateStyle: "medium", timeStyle: "short" }
      : { dateStyle: "medium" },
  );
}
function numberValue(data: FormData, name: string) {
  const value = String(data.get(name) || "");
  return value === "" ? 0 : Number(value);
}
async function sha256(file: File) {
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export default function FieldReportingPanel({
  profile,
  programs: initialPrograms,
  projects: initialProjects,
  activities: initialActivities,
  projectMembers: initialProjectMembers,
  staffProfiles,
  bodies,
  workforceAssignments,
  positionAssignments,
  institutionalMembers,
  bodyMemberships,
  initialActivityTasks,
  initialActivityTaskCounts,
  initialTaskReports,
  initialEvidence,
  initialAttendance,
  initialIndicators,
  initialApprovals,
  initialEvents,
}: {
  profile: OperationProfile;
  programs: ProjectProgramRow[];
  projects: ProjectRow[];
  activities: PortfolioActivityRow[];
  projectMembers: ProjectMemberRow[];
  staffProfiles: OperationProfile[];
  bodies: OperationBody[];
  workforceAssignments: Array<{
    profile_id: string | null;
    body_id: string | null;
    status: string;
  }>;
  positionAssignments: Array<{
    profile_id: string | null;
    body_id: string;
    status: string;
  }>;
  institutionalMembers: Array<{
    id: string;
    profile_id: string | null;
    status: string;
  }>;
  bodyMemberships: Array<{
    body_id: string;
    member_id: string;
    status: string;
  }>;
  initialActivityTasks: ActivityTaskRow[];
  initialActivityTaskCounts: ActivityTaskCountRow[];
  initialTaskReports: TaskReportRow[];
  initialEvidence: TaskReportEvidenceRow[];
  initialAttendance: TaskReportAttendanceRow[];
  initialIndicators: TaskReportIndicatorRow[];
  initialApprovals: TaskReportApprovalRow[];
  initialEvents: TaskReportEventRow[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [section, setSection] = useState("structure");
  const [structureStep, setStructureStep] = useState("program");
  const [programs, setPrograms] = useState(initialPrograms);
  const [projects, setProjects] = useState(initialProjects);
  const [activities, setActivities] = useState(initialActivities);
  const [projectMembers, setProjectMembers] = useState(initialProjectMembers);
  const [tasks, setTasks] = useState(initialActivityTasks);
  const [taskCounts, setTaskCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      initialActivityTaskCounts.map((item) => [
        item.activity_id,
        Number(item.task_count),
      ]),
    ),
  );
  const [reports, setReports] = useState(initialTaskReports);
  const [evidence, setEvidence] = useState(initialEvidence);
  const [attendance, setAttendance] = useState(initialAttendance);
  const [indicators, setIndicators] = useState(initialIndicators);
  const [approvals, setApprovals] = useState(initialApprovals);
  const [events, setEvents] = useState(initialEvents);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [newProgramBodyId, setNewProgramBodyId] = useState("");
  const [newActivityProjectId, setNewActivityProjectId] = useState("");
  const [newTaskActivityId, setNewTaskActivityId] = useState("");
  const [reportBodyId, setReportBodyId] = useState("");
  const [reportProgramId, setReportProgramId] = useState("");
  const [reportProjectId, setReportProjectId] = useState("");
  const [reportActivityId, setReportActivityId] = useState("");
  const [reportTaskId, setReportTaskId] = useState("");
  const [loadedActivityIds, setLoadedActivityIds] = useState(
    () => new Set(initialActivityTasks.map((item) => item.activity_id)),
  );
  const [loadingActivityId, setLoadingActivityId] = useState("");
  const [teamProjectId, setTeamProjectId] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [richHtmlDraft, setRichHtmlDraft] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const isAdmin = ["admin", "super_admin"].includes(profile.role);
  const activeBodies = useMemo(
    () => bodies.filter((item) => item.status === "active"),
    [bodies],
  );
  const memberProfileIds = useMemo(
    () =>
      Object.fromEntries(
        institutionalMembers.map((item) => [item.id, item.profile_id]),
      ),
    [institutionalMembers],
  );
  const bodyProfileIds = useMemo(() => {
    const result: Record<string, Set<string>> = {};
    for (const body of activeBodies) result[body.id] = new Set<string>();
    for (const row of workforceAssignments)
      if (row.status === "active" && row.body_id && row.profile_id)
        result[row.body_id]?.add(row.profile_id);
    for (const row of positionAssignments)
      if (row.status === "active" && row.profile_id)
        result[row.body_id]?.add(row.profile_id);
    for (const row of bodyMemberships) {
      const profileId = memberProfileIds[row.member_id];
      if (row.status === "active" && profileId)
        result[row.body_id]?.add(profileId);
    }
    return result;
  }, [
    activeBodies,
    bodyMemberships,
    memberProfileIds,
    positionAssignments,
    workforceAssignments,
  ]);
  const manageableBodyIds = useMemo(
    () =>
      new Set(
        isAdmin
          ? activeBodies.map((item) => item.id)
          : activeBodies
              .filter((item) => bodyProfileIds[item.id]?.has(profile.id))
              .map((item) => item.id),
      ),
    [activeBodies, bodyProfileIds, isAdmin, profile.id],
  );
  const manageableBodies = activeBodies.filter((item) =>
    manageableBodyIds.has(item.id),
  );
  const activeCollaborators = staffProfiles.filter(
    (item) => item.status === "active",
  );
  const profileNames = useMemo(
    () =>
      Object.fromEntries(
        [profile, ...staffProfiles].map((item) => [
          item.id,
          item.full_name || item.email || "Compte AIAC",
        ]),
      ),
    [profile, staffProfiles],
  );
  const programNames = useMemo(
    () =>
      Object.fromEntries(
        programs.map((item) => [item.id, `${item.code} · ${item.name}`]),
      ),
    [programs],
  );
  const projectNames = useMemo(
    () =>
      Object.fromEntries(
        projects.map((item) => [item.id, `${item.code} · ${item.name}`]),
      ),
    [projects],
  );
  const activityNames = useMemo(
    () =>
      Object.fromEntries(
        activities.map((item) => [item.id, `${item.code} · ${item.title}`]),
      ),
    [activities],
  );
  const bodyNames = useMemo(
    () =>
      Object.fromEntries(
        bodies.map((item) => [item.id, `${item.code} · ${item.name}`]),
      ),
    [bodies],
  );
  const taskMap = useMemo(
    () => Object.fromEntries(tasks.map((item) => [item.id, item])),
    [tasks],
  );
  const programMap = useMemo(
    () => Object.fromEntries(programs.map((item) => [item.id, item])),
    [programs],
  );
  const activityMap = useMemo(
    () => Object.fromEntries(activities.map((item) => [item.id, item])),
    [activities],
  );
  const projectMap = useMemo(
    () => Object.fromEntries(projects.map((item) => [item.id, item])),
    [projects],
  );
  const leadProjectIds = useMemo(
    () =>
      new Set(
        projectMembers
          .filter(
            (item) =>
              item.user_id === profile.id && item.member_role === "lead",
          )
          .map((item) => item.project_id),
      ),
    [profile.id, projectMembers],
  );
  const contributorProjectIds = useMemo(
    () =>
      new Set(
        projectMembers
          .filter(
            (item) =>
              item.user_id === profile.id && item.member_role !== "viewer",
          )
          .map((item) => item.project_id),
      ),
    [profile.id, projectMembers],
  );

  function bodyStaff(bodyId: string) {
    const ids = bodyProfileIds[bodyId] || new Set<string>();
    return activeCollaborators.filter(
      (item) =>
        ids.has(item.id) ||
        item.id === profile.id ||
        (isAdmin && item.role === "super_admin"),
    );
  }
  function bodyForProject(projectId: string) {
    const project = projectMap[projectId];
    return project?.program_id ? programMap[project.program_id]?.body_id : null;
  }
  const activityProjectBodyId = bodyForProject(newActivityProjectId) || "";
  const selectedTaskActivity = activityMap[newTaskActivityId];
  const taskBodyId = selectedTaskActivity?.project_id
    ? bodyForProject(selectedTaskActivity.project_id) || ""
    : "";

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("report");
    if (requested) setSelectedReportId(requested);
  }, []);
  useEffect(() => {
    setEvidenceFile(null);
    const report = reports.find((item) => item.id === selectedReportId);
    setRichHtmlDraft(report?.rich_content_html || "");
  }, [selectedReportId]);

  function hierarchyForTask(taskId: string) {
    const task = taskMap[taskId];
    const activity = task ? activityMap[task.activity_id] : undefined;
    const project = activity
      ? projectMap[activity.project_id || ""]
      : undefined;
    return {
      task,
      activity,
      project,
      program: project?.program_id
        ? programs.find((item) => item.id === project.program_id)
        : undefined,
    };
  }
  function canCreateReport(task: ActivityTaskRow) {
    const { activity } = hierarchyForTask(task.id);
    return (
      isAdmin ||
      task.assigned_to === profile.id ||
      activity?.manager_id === profile.id ||
      Boolean(
        activity?.project_id && contributorProjectIds.has(activity.project_id),
      )
    );
  }
  function canManageTask(task: ActivityTaskRow) {
    const { activity } = hierarchyForTask(task.id);
    return (
      isAdmin ||
      activity?.manager_id === profile.id ||
      activity?.created_by === profile.id ||
      Boolean(
        profile.role === "manager" &&
          activity?.project_id &&
          leadProjectIds.has(activity.project_id),
      )
    );
  }
  function canReview(report: TaskReportRow) {
    const { activity } = hierarchyForTask(report.task_id);
    return (
      report.reporter_id !== profile.id &&
      (isAdmin ||
        report.supervisor_id === profile.id ||
        activity?.manager_id === profile.id ||
        Boolean(
          profile.role === "manager" &&
            activity?.project_id &&
            leadProjectIds.has(activity.project_id),
        ))
    );
  }
  function setError(message: string) {
    setNotice(message);
    setBusy(false);
  }
  function upsertReport(incoming: TaskReportRow) {
    setReports((items) =>
      items.some((item) => item.id === incoming.id)
        ? items.map((item) => (item.id === incoming.id ? incoming : item))
        : [incoming, ...items],
    );
  }

  async function loadActivityTasks(activityId: string) {
    if (!activityId || loadedActivityIds.has(activityId))
      return tasks.filter((item) => item.activity_id === activityId);
    setLoadingActivityId(activityId);
    const { data, error } = await supabase
      .from("activity_tasks")
      .select("*")
      .eq("activity_id", activityId)
      .order("sequence_no")
      .limit(1000);
    if (error) {
      setLoadingActivityId("");
      setError(error.message);
      return [] as ActivityTaskRow[];
    }
    const incoming = (data || []) as ActivityTaskRow[];
    setTasks((items) => [
      ...new Map(
        [...items, ...incoming].map((item) => [item.id, item]),
      ).values(),
    ]);
    setLoadedActivityIds((items) => new Set([...items, activityId]));
    setLoadingActivityId("");
    return incoming;
  }

  async function chooseReportActivity(activityId: string) {
    setReportActivityId(activityId);
    setReportTaskId("");
    if (activityId) await loadActivityTasks(activityId);
  }

  async function tasksForProject(project: ProjectRow) {
    const activityIds = activities
      .filter((item) => item.project_id === project.id)
      .map((item) => item.id);
    if (!activityIds.length) return tasks;
    const { data, error } = await supabase
      .from("activity_tasks")
      .select("*")
      .in("activity_id", activityIds)
      .order("sequence_no")
      .limit(5000);
    if (error) {
      setError(error.message);
      return tasks;
    }
    const merged = [
      ...new Map(
        [...tasks, ...((data || []) as ActivityTaskRow[])].map((item) => [
          item.id,
          item,
        ]),
      ).values(),
    ];
    setTasks(merged);
    setLoadedActivityIds((items) => new Set([...items, ...activityIds]));
    return merged;
  }

  const visibleTasks = tasks.filter((task) => {
    const h = hierarchyForTask(task.id);
    return `${task.code} ${task.title} ${h.activity?.title || ""} ${h.project?.name || ""} ${h.program?.name || ""}`
      .toLowerCase()
      .includes(query.toLowerCase());
  });
  const visibleReports = reports.filter((report) => {
    const h = hierarchyForTask(report.task_id);
    return (
      (statusFilter === "all" || report.status === statusFilter) &&
      `${report.report_number} ${report.summary} ${h.task?.title || ""} ${h.activity?.title || ""} ${h.project?.name || ""} ${h.program?.name || ""}`
        .toLowerCase()
        .includes(query.toLowerCase())
    );
  });
  const selectedReport =
    reports.find((item) => item.id === selectedReportId) || null;

  async function createProgram(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = event.currentTarget;
    const data = new FormData(form);
    const bodyId = String(data.get("body_id") || "");
    if (!manageableBodyIds.has(bodyId)) {
      setError(
        "Choisissez un organe dans lequel vous êtes autorisé à intervenir.",
      );
      return;
    }
    const payload = {
      body_id: bodyId,
      code: String(data.get("code") || "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_-]/g, "-"),
      name: String(data.get("name") || "").trim(),
      description: String(data.get("description") || "").trim() || null,
      thematic_area: String(data.get("thematic_area") || "").trim() || null,
      manager_id: String(data.get("manager_id") || "") || null,
      start_date: data.get("start_date") || null,
      end_date: data.get("end_date") || null,
      budget_amount: data.get("budget_amount")
        ? Number(data.get("budget_amount"))
        : null,
      budget_currency: "XAF",
      created_by: profile.id,
    };
    const { data: created, error } = await supabase
      .from("programs")
      .insert(payload)
      .select()
      .single();
    if (error || !created) {
      setError(error?.message || "Création impossible");
      return;
    }
    setPrograms((items) => [created as ProjectProgramRow, ...items]);
    form.reset();
    setNotice("Programme créé dans l’organe sélectionné.");
    setBusy(false);
    router.refresh();
  }

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = event.currentTarget;
    const data = new FormData(form);
    const programId = String(data.get("program_id") || "");
    const parent = programMap[programId];
    if (!parent || !manageableBodyIds.has(parent.body_id)) {
      setError("Choisissez un programme que votre organe peut gérer.");
      return;
    }
    const payload = {
      code: String(data.get("code") || "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_-]/g, "-"),
      name: String(data.get("name") || "").trim(),
      description: String(data.get("description") || "").trim() || null,
      program_id: programId,
      location: String(data.get("location") || "").trim() || null,
      start_date: data.get("start_date") || null,
      end_date: data.get("end_date") || null,
      budget_amount: data.get("budget_amount")
        ? Number(data.get("budget_amount"))
        : null,
      budget_currency: "XAF",
      created_by: profile.id,
    };
    const { data: created, error } = await supabase
      .from("projects")
      .insert(payload)
      .select()
      .single();
    if (error || !created) {
      setError(error?.message || "Création impossible");
      return;
    }
    const member = await supabase
      .from("project_members")
      .insert({
        project_id: created.id,
        user_id: profile.id,
        member_role: "lead",
        added_by: profile.id,
      })
      .select()
      .single();
    setProjects((items) => [created as ProjectRow, ...items]);
    if (member.data)
      setProjectMembers((items) => [...items, member.data as ProjectMemberRow]);
    form.reset();
    setNotice("Projet créé dans le programme et l’organe sélectionnés.");
    setBusy(false);
    router.refresh();
  }

  async function createActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = event.currentTarget;
    const data = new FormData(form);
    const projectId = String(data.get("project_id") || "");
    const parent = projectMap[projectId];
    if (
      !parent?.program_id ||
      !manageableBodyIds.has(programMap[parent.program_id]?.body_id)
    ) {
      setError("Choisissez un projet géré par votre organe.");
      return;
    }
    const payload = {
      title: String(data.get("title") || "").trim(),
      activity_type: String(data.get("activity_type") || "other"),
      description: String(data.get("description") || "").trim() || null,
      project_id: projectId,
      program_id: parent.program_id,
      location: String(data.get("location") || "").trim() || null,
      starts_at: new Date(String(data.get("starts_at"))).toISOString(),
      ends_at: data.get("ends_at")
        ? new Date(String(data.get("ends_at"))).toISOString()
        : null,
      expected_participants: data.get("expected_participants")
        ? Number(data.get("expected_participants"))
        : null,
      budget_amount: data.get("budget_amount")
        ? Number(data.get("budget_amount"))
        : null,
      budget_currency: "XAF",
      manager_id: String(data.get("manager_id") || "") || profile.id,
      created_by: profile.id,
    };
    const { data: created, error } = await supabase
      .from("activities")
      .insert(payload)
      .select()
      .single();
    if (error || !created) {
      setError(error?.message || "Création impossible");
      return;
    }
    setActivities((items) => [created as PortfolioActivityRow, ...items]);
    form.reset();
    setNotice("Activité créée dans le projet sélectionné.");
    setBusy(false);
    router.refresh();
  }

  async function addProjectMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = event.currentTarget;
    const data = new FormData(form);
    const projectId = String(data.get("project_id") || "");
    const bodyId = bodyForProject(projectId);
    const userId = String(data.get("user_id") || "");
    if (!bodyId || !bodyStaff(bodyId).some((item) => item.id === userId)) {
      setError(
        "Ce collaborateur n’est pas rattaché à l’organe propriétaire du projet.",
      );
      return;
    }
    const { data: created, error } = await supabase
      .from("project_members")
      .insert({
        project_id: projectId,
        user_id: userId,
        member_role: String(data.get("member_role")),
        added_by: profile.id,
      })
      .select()
      .single();
    if (error || !created) {
      setError(error?.message || "Ajout impossible");
      return;
    }
    setProjectMembers((items) => [...items, created as ProjectMemberRow]);
    form.reset();
    setNotice("Collaborateur ajouté à l’équipe du projet.");
    setBusy(false);
    router.refresh();
  }

  async function createActivityTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = {
      activity_id: String(data.get("activity_id")),
      code:
        String(data.get("code") || "")
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9_-]/g, "-") || undefined,
      title: String(data.get("title") || "").trim(),
      description: String(data.get("description") || "").trim() || null,
      expected_output: String(data.get("expected_output") || "").trim() || null,
      sequence_no: numberValue(data, "sequence_no") || 1,
      assigned_to: String(data.get("assigned_to") || "") || null,
      due_date: data.get("due_date") || null,
      requires_evidence: false,
      requires_attendance: data.get("requires_attendance") === "on",
      status: String(data.get("status") || "planned"),
      created_by: profile.id,
    };
    const { data: created, error } = await supabase
      .from("activity_tasks")
      .insert(payload)
      .select()
      .single();
    if (error || !created) {
      setError(error?.message || "Création impossible");
      return;
    }
    setTasks((items) => [created as ActivityTaskRow, ...items]);
    setTaskCounts((items) => ({
      ...items,
      [created.activity_id]: (items[created.activity_id] || 0) + 1,
    }));
    form.reset();
    setNotice("Tâche de mise en œuvre créée dans l’activité.");
    setBusy(false);
    router.refresh();
  }

  async function createReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = event.currentTarget;
    const data = new FormData(form);
    const reportType = String(
      data.get("report_type") || "task_execution",
    ) as ReportType;
    const payload = {
      task_id: String(data.get("task_id")),
      reporter_id: profile.id,
      report_type: reportType,
      title:
        String(data.get("title") || "").trim() ||
        defaultReportTitle(reportType),
      period_start: data.get("period_start") || null,
      period_end: data.get("period_end") || null,
      rich_content_html: reportTemplateHtml(reportType),
      execution_date: String(data.get("execution_date")),
      started_at: data.get("started_at")
        ? new Date(String(data.get("started_at"))).toISOString()
        : null,
      ended_at: data.get("ended_at")
        ? new Date(String(data.get("ended_at"))).toISOString()
        : null,
      location: String(data.get("location") || "").trim() || null,
      latitude: data.get("latitude") ? Number(data.get("latitude")) : null,
      longitude: data.get("longitude") ? Number(data.get("longitude")) : null,
      summary: String(data.get("summary") || "").trim(),
      objectives: null,
      methodology: null,
      outcomes: null,
      challenges: null,
      recommendations: null,
      success_story: null,
      safeguarding_notes: null,
      women_count: 0,
      men_count: 0,
      girls_count: 0,
      boys_count: 0,
      disability_count: 0,
      vulnerable_count: 0,
    };
    const { data: created, error } = await supabase
      .from("task_reports")
      .insert(payload)
      .select()
      .single();
    if (error || !created) {
      setError(error?.message || "Création impossible");
      return;
    }
    upsertReport(created as TaskReportRow);
    setSelectedReportId(created.id);
    setReportTaskId("");
    form.reset();
    setNotice(
      "Brouillon créé. Les preuves sont facultatives sauf demande explicite du validateur.",
    );
    setBusy(false);
  }

  async function saveReport(
    event: FormEvent<HTMLFormElement>,
    report: TaskReportRow,
  ) {
    event.preventDefault();
    setBusy(true);
    const data = new FormData(event.currentTarget);
    const payload = {
      report_type: String(
        data.get("report_type") || report.report_type,
      ) as ReportType,
      title: String(data.get("title") || "").trim(),
      period_start: data.get("period_start") || null,
      period_end: data.get("period_end") || null,
      rich_content_html: richHtmlDraft,
      execution_date: String(data.get("execution_date")),
      started_at: data.get("started_at")
        ? new Date(String(data.get("started_at"))).toISOString()
        : null,
      ended_at: data.get("ended_at")
        ? new Date(String(data.get("ended_at"))).toISOString()
        : null,
      location: String(data.get("location") || "").trim() || null,
      latitude: data.get("latitude") ? Number(data.get("latitude")) : null,
      longitude: data.get("longitude") ? Number(data.get("longitude")) : null,
      summary: String(data.get("summary") || "").trim(),
      objectives: String(data.get("objectives") || "").trim() || null,
      methodology: String(data.get("methodology") || "").trim() || null,
      outcomes: String(data.get("outcomes") || "").trim() || null,
      challenges: String(data.get("challenges") || "").trim() || null,
      recommendations: String(data.get("recommendations") || "").trim() || null,
      success_story: String(data.get("success_story") || "").trim() || null,
      safeguarding_notes:
        String(data.get("safeguarding_notes") || "").trim() || null,
      women_count: numberValue(data, "women_count"),
      men_count: numberValue(data, "men_count"),
      girls_count: numberValue(data, "girls_count"),
      boys_count: numberValue(data, "boys_count"),
      disability_count: numberValue(data, "disability_count"),
      vulnerable_count: numberValue(data, "vulnerable_count"),
    };
    const { data: updated, error } = await supabase
      .from("task_reports")
      .update(payload)
      .eq("id", report.id)
      .select()
      .single();
    if (error || !updated) {
      setError(error?.message || "Enregistrement impossible");
      return;
    }
    upsertReport(updated as TaskReportRow);
    setNotice("Brouillon enregistré dans l’espace centralisé.");
    setBusy(false);
  }

  async function uploadFile(
    report: TaskReportRow,
    file: File,
    folder: "evidence" | "signatures",
  ) {
    const path = `${profile.id}/${report.id}/${folder}/${crypto.randomUUID()}-${cleanFileName(file.name)}`;
    const upload = await supabase.storage
      .from("aiac-task-reports")
      .upload(path, file, {
        contentType: file.type,
        upsert: false,
        cacheControl: "3600",
      });
    if (upload.error) throw upload.error;
    return path;
  }

  async function addEvidence(
    event: FormEvent<HTMLFormElement>,
    report: TaskReportRow,
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = (evidenceFile || data.get("file")) as File | null;
    if (!file || !file.name) {
      setError("Sélectionnez un fichier.");
      return;
    }
    if (typeof file.size === "number" && file.size > 15 * 1024 * 1024) {
      setError("Le fichier dépasse 15 Mo.");
      return;
    }
    setBusy(true);
    try {
      const path = await uploadFile(report, file, "evidence");
      const digest = await sha256(file);
      const { data: created, error } = await supabase
        .from("task_report_evidence")
        .insert({
          report_id: report.id,
          evidence_type: String(data.get("evidence_type")),
          storage_path: path,
          file_name: file.name,
          mime_type: file.type || "application/octet-stream",
          size_bytes: file.size,
          sha256: digest,
          caption: String(data.get("caption") || "").trim() || null,
          classification: String(data.get("classification") || "internal"),
          uploaded_by: profile.id,
        })
        .select()
        .single();
      if (error || !created) {
        await supabase.storage.from("aiac-task-reports").remove([path]);
        throw error || new Error("Enregistrement impossible");
      }
      setEvidence((items) => [...items, created as TaskReportEvidenceRow]);
      form.reset();
      setEvidenceFile(null);
      setNotice("Preuve ajoutée et empreinte SHA-256 enregistrée.");
      setBusy(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Envoi impossible");
    }
  }

  async function addGeneratedEvidence(report: TaskReportRow) {
    setBusy(true);
    const h = hierarchyForTask(report.task_id);
    const title = `${h.task?.code || "Tâche"} · ${h.task?.title || "Justificatif"}`;
    const generatedAt = new Date().toLocaleString("fr-FR");
    const pdfSafe = (value: string) =>
      value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\x20-\x7E]/g, " ")
        .replace(/[\\()]/g, (char) => `\\${char}`)
        .slice(0, 110);
    const lines = [
      "FICHE JUSTIFICATIVE AIAC",
      report.report_number,
      title,
      `Execution : ${formatDate(report.execution_date)}`,
      `Lieu : ${report.location || "Non renseigne"}`,
      `Produit le : ${generatedAt}`,
      "Fiche generee depuis le rapport centralise.",
      "Completer par des photos reelles lorsqu elles sont disponibles.",
    ];
    const commands = lines
      .map(
        (line, index) =>
          `${index === 0 ? "/F1 22 Tf" : "/F1 12 Tf"} 1 0 0 1 72 ${750 - index * 58} Tm (${pdfSafe(line)}) Tj`,
      )
      .join("\n");
    const stream = `BT\n${commands}\nET`;
    const objects = [
      "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
      "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
      "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >> endobj",
      `4 0 obj << /Length ${new TextEncoder().encode(stream).length} >> stream\n${stream}\nendstream\nendobj`,
      "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    ];
    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    for (const object of objects) {
      offsets.push(new TextEncoder().encode(pdf).length);
      pdf += `${object}\n`;
    }
    const xrefOffset = new TextEncoder().encode(pdf).length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
      .slice(1)
      .map((offset) => `${String(offset).padStart(10, "0")} 00000 n `)
      .join(
        "\n",
      )}\ntrailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    const file = new File(
      [pdf],
      `fiche-justificative-${report.report_number}.pdf`,
      { type: "application/pdf" },
    );
    try {
      const path = await uploadFile(report, file, "evidence");
      const digest = await sha256(file);
      const { data: created, error } = await supabase
        .from("task_report_evidence")
        .insert({
          report_id: report.id,
          evidence_type: "document",
          storage_path: path,
          file_name: file.name,
          mime_type: file.type,
          size_bytes: file.size,
          sha256: digest,
          caption: "Fiche justificative générée depuis les données du rapport.",
          classification: "internal",
          uploaded_by: profile.id,
        })
        .select()
        .single();
      if (error || !created) {
        await supabase.storage.from("aiac-task-reports").remove([path]);
        throw error || new Error("Enregistrement impossible");
      }
      setEvidence((items) => [...items, created as TaskReportEvidenceRow]);
      setNotice(
        "Fiche justificative générée, stockée et empreinte SHA-256 enregistrée.",
      );
      setBusy(false);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Génération impossible",
      );
    }
  }

  async function removeEvidence(item: TaskReportEvidenceRow) {
    setBusy(true);
    const storage = await supabase.storage
      .from("aiac-task-reports")
      .remove([item.storage_path]);
    if (storage.error) {
      setError(storage.error.message);
      return;
    }
    const { error } = await supabase
      .from("task_report_evidence")
      .delete()
      .eq("id", item.id);
    if (error) {
      setError(error.message);
      return;
    }
    setEvidence((items) => items.filter((row) => row.id !== item.id));
    setNotice("Preuve retirée du brouillon.");
    setBusy(false);
  }

  async function addAttendance(
    event: FormEvent<HTMLFormElement>,
    report: TaskReportRow,
  ) {
    event.preventDefault();
    setBusy(true);
    const form = event.currentTarget;
    const data = new FormData(form);
    const { data: created, error } = await supabase
      .from("task_report_attendance")
      .insert({
        report_id: report.id,
        participant_code:
          String(data.get("participant_code") || "").trim() || null,
        full_name: String(data.get("full_name") || "").trim(),
        phone: String(data.get("phone") || "").trim() || null,
        email: String(data.get("email") || "").trim() || null,
        gender: String(data.get("gender") || "unknown"),
        age_group: String(data.get("age_group") || "adult"),
        person_with_disability: data.get("person_with_disability") === "on",
        vulnerable: data.get("vulnerable") === "on",
        organization: String(data.get("organization") || "").trim() || null,
        role: String(data.get("role") || "").trim() || null,
        present: data.get("present") === "on",
        signature_name: String(data.get("signature_name") || "").trim() || null,
        consent_at: new Date().toISOString(),
        recorded_by: profile.id,
      })
      .select()
      .single();
    if (error || !created) {
      setError(error?.message || "Ajout impossible");
      return;
    }
    setAttendance((items) => [...items, created as TaskReportAttendanceRow]);
    form.reset();
    setNotice("Participant ajouté à la liste de présence sécurisée.");
    setBusy(false);
  }
  async function removeAttendance(id: string) {
    setBusy(true);
    const { error } = await supabase
      .from("task_report_attendance")
      .delete()
      .eq("id", id);
    if (error) {
      setError(error.message);
      return;
    }
    setAttendance((items) => items.filter((row) => row.id !== id));
    setBusy(false);
  }

  async function addIndicator(
    event: FormEvent<HTMLFormElement>,
    report: TaskReportRow,
  ) {
    event.preventDefault();
    setBusy(true);
    const form = event.currentTarget;
    const data = new FormData(form);
    const { data: created, error } = await supabase
      .from("task_report_indicator_values")
      .insert({
        report_id: report.id,
        indicator_code: String(data.get("indicator_code") || "")
          .trim()
          .toUpperCase(),
        indicator_label: String(data.get("indicator_label") || "").trim(),
        unit: String(data.get("unit") || "").trim(),
        baseline_value: data.get("baseline_value")
          ? Number(data.get("baseline_value"))
          : null,
        target_value: data.get("target_value")
          ? Number(data.get("target_value"))
          : null,
        achieved_value: Number(data.get("achieved_value")),
        verification_source:
          String(data.get("verification_source") || "").trim() || null,
        notes: String(data.get("notes") || "").trim() || null,
        recorded_by: profile.id,
      })
      .select()
      .single();
    if (error || !created) {
      setError(error?.message || "Ajout impossible");
      return;
    }
    setIndicators((items) => [...items, created as TaskReportIndicatorRow]);
    form.reset();
    setNotice("Contribution à l’indicateur enregistrée.");
    setBusy(false);
  }

  async function submitReport(
    event: FormEvent<HTMLFormElement>,
    report: TaskReportRow,
  ) {
    event.preventDefault();
    setBusy(true);
    const form = event.currentTarget;
    const data = new FormData(form);
    const signatureFile = data.get("signature_file");
    try {
      let signaturePath: null | string = null;
      if (signatureFile instanceof File && signatureFile.size) {
        if (
          signatureFile.size > 2 * 1024 * 1024 ||
          !signatureFile.type.startsWith("image/")
        )
          throw new Error("La signature doit être une image de 2 Mo maximum.");
        signaturePath = await uploadFile(report, signatureFile, "signatures");
      }
      const { data: updated, error } = await supabase.rpc(
        "submit_task_report",
        {
          target_report_id: report.id,
          signature_name: String(data.get("signature_name") || "").trim(),
          signature_asset_path: signaturePath,
        },
      );
      if (error || !updated) throw error || new Error("Soumission impossible");
      upsertReport(updated as TaskReportRow);
      const refreshed = await Promise.all([
        supabase
          .from("task_report_approvals")
          .select("*")
          .eq("report_id", report.id)
          .order("created_at"),
        supabase
          .from("task_report_events")
          .select("*")
          .eq("report_id", report.id)
          .order("created_at"),
      ]);
      if (refreshed[0].data)
        setApprovals((items) => [
          ...items.filter((row) => row.report_id !== report.id),
          ...(refreshed[0].data as TaskReportApprovalRow[]),
        ]);
      if (refreshed[1].data)
        setEvents((items) => [
          ...items.filter((row) => row.report_id !== report.id),
          ...(refreshed[1].data as TaskReportEventRow[]),
        ]);
      form.reset();
      setNotice(
        "Rapport signé, version figée et transmis au responsable hiérarchique.",
      );
      setBusy(false);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Soumission impossible",
      );
    }
  }

  async function reviewReport(
    event: FormEvent<HTMLFormElement>,
    report: TaskReportRow,
    decision: "approved" | "returned",
  ) {
    event.preventDefault();
    setBusy(true);
    const form = event.currentTarget;
    const data = new FormData(form);
    const signatureFile = data.get("signature_file");
    const requireEvidence = data.get("require_evidence") === "on";
    try {
      let signaturePath: null | string = null;
      if (signatureFile instanceof File && signatureFile.size) {
        if (
          signatureFile.size > 2 * 1024 * 1024 ||
          !signatureFile.type.startsWith("image/")
        )
          throw new Error("La signature doit être une image de 2 Mo maximum.");
        signaturePath = await uploadFile(report, signatureFile, "signatures");
      }
      const { data: updated, error } = await supabase.rpc(
        "review_task_report_with_evidence",
        {
          target_report_id: report.id,
          decision,
          review_comment: String(data.get("comment") || "").trim(),
          signature_name: String(data.get("signature_name") || "").trim(),
          signature_asset_path: signaturePath,
          require_evidence: requireEvidence,
        },
      );
      if (error || !updated) throw error || new Error("Validation impossible");
      upsertReport(updated as TaskReportRow);
      const refreshed = await Promise.all([
        supabase
          .from("task_report_approvals")
          .select("*")
          .eq("report_id", report.id)
          .order("created_at"),
        supabase
          .from("task_report_events")
          .select("*")
          .eq("report_id", report.id)
          .order("created_at"),
      ]);
      if (refreshed[0].data)
        setApprovals((items) => [
          ...items.filter((row) => row.report_id !== report.id),
          ...(refreshed[0].data as TaskReportApprovalRow[]),
        ]);
      if (refreshed[1].data)
        setEvents((items) => [
          ...items.filter((row) => row.report_id !== report.id),
          ...(refreshed[1].data as TaskReportEventRow[]),
        ]);
      form.reset();
      setNotice(
        decision === "approved"
          ? "Rapport validé et signé. Il entre maintenant dans les consolidations."
          : requireEvidence
            ? "Rapport retourné : une preuve sera exigée à la prochaine soumission."
            : "Rapport retourné à l’agent avec les corrections demandées.",
      );
      setBusy(false);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Validation impossible",
      );
    }
  }

  async function openEvidence(item: TaskReportEvidenceRow) {
    const { data, error } = await supabase.storage
      .from("aiac-task-reports")
      .createSignedUrl(item.storage_path, 60);
    if (error || !data) {
      setNotice(error?.message || "Ouverture impossible");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function buildReportHtml(
    report: TaskReportRow,
    publicVersion: boolean,
  ) {
    const h = hierarchyForTask(report.task_id);
    const rows = attendance.filter((item) => item.report_id === report.id);
    const files = evidence.filter(
      (item) =>
        item.report_id === report.id &&
        (publicVersion ? item.classification === "public" : true),
    );
    const values = indicators.filter((item) => item.report_id === report.id);
    const signs = approvals.filter((item) => item.report_id === report.id);
    const images = await Promise.all(
      files
        .filter((item) => item.mime_type.startsWith("image/"))
        .map(async (item) => ({
          item,
          url:
            (
              await supabase.storage
                .from("aiac-task-reports")
                .createSignedUrl(item.storage_path, 900)
            ).data?.signedUrl || "",
        })),
    );
    const total =
      report.women_count +
      report.men_count +
      report.girls_count +
      report.boys_count;
    const rich = pruneEmptyReportSections(
      sanitizeRichHtml(report.rich_content_html || ""),
    );
    const section = (
      title: string,
      value: string | null | undefined,
      confidential = false,
    ) =>
      value?.trim() && (!publicVersion || !confidential)
        ? `<h2>${escapeHtml(title)}</h2><p${confidential ? ' class="conf"' : ""}>${escapeHtml(value).replace(/\n/g, "<br>")}</p>`
        : "";
    const beneficiarySection =
      total || report.disability_count || report.vulnerable_count
        ? `<h2>Bénéficiaires</h2><table><tr><th>Femmes</th><th>Hommes</th><th>Filles</th><th>Garçons</th><th>Total</th><th>Handicap</th><th>Vulnérabilité</th></tr><tr><td>${report.women_count}</td><td>${report.men_count}</td><td>${report.girls_count}</td><td>${report.boys_count}</td><td>${total}</td><td>${report.disability_count}</td><td>${report.vulnerable_count}</td></tr></table>`
        : "";
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(report.title || report.report_number)}</title><style>body{font:14px/1.55 Arial,sans-serif;color:#17202a;max-width:900px;margin:auto;padding:32px}header{text-align:center;border-bottom:3px solid #0b6b3a;padding-bottom:16px}h1{font-size:24px;color:#0b6b3a}h2{font-size:17px;color:#174c35;border-bottom:1px solid #b9c9c0;padding-bottom:5px;margin-top:25px}h3{font-size:15px}table{border-collapse:collapse;width:100%;margin:12px 0}th,td{border:1px solid #aab8b0;padding:7px;text-align:left;vertical-align:top}.meta{background:#f3f8f5}.report-content img,.photos img{max-width:100%;height:auto;max-height:480px;object-fit:contain}.report-content figure,.photos figure{break-inside:avoid;text-align:center}.report-content figcaption,.photos figcaption{font-size:12px;color:#52645b}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:28px}.signature{min-height:90px;border-top:1px solid #555;margin-top:35px;padding-top:8px}.photos{display:grid;grid-template-columns:1fr 1fr;gap:14px}.hash{font:10px monospace;word-break:break-all}.conf{color:#9b1c1c;font-weight:bold}.exportBar{position:sticky;bottom:0;background:#fff;padding:12px;border-top:1px solid #ccc}@media print{.exportBar{display:none}body{padding:0}.report-content{orphans:3;widows:3}}</style></head><body><header><b>AGENCE D’INTERVENTION ET D’ACTION COMMUNAUTAIRE — AIAC</b><h1>${escapeHtml(report.title || reportTypes[report.report_type] || "Rapport")}</h1><div>${escapeHtml(report.report_number)} · ${publicVersion ? "Version publique anonymisée" : "Dossier interne"} · Révision ${report.revision}</div></header><table class="meta"><tr><th>Organe responsable</th><td colspan="3">${escapeHtml(bodyNames[report.body_id || ""] || "Rattachement institutionnel")}</td></tr><tr><th>Programme</th><td>${escapeHtml(h.program?.code)} · ${escapeHtml(h.program?.name)}</td><th>Projet</th><td>${escapeHtml(h.project?.code)} · ${escapeHtml(h.project?.name)}</td></tr><tr><th>Activité</th><td>${escapeHtml(h.activity?.code)} · ${escapeHtml(h.activity?.title)}</td><th>Tâche</th><td>${escapeHtml(h.task?.code)} · ${escapeHtml(h.task?.title)}</td></tr><tr><th>Période</th><td>${escapeHtml(report.period_start ? `${formatDate(report.period_start)}${report.period_end ? ` – ${formatDate(report.period_end)}` : ""}` : formatDate(report.execution_date))}</td><th>Lieu</th><td>${escapeHtml(report.location || "Non renseigné")}</td></tr></table>${section("Résumé exécutif", report.summary)}${rich ? `<div class="report-content">${rich}</div>` : ""}${section("Objectifs", report.objectives)}${section("Méthodologie", report.methodology)}${section("Résultats obtenus", report.outcomes)}${section("Difficultés", report.challenges)}${section("Recommandations", report.recommendations)}${section("Histoire de réussite", report.success_story)}${section("Note confidentielle de sauvegarde", report.safeguarding_notes, true)}${beneficiarySection}${values.length ? `<h2>Indicateurs et moyens de vérification</h2><table><tr><th>Code</th><th>Indicateur</th><th>Référence</th><th>Cible</th><th>Réalisé</th><th>Source</th></tr>${values.map((item) => `<tr><td>${escapeHtml(item.indicator_code)}</td><td>${escapeHtml(item.indicator_label)} (${escapeHtml(item.unit)})</td><td>${escapeHtml(item.baseline_value ?? "")}</td><td>${escapeHtml(item.target_value ?? "")}</td><td>${escapeHtml(item.achieved_value)}</td><td>${escapeHtml(item.verification_source || "")}</td></tr>`).join("")}</table>` : ""}${rows.length ? `<h2>Liste de présence ${publicVersion ? "— données anonymisées" : ""}</h2><table><tr>${publicVersion ? "" : `<th>Nom</th><th>Contact</th>`}<th>Genre</th><th>Groupe d’âge</th><th>Organisation/rôle</th><th>Présence</th></tr>${rows.map((item) => `<tr>${publicVersion ? "" : `<td>${escapeHtml(item.full_name)}</td><td>${escapeHtml(item.phone || item.email || "")}</td>`}<td>${escapeHtml(item.gender)}</td><td>${escapeHtml(item.age_group)}</td><td>${escapeHtml([item.organization, item.role].filter(Boolean).join(" · "))}</td><td>${item.present ? "Oui" : "Non"}</td></tr>`).join("")}</table>` : ""}${images.length ? `<h2>Annexe photographique</h2><div class="photos">${images.map(({ item, url }) => `<figure><img src="${escapeHtml(url)}" alt="Preuve"><figcaption>${escapeHtml(item.caption || item.file_name)}</figcaption></figure>`).join("")}</div>` : ""}${
      files.filter((item) => !item.mime_type.startsWith("image/")).length
        ? `<h2>Pièces justificatives annexées</h2><ul>${files
            .filter((item) => !item.mime_type.startsWith("image/"))
            .map(
              (item) =>
                `<li>${escapeHtml(item.file_name)}${item.caption ? ` — ${escapeHtml(item.caption)}` : ""}</li>`,
            )
            .join("")}</ul>`
        : ""
    }${signs.length ? `<h2>Signatures et validation</h2><div class="signatures">${signs.map((item) => `<div class="signature"><b>${escapeHtml(decisionLabels[item.decision] || item.decision)} ${escapeHtml(item.actor_name)}</b><br>${escapeHtml(item.actor_job_title || item.actor_role)}<br>Signature déclarée : ${escapeHtml(item.signature_name)}<br>${formatDate(item.signed_at, true)}</div>`).join("")}</div>` : ""}<h2>Traçabilité</h2><p class="hash">Empreinte SHA-256 de la version : ${escapeHtml(report.current_hash || "Brouillon non figé")}</p><p>Document généré depuis la plateforme centralisée AIAC. ${publicVersion ? "Les listes nominatives, contacts et notes sensibles ont été retirés." : "Document interne soumis aux règles de confidentialité AIAC."}</p><div class="exportBar"><button onclick="window.print()">Imprimer / Enregistrer en PDF</button></div></body></html>`;
  }

  function downloadBlob(contents: BlobPart, fileName: string, mime: string) {
    const url = URL.createObjectURL(new Blob([contents], { type: mime }));
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function printReport(report: TaskReportRow, publicVersion: boolean) {
    const popup = window.open("", "_blank");
    if (!popup) {
      setNotice(
        "Autorisez les fenêtres contextuelles pour produire le rapport.",
      );
      return;
    }
    popup.document.write(await buildReportHtml(report, publicVersion));
    popup.document.close();
  }
  async function downloadReport(
    report: TaskReportRow,
    format: "html" | "word",
    publicVersion = false,
  ) {
    const html = await buildReportHtml(report, publicVersion);
    const name = `${cleanFileName(report.report_number)}-${publicVersion ? "public" : "interne"}`;
    downloadBlob(
      format === "word" ? `\ufeff${html}` : html,
      `${name}.${format === "word" ? "doc" : "html"}`,
      format === "word"
        ? "application/msword;charset=utf-8"
        : "text/html;charset=utf-8",
    );
    setNotice(
      format === "word"
        ? "Document Word téléchargé."
        : "Document HTML5 téléchargé.",
    );
  }

  async function publishReport(report: TaskReportRow) {
    if (report.status !== "approved" || !report.body_id) {
      setError(
        "Le rapport doit être approuvé et rattaché à un organe avant sa publication.",
      );
      return;
    }
    if (report.public_content_id) {
      setNotice("Ce rapport est déjà publié.");
      return;
    }
    setBusy(true);
    try {
      const h = hierarchyForTask(report.task_id);
      const publicHtml = await buildReportHtml(report, true);
      const publicDoc = new DOMParser().parseFromString(
        publicHtml,
        "text/html",
      );
      publicDoc.querySelector(".exportBar")?.remove();
      const privateGallery = publicDoc.querySelector(".photos");
      if (privateGallery) {
        const heading = privateGallery.previousElementSibling;
        if (heading?.tagName === "H2") heading.remove();
        privateGallery.remove();
      }
      const bodyText = publicDoc.body.innerHTML;
      const title =
        report.title ||
        `${reportTypes[report.report_type] || "Rapport"} — ${h.task?.title || report.report_number}`;
      const publicSummary =
        report.summary.trim().length >= 10
          ? report.summary.slice(0, 1200)
          : `${title} — rapport public validé de l’AIAC.`;
      const { data: publication, error } = await supabase
        .from("public_content_items")
        .insert({
          body_id: report.body_id,
          content_type: "report",
          subtype: reportTypes[report.report_type] || "Rapport",
          title,
          slug: makeSlug(title),
          summary: publicSummary,
          content: bodyText,
          content_format: "html",
          location: report.location,
          activity_date: report.execution_date,
          status: "published",
          project_id: h.project?.id || null,
          program_id: h.program?.id || null,
          source_task_report_id: report.id,
          created_by: profile.id,
        })
        .select()
        .single();
      if (error || !publication)
        throw error || new Error("Publication impossible");
      const publicFiles = evidence.filter(
        (item) =>
          item.report_id === report.id && item.classification === "public",
      );
      const mediaRows = [] as Array<Record<string, unknown>>;
      for (let index = 0; index < publicFiles.length; index++) {
        const item = publicFiles[index];
        const downloaded = await supabase.storage
          .from("aiac-task-reports")
          .download(item.storage_path);
        if (downloaded.error || !downloaded.data) continue;
        const path = `${report.body_id}/${publication.id}/${crypto.randomUUID()}-${cleanFileName(item.file_name)}`;
        const uploaded = await supabase.storage
          .from("aiac-public-media")
          .upload(path, downloaded.data, {
            contentType: item.mime_type,
            upsert: false,
          });
        if (!uploaded.error)
          mediaRows.push({
            content_id: publication.id,
            media_type: item.mime_type.startsWith("image/")
              ? "image"
              : item.mime_type.startsWith("video/")
                ? "video"
                : item.mime_type.startsWith("audio/")
                  ? "audio"
                  : "document",
            storage_path: path,
            title: item.file_name,
            caption: item.caption,
            alt_text: item.caption || item.file_name,
            sort_order: index,
            created_by: profile.id,
          });
      }
      if (mediaRows.length)
        await supabase.from("public_content_media").insert(mediaRows);
      const linked = await supabase.rpc("link_task_report_publication", {
        target_report_id: report.id,
        target_content_id: publication.id,
      });
      if (linked.error || !linked.data)
        throw linked.error || new Error("Liaison de publication impossible");
      upsertReport(linked.data as TaskReportRow);
      setNotice(
        "Rapport public anonymisé publié dans la rubrique de l’organe. Il est maintenant visible par les visiteurs.",
      );
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Publication impossible",
      );
      return;
    }
    setBusy(false);
  }

  function buildProjectDossier(project: ProjectRow, availableTasks = tasks) {
    const program = project.program_id
      ? programMap[project.program_id]
      : undefined;
    const body = program
      ? bodies.find((item) => item.id === program.body_id)
      : undefined;
    const childActivities = activities.filter(
      (item) => item.project_id === project.id,
    );
    const childTasks = availableTasks.filter((task) =>
      childActivities.some((activity) => activity.id === task.activity_id),
    );
    const childReports = reports.filter((report) =>
      childTasks.some((task) => task.id === report.task_id),
    );
    const approvedReports = childReports.filter(
      (report) => report.status === "approved",
    );
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${escapeHtml(project.code)} · ${escapeHtml(project.name)}</title><style>body{font:14px/1.5 Arial;max-width:950px;margin:auto;padding:32px;color:#17202a}header{border-bottom:3px solid #0b6b3a;text-align:center}h1,h2{color:#0b6b3a}table{border-collapse:collapse;width:100%;margin:15px 0}th,td{border:1px solid #aab8b0;padding:8px;text-align:left}small{color:#52645b}@media print{button{display:none}}</style></head><body><header><b>AGENCE D’INTERVENTION ET D’ACTION COMMUNAUTAIRE — AIAC</b><h1>DOSSIER DU PROJET</h1></header><table><tr><th>Organe propriétaire</th><td>${escapeHtml(body ? `${body.code} · ${body.name}` : "")}</td></tr><tr><th>Programme</th><td>${escapeHtml(program ? `${program.code} · ${program.name}` : "")}</td></tr><tr><th>Projet</th><td>${escapeHtml(`${project.code} · ${project.name}`)}</td></tr><tr><th>Période</th><td>${escapeHtml(`${formatDate(project.start_date)} – ${formatDate(project.end_date)}`)}</td></tr><tr><th>Lieu</th><td>${escapeHtml(project.location || "")}</td></tr><tr><th>État</th><td>${escapeHtml(portfolioStatuses[project.status] || project.status)}</td></tr></table>${project.description ? `<h2>Description et objectif</h2><p>${escapeHtml(project.description).replace(/\n/g, "<br>")}</p>` : ""}<h2>Chaîne de mise en œuvre</h2><table><tr><th>Activité</th><th>Tâches</th><th>Rapports approuvés</th></tr>${childActivities
      .map((activity) => {
        const activityTasks = childTasks.filter(
          (task) => task.activity_id === activity.id,
        );
        return `<tr><td>${escapeHtml(`${activity.code} · ${activity.title}`)}</td><td>${activityTasks.map((task) => escapeHtml(`${task.code} · ${task.title}`)).join("<br>")}</td><td>${approvedReports
          .filter((report) =>
            activityTasks.some((task) => task.id === report.task_id),
          )
          .map((report) =>
            escapeHtml(
              `${report.report_number} · ${report.title || report.summary.slice(0, 80)}`,
            ),
          )
          .join("<br>")}</td></tr>`;
      })
      .join(
        "",
      )}</table><h2>État consolidé</h2><p>${childActivities.length} activité(s), ${childTasks.length} tâche(s), ${childReports.length} rapport(s), dont ${approvedReports.length} approuvé(s).</p><button onclick="window.print()">Imprimer / Enregistrer en PDF</button></body></html>`;
  }
  async function openProjectDossier(project: ProjectRow) {
    const popup = window.open("", "_blank");
    if (!popup) {
      setNotice("Autorisez les fenêtres contextuelles pour ouvrir le projet.");
      return;
    }
    popup.document.write("<p>Chargement du dossier complet…</p>");
    const availableTasks = await tasksForProject(project);
    popup.document.open();
    popup.document.write(buildProjectDossier(project, availableTasks));
    popup.document.close();
  }
  async function downloadProjectDossier(
    project: ProjectRow,
    format: "html" | "word",
  ) {
    const availableTasks = await tasksForProject(project);
    const html = buildProjectDossier(project, availableTasks);
    downloadBlob(
      format === "word" ? `\ufeff${html}` : html,
      `${cleanFileName(project.code)}-dossier.${format === "word" ? "doc" : "html"}`,
      format === "word"
        ? "application/msword;charset=utf-8"
        : "text/html;charset=utf-8",
    );
  }

  function hierarchyLabel(task: ActivityTaskRow) {
    const h = hierarchyForTask(task.id);
    return `${h.program?.code || "Programme"} → ${h.project?.code || "Projet"} → ${h.activity?.code || "Activité"} → ${task.code}`;
  }
  const approved = reports.filter((item) => item.status === "approved");
  const totalApprovedBeneficiaries = approved.reduce(
    (sum, item) =>
      sum +
      item.women_count +
      item.men_count +
      item.girls_count +
      item.boys_count,
    0,
  );
  const reviewQueue = reports.filter(
    (item) => item.status === "submitted" && canReview(item),
  );
  const reportPrograms = programs.filter(
    (item) =>
      item.body_id === reportBodyId &&
      !["completed", "cancelled"].includes(item.status),
  );
  const reportProjects = projects.filter(
    (item) =>
      item.program_id === reportProgramId &&
      !["completed", "cancelled"].includes(item.status),
  );
  const reportActivities = activities.filter(
    (item) =>
      item.project_id === reportProjectId &&
      !["completed", "cancelled"].includes(item.status),
  );
  const reportTasks = tasks.filter(
    (item) =>
      item.activity_id === reportActivityId &&
      canCreateReport(item) &&
      ["planned", "active"].includes(item.status),
  );

  return (
    <section className="fieldReporting">
      {notice && (
        <div className="notice" role="status">
          {notice}
          <button onClick={() => setNotice("")}>×</button>
        </div>
      )}
      <div className="portalPanel fieldHero">
        <div>
          <p className="eyebrow">Gestion opérationnelle par organe</p>
          <h2>Programmes et rapports</h2>
          <p>
            Organe responsable → Programme → Projet → Activité → Tâche → Rapport
            signé → Validation hiérarchique.
          </p>
        </div>
        <div className="fieldMetrics">
          <span>
            <b>
              {reports.filter((item) => item.reporter_id === profile.id).length}
            </b>{" "}
            Mes rapports
          </span>
          <span>
            <b>{reviewQueue.length}</b> À valider
          </span>
          <span>
            <b>{approved.length}</b> Approuvés
          </span>
        </div>
      </div>
      <div className="operationNav">
        {[
          ["structure", "Structure et tâches"],
          ["rapports", "Saisir et suivre"],
          [
            "validation",
            `Validation${reviewQueue.length ? ` (${reviewQueue.length})` : ""}`,
          ],
          ["consolidation", "Consolidations"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={section === id ? "active" : ""}
            onClick={() => {
              setSection(id);
              setSelectedReportId(null);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {section === "structure" && (
        <>
          <div className="portalPanel structureIntro">
            <h3>Construire la chaîne dans l’ordre</h3>
            <p>
              Commencez obligatoirement par l’organe propriétaire. Tous les
              projets, activités, tâches, accès du personnel et rapports
              héritent ensuite de ce rattachement.
            </p>
            <div className="structureSteps" aria-label="Étapes de la structure">
              {[
                ["program", "1 · Programme"],
                ["project", "2 · Projet"],
                ["activity", "3 · Activité"],
                ["task", "4 · Tâches et équipe"],
                ["tree", "5 · Vérifier l’arborescence"],
              ].map(([id, label]) => (
                <button
                  type="button"
                  key={id}
                  className={structureStep === id ? "active" : ""}
                  onClick={() => setStructureStep(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="structureGrid">
            {structureStep === "program" && (
              <div className="portalPanel">
                <h3>1 · Programme de l’organe</h3>
                <form className="operationForm" onSubmit={createProgram}>
                  <label className="wideField">
                    Organe propriétaire
                    <select
                      name="body_id"
                      value={newProgramBodyId}
                      onChange={(event) =>
                        setNewProgramBodyId(event.target.value)
                      }
                      required
                    >
                      <option value="">Choisir d’abord l’organe</option>
                      {manageableBodies.map((item) => (
                        <option value={item.id} key={item.id}>
                          {item.code} · {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <input
                    name="code"
                    placeholder="Code du programme"
                    maxLength={30}
                    required
                  />
                  <input name="name" placeholder="Nom du programme" required />
                  <input name="thematic_area" placeholder="Axe thématique" />
                  <select name="manager_id">
                    <option value="">Responsable à définir</option>
                    {bodyStaff(newProgramBodyId).map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.full_name || item.email}
                      </option>
                    ))}
                  </select>
                  <textarea
                    className="wideField"
                    name="description"
                    placeholder="Objectifs et résultats attendus"
                  />
                  <label>
                    Début
                    <input name="start_date" type="date" />
                  </label>
                  <label>
                    Fin
                    <input name="end_date" type="date" />
                  </label>
                  <label>
                    Budget (XAF)
                    <input
                      name="budget_amount"
                      type="number"
                      min="0"
                      step="1"
                    />
                  </label>
                  <button disabled={busy || !newProgramBodyId}>
                    Créer le programme
                  </button>
                </form>
              </div>
            )}
            {structureStep === "project" && (
              <div className="portalPanel">
                <h3>2 · Projet du programme</h3>
                <form className="operationForm" onSubmit={createProject}>
                  <label className="wideField">
                    Programme parent
                    <select name="program_id" required>
                      <option value="">Choisir un programme</option>
                      {programs
                        .filter(
                          (item) =>
                            manageableBodyIds.has(item.body_id) &&
                            !["completed", "cancelled"].includes(item.status),
                        )
                        .map((item) => (
                          <option value={item.id} key={item.id}>
                            {bodyNames[item.body_id]} → {item.code} ·{" "}
                            {item.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <input
                    name="code"
                    placeholder="Code du projet"
                    minLength={2}
                    maxLength={30}
                    required
                  />
                  <input name="name" placeholder="Nom du projet" required />
                  <textarea
                    className="wideField"
                    name="description"
                    placeholder="Objectif et description"
                  />
                  <input name="location" placeholder="Zone d’intervention" />
                  <label>
                    Début
                    <input name="start_date" type="date" />
                  </label>
                  <label>
                    Fin
                    <input name="end_date" type="date" />
                  </label>
                  <label>
                    Budget (XAF)
                    <input
                      name="budget_amount"
                      type="number"
                      min="0"
                      step="1"
                    />
                  </label>
                  <button disabled={busy || programs.length === 0}>
                    Créer le projet
                  </button>
                </form>
              </div>
            )}
            {structureStep === "activity" && (
              <div className="portalPanel">
                <h3>3 · Activité du projet</h3>
                <form className="operationForm" onSubmit={createActivity}>
                  <label className="wideField">
                    Projet parent
                    <select
                      name="project_id"
                      value={newActivityProjectId}
                      onChange={(event) =>
                        setNewActivityProjectId(event.target.value)
                      }
                      required
                    >
                      <option value="">Choisir un projet</option>
                      {projects
                        .filter(
                          (item) =>
                            item.program_id &&
                            manageableBodyIds.has(
                              programMap[item.program_id]?.body_id,
                            ),
                        )
                        .map((item) => (
                          <option value={item.id} key={item.id}>
                            {
                              bodyNames[
                                programMap[item.program_id || ""]?.body_id
                              ]
                            }{" "}
                            → {programNames[item.program_id || ""]} →{" "}
                            {item.code} · {item.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <input
                    name="title"
                    placeholder="Intitulé de l’activité"
                    required
                  />
                  <select name="activity_type">
                    <option value="meeting">Réunion</option>
                    <option value="training">Formation</option>
                    <option value="workshop">Atelier</option>
                    <option value="awareness">Sensibilisation</option>
                    <option value="field_visit">Visite terrain</option>
                    <option value="distribution">Distribution</option>
                    <option value="advocacy">Plaidoyer</option>
                    <option value="monitoring">Suivi-évaluation</option>
                    <option value="event">Événement</option>
                    <option value="other">Autre</option>
                  </select>
                  <textarea
                    className="wideField"
                    name="description"
                    placeholder="Objectifs et déroulé"
                  />
                  <input name="location" placeholder="Lieu" />
                  <label>
                    Début
                    <input name="starts_at" type="datetime-local" required />
                  </label>
                  <label>
                    Fin
                    <input name="ends_at" type="datetime-local" />
                  </label>
                  <input
                    name="expected_participants"
                    type="number"
                    min="0"
                    placeholder="Participants attendus"
                  />
                  <input
                    name="budget_amount"
                    type="number"
                    min="0"
                    placeholder="Budget XAF"
                  />
                  <select name="manager_id">
                    <option value="">Moi-même</option>
                    {bodyStaff(activityProjectBodyId).map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.full_name || item.email}
                      </option>
                    ))}
                  </select>
                  <button disabled={busy || !newActivityProjectId}>
                    Créer l’activité
                  </button>
                </form>
              </div>
            )}
            {structureStep === "task" && (
              <div className="portalPanel">
                <h3>4 · Tâche de l’activité</h3>
                <form className="operationForm" onSubmit={createActivityTask}>
                  <label className="wideField">
                    Activité parent
                    <select
                      name="activity_id"
                      value={newTaskActivityId}
                      onChange={(event) =>
                        setNewTaskActivityId(event.target.value)
                      }
                      required
                    >
                      <option value="">Choisir une activité</option>
                      {activities
                        .filter(
                          (activity) =>
                            activity.project_id &&
                            manageableBodyIds.has(
                              bodyForProject(activity.project_id) || "",
                            ),
                        )
                        .map((activity) => {
                          const project = projectMap[activity.project_id || ""];
                          const program = programMap[project?.program_id || ""];
                          return (
                            <option value={activity.id} key={activity.id}>
                              {bodyNames[program?.body_id || ""]} →{" "}
                              {programNames[program?.id || ""]} →{" "}
                              {projectNames[project?.id || ""]} →{" "}
                              {activity.code} · {activity.title}
                            </option>
                          );
                        })}
                    </select>
                  </label>
                  <input name="code" placeholder="Code — généré si vide" />
                  <input
                    name="title"
                    placeholder="Intitulé de la tâche"
                    required
                  />
                  <textarea
                    className="wideField"
                    name="description"
                    placeholder="Description et consignes"
                  />
                  <textarea
                    className="wideField"
                    name="expected_output"
                    placeholder="Produit ou résultat attendu"
                  />
                  <label>
                    Ordre
                    <input
                      name="sequence_no"
                      type="number"
                      min="1"
                      defaultValue="1"
                    />
                  </label>
                  <label>
                    Responsable
                    <select name="assigned_to">
                      <option value="">Équipe autorisée de l’organe</option>
                      {bodyStaff(taskBodyId).map((item) => (
                        <option value={item.id} key={item.id}>
                          {item.full_name || item.email}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Échéance
                    <input name="due_date" type="date" />
                  </label>
                  <label>
                    État
                    <select name="status" defaultValue="planned">
                      {Object.entries(taskStatuses).map(([value, label]) => (
                        <option value={value} key={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="wideField evidencePolicyHint">
                    <b>Preuves facultatives par défaut.</b> Le supérieur pourra
                    exiger une preuve motivée au moment de la validation.
                  </p>
                  <label className="consentCheck">
                    <input name="requires_attendance" type="checkbox" /> Liste
                    de présence obligatoire
                  </label>
                  <button disabled={busy || !newTaskActivityId}>
                    Créer la tâche
                  </button>
                </form>
              </div>
            )}
          </div>
          {structureStep === "task" && (
            <>
              <div className="portalPanel">
                <h3>Équipe du projet</h3>
                <p>
                  Seules les personnes rattachées à l’organe propriétaire
                  peuvent être ajoutées.
                </p>
                <form
                  className="operationForm compact"
                  onSubmit={addProjectMember}
                >
                  <select
                    name="project_id"
                    value={teamProjectId}
                    onChange={(event) => setTeamProjectId(event.target.value)}
                    required
                  >
                    <option value="">Projet</option>
                    {projects
                      .filter(
                        (item) =>
                          item.program_id &&
                          manageableBodyIds.has(
                            programMap[item.program_id]?.body_id,
                          ),
                      )
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.code} · {item.name}
                        </option>
                      ))}
                  </select>
                  <select name="user_id" required>
                    <option value="">Collaborateur de l’organe</option>
                    {bodyStaff(bodyForProject(teamProjectId) || "")
                      .filter((item) => item.id !== profile.id)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.full_name || item.email}
                        </option>
                      ))}
                  </select>
                  <select name="member_role">
                    <option value="lead">Responsable</option>
                    <option value="officer">Agent</option>
                    <option value="contributor">Contributeur</option>
                    <option value="viewer">Observateur</option>
                  </select>
                  <button disabled={busy || !teamProjectId}>Ajouter</button>
                </form>
              </div>
            </>
          )}
          {structureStep === "tree" && (
            <>
              <div className="portalPanel">
                <h3>Afficher ou télécharger un projet</h3>
                <p>
                  Le dossier rassemble l’identité du projet, son programme, ses
                  activités, tâches et rapports approuvés.
                </p>
                <div className="compactForm">
                  <select
                    value={teamProjectId}
                    onChange={(event) => setTeamProjectId(event.target.value)}
                  >
                    <option value="">Choisir le projet</option>
                    {projects
                      .filter(
                        (item) =>
                          item.program_id &&
                          manageableBodyIds.has(
                            programMap[item.program_id]?.body_id,
                          ),
                      )
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.code} · {item.name}
                        </option>
                      ))}
                  </select>
                  <button
                    disabled={!teamProjectId}
                    onClick={() => {
                      const project = projectMap[teamProjectId];
                      if (project) openProjectDossier(project);
                    }}
                  >
                    Afficher
                  </button>
                  <button
                    disabled={!teamProjectId}
                    onClick={() => {
                      const project = projectMap[teamProjectId];
                      if (project) downloadProjectDossier(project, "word");
                    }}
                  >
                    Word
                  </button>
                  <button
                    disabled={!teamProjectId}
                    onClick={() => {
                      const project = projectMap[teamProjectId];
                      if (project) downloadProjectDossier(project, "html");
                    }}
                  >
                    HTML5
                  </button>
                </div>
              </div>
              <div className="portalPanel">
                <div className="panelTitle">
                  <div>
                    <h3>Arborescence complète par organe</h3>
                    <p>
                      Les tâches sont chargées uniquement à l’ouverture de leur
                      activité pour garder la plateforme rapide.
                    </p>
                  </div>
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Rechercher programme, projet ou activité"
                  />
                </div>
                {manageableBodies.map((body) => {
                  const bodyPrograms = programs.filter(
                    (program) =>
                      (program.body_id === body.id &&
                        `${program.code} ${program.name} ${body.name}`
                          .toLowerCase()
                          .includes(query.toLowerCase())) ||
                      (program.body_id === body.id &&
                        projects.some(
                          (project) =>
                            project.program_id === program.id &&
                            `${project.code} ${project.name}`
                              .toLowerCase()
                              .includes(query.toLowerCase()),
                        )) ||
                      (program.body_id === body.id &&
                        activities.some(
                          (activity) =>
                            activity.program_id === program.id &&
                            `${activity.code} ${activity.title}`
                              .toLowerCase()
                              .includes(query.toLowerCase()),
                        )),
                  );
                  if (!bodyPrograms.length) return null;
                  return (
                    <details
                      className="workflowCard bodyWorkflow"
                      key={body.id}
                      open
                    >
                      <summary>
                        <span>
                          <b>
                            {body.code} · {body.name}
                          </b>
                          <small>{bodyPrograms.length} programme(s)</small>
                        </span>
                      </summary>
                      <div className="workflowBody">
                        {bodyPrograms.map((program) => {
                          const childProjects = projects.filter(
                            (project) => project.program_id === program.id,
                          );
                          return (
                            <details
                              className="workflowCard"
                              key={program.id}
                              open
                            >
                              <summary>
                                <span>
                                  <b>
                                    {program.code} · {program.name}
                                  </b>
                                  <small>
                                    {childProjects.length} projet(s) ·{" "}
                                    {program.manager_id
                                      ? profileNames[program.manager_id] ||
                                        "Responsable désigné"
                                      : "Responsable à désigner"}
                                  </small>
                                </span>
                                <span
                                  className={`operationBadge ${program.status}`}
                                >
                                  {portfolioStatuses[program.status] ||
                                    program.status}
                                </span>
                              </summary>
                              <div className="workflowBody">
                                {childProjects.length ? (
                                  childProjects.map((project) => {
                                    const childActivities = activities.filter(
                                      (activity) =>
                                        activity.project_id === project.id,
                                    );
                                    return (
                                      <details
                                        className="workflowCard"
                                        key={project.id}
                                      >
                                        <summary>
                                          <span>
                                            <b>
                                              {project.code} · {project.name}
                                            </b>
                                            <small>
                                              {childActivities.length}{" "}
                                              activité(s)
                                            </small>
                                          </span>
                                          <span
                                            className={`operationBadge ${project.status}`}
                                          >
                                            {portfolioStatuses[
                                              project.status
                                            ] || project.status}
                                          </span>
                                        </summary>
                                        <div className="workflowBody">
                                          {childActivities.length ? (
                                            childActivities.map((activity) => {
                                              const childTasks = tasks.filter(
                                                (task) =>
                                                  task.activity_id ===
                                                  activity.id,
                                              );
                                              const total =
                                                taskCounts[activity.id] ||
                                                childTasks.length;
                                              return (
                                                <details
                                                  className="workflowCard"
                                                  key={activity.id}
                                                  onToggle={(event) => {
                                                    if (
                                                      event.currentTarget.open
                                                    )
                                                      void loadActivityTasks(
                                                        activity.id,
                                                      );
                                                  }}
                                                >
                                                  <summary>
                                                    <span>
                                                      <b>
                                                        {activity.code} ·{" "}
                                                        {activity.title}
                                                      </b>
                                                      <small>
                                                        {total} tâche(s)
                                                      </small>
                                                    </span>
                                                    <span
                                                      className={`operationBadge ${activity.status}`}
                                                    >
                                                      {portfolioStatuses[
                                                        activity.status
                                                      ] || activity.status}
                                                    </span>
                                                  </summary>
                                                  <div className="workflowBody">
                                                    {loadingActivityId ===
                                                    activity.id ? (
                                                      <p>
                                                        Chargement des tâches…
                                                      </p>
                                                    ) : childTasks.length ? (
                                                      childTasks.map((task) => (
                                                        <div
                                                          className="listRow"
                                                          key={task.id}
                                                        >
                                                          <div>
                                                            <b>
                                                              {task.code} ·{" "}
                                                              {task.title}
                                                            </b>
                                                            <small>
                                                              {task.assigned_to
                                                                ? profileNames[
                                                                    task
                                                                      .assigned_to
                                                                  ] ||
                                                                  "Responsable"
                                                                : "Équipe de l’organe"}{" "}
                                                              ·{" "}
                                                              {task.requires_evidence
                                                                ? "Preuve requise"
                                                                : "Preuve facultative"}
                                                            </small>
                                                          </div>
                                                          <span>
                                                            {taskStatuses[
                                                              task.status
                                                            ] || task.status}
                                                          </span>
                                                        </div>
                                                      ))
                                                    ) : loadedActivityIds.has(
                                                        activity.id,
                                                      ) ? (
                                                      <p>
                                                        Aucune tâche accessible
                                                        dans cette activité.
                                                      </p>
                                                    ) : (
                                                      <p>
                                                        Ouvrez l’activité pour
                                                        charger ses tâches.
                                                      </p>
                                                    )}
                                                  </div>
                                                </details>
                                              );
                                            })
                                          ) : (
                                            <p>
                                              Aucune activité dans ce projet.
                                            </p>
                                          )}
                                        </div>
                                      </details>
                                    );
                                  })
                                ) : (
                                  <p>Aucun projet dans ce programme.</p>
                                )}
                              </div>
                            </details>
                          );
                        })}
                      </div>
                    </details>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {section === "rapports" && (
        <>
          <div className="portalPanel">
            <h3>Créer un dossier de rapport</h3>
            <p>
              Choisissez chaque niveau. Seules les tâches de l’activité
              sélectionnée sont chargées, ce qui garantit une navigation rapide
              même avec un grand référentiel.
            </p>
            <form
              className="operationForm fieldReportForm"
              onSubmit={createReport}
            >
              <label>
                Type de rapport
                <select name="report_type" defaultValue="task_execution">
                  {Object.entries(reportTypes).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="wideField">
                Titre officiel
                <input
                  name="title"
                  placeholder="Laisser vide pour reprendre le titre du modèle"
                />
              </label>
              <label>
                Organe
                <select
                  value={reportBodyId}
                  onChange={(event) => {
                    setReportBodyId(event.target.value);
                    setReportProgramId("");
                    setReportProjectId("");
                    void chooseReportActivity("");
                  }}
                  required
                >
                  <option value="">Choisir l’organe</option>
                  {manageableBodies.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.code} · {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Programme
                <select
                  value={reportProgramId}
                  onChange={(event) => {
                    setReportProgramId(event.target.value);
                    setReportProjectId("");
                    void chooseReportActivity("");
                  }}
                  required
                  disabled={!reportBodyId}
                >
                  <option value="">Choisir le programme</option>
                  {reportPrograms.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.code} · {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Projet
                <select
                  value={reportProjectId}
                  onChange={(event) => {
                    setReportProjectId(event.target.value);
                    void chooseReportActivity("");
                  }}
                  required
                  disabled={!reportProgramId}
                >
                  <option value="">Choisir le projet</option>
                  {reportProjects.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.code} · {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Activité
                <select
                  value={reportActivityId}
                  onChange={(event) =>
                    void chooseReportActivity(event.target.value)
                  }
                  required
                  disabled={!reportProjectId}
                >
                  <option value="">Choisir l’activité</option>
                  {reportActivities.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.code} · {item.title} ({taskCounts[item.id] || 0}{" "}
                      tâches)
                    </option>
                  ))}
                </select>
              </label>
              <label className="wideField">
                Tâche
                <select
                  name="task_id"
                  value={reportTaskId}
                  onChange={(event) => setReportTaskId(event.target.value)}
                  required
                  disabled={
                    !reportActivityId || loadingActivityId === reportActivityId
                  }
                >
                  <option value="">
                    {loadingActivityId === reportActivityId
                      ? "Chargement des tâches…"
                      : "Choisir la tâche à renseigner"}
                  </option>
                  {reportTasks.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.code} · {item.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Date de référence
                <input
                  name="execution_date"
                  type="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  required
                />
              </label>
              <label>
                Début de période
                <input name="period_start" type="date" />
              </label>
              <label>
                Fin de période
                <input name="period_end" type="date" />
              </label>
              <label>
                Début horaire
                <input name="started_at" type="datetime-local" />
              </label>
              <label>
                Fin horaire
                <input name="ended_at" type="datetime-local" />
              </label>
              <label>
                Lieu
                <input name="location" placeholder="Localité et site" />
              </label>
              <label>
                Latitude
                <input
                  name="latitude"
                  type="number"
                  step="0.000001"
                  min="-90"
                  max="90"
                />
              </label>
              <label>
                Longitude
                <input
                  name="longitude"
                  type="number"
                  step="0.000001"
                  min="-180"
                  max="180"
                />
              </label>
              <label className="wideField">
                Présentation courte / résumé exécutif
                <textarea
                  name="summary"
                  minLength={5}
                  maxLength={15000}
                  required
                  placeholder="Ce résumé sert aussi à identifier le rapport dans les listes et, après approbation, sur le site public."
                />
              </label>
              <button disabled={busy || !reportTaskId}>
                Créer et ouvrir le modèle complet
              </button>
            </form>
            {reportActivityId &&
              loadedActivityIds.has(reportActivityId) &&
              reportTasks.length === 0 && (
                <p>
                  Aucune tâche active accessible dans cette activité. Vérifiez
                  votre affectation au projet.
                </p>
              )}
          </div>
          <div className="portalPanel">
            <div className="panelTitle">
              <div>
                <h3>Rapports accessibles</h3>
                <p>
                  Les droits de la plateforme déterminent automatiquement les
                  dossiers visibles.
                </p>
              </div>
              <div className="fieldFilters">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Rechercher"
                />
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                >
                  <option value="all">Tous les statuts</option>
                  {Object.entries(reportStatuses).map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {visibleReports.length === 0 ? (
              <p>Aucun rapport correspondant.</p>
            ) : (
              visibleReports.map((report) => {
                const h = hierarchyForTask(report.task_id);
                return (
                  <button
                    className={`reportListItem ${selectedReportId === report.id ? "selected" : ""}`}
                    key={report.id}
                    onClick={() => setSelectedReportId(report.id)}
                  >
                    <span>
                      <b>{report.title || report.report_number}</b>
                      <small>
                        {reportTypes[report.report_type] || "Rapport"} ·{" "}
                        {report.report_number}
                      </small>
                      <small>
                        {hierarchyLabel(h.task)} · {h.task?.title}
                      </small>
                      <small>
                        {formatDate(report.execution_date)} ·{" "}
                        {profileNames[report.reporter_id] || "Agent AIAC"}
                      </small>
                    </span>
                    <i className={`operationBadge ${report.status}`}>
                      {reportStatuses[report.status]}
                    </i>
                  </button>
                );
              })
            )}
          </div>
          {selectedReport && <OfficialReportDetails report={selectedReport} />}
        </>
      )}

      {section === "validation" && (
        <div className="portalPanel">
          <h3>Rapports en attente de votre validation</h3>
          <p>
            La validation porte toujours sur une version figée et son empreinte
            numérique.
          </p>
          {reviewQueue.length === 0 ? (
            <p>Aucun rapport ne nécessite votre intervention.</p>
          ) : (
            reviewQueue.map((report) => (
              <div className="reviewCard" key={report.id}>
                <div className="panelTitle">
                  <div>
                    <h4>{report.report_number}</h4>
                    <p>
                      {hierarchyLabel(taskMap[report.task_id])} ·{" "}
                      {taskMap[report.task_id]?.title}
                    </p>
                  </div>
                  <span className="operationBadge submitted">
                    Soumis · révision {report.revision}
                  </span>
                </div>
                <p>{report.summary}</p>
                <p className="hashPreview">SHA-256 : {report.current_hash}</p>
                <div className="reportActions">
                  <button onClick={() => printReport(report, false)}>
                    Consulter le dossier interne
                  </button>
                  <button onClick={() => printReport(report, true)}>
                    Aperçu anonymisé
                  </button>
                </div>
                <form
                  className="reviewForm"
                  onSubmit={(event) => reviewReport(event, report, "approved")}
                >
                  <input
                    name="signature_name"
                    defaultValue={profile.full_name || ""}
                    placeholder="Nom et prénom du signataire"
                    required
                  />
                  <label>
                    Image de signature facultative
                    <input
                      name="signature_file"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                    />
                  </label>
                  <textarea
                    name="comment"
                    placeholder="Observation de validation"
                  />
                  <button className="approveButton" disabled={busy}>
                    Approuver et signer
                  </button>
                </form>
                <form
                  className="reviewForm returnForm"
                  onSubmit={(event) => reviewReport(event, report, "returned")}
                >
                  <input
                    name="signature_name"
                    defaultValue={profile.full_name || ""}
                    placeholder="Nom et prénom"
                    required
                  />
                  <textarea
                    name="comment"
                    minLength={5}
                    placeholder="Corrections précises demandées"
                    required
                  />
                  <label className="evidenceReviewChoice">
                    <input name="require_evidence" type="checkbox" /> Exiger au
                    moins une preuve à la prochaine soumission
                  </label>
                  <button disabled={busy}>Retourner pour correction</button>
                </form>
              </div>
            ))
          )}
        </div>
      )}

      {section === "consolidation" && (
        <>
          <div className="statGrid operationStats">
            <article>
              <b>{approved.length}</b>
              <span>Tâches validées</span>
            </article>
            <article>
              <b>{totalApprovedBeneficiaries}</b>
              <span>Participations validées</span>
            </article>
            <article>
              <b>
                {
                  new Set(
                    approved
                      .map(
                        (item) => hierarchyForTask(item.task_id).activity?.id,
                      )
                      .filter(Boolean),
                  ).size
                }
              </b>
              <span>Activités alimentées</span>
            </article>
            <article>
              <b>
                {
                  new Set(
                    approved
                      .map((item) => hierarchyForTask(item.task_id).project?.id)
                      .filter(Boolean),
                  ).size
                }
              </b>
              <span>Projets alimentés</span>
            </article>
          </div>
          <div className="portalPanel">
            <h3>Rapports officiels consolidés</h3>
            <p>
              Seuls les rapports approuvés apparaissent ici. Les résultats
              peuvent être lus par tâche, activité, projet ou programme selon
              votre accréditation.
            </p>
            <table className="reportTable">
              <thead>
                <tr>
                  <th>Programme / projet</th>
                  <th>Activité / tâche</th>
                  <th>Rapport</th>
                  <th>Participants</th>
                  <th>Approuvé</th>
                  <th>Produire</th>
                </tr>
              </thead>
              <tbody>
                {approved.map((report) => {
                  const h = hierarchyForTask(report.task_id);
                  return (
                    <tr key={report.id}>
                      <td>
                        {h.program?.code}
                        <br />
                        <small>
                          {h.project?.code} · {h.project?.name}
                        </small>
                      </td>
                      <td>
                        {h.activity?.code} · {h.activity?.title}
                        <br />
                        <small>
                          {h.task?.code} · {h.task?.title}
                        </small>
                      </td>
                      <td>
                        {report.report_number}
                        <br />
                        <small>Révision {report.revision}</small>
                      </td>
                      <td>
                        {report.women_count +
                          report.men_count +
                          report.girls_count +
                          report.boys_count}
                      </td>
                      <td>{formatDate(report.approved_at, true)}</td>
                      <td>
                        <button onClick={() => printReport(report, false)}>
                          Interne
                        </button>
                        <button onClick={() => printReport(report, true)}>
                          Public
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {approved.length === 0 && (
              <p>Aucun rapport approuvé pour le moment.</p>
            )}
          </div>
        </>
      )}
    </section>
  );

  function OfficialReportDetails({ report }: { report: TaskReportRow }) {
    const editable =
      report.reporter_id === profile.id &&
      ["draft", "returned"].includes(report.status);
    const reportEvidence = evidence.filter(
      (item) => item.report_id === report.id,
    );
    const reportAttendance = attendance.filter(
      (item) => item.report_id === report.id,
    );
    const reportIndicators = indicators.filter(
      (item) => item.report_id === report.id,
    );
    const reportApprovals = approvals.filter(
      (item) => item.report_id === report.id,
    );
    const reportEvents = events
      .filter((item) => item.report_id === report.id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    return (
      <div className="portalPanel reportDetail officialReportDetail">
        <div className="panelTitle">
          <div>
            <p className="eyebrow">
              {reportTypes[report.report_type] || "Rapport officiel"}
            </p>
            <h3>{report.title || report.report_number}</h3>
            <p>
              {report.report_number} · {hierarchyLabel(taskMap[report.task_id])}{" "}
              · Révision {report.revision}
            </p>
          </div>
          <div>
            <span className={`operationBadge ${report.status}`}>
              {reportStatuses[report.status]}
            </span>
            {report.public_content_id && (
              <span className="operationBadge published">Publié</span>
            )}
          </div>
        </div>
        {report.status === "returned" && (
          <div className="warningBox">
            <b>Corrections demandées</b>
            <p>
              {reportApprovals
                .filter((item) => item.decision === "returned")
                .at(-1)?.comment || "Consultez l’historique de validation."}
            </p>
            {report.evidence_required_by_reviewer && (
              <p>
                <b>Une preuve est exigée avant la prochaine soumission.</b>{" "}
                {report.evidence_requirement_comment || ""}
              </p>
            )}
          </div>
        )}
        <form
          key={report.updated_at}
          className="operationForm fieldReportForm reportDocumentForm"
          onSubmit={(event) => saveReport(event, report)}
        >
          <label>
            Type
            <select
              name="report_type"
              defaultValue={report.report_type || "task_execution"}
              disabled={!editable}
            >
              {Object.entries(reportTypes).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="wideField">
            Titre officiel
            <input
              name="title"
              defaultValue={
                report.title || reportTypes[report.report_type] || "Rapport"
              }
              disabled={!editable}
              required
            />
          </label>
          <label>
            Date de référence
            <input
              name="execution_date"
              type="date"
              defaultValue={report.execution_date}
              disabled={!editable}
              required
            />
          </label>
          <label>
            Début de période
            <input
              name="period_start"
              type="date"
              defaultValue={report.period_start || ""}
              disabled={!editable}
            />
          </label>
          <label>
            Fin de période
            <input
              name="period_end"
              type="date"
              defaultValue={report.period_end || ""}
              disabled={!editable}
            />
          </label>
          <label>
            Début horaire
            <input
              name="started_at"
              type="datetime-local"
              defaultValue={
                report.started_at
                  ? new Date(report.started_at).toISOString().slice(0, 16)
                  : ""
              }
              disabled={!editable}
            />
          </label>
          <label>
            Fin horaire
            <input
              name="ended_at"
              type="datetime-local"
              defaultValue={
                report.ended_at
                  ? new Date(report.ended_at).toISOString().slice(0, 16)
                  : ""
              }
              disabled={!editable}
            />
          </label>
          <label>
            Lieu
            <input
              name="location"
              defaultValue={report.location || ""}
              disabled={!editable}
            />
          </label>
          <label>
            Latitude
            <input
              name="latitude"
              type="number"
              step="0.000001"
              defaultValue={report.latitude ?? ""}
              disabled={!editable}
            />
          </label>
          <label>
            Longitude
            <input
              name="longitude"
              type="number"
              step="0.000001"
              defaultValue={report.longitude ?? ""}
              disabled={!editable}
            />
          </label>
          <label className="wideField">
            Résumé exécutif
            <textarea
              name="summary"
              defaultValue={report.summary}
              disabled={!editable}
              required
            />
          </label>
          <div className="richEditorWide reportNarrativeEditor">
            <span className="richEditorLabel">Corps complet du rapport</span>
            {editable ? (
              <RichHtmlEditor
                key={`${report.id}-${report.updated_at}`}
                initialHtml={
                  report.rich_content_html ||
                  reportTemplateHtml(report.report_type || "task_execution")
                }
                resetToken={`${report.id}-${report.updated_at}`}
                onChange={setRichHtmlDraft}
                allowInlineImages
                htmlImportMode="editable"
                placeholder="Rédigez chaque partie, collez depuis Word, ajoutez des tableaux ou insérez une photo à la position du curseur…"
              />
            ) : (
              <div
                className="richReportPreview"
                dangerouslySetInnerHTML={{
                  __html: pruneEmptyReportSections(
                    sanitizeRichHtml(report.rich_content_html || ""),
                  ),
                }}
              />
            )}
            <small>
              Les titres dont le contenu reste vide seront automatiquement
              supprimés du rapport produit. Les photos insérées ici apparaissent
              dans le texte; les originaux peuvent aussi être conservés comme
              preuves en annexe.
            </small>
          </div>
          <details className="wideField structuredData">
            <summary>
              Données structurées, confidentialité et statistiques
            </summary>
            <div className="operationForm fieldReportForm">
              <label className="wideField">
                Objectifs structurés
                <textarea
                  name="objectives"
                  defaultValue={report.objectives || ""}
                  disabled={!editable}
                />
              </label>
              <label className="wideField">
                Méthodologie structurée
                <textarea
                  name="methodology"
                  defaultValue={report.methodology || ""}
                  disabled={!editable}
                />
              </label>
              <label className="wideField">
                Résultats structurés
                <textarea
                  name="outcomes"
                  defaultValue={report.outcomes || ""}
                  disabled={!editable}
                />
              </label>
              <label className="wideField">
                Difficultés structurées
                <textarea
                  name="challenges"
                  defaultValue={report.challenges || ""}
                  disabled={!editable}
                />
              </label>
              <label className="wideField">
                Recommandations structurées
                <textarea
                  name="recommendations"
                  defaultValue={report.recommendations || ""}
                  disabled={!editable}
                />
              </label>
              <label className="wideField">
                Histoire de réussite
                <textarea
                  name="success_story"
                  defaultValue={report.success_story || ""}
                  disabled={!editable}
                />
              </label>
              <label className="wideField confidentialField">
                Note de sauvegarde confidentielle — jamais publiée
                <textarea
                  name="safeguarding_notes"
                  defaultValue={report.safeguarding_notes || ""}
                  disabled={!editable}
                />
              </label>
              {[
                ["women_count", "Femmes", report.women_count],
                ["men_count", "Hommes", report.men_count],
                ["girls_count", "Filles", report.girls_count],
                ["boys_count", "Garçons", report.boys_count],
                ["disability_count", "Handicap", report.disability_count],
                ["vulnerable_count", "Vulnérabilité", report.vulnerable_count],
              ].map(([name, label, value]) => (
                <label key={String(name)}>
                  {label}
                  <input
                    name={String(name)}
                    type="number"
                    min="0"
                    defaultValue={String(value)}
                    disabled={!editable}
                  />
                </label>
              ))}
            </div>
          </details>
          {editable && (
            <button disabled={busy}>Enregistrer tout le dossier</button>
          )}
        </form>
        <div className="reportSubsection">
          <h4>Preuves et photographies annexes</h4>
          <p>
            Une preuve « Publiable » peut être copiée dans la galerie du rapport
            public; les preuves internes et restreintes ne quittent pas l’espace
            sécurisé.
          </p>
          {reportEvidence.map((item) => (
            <div className="listRow" key={item.id}>
              <div>
                <b>{item.file_name}</b>
                <small>
                  {item.caption || item.evidence_type} · {item.classification} ·
                  SHA-256 {item.sha256?.slice(0, 12)}…
                </small>
              </div>
              <span>
                <button onClick={() => openEvidence(item)}>Ouvrir</button>
                {editable && (
                  <button onClick={() => removeEvidence(item)}>Retirer</button>
                )}
              </span>
            </div>
          ))}
          {editable && (
            <>
              <form
                className="compactForm"
                onSubmit={(event) => addEvidence(event, report)}
              >
                <select name="evidence_type">
                  <option value="photo">Photo</option>
                  <option value="document">Document</option>
                  <option value="video">Vidéo</option>
                  <option value="audio">Audio</option>
                  <option value="other">Autre</option>
                </select>
                <input name="caption" placeholder="Légende et contexte" />
                <select name="classification">
                  <option value="internal">Interne</option>
                  <option value="restricted">Restreinte</option>
                  <option value="public">Publiable</option>
                </select>
                <input
                  name="file"
                  type="file"
                  onChange={(event) =>
                    setEvidenceFile(event.currentTarget.files?.[0] || null)
                  }
                />
                {evidenceFile && (
                  <small>Fichier sélectionné : {evidenceFile.name}</small>
                )}
                <button disabled={busy}>Ajouter</button>
              </form>
              <div className="reportActions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => addGeneratedEvidence(report)}
                >
                  Générer une fiche justificative
                </button>
              </div>
            </>
          )}
        </div>
        <div className="reportSubsection">
          <h4>Liste de présence sécurisée</h4>
          {reportAttendance.length > 0 && (
            <table className="reportTable">
              <thead>
                <tr>
                  <th>Participant</th>
                  <th>Genre/âge</th>
                  <th>Organisation/rôle</th>
                  <th>Présent</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {reportAttendance.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {item.full_name}
                      <br />
                      <small>
                        {item.phone ||
                          item.email ||
                          item.participant_code ||
                          "—"}
                      </small>
                    </td>
                    <td>
                      {item.gender} · {item.age_group}
                    </td>
                    <td>
                      {item.organization || "—"} · {item.role || "—"}
                    </td>
                    <td>{item.present ? "Oui" : "Non"}</td>
                    <td>
                      {editable && (
                        <button onClick={() => removeAttendance(item.id)}>
                          Retirer
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {editable && (
            <form
              className="compactForm attendanceForm"
              onSubmit={(event) => addAttendance(event, report)}
            >
              <input name="full_name" placeholder="Nom complet" required />
              <input name="participant_code" placeholder="Code participant" />
              <input name="phone" placeholder="Téléphone" />
              <input name="email" type="email" placeholder="E-mail" />
              <select name="gender">
                <option value="female">Femme</option>
                <option value="male">Homme</option>
                <option value="other">Autre</option>
                <option value="prefer_not_to_say">Préfère ne pas dire</option>
                <option value="unknown">Non renseigné</option>
              </select>
              <select name="age_group">
                <option value="child">Enfant</option>
                <option value="youth">Jeune</option>
                <option value="adult">Adulte</option>
                <option value="older_person">Personne âgée</option>
                <option value="unknown">Non renseigné</option>
              </select>
              <input name="organization" placeholder="Organisation/localité" />
              <input name="role" placeholder="Fonction/rôle" />
              <input name="signature_name" placeholder="Signature ou mention" />
              <label>
                <input name="present" type="checkbox" defaultChecked /> Présent
              </label>
              <label>
                <input name="person_with_disability" type="checkbox" /> Handicap
              </label>
              <label>
                <input name="vulnerable" type="checkbox" /> Vulnérabilité
              </label>
              <button disabled={busy}>Ajouter avec consentement</button>
            </form>
          )}
        </div>
        <div className="reportSubsection">
          <h4>Indicateurs et moyens de vérification</h4>
          {reportIndicators.map((item) => (
            <div className="listRow" key={item.id}>
              <div>
                <b>
                  {item.indicator_code} · {item.indicator_label}
                </b>
                <small>
                  Réalisé : {item.achieved_value} {item.unit} · Cible :{" "}
                  {item.target_value ?? "—"} ·{" "}
                  {item.verification_source || "Source non renseignée"}
                </small>
              </div>
            </div>
          ))}
          {editable && (
            <form
              className="compactForm"
              onSubmit={(event) => addIndicator(event, report)}
            >
              <input name="indicator_code" placeholder="Code" required />
              <input name="indicator_label" placeholder="Indicateur" required />
              <input name="unit" placeholder="Unité" required />
              <input
                name="baseline_value"
                type="number"
                step="any"
                placeholder="Référence"
              />
              <input
                name="target_value"
                type="number"
                step="any"
                placeholder="Cible"
              />
              <input
                name="achieved_value"
                type="number"
                step="any"
                placeholder="Réalisé"
                required
              />
              <input
                name="verification_source"
                placeholder="Source de vérification"
              />
              <button disabled={busy}>Ajouter</button>
            </form>
          )}
        </div>
        {editable && (
          <div className="signatureBox">
            <h4>Signer et soumettre</h4>
            <p>
              La soumission fige le contenu riche, les tableaux, les images
              intégrées, les annexes, présences et indicateurs dans la même
              empreinte numérique.
            </p>
            <form
              className="reviewForm"
              onSubmit={(event) => submitReport(event, report)}
            >
              <input
                name="signature_name"
                defaultValue={profile.full_name || ""}
                placeholder="Nom et prénom du signataire"
                required
              />
              <label>
                Image de votre signature, facultative
                <input
                  name="signature_file"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                />
              </label>
              <button className="approveButton" disabled={busy}>
                Signer et soumettre
              </button>
            </form>
          </div>
        )}
        <div className="reportSubsection">
          <h4>Produire et diffuser</h4>
          <div className="reportActions exportActions">
            <button onClick={() => printReport(report, false)}>
              PDF / impression interne
            </button>
            <button onClick={() => downloadReport(report, "word")}>
              Word (.doc)
            </button>
            <button onClick={() => downloadReport(report, "html")}>
              HTML5
            </button>
            <button onClick={() => printReport(report, true)}>
              Aperçu public
            </button>
            <button onClick={() => downloadReport(report, "word", true)}>
              Word public
            </button>
            <button onClick={() => downloadReport(report, "html", true)}>
              HTML5 public
            </button>
            {report.status === "approved" && !report.public_content_id && (
              <button
                className="approveButton"
                disabled={busy}
                onClick={() => publishReport(report)}
              >
                Publier sur la plateforme
              </button>
            )}
            {report.public_content_id && (
              <a
                className="secondaryButton"
                target="_blank"
                href="/publications/rapports"
              >
                Voir dans les rapports publics
              </a>
            )}
          </div>
          <small>
            Le bouton PDF ouvre la version mise en page : choisissez «
            Enregistrer au format PDF » dans la boîte d’impression du
            navigateur.
          </small>
        </div>
        <div className="reportSubsection">
          <h4>Signatures et décisions</h4>
          {reportApprovals.map((item) => (
            <div className="approvalRow" key={item.id}>
              <span>{decisionLabels[item.decision] || item.decision}</span>
              <b>{item.actor_name}</b>
              <small>
                {item.actor_job_title || item.actor_role} ·{" "}
                {formatDate(item.signed_at, true)}
              </small>
              {item.comment && <p>{item.comment}</p>}
              <code>{item.content_hash}</code>
            </div>
          ))}
        </div>
        <div className="reportSubsection">
          <h4>Historique complet</h4>
          {reportEvents.map((item) => (
            <div className="timelineItem" key={item.id}>
              <span>{formatDate(item.created_at, true)}</span>
              <b>{eventLabels[item.event_type] || item.event_type}</b>
              <small>
                {item.comment ||
                  `${item.from_status || ""}${item.to_status ? ` → ${item.to_status}` : ""}`}
              </small>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function ReportDetails({ report }: { report: TaskReportRow }) {
    const editable =
      report.reporter_id === profile.id &&
      ["draft", "returned"].includes(report.status);
    const reportEvidence = evidence.filter(
      (item) => item.report_id === report.id,
    );
    const reportAttendance = attendance.filter(
      (item) => item.report_id === report.id,
    );
    const reportIndicators = indicators.filter(
      (item) => item.report_id === report.id,
    );
    const reportApprovals = approvals.filter(
      (item) => item.report_id === report.id,
    );
    const reportEvents = events
      .filter((item) => item.report_id === report.id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    return (
      <div className="portalPanel reportDetail">
        <div className="panelTitle">
          <div>
            <h3>{report.report_number}</h3>
            <p>
              {hierarchyLabel(taskMap[report.task_id])} · Révision{" "}
              {report.revision}
            </p>
          </div>
          <span className={`operationBadge ${report.status}`}>
            {reportStatuses[report.status]}
          </span>
        </div>
        {report.status === "returned" && (
          <div className="warningBox">
            <b>Corrections demandées</b>
            <p>
              {reportApprovals
                .filter((item) => item.decision === "returned")
                .at(-1)?.comment || "Consultez l’historique de validation."}
            </p>
          </div>
        )}
        <form
          key={report.updated_at}
          className="operationForm fieldReportForm"
          onSubmit={(event) => saveReport(event, report)}
        >
          <label>
            Date
            <input
              name="execution_date"
              type="date"
              defaultValue={report.execution_date}
              disabled={!editable}
              required
            />
          </label>
          <label>
            Début
            <input
              name="started_at"
              type="datetime-local"
              defaultValue={
                report.started_at
                  ? new Date(report.started_at).toISOString().slice(0, 16)
                  : ""
              }
              disabled={!editable}
            />
          </label>
          <label>
            Fin
            <input
              name="ended_at"
              type="datetime-local"
              defaultValue={
                report.ended_at
                  ? new Date(report.ended_at).toISOString().slice(0, 16)
                  : ""
              }
              disabled={!editable}
            />
          </label>
          <label>
            Lieu
            <input
              name="location"
              defaultValue={report.location || ""}
              disabled={!editable}
            />
          </label>
          <label>
            Latitude
            <input
              name="latitude"
              type="number"
              step="0.000001"
              defaultValue={report.latitude ?? ""}
              disabled={!editable}
            />
          </label>
          <label>
            Longitude
            <input
              name="longitude"
              type="number"
              step="0.000001"
              defaultValue={report.longitude ?? ""}
              disabled={!editable}
            />
          </label>
          <label className="wideField">
            Résumé
            <textarea
              name="summary"
              defaultValue={report.summary}
              disabled={!editable}
              required
            />
          </label>
          <label className="wideField">
            Objectifs
            <textarea
              name="objectives"
              defaultValue={report.objectives || ""}
              disabled={!editable}
            />
          </label>
          <label className="wideField">
            Méthodologie
            <textarea
              name="methodology"
              defaultValue={report.methodology || ""}
              disabled={!editable}
            />
          </label>
          <label className="wideField">
            Résultats
            <textarea
              name="outcomes"
              defaultValue={report.outcomes || ""}
              disabled={!editable}
            />
          </label>
          <label className="wideField">
            Difficultés
            <textarea
              name="challenges"
              defaultValue={report.challenges || ""}
              disabled={!editable}
            />
          </label>
          <label className="wideField">
            Recommandations
            <textarea
              name="recommendations"
              defaultValue={report.recommendations || ""}
              disabled={!editable}
            />
          </label>
          <label className="wideField">
            Histoire de réussite
            <textarea
              name="success_story"
              defaultValue={report.success_story || ""}
              disabled={!editable}
            />
          </label>
          <label className="wideField confidentialField">
            Note de sauvegarde confidentielle
            <textarea
              name="safeguarding_notes"
              defaultValue={report.safeguarding_notes || ""}
              disabled={!editable}
            />
          </label>
          {[
            ["women_count", "Femmes", report.women_count],
            ["men_count", "Hommes", report.men_count],
            ["girls_count", "Filles", report.girls_count],
            ["boys_count", "Garçons", report.boys_count],
            ["disability_count", "Handicap", report.disability_count],
            ["vulnerable_count", "Vulnérabilité", report.vulnerable_count],
          ].map(([name, label, value]) => (
            <label key={String(name)}>
              {label}
              <input
                name={String(name)}
                type="number"
                min="0"
                defaultValue={String(value)}
                disabled={!editable}
              />
            </label>
          ))}
          {editable && (
            <button disabled={busy}>Enregistrer le brouillon</button>
          )}
        </form>
        <div className="reportSubsection">
          <h4>Preuves et photographies</h4>
          {reportEvidence.map((item) => (
            <div className="listRow" key={item.id}>
              <div>
                <b>{item.file_name}</b>
                <small>
                  {item.caption || item.evidence_type} · {item.classification} ·
                  SHA-256 {item.sha256?.slice(0, 12)}…
                </small>
              </div>
              <span>
                <button onClick={() => openEvidence(item)}>Ouvrir</button>
                {editable && (
                  <button onClick={() => removeEvidence(item)}>Retirer</button>
                )}
              </span>
            </div>
          ))}
          {editable && (
            <>
              <form
                className="compactForm"
                onSubmit={(event) => addEvidence(event, report)}
              >
                <select name="evidence_type">
                  <option value="photo">Photo</option>
                  <option value="document">Document</option>
                  <option value="video">Vidéo</option>
                  <option value="audio">Audio</option>
                  <option value="other">Autre</option>
                </select>
                <input name="caption" placeholder="Légende et contexte" />
                <select name="classification">
                  <option value="internal">Interne</option>
                  <option value="restricted">Restreinte</option>
                  <option value="public">Publiable</option>
                </select>
                <input
                  name="file"
                  type="file"
                  onChange={(event) =>
                    setEvidenceFile(event.currentTarget.files?.[0] || null)
                  }
                />
                {evidenceFile && (
                  <small>Fichier sélectionné : {evidenceFile.name}</small>
                )}
                <button disabled={busy}>Ajouter</button>
              </form>
              <div className="reportActions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => addGeneratedEvidence(report)}
                >
                  Générer une fiche justificative
                </button>
                <small>
                  Attestation interne issue du rapport ; ajoutez des photos
                  réelles lorsqu’elles sont disponibles.
                </small>
              </div>
            </>
          )}
        </div>
        <div className="reportSubsection">
          <h4>Liste de présence</h4>
          {reportAttendance.length > 0 && (
            <table className="reportTable">
              <thead>
                <tr>
                  <th>Participant</th>
                  <th>Genre/âge</th>
                  <th>Organisation/rôle</th>
                  <th>Présent</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {reportAttendance.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {item.full_name}
                      <br />
                      <small>
                        {item.phone ||
                          item.email ||
                          item.participant_code ||
                          "—"}
                      </small>
                    </td>
                    <td>
                      {item.gender} · {item.age_group}
                    </td>
                    <td>
                      {item.organization || "—"} · {item.role || "—"}
                    </td>
                    <td>{item.present ? "Oui" : "Non"}</td>
                    <td>
                      {editable && (
                        <button onClick={() => removeAttendance(item.id)}>
                          Retirer
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {editable && (
            <form
              className="compactForm attendanceForm"
              onSubmit={(event) => addAttendance(event, report)}
            >
              <input name="full_name" placeholder="Nom complet" required />
              <input name="participant_code" placeholder="Code participant" />
              <input name="phone" placeholder="Téléphone" />
              <input name="email" type="email" placeholder="E-mail" />
              <select name="gender">
                <option value="female">Femme</option>
                <option value="male">Homme</option>
                <option value="other">Autre</option>
                <option value="prefer_not_to_say">Préfère ne pas dire</option>
                <option value="unknown">Non renseigné</option>
              </select>
              <select name="age_group">
                <option value="child">Enfant</option>
                <option value="youth">Jeune</option>
                <option value="adult">Adulte</option>
                <option value="older_person">Personne âgée</option>
                <option value="unknown">Non renseigné</option>
              </select>
              <input name="organization" placeholder="Organisation/localité" />
              <input name="role" placeholder="Fonction/rôle" />
              <input name="signature_name" placeholder="Signature ou mention" />
              <label>
                <input name="present" type="checkbox" defaultChecked /> Présent
              </label>
              <label>
                <input name="person_with_disability" type="checkbox" /> Handicap
              </label>
              <label>
                <input name="vulnerable" type="checkbox" /> Vulnérabilité
              </label>
              <button disabled={busy}>Ajouter avec consentement</button>
            </form>
          )}
        </div>
        <div className="reportSubsection">
          <h4>Indicateurs</h4>
          {reportIndicators.map((item) => (
            <div className="listRow" key={item.id}>
              <div>
                <b>
                  {item.indicator_code} · {item.indicator_label}
                </b>
                <small>
                  Réalisé : {item.achieved_value} {item.unit} · Cible :{" "}
                  {item.target_value ?? "—"} ·{" "}
                  {item.verification_source || "Source non renseignée"}
                </small>
              </div>
            </div>
          ))}
          {editable && (
            <form
              className="compactForm"
              onSubmit={(event) => addIndicator(event, report)}
            >
              <input name="indicator_code" placeholder="Code" required />
              <input name="indicator_label" placeholder="Indicateur" required />
              <input name="unit" placeholder="Unité" required />
              <input
                name="baseline_value"
                type="number"
                step="any"
                placeholder="Référence"
              />
              <input
                name="target_value"
                type="number"
                step="any"
                placeholder="Cible"
              />
              <input
                name="achieved_value"
                type="number"
                step="any"
                placeholder="Réalisé"
                required
              />
              <input
                name="verification_source"
                placeholder="Source de vérification"
              />
              <button disabled={busy}>Ajouter</button>
            </form>
          )}
        </div>
        {editable && (
          <div className="signatureBox">
            <h4>Signer et soumettre</h4>
            <p>
              La soumission crée une version immuable et avertit automatiquement
              votre supérieur.
            </p>
            <form
              className="reviewForm"
              onSubmit={(event) => submitReport(event, report)}
            >
              <input
                name="signature_name"
                defaultValue={profile.full_name || ""}
                placeholder="Nom et prénom du signataire"
                required
              />
              <label>
                Image de votre signature, facultative
                <input
                  name="signature_file"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                />
              </label>
              <button className="approveButton" disabled={busy}>
                Signer et soumettre
              </button>
            </form>
          </div>
        )}
        <div className="reportActions">
          <button onClick={() => printReport(report, false)}>
            Rapport interne
          </button>
          <button onClick={() => printReport(report, true)}>
            Version publique anonymisée
          </button>
        </div>
        <div className="reportSubsection">
          <h4>Signatures et décisions</h4>
          {reportApprovals.map((item) => (
            <div className="approvalRow" key={item.id}>
              <span>{decisionLabels[item.decision] || item.decision}</span>
              <b>{item.actor_name}</b>
              <small>
                {item.actor_job_title || item.actor_role} ·{" "}
                {formatDate(item.signed_at, true)}
              </small>
              {item.comment && <p>{item.comment}</p>}
              <code>{item.content_hash}</code>
            </div>
          ))}
        </div>
        <div className="reportSubsection">
          <h4>Historique complet</h4>
          {reportEvents.map((item) => (
            <div className="timelineItem" key={item.id}>
              <span>{formatDate(item.created_at, true)}</span>
              <b>{eventLabels[item.event_type] || item.event_type}</b>
              <small>
                {item.comment ||
                  `${item.from_status || ""}${item.to_status ? ` → ${item.to_status}` : ""}`}
              </small>
            </div>
          ))}
        </div>
      </div>
    );
  }
}
