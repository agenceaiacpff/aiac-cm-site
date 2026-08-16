"use client";

import dynamic from "next/dynamic";

const OperationsPanel = dynamic(() => import("./OperationsPanelHeavy"), {
  loading: () => <div className="portalPanel"><p>Chargement des demandes et interventions…</p></div>,
});

export default OperationsPanel;
export type {
  OperationProfile,
  ProjectRow,
  ProjectProgramRow,
  PortfolioActivityRow,
  ProjectMemberRow,
  TaskRow,
  DocumentRow,
  BeneficiaryRow,
  OperationalRequest,
  WorkflowEvent,
  InterventionRow,
  OperationBody,
} from "./OperationsPanelHeavy";

export const requestStatus: Record<string, string> = {
  new: "Nouvelle",
  under_review: "À examiner",
  assigned: "Affectée",
  in_progress: "En cours",
  waiting_user: "En attente du demandeur",
  resolved: "Résolue",
  closed: "Clôturée",
  rejected: "Rejetée",
};
