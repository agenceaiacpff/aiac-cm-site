"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { TaskReportRow } from "@/components/FieldReportingPanel";
import type { OperationBody, OperationProfile } from "@/components/OperationsPanel";
import type { InstitutionalSignatureAsset } from "@/lib/institutional-signatures";

type CollectiveTaskReport = TaskReportRow & {
  validation_authority_type?: string;
  validation_authority_body_id?: string | null;
};

type Props = {
  profile: OperationProfile;
  reports: TaskReportRow[];
  bodies: OperationBody[];
  signatureAssets: InstitutionalSignatureAsset[];
};

type LastDecision = {
  reportNumber: string;
  authorityName: string;
  recorderName: string;
  reference: string;
  date: string;
  decision: "approved" | "returned";
};

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export default function CollectiveValidationPanel({
  profile,
  reports,
  bodies,
  signatureAssets,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [pendingReports, setPendingReports] = useState<CollectiveTaskReport[]>(() =>
    (reports as CollectiveTaskReport[]).filter(
      (report) =>
        report.status === "submitted" &&
        report.reporter_id !== profile.id &&
        report.validation_authority_type === "collective_body" &&
        Boolean(report.validation_authority_body_id),
    ),
  );
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState("");
  const [signatureUrl, setSignatureUrl] = useState("");
  const [lastDecision, setLastDecision] = useState<LastDecision | null>(null);

  const officialSignature = useMemo(
    () =>
      signatureAssets.find(
        (asset) =>
          asset.profile_id === profile.id &&
          asset.status === "active" &&
          asset.is_default &&
          ["composite_signature", "signature"].includes(asset.asset_type),
      ) || null,
    [profile.id, signatureAssets],
  );

  useEffect(() => {
    setPendingReports(
      (reports as CollectiveTaskReport[]).filter(
        (report) =>
          report.status === "submitted" &&
          report.reporter_id !== profile.id &&
          report.validation_authority_type === "collective_body" &&
          Boolean(report.validation_authority_body_id),
      ),
    );
  }, [profile.id, reports]);

  useEffect(() => {
    if (!officialSignature) {
      setSignatureUrl("");
      return;
    }
    let cancelled = false;
    void supabase.storage
      .from("aiac-signatures")
      .createSignedUrl(officialSignature.storage_path, 900)
      .then(({ data }) => {
        if (!cancelled) setSignatureUrl(data?.signedUrl || "");
      });
    return () => {
      cancelled = true;
    };
  }, [officialSignature, supabase]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("mode") === "validation") {
      requestAnimationFrame(() =>
        document
          .getElementById("collective-validation")
          ?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    }
  }, []);

  function authorityName(report: CollectiveTaskReport) {
    return (
      bodies.find((body) => body.id === report.validation_authority_body_id)?.name ||
      "Conseil d’administration"
    );
  }

  async function recordDecision(
    event: FormEvent<HTMLFormElement>,
    report: CollectiveTaskReport,
    decision: "approved" | "returned",
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const reference = String(data.get("decision_reference") || "").trim();
    const date = String(data.get("decision_date") || "");
    const comment = String(data.get("comment") || "").trim();
    const requireEvidence = data.get("require_evidence") === "on";

    if (!reference || !date) {
      setNotice("La référence de décision/PV et la date sont obligatoires.");
      return;
    }
    if (decision === "returned" && comment.length < 5) {
      setNotice("Précisez les corrections demandées.");
      return;
    }

    setBusyId(report.id);
    setNotice("");
    const { error } = await supabase.rpc("review_task_report_collective", {
      target_report_id: report.id,
      decision,
      review_comment: comment,
      decision_reference: reference,
      decision_date: date,
      require_evidence: requireEvidence,
    });

    if (error) {
      setNotice(error.message);
      setBusyId("");
      return;
    }

    const authority = authorityName(report);
    setPendingReports((items) => items.filter((item) => item.id !== report.id));
    setLastDecision({
      reportNumber: report.report_number,
      authorityName: authority,
      recorderName: profile.full_name || profile.email || "Membre habilité du CA",
      reference,
      date,
      decision,
    });
    setNotice(
      decision === "approved"
        ? "Décision du Conseil d’administration enregistrée. Le rapport est maintenant approuvé."
        : "Décision du Conseil d’administration enregistrée. Le rapport est retourné pour correction.",
    );
    setBusyId("");
    router.refresh();
  }

  if (!pendingReports.length && !lastDecision) return null;

  return (
    <section id="collective-validation" className="portalPanel">
      <div className="panelTitle">
        <div>
          <p className="eyebrow">Gouvernance · Conseil d’administration</p>
          <h2>Rapports soumis à la validation collégiale</h2>
          <p>
            Vous enregistrez ici la décision du Conseil en qualité de membre habilité.
            L’autorité de validation reste le Conseil d’administration et non votre fonction individuelle.
          </p>
        </div>
        {pendingReports.length > 0 && (
          <span className="operationBadge submitted">{pendingReports.length} à valider</span>
        )}
      </div>

      {notice && <div className="notice" role="status">{notice}</div>}

      {lastDecision && (
        <div className="reviewCard">
          <h3>{lastDecision.reportNumber}</h3>
          <p><b>Autorité de validation :</b> {lastDecision.authorityName}</p>
          <p><b>Décision enregistrée par :</b> {lastDecision.recorderName}</p>
          <p><b>Référence de décision/PV :</b> {lastDecision.reference}</p>
          <p><b>Date :</b> {formatDate(lastDecision.date)}</p>
          <p><b>Décision :</b> {lastDecision.decision === "approved" ? "Approuvé" : "Retourné pour correction"}</p>
          <div>
            <b>Signature :</b>
            {signatureUrl ? (
              <div className="official-assets">
                <figure className="official-asset composite_signature">
                  <img src={signatureUrl} alt="Signature officielle du membre habilité" />
                </figure>
              </div>
            ) : (
              <p>Signature officielle enregistrée dans le registre institutionnel.</p>
            )}
          </div>
        </div>
      )}

      {pendingReports.map((report) => {
        const authority = authorityName(report);
        const today = new Date().toISOString().slice(0, 10);
        return (
          <article className="reviewCard" key={report.id}>
            <div className="panelTitle">
              <div>
                <h3>{report.report_number}</h3>
                <p>{report.title || report.summary}</p>
              </div>
              <span className="operationBadge submitted">Soumis · révision {report.revision}</span>
            </div>
            <p>{report.summary}</p>
            <p className="hashPreview">SHA-256 : {report.current_hash}</p>

            <div className="securityBox">
              <p><b>Autorité de validation :</b> {authority}</p>
              <p><b>Décision enregistrée par :</b> {profile.full_name || profile.email}</p>
              <p><b>Signature :</b> signature officielle active de votre compte institutionnel.</p>
              {signatureUrl && (
                <div className="official-assets">
                  <figure className="official-asset composite_signature">
                    <img src={signatureUrl} alt="Signature officielle" />
                  </figure>
                </div>
              )}
            </div>

            <form
              className="reviewForm"
              onSubmit={(event) => recordDecision(event, report, "approved")}
            >
              <label>
                Référence de décision / PV
                <input
                  name="decision_reference"
                  placeholder="Ex. PV-CA-2026-08-16 / Résolution n°…"
                  required
                />
              </label>
              <label>
                Date de la décision
                <input name="decision_date" type="date" defaultValue={today} required />
              </label>
              <textarea name="comment" placeholder="Observation du Conseil — facultative en cas d’approbation" />
              <button className="approveButton" disabled={busyId === report.id || !officialSignature}>
                {busyId === report.id ? "Enregistrement…" : "Valider au nom du Conseil d’administration"}
              </button>
              {!officialSignature && (
                <small>Une signature officielle active est nécessaire pour enregistrer la décision.</small>
              )}
            </form>

            <details>
              <summary>Retourner le rapport pour correction</summary>
              <form
                className="reviewForm returnForm"
                onSubmit={(event) => recordDecision(event, report, "returned")}
              >
                <label>
                  Référence de décision / PV
                  <input name="decision_reference" required />
                </label>
                <label>
                  Date de la décision
                  <input name="decision_date" type="date" defaultValue={today} required />
                </label>
                <textarea
                  name="comment"
                  minLength={5}
                  placeholder="Corrections précises demandées par le Conseil"
                  required
                />
                <label className="evidenceReviewChoice">
                  <input name="require_evidence" type="checkbox" /> Exiger au moins une preuve à la prochaine soumission
                </label>
                <button disabled={busyId === report.id || !officialSignature}>
                  Enregistrer le retour du Conseil
                </button>
              </form>
            </details>
          </article>
        );
      })}
    </section>
  );
}
