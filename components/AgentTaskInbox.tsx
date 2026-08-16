"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type TaskInboxRow = {
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
  task_status: string;
  due_date: string | null;
  latest_report_id: string | null;
  latest_report_number: string | null;
  latest_report_status: string | null;
  latest_report_updated_at: string | null;
};

const reportLabels: Record<string, string> = {
  draft: "Brouillon",
  returned: "À corriger",
  submitted: "Soumis",
  approved: "Validé",
  archived: "Archivé",
};

const taskLabels: Record<string, string> = {
  planned: "Planifiée",
  active: "Active",
  completed: "Terminée",
  cancelled: "Annulée",
};

export default function AgentTaskInbox() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<TaskInboxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.rpc("my_institutional_task_dashboard", {
        target_body_id: null,
      });
      if (cancelled) return;
      setLoading(false);
      if (error) {
        setNotice(error.message);
        return;
      }
      setRows((data || []) as TaskInboxRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const now = new Date().toISOString().slice(0, 10);
  const counters = useMemo(
    () => ({
      all: rows.length,
      todo: rows.filter((row) => !row.latest_report_status && !["completed", "cancelled"].includes(row.task_status)).length,
      draft: rows.filter((row) => row.latest_report_status === "draft").length,
      returned: rows.filter((row) => row.latest_report_status === "returned").length,
      submitted: rows.filter((row) => row.latest_report_status === "submitted").length,
      approved: rows.filter((row) => row.latest_report_status === "approved").length,
      overdue: rows.filter(
        (row) =>
          row.due_date &&
          row.due_date < now &&
          row.latest_report_status !== "approved" &&
          !["completed", "cancelled"].includes(row.task_status),
      ).length,
    }),
    [now, rows],
  );

  const visible = rows.filter((row) => {
    if (filter === "todo") return !row.latest_report_status && !["completed", "cancelled"].includes(row.task_status);
    if (filter === "overdue")
      return Boolean(
        row.due_date &&
          row.due_date < now &&
          row.latest_report_status !== "approved" &&
          !["completed", "cancelled"].includes(row.task_status),
      );
    if (["draft", "returned", "submitted", "approved"].includes(filter))
      return row.latest_report_status === filter;
    return true;
  });

  if (loading) {
    return (
      <div className="portalPanel">
        <h3>Mes tâches</h3>
        <p>Chargement de vos tâches affectées…</p>
      </div>
    );
  }

  return (
    <div className="portalPanel">
      <div className="panelTitle">
        <div>
          <h3>Mes tâches affectées</h3>
          <p>Votre file de travail personnelle. Une affectation facilite le suivi, mais elle n’est pas obligatoire pour rapporter une tâche via le formulaire ci-dessus.</p>
        </div>
      </div>
      {notice && <p>{notice}</p>}
      <div className="fieldFilters">
        {[
          ["all", "Toutes"],
          ["todo", "À renseigner"],
          ["draft", "Brouillons"],
          ["returned", "À corriger"],
          ["submitted", "Soumis"],
          ["approved", "Validés"],
          ["overdue", "En retard"],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={filter === id ? "active" : ""}
            onClick={() => setFilter(id)}
          >
            {label} ({counters[id as keyof typeof counters]})
          </button>
        ))}
      </div>
      {visible.length === 0 ? (
        <p>Aucune tâche ne vous est actuellement affectée dans cette catégorie. Vous pouvez néanmoins rapporter n’importe quelle tâche officielle planifiée ou active avec « Rapporter une tâche » ci-dessus.</p>
      ) : (
        visible.slice(0, 150).map((row) => {
          const href = `/espace/terrain?body=${encodeURIComponent(row.body_id)}&program=${encodeURIComponent(row.program_id)}&project=${encodeURIComponent(row.project_id)}&activity=${encodeURIComponent(row.activity_id)}&task=${encodeURIComponent(row.task_id)}`;
          return (
            <div className="workflowCard" key={row.task_id}>
              <div className="workflowBody">
                <div className="panelTitle">
                  <div>
                    <b>Tâche {row.task_sequence_no} · {row.task_code} · {row.task_title}</b>
                    <p>
                      {row.body_code} → {row.program_code} → {row.project_code} → {row.activity_code}
                    </p>
                    <small>
                      {row.body_name} · {row.program_name} · {row.project_name} · {row.activity_title}
                    </small>
                  </div>
                  <span className={`operationBadge ${row.latest_report_status || row.task_status}`}>
                    {row.latest_report_status
                      ? reportLabels[row.latest_report_status] || row.latest_report_status
                      : taskLabels[row.task_status] || row.task_status}
                  </span>
                </div>
                <p>
                  Échéance : <b>{row.due_date || "Non définie"}</b>
                  {row.due_date && row.due_date < now && row.latest_report_status !== "approved" ? " · En retard" : ""}
                </p>
                {row.latest_report_number && (
                  <p>
                    Dernier rapport : <b>{row.latest_report_number}</b>
                    {row.latest_report_updated_at
                      ? ` · mis à jour le ${new Date(row.latest_report_updated_at).toLocaleDateString("fr-FR")}`
                      : ""}
                  </p>
                )}
                <Link className="secondaryButton" href={href}>
                  Rapporter / ouvrir cette tâche
                </Link>
              </div>
            </div>
          );
        })
      )}
      {visible.length > 150 && <p>Affichage limité aux 150 premières tâches de ce filtre.</p>}
    </div>
  );
}
