"use client";

import dynamic from "next/dynamic";

const AccountsPanel = dynamic(() => import("./AccountsPanelHeavy"), {
  loading: () => <div className="portalPanel"><p>Chargement des comptes et accès…</p></div>,
});

export default AccountsPanel;
export type {
  AccountProfile,
  PositionDefinitionRow,
  PositionAssignmentRow,
  AccountReviewRow,
  PermissionRow,
  PermissionOverrideRow,
  AccountScopeRow,
  AccountStatusHistory,
} from "./AccountsPanelHeavy";

export const roleLabels: Record<string, string> = {
  member: "Membre",
  beneficiary: "Bénéficiaire",
  volunteer: "Bénévole",
  staff: "Personnel AIAC",
  manager: "Responsable d’organe",
  partner: "Partenaire",
  admin: "Administrateur",
  super_admin: "Super-administrateur",
};
