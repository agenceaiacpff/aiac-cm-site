"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import ReportSignatureCenter from "./ReportSignatureCenter";

const FieldReportingPanelHeavy = dynamic(() => import("./FieldReportingPanelHeavy"), {
  loading: () => <div className="portalPanel"><p>Chargement du dossier de reporting…</p></div>,
}) as ComponentType<any>;

export default function FieldReportingPanel(props: any) {
  return (
    <>
      {props?.profile ? <ReportSignatureCenter profile={props.profile} /> : null}
      <FieldReportingPanelHeavy {...props} />
    </>
  );
}

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
