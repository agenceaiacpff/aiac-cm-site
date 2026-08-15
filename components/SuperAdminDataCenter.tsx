"use client";

import { FormEvent, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ControlRow = {
  id: string;
  reference: string;
  name: string;
  description?: string | null;
  status?: string | null;
};
type ResourceGroup = {
  id: string;
  label: string;
  purpose: string;
  rows: ControlRow[];
};

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
  programs: Array<{
    id: string;
    code: string;
    name: string;
    description: string | null;
    status: string;
  }>;
  projects: Array<{
    id: string;
    code: string;
    name: string;
    description: string | null;
    status: string;
  }>;
  activities: Array<{
    id: string;
    code: string;
    title: string;
    description: string | null;
    status: string;
  }>;
  tasks: Array<{
    id: string;
    code: string;
    title: string;
    description: string | null;
    status: string;
  }>;
  reports: Array<{
    id: string;
    report_number: string;
    title: string | null;
    summary: string;
    status: string;
  }>;
  publications: Array<{
    id: string;
    slug: string;
    title: string;
    summary: string;
    status: string;
  }>;
  documents: Array<{
    id: string;
    title: string;
    file_name: string | null;
    document_status: string;
  }>;
  bodies: Array<{
    id: string;
    code: string;
    name: string;
    description: string | null;
    status: string;
  }>;
  members: Array<{
    id: string;
    member_number: string;
    full_name: string;
    notes: string | null;
    status: string;
  }>;
  workforce: Array<{
    id: string;
    job_title: string;
    assignment_type: string;
    notes: string | null;
    status: string;
  }>;
  partners: Array<{
    id: string;
    code: string;
    legal_name: string;
    notes: string | null;
    status: string;
  }>;
}) {
  const supabase = useMemo(() => createClient(), []);
  const groups: ResourceGroup[] = [
    {
      id: "governance_body",
      label: "Organes",
      purpose: "Gouvernance, rattachements et statut institutionnel",
      rows: bodies.map((r) => ({
        id: r.id,
        reference: r.code,
        name: r.name,
        description: r.description,
        status: r.status,
      })),
    },
    {
      id: "institutional_member",
      label: "Membres",
      purpose: "Membres institutionnels et dossiers d’adhésion",
      rows: members.map((r) => ({
        id: r.id,
        reference: r.member_number,
        name: r.full_name,
        description: r.notes,
        status: r.status,
      })),
    },
    {
      id: "workforce_assignment",
      label: "Affectations",
      purpose: "Postes, responsables hiérarchiques et affectations",
      rows: workforce.map((r) => ({
        id: r.id,
        reference: r.assignment_type,
        name: r.job_title,
        description: r.notes,
        status: r.status,
      })),
    },
    {
      id: "partner",
      label: "Partenaires",
      purpose: "Répertoire et relations institutionnelles",
      rows: partners.map((r) => ({
        id: r.id,
        reference: r.code,
        name: r.legal_name,
        description: r.notes,
        status: r.status,
      })),
    },
    {
      id: "program",
      label: "Programmes",
      purpose: "Niveau stratégique rattaché à un organe",
      rows: programs.map((r) => ({
        id: r.id,
        reference: r.code,
        name: r.name,
        description: r.description,
        status: r.status,
      })),
    },
    {
      id: "project",
      label: "Projets",
      purpose: "Portefeuille de mise en œuvre d’un programme",
      rows: projects.map((r) => ({
        id: r.id,
        reference: r.code,
        name: r.name,
        description: r.description,
        status: r.status,
      })),
    },
    {
      id: "activity",
      label: "Activités",
      purpose: "Actions planifiées dans un projet",
      rows: activities.map((r) => ({
        id: r.id,
        reference: r.code,
        name: r.title,
        description: r.description,
        status: r.status,
      })),
    },
    {
      id: "activity_task",
      label: "Tâches rapportables",
      purpose: "Unités exécutées et rapportées par les agents",
      rows: tasks.map((r) => ({
        id: r.id,
        reference: r.code,
        name: r.title,
        description: r.description,
        status: r.status,
      })),
    },
    {
      id: "task_report",
      label: "Rapports",
      purpose: "Rapports, validations, signatures et versions",
      rows: reports.map((r) => ({
        id: r.id,
        reference: r.report_number,
        name: r.title || r.report_number,
        description: r.summary,
        status: r.status,
      })),
    },
    {
      id: "public_content",
      label: "Publications",
      purpose: "Contenus visibles sur le site officiel",
      rows: publications.map((r) => ({
        id: r.id,
        reference: r.slug,
        name: r.title,
        description: r.summary,
        status: r.status,
      })),
    },
    {
      id: "document",
      label: "Documents",
      purpose: "Documents privés, classés et versionnés",
      rows: documents.map((r) => ({
        id: r.id,
        reference: r.file_name || r.id.slice(0, 8),
        name: r.title,
        status: r.document_status,
      })),
    },
  ];
  const [resource, setResource] = useState("program");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");
  const current = groups.find((group) => group.id === resource) || groups[0];
  const visible = current.rows
    .filter((row) =>
      `${row.reference} ${row.name} ${row.description || ""} ${row.status || ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .slice(0, 250);

  async function save(event: FormEvent<HTMLFormElement>, row: ControlRow) {
    event.preventDefault();
    setBusyId(row.id);
    setNotice("");
    const data = new FormData(event.currentTarget);
    const changes = {
      name: String(data.get("name") || "").trim(),
      description: String(data.get("description") || "").trim(),
      status: String(data.get("status") || "").trim(),
    };
    const { error } = await supabase.rpc("super_admin_update_resource", {
      resource_type: resource,
      target_id: row.id,
      changes,
    });
    if (error) setNotice(error.message);
    else
      setNotice(
        `« ${row.reference} » a été modifié. Rechargez la page pour actualiser toutes les vues liées.`,
      );
    setBusyId("");
  }

  async function remove(row: ControlRow) {
    const typed = window.prompt(
      `Suppression définitive et journalisée. Tapez exactement ${row.reference} pour confirmer.`,
    );
    if (typed !== row.reference) {
      if (typed !== null)
        setNotice("Confirmation incorrecte : aucune suppression effectuée.");
      return;
    }
    setBusyId(row.id);
    setNotice("");
    const { error } = await supabase.rpc("super_admin_delete_resource", {
      resource_type: resource,
      target_id: row.id,
    });
    if (error)
      setNotice(
        `${error.message}. Supprimez d’abord les éléments enfants lorsqu’une hiérarchie est encore liée.`,
      );
    else
      setNotice(
        `« ${row.reference} » a été supprimé et l’opération a été journalisée.`,
      );
    setBusyId("");
  }

  return (
    <section className="operationsWorkspace superAdminDataCenter">
      <div className="portalPanel controlHero">
        <div>
          <p className="eyebrow">MFA obligatoire · actions journalisées</p>
          <h2>Contrôle intégral des données</h2>
          <p>
            Modifier ou supprimer les ressources depuis un seul centre. Les
            suppressions suivent l’ordre rapport → tâche → activité → projet →
            programme afin de protéger l’intégrité de la plateforme.
          </p>
        </div>
      </div>
      {notice && (
        <div className="notice" role="status">
          {notice}
          <button onClick={() => setNotice("")}>×</button>
        </div>
      )}
      <div className="operationNav controlResourceNav">
        {groups.map((group) => (
          <button
            key={group.id}
            className={resource === group.id ? "active" : ""}
            onClick={() => {
              setResource(group.id);
              setQuery("");
            }}
          >
            {group.label} <small>{group.rows.length}</small>
          </button>
        ))}
      </div>
      <div className="portalPanel">
        <div className="panelTitle">
          <div>
            <h3>{current.label}</h3>
            <p>{current.purpose}</p>
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Rechercher dans ${current.label.toLowerCase()}`}
          />
        </div>
        {current.rows.length > 250 && !query && (
          <p className="privacyHint">
            Les 250 premiers éléments sont affichés. Utilisez la recherche pour
            atteindre une référence précise.
          </p>
        )}
        {visible.length === 0 ? (
          <p>Aucun élément correspondant.</p>
        ) : (
          visible.map((row) => (
            <details className="workflowCard adminResourceCard" key={row.id}>
              <summary>
                <span>
                  <b>
                    {row.reference} · {row.name}
                  </b>
                  <small>{row.status || "Sans statut"}</small>
                </span>
                <span>Modifier / supprimer</span>
              </summary>
              <div className="workflowBody">
                <form
                  className="operationForm"
                  onSubmit={(event) => save(event, row)}
                >
                  <label className="wideField">
                    Nom ou titre
                    <input name="name" defaultValue={row.name} required />
                  </label>
                  <label className="wideField">
                    Description ou résumé
                    <textarea
                      name="description"
                      defaultValue={row.description || ""}
                    />
                  </label>
                  <label>
                    Statut
                    <input
                      name="status"
                      defaultValue={row.status || ""}
                      placeholder="Statut actuel"
                    />
                  </label>
                  <button disabled={busyId === row.id}>
                    Enregistrer les modifications
                  </button>
                  <button
                    type="button"
                    className="dangerButton"
                    disabled={busyId === row.id}
                    onClick={() => void remove(row)}
                  >
                    Supprimer définitivement
                  </button>
                </form>
              </div>
            </details>
          ))
        )}
      </div>
    </section>
  );
}
