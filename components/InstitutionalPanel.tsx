"use client";

import dynamic from "next/dynamic";

const InstitutionalPanel = dynamic(() => import("./InstitutionalPanelHeavy"), {
  loading: () => <div className="portalPanel"><p>Chargement de la gouvernance et des membres…</p></div>,
});

export default InstitutionalPanel;
export type {
  GovernanceBodyRow,
  InstitutionalMemberRow,
  BodyMembershipRow,
  WorkforceAssignmentRow,
  ProgramRow,
  PartnerRow,
  PartnershipRow,
  CaseFileRow,
  CaseNoteRow,
  CaseActionRow,
  ActivityRow,
  ActivityReportRow,
} from "./InstitutionalPanelHeavy";
