"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type Report = {
  id: string;
  report_number: string;
  reporter_id: string;
  status: string;
  title: string | null;
  summary: string;
  revision: number;
  current_hash: string | null;
  validation_authority_type?: string;
  validation_authority_body_id?: string | null;
};

type Approval = {
  id: string;
  report_id: string;
  actor_id: string;
  actor_name: string;
  actor_job_title: string | null;
  decision: string;
  comment: string | null;
  content_hash: string;
  signed_at: string;
  created_at: string;
  authority_type?: string;
  authority_body_id?: string | null;
  authority_name?: string | null;
  decision_reference?: string | null;
  decision_date?: string | null;
};

type Body = { id: string; name: string };

type SignatureAsset = {
  profile_id: string;
  asset_type: string;
  storage_path: string;
  is_default: boolean;
  status: string;
};

type Props = {
  profile: Profile;
  reports: Report[];
  approvals: Approval[];
  bodies: Body[];
  signatureAssets: SignatureAsset[];
};

type LastDecision = {
  reportNumber: string;
  authorityName: string;
  recorderName: string;
  reference: string;
  date: string;
  decision: "approved" | "returned";
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const dateOnly = value.slice(0, 10);
  return new Date(`${dateOnly}T12:00:00`).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export default function CollectiveValidationPanel({
  profile,
  reports,
  approvals,
  bodies,
  signatureAssets,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [pendingReports, setPendingReports] = useState<Report[]>(() =>
    reports.filter(
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

  const collectiveApprovals = useMemo(
    () =>
      approvals
        .filter((item) => item.authority_type === "collective_body")
        .slice()
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [approvals],
  );

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
      reports.filter(
        (report) =>
          report.status === "submitted" &&
          report.reporter_id !== profile.id &&
          report.validation_authority_type === "collective_body" &&
          Boolean(report.validation_authority_body_id),
      ),
    );
  }, [profile.id, reports]);

  useEffect(() => {
    let cancelled = false;
    async function loadSignature() {
      if (!officialSignature) {
        setSignatureUrl("");
        return;
      }
      const { data } = await supabase.storage
        .from("aiac-signatures")
        .createSignedUrl(officialSignature.storage_path, 900);
      if (!cancelled) setSignatureUrl(data?.signedUrl || "");
    }
    void loadSignature();
    return () => {
      cancelled = true;
    };
  }, [officialSignature, supabase]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("mode") !== "validation") return;
    requestAnimationFrame(() => {
      document.getElementById("collective-validation")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, []);

  function authorityName(report: Report) {
    return (
      bodies.find((body) => body.id === report.validation_authority_body_id)?.name ||
      "Conseil d’administration"
    );
  }

  async function recordDecision(
    event: FormEvent<HTMLFormElement>,
    report: Report,
    decision: "approved" | "returned",
  ) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
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

    setPendingReports((items) => items.filter((item) => item.id !== report.id));
    setLastDecision({
      reportNumber: report.report_number,
      authorityName: authorityName(report),
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

  if (!pendingReports.length && !lastDecision && !collectiveApprovals.length) return null;

  return (
    <section id="collective-validation" className="portalPanel">
      <div className="panelTitle">
        <div>
          <p className="eyebrow">Gouvernance · Conseil d’administration</p>
          <h2>Validation collégiale des rapports</h2>
          <p>
            Le membre habilité enregistre la décision du Conseil. L’autorité de validation reste le Conseil d’administration, jamais la fonction individuelle du signataire.
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

            <form className="reviewForm" onSubmit={(event) => recordDecision(event, report, "approved")}>
              <label>
                Référence de décision / PV
                <input name="decision_reference" placeholder="Ex. PV-CA-2026-08-16 / Résolution n°…" required />
              </label>
              <label>
                Date de la décision
                <input name="decision_date" type="date" defaultValue={today} required />
              </label>
              <textarea name="comment" placeholder="Observation du Conseil — facultative en cas d’approbation" />
              <button className="approveButton" disabled={busyId === report.id || !officialSignature}>
                {busyId === report.id ? "Enregistrement…" : "Valider au nom du Conseil d’administration"}
              </button>
              {!officialSignature && <small>Une signature officielle active est nécessaire pour enregistrer la décision.</small>}
            </form>

            <details>
              <summary>Retourner le rapport pour correction</summary>
              <form className="reviewForm returnForm" onSubmit={(event) => recordDecision(event, report, "returned")}>
                <label>Référence de décision / PV<input name="decision_reference" required /></label>
                <label>Date de la décision<input name="decision_date" type="date" defaultValue={today} required /></label>
                <textarea name="comment" minLength={5} placeholder="Corrections précises demandées par le Conseil" required />
                <label className="evidenceReviewChoice"><input name="require_evidence" type="checkbox" /> Exiger au moins une preuve à la prochaine soumission</label>
                <button disabled={busyId === report.id || !officialSignature}>Enregistrer le retour du Conseil</button>
              </form>
            </details>
          </article>
        );
      })}

      {collectiveApprovals.length > 0 && (
        <div className="reportSubsection">
          <h3>Décisions collégiales enregistrées</h3>
          {collectiveApprovals.map((approval) => {
            const report = reports.find((item) => item.id === approval.report_id);
            const currentSigner = approval.actor_id === profile.id;
            return (
              <div className="approvalRow" key={approval.id}>
                <b>{report?.report_number || "Rapport AIAC"} · {approval.decision === "approved" ? "Approuvé" : "Retourné"}</b>
                <p><b>Autorité de validation :</b> {approval.authority_name || "Conseil d’administration"}</p>
                <p><b>Décision enregistrée par :</b> {approval.actor_name}</p>
                <p><b>Référence de décision/PV :</b> {approval.decision_reference || "—"}</p>
                <p><b>Date :</b> {formatDate(approval.decision_date || approval.signed_at)}</p>
                {approval.comment && <p><b>Observation :</b> {approval.comment}</p>}
                <div>
                  <b>Signature :</b>
                  {currentSigner && signatureUrl ? (
                    <div className="official-assets">
                      <figure className="official-asset composite_signature">
                        <img src={signatureUrl} alt={`Signature officielle de ${approval.actor_name}`} />
                      </figure>
                    </div>
                  ) : (
                    <span> signature officielle enregistrée dans le dossier de décision.</span>
                  )}
                </div>
                <code>{approval.content_hash}</code>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
