"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import UniversalTaskReporter from "@/components/UniversalTaskReporter";
import AgentTaskInbox from "@/components/AgentTaskInbox";
import CollectiveValidationAlert from "@/components/CollectiveValidationAlert";
import InstitutionalReportsCenter from "@/components/InstitutionalReportsCenter";
import type { AccountProfile } from "@/components/AccountsPanel";
import { roleLabels } from "@/components/AccountsPanel";

const links = [
  ["accueil", "Tableau de bord"],
  ["reunions", "Réunions et agenda"],
  ["demandes", "Mes demandes"],
  ["messages", "Messagerie"],
  ["notifications", "Notifications"],
  ["annonces", "Annonces"],
  ["profil", "Mon profil"],
  ["terrain", "Cycle des programmes"],
  ["reports", "Centre des rapports"],
  ["operations", "Demandes et interventions"],
  ["institution", "Gouvernance et membres"],
  ["documents", "Documents sécurisés"],
  ["contenus", "Publications du site"],
  ["administration", "Comptes et accès"],
  ["data-control", "Contrôle des données"],
  ["audit", "Journal d’audit"],
];

export default function ProgramCycleLandingPortal({ profile }: { profile: AccountProfile }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const isAdmin = ["admin", "super_admin"].includes(profile.role);
  const isSuperAdmin = profile.role === "super_admin";
  const isStaff = ["staff", "manager", "admin", "super_admin"].includes(profile.role);

  async function logout() {
    await supabase.auth.signOut();
    router.push("/connexion");
    router.refresh();
  }

  function openTab(id: string) {
    if (id === "reports") {
      document.getElementById("centre-rapports")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    router.push(id === "terrain" ? "/espace/terrain" : `/espace?tab=${encodeURIComponent(id)}`);
  }

  return (
    <div className="portalShell">
      <aside className="portalSidebar">
        <a href="/nouveau-site/index.html" className="portalBrand">
          <img src="/aiac-logo.bmp" alt="AIAC" />
          <span><b>AIAC</b><small>Site public</small></span>
        </a>
        <div className="portalIdentity">
          <span aria-hidden="true">{(profile.full_name || profile.email || "A").charAt(0).toUpperCase()}</span>
          <div>
            <b>{profile.full_name || "Membre AIAC"}</b>
            <small>{roleLabels[profile.role] || profile.role}</small>
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
            <p className="eyebrow">{roleLabels[profile.role] || profile.role}</p>
            <h1>Cycle des programmes</h1>
          </div>
          <span className={`status ${profile.status}`}>
            {profile.status === "active" ? "Compte actif" : profile.status}
          </span>
        </header>

        <CollectiveValidationAlert profileId={profile.id} />

        <InstitutionalReportsCenter />

        <div className="portalPanel fieldHero">
          <div>
            <p className="eyebrow">Entrée rapide</p>
            <h2>Exécution et rapports de tâches</h2>
            <p>
              Cette page ne charge pas le module administratif complet. Commencez directement par rapporter une tâche ou consulter les tâches qui vous ont été affectées.
            </p>
          </div>
          <div className="reportActions">
            <button type="button" onClick={() => router.push("/espace/terrain/complet") }>
              Ouvrir la gestion complète du cycle
            </button>
          </div>
        </div>

        <UniversalTaskReporter />
        <AgentTaskInbox />
      </main>
    </div>
  );
}
