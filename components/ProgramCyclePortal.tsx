"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import HierarchicalProgramCycle from "@/components/HierarchicalProgramCycle";
import AgentTaskInbox from "@/components/AgentTaskInbox";
import ProgramCycleContextBridge from "@/components/ProgramCycleContextBridge";
import CollectiveValidationPanel from "@/components/CollectiveValidationPanel";
import type { AccountProfile } from "@/components/AccountsPanel";
import { roleLabels } from "@/components/AccountsPanel";
import type {
  OperationBody,
  OperationProfile,
  PortfolioActivityRow,
  ProjectMemberRow,
  ProjectProgramRow,
  ProjectRow,
} from "@/components/OperationsPanel";
import type {
  ActivityTaskCountRow,
  ActivityTaskRow,
  TaskReportApprovalRow,
  TaskReportAttendanceRow,
  TaskReportEventRow,
  TaskReportEvidenceRow,
  TaskReportIndicatorRow,
  TaskReportRow,
} from "@/components/FieldReportingPanel";
import type { InstitutionalSignatureAsset } from "@/lib/institutional-signatures";

const links = [
  ["accueil", "Tableau de bord"],
  ["reunions", "Réunions et agenda"],
  ["demandes", "Mes demandes"],
  ["messages", "Messagerie"],
  ["notifications", "Notifications"],
  ["annonces", "Annonces"],
  ["profil", "Mon profil"],
  ["terrain", "Cycle des programmes"],
  ["operations", "Demandes et interventions"],
  ["institution", "Gouvernance et membres"],
  ["documents", "Documents sécurisés"],
  ["contenus", "Publications du site"],
  ["administration", "Comptes et accès"],
  ["data-control", "Contrôle des données"],
  ["audit", "Journal d’audit"],
];

type Props = {
  profile: AccountProfile;
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

export default function ProgramCyclePortal(props: Props) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const isAdmin = ["admin", "super_admin"].includes(props.profile.role);
  const isSuperAdmin = props.profile.role === "super_admin";
  const isStaff = ["staff", "manager", "admin", "super_admin"].includes(props.profile.role);

  async function logout() {
    await supabase.auth.signOut();
    router.push("/connexion");
    router.refresh();
  }

  function openTab(id: string) {
    router.push(id === "terrain" ? "/espace/terrain" : `/espace?tab=${encodeURIComponent(id)}`);
  }

  return (
    <div className="portalShell">
      <ProgramCycleContextBridge />
      <aside className="portalSidebar">
        <a href="/nouveau-site/index.html" className="portalBrand">
          <img src="/aiac-logo.bmp" alt="AIAC" />
          <span><b>AIAC</b><small>Site public</small></span>
        </a>
        <div className="portalIdentity">
          <span aria-hidden="true">{(props.profile.full_name || props.profile.email || "A").charAt(0).toUpperCase()}</span>
          <div>
            <b>{props.profile.full_name || "Membre AIAC"}</b>
            <small>{roleLabels[props.profile.role] || props.profile.role}</small>
          </div>
        </div>
        <nav>
          {links
            .filter(([id]) => {
              if (["operations", "institution", "documents", "contenus"].includes(id)) return isStaff;
              if (id === "administration") return isAdmin;
              if (["data-control", "audit"].includes(id)) return isSuperAdmin;
              return true;
            })
            .map(([id, label]) => (
              <button
                type="button"
                key={id}
                className={id === "terrain" ? "active" : ""}
                onClick={() => openTab(id)}
              >
                <span>{label}</span>
              </button>
            ))}
        </nav>
        <a className="publicSiteLink" href="/nouveau-site/index.html">Voir le site public</a>
        <button className="logout" onClick={logout}>Se déconnecter</button>
      </aside>
      <main className="portalMain">
        <header>
          <div>
            <p className="eyebrow">{roleLabels[props.profile.role] || props.profile.role}</p>
            <h1>Gestion complète du cycle des programmes</h1>
          </div>
          <span className={`status ${props.profile.status}`}>
            {props.profile.status === "active" ? "Compte actif" : props.profile.status}
          </span>
        </header>
        <AgentTaskInbox />
        <CollectiveValidationPanel
          profile={props.profile as OperationProfile}
          reports={props.initialTaskReports}
          approvals={props.initialApprovals}
          bodies={props.bodies}
          signatureAssets={props.institutionalSignatureAssets}
        />
        <HierarchicalProgramCycle {...props} profile={props.profile as OperationProfile} />
      </main>
    </div>
  );
}
