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
      <style>{`
        /* Les anciens formulaires signaient sans mémoriser le choix des cachets.
           Ils restent dans le code historique pour l'édition des dossiers mais
           ne constituent plus une voie de signature ou d'export officielle. */
        .legacyReportingCore .signatureBox,
        .legacyReportingCore .reviewForm,
        .legacyReportingCore .exportActions { display: none !important; }
      `}</style>
      <div className="legacyReportingCore">
        <FieldReportingPanelHeavy {...props} />
      </div>
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
