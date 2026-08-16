"use client";

import dynamic from "next/dynamic";

const FieldReportingPanel = dynamic(() => import("./FieldReportingPanelHeavy"), {
  loading: () => <div className="portalPanel"><p>Chargement du dossier de reporting…</p></div>,
});

export default FieldReportingPanel;
export type {
  ActivityTaskRow,
  ActivityTaskCountRow,
  TaskReportRow,
  TaskReportEvidenceRow,
  TaskReportAttendanceRow,
  TaskReportIndicatorRow,
  TaskReportApprovalRow,
  TaskReportEventRow,
} from "./FieldReportingPanelHeavy";
