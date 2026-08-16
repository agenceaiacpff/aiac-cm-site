"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Profile = { id: string; full_name: string | null; email: string | null };
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
  authority_name?: string | null;
  decision_reference?: string | null;
  decision_date?: string | null;
  mandate_reference?: string | null;
  validation_reference?: string | null;
};
type Body = { id: string; name: string };
type SignatureAsset = {
  profile_id: string;
  asset_type: string;
  storage_path: string;
  is_default: boolean;
  status: string;
};
type Mandate = {
  id: string;
  mandate_code: string;
  pv_reference: string;
  resolution_reference: string;
  title: string;
  authority_name: string;
  adopted_on: string;
  effective_from: string;
  effective_until: string | null;
  scope_summary: string;
  signed_pdf_file_name: string | null;
  signed_pdf_sha256: string | null;
  member_status: string;
  accepted_at: string | null;
};
type DecisionResult = {
  report_number: string;
  decision: "approved" | "returned";
  validation_reference: string;
  mandate_reference: string;
  resolution_reference: string;
  mandate_adopted_on: string;
  decision_date: string;
  authority_name: string;
};
type Props = {
  profile: Profile;
  reports: Report[];
  approvals: Approval[];
  bodies: Body[];
  signatureAssets: SignatureAsset[];
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

export default function CollectiveValidationPanel({ profile, reports, approvals, bodies, signatureAssets }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [pendingReports, setPendingReports] = useState<Report[]>(() =>
    reports.filter((report) => report.status === "submitted" && report.reporter_id !== profile.id && report.validation_authority_type === "collective_body" && Boolean(report.validation_authority_body_id)),
  );
  const [mandatesByReport, setMandatesByReport] = useState<Record<string, Mandate[]>>({});
  const [selectedMandateByReport, setSelectedMandateByReport] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState("");
  const [signatureUrl, setSignatureUrl] = useState("");
  const [lastDecision, setLastDecision] = useState<DecisionResult | null>(null);

  const collectiveApprovals = useMemo(
    () => approvals.filter((item) => item.authority_type === "collective_body").slice().sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [approvals],
  );
  const officialSignature = useMemo(
    () => signatureAssets.find((asset) => asset.profile_id === profile.id && asset.status === "active" && asset.is_default && ["composite_signature", "signature"].includes(asset.asset_type)) || null,
    [profile.id, signatureAssets],
  );

  useEffect(() => {
    setPendingReports(reports.filter((report) => report.status === "submitted" && report.reporter_id !== profile.id && report.validation_authority_type === "collective_body" && Boolean(report.validation_authority_body_id)));
  }, [profile.id, reports]);

  useEffect(() => {
    let cancelled = false;
    async function loadMandates() {
      const entries: Array<[string, Mandate[]]> = [];
      for (const report of pendingReports) {
        const { data, error } = await supabase.rpc("my_report_validation_mandates", { target_report_id: report.id });
        if (!error) entries.push([report.id, (data || []) as Mandate[]]);
      }
      if (!cancelled) setMandatesByReport(Object.fromEntries(entries));
    }
    void loadMandates();
    return () => { cancelled = true; };
  }, [pendingReports, supabase]);

  useEffect(() => {
    let cancelled = false;
    async function loadSignature() {
      if (!officialSignature) { setSignatureUrl(""); return; }
      const { data } = await supabase.storage.from("aiac-signatures").createSignedUrl(officialSignature.storage_path, 900);
      if (!cancelled) setSignatureUrl(data?.signedUrl || "");
    }
    void loadSignature();
    return () => { cancelled = true; };
  }, [officialSignature, supabase]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("mode") !== "validation") return;
    requestAnimationFrame(() => document.getElementById("collective-validation")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, []);

  function authorityName(report: Report) {
    return bodies.find((body) => body.id === report.validation_authority_body_id)?.name || "Conseil d’administration";
  }

  async function recordDecision(event: FormEvent<HTMLFormElement>, report: Report, decision: "approved" | "returned") {
    event.preventDefault();
    const mandateId = selectedMandateByReport[report.id];
    const data = new FormData(event.currentTarget);
    const comment = String(data.get("comment") || "").trim();
    const requireEvidence = data.get("require_evidence") === "on";
    if (!mandateId) { setNotice("Sélectionnez d’abord le PV d’habilitation applicable."); return; }
    if (decision === "returned" && comment.length < 5) { setNotice("Précisez les corrections demandées."); return; }

    setBusyId(report.id);
    setNotice("");
    const { data: result, error } = await supabase.rpc("review_task_report_collective_from_mandate", {
      target_report_id: report.id,
      decision,
      review_comment: comment,
      mandate_id: mandateId,
      require_evidence: requireEvidence,
    });
    if (error) { setNotice(error.message); setBusyId(""); return; }

    setPendingReports((items) => items.filter((item) => item.id !== report.id));
    setLastDecision(result as DecisionResult);
    setNotice(decision === "approved"
      ? "Décision enregistrée au nom du Conseil d’administration. La référence de validation a été générée automatiquement."
      : "Retour pour correction enregistré au nom du Conseil d’administration.");
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
          <p>Le PV permanent d’habilitation est enregistré une seule fois. Au moment de la validation, le membre habilité le sélectionne et la plateforme reprend automatiquement ses références.</p>
        </div>
        {pendingReports.length > 0 && <span className="operationBadge submitted">{pendingReports.length} à valider</span>}
      </div>

      {notice && <div className="notice" role="status">{notice}</div>}

      {lastDecision && (
        <div className="reviewCard">
          <h3>{lastDecision.report_number}</h3>
          <p><b>Autorité de validation :</b> {lastDecision.authority_name}</p>
          <p><b>Décision enregistrée par :</b> {profile.full_name || profile.email}</p>
          <p><b>PV d’habilitation :</b> {lastDecision.mandate_reference}</p>
          <p><b>Résolution :</b> {lastDecision.resolution_reference}</p>
          <p><b>Date du PV :</b> {formatDate(lastDecision.mandate_adopted_on)}</p>
          <p><b>Référence de validation :</b> {lastDecision.validation_reference}</p>
          <p><b>Date de validation :</b> {formatDate(lastDecision.decision_date)}</p>
          <p><b>Décision :</b> {lastDecision.decision === "approved" ? "Approuvé" : "Retourné pour correction"}</p>
          {signatureUrl && <div className="official-assets"><figure className="official-asset composite_signature"><img src={signatureUrl} alt="Signature officielle du membre habilité" /></figure></div>}
        </div>
      )}

      {pendingReports.map((report) => {
        const mandates = mandatesByReport[report.id] || [];
        const selectedId = selectedMandateByReport[report.id] || "";
        const selected = mandates.find((item) => item.id === selectedId) || null;
        return (
          <article className="reviewCard" key={report.id}>
            <div className="panelTitle">
              <div><h3>{report.report_number}</h3><p>{report.title || report.summary}</p></div>
              <span className="operationBadge submitted">Soumis · révision {report.revision}</span>
            </div>
            <p>{report.summary}</p>
            <p className="hashPreview">SHA-256 : {report.current_hash}</p>
            <div className="securityBox">
              <p><b>Autorité de validation :</b> {authorityName(report)}</p>
              <p><b>Décision enregistrée par :</b> {profile.full_name || profile.email}</p>
              {signatureUrl && <div className="official-assets"><figure className="official-asset composite_signature"><img src={signatureUrl} alt="Signature officielle" /></figure></div>}
            </div>

            <div className="reportSubsection">
              <h4>1 · Sélectionner l’habilitation</h4>
              {mandates.length === 0 ? (
                <p>Aucun PV d’habilitation actif n’est disponible pour votre compte et ce rapport.</p>
              ) : (
                <div className="reportActions">
                  {mandates.map((mandate) => (
                    <button
                      type="button"
                      key={mandate.id}
                      className={selectedId === mandate.id ? "approveButton" : ""}
                      onClick={() => setSelectedMandateByReport((items) => ({ ...items, [report.id]: mandate.id }))}
                    >
                      {selectedId === mandate.id ? "PV sélectionné" : "Utiliser ce PV"} · {mandate.pv_reference}
                    </button>
                  ))}
                </div>
              )}
              {selected && (
                <div className="securityBox">
                  <p><b>PV d’habilitation :</b> {selected.pv_reference}</p>
                  <p><b>Résolution :</b> {selected.resolution_reference}</p>
                  <p><b>Date d’adoption :</b> {formatDate(selected.adopted_on)}</p>
                  <p><b>État :</b> habilitation active et acceptée</p>
                  <p><b>Référence de validation :</b> générée automatiquement au format VAL-CA-AAAA-NNNN</p>
                  <p><b>Date de validation :</b> remplie automatiquement au jour de la décision</p>
                  {selected.signed_pdf_sha256 && <code>PV signé · SHA-256 {selected.signed_pdf_sha256}</code>}
                </div>
              )}
            </div>

            <form className="reviewForm" onSubmit={(event) => recordDecision(event, report, "approved")}>
              <h4>2 · Enregistrer la décision</h4>
              <textarea name="comment" placeholder="Observation du Conseil — facultative en cas d’approbation" />
              <button className="approveButton" disabled={busyId === report.id || !officialSignature || !selected}>
                {busyId === report.id ? "Enregistrement…" : "Valider au nom du Conseil d’administration"}
              </button>
              {!officialSignature && <small>Une signature officielle active est nécessaire.</small>}
            </form>

            <details>
              <summary>Retourner le rapport pour correction</summary>
              <form className="reviewForm returnForm" onSubmit={(event) => recordDecision(event, report, "returned")}>
                <textarea name="comment" minLength={5} placeholder="Corrections précises demandées par le Conseil" required />
                <label className="evidenceReviewChoice"><input name="require_evidence" type="checkbox" /> Exiger au moins une preuve à la prochaine soumission</label>
                <button disabled={busyId === report.id || !officialSignature || !selected}>Enregistrer le retour du Conseil</button>
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
            return (
              <div className="approvalRow" key={approval.id}>
                <b>{report?.report_number || "Rapport AIAC"} · {approval.decision === "approved" ? "Approuvé" : "Retourné"}</b>
                <p><b>Autorité de validation :</b> {approval.authority_name || "Conseil d’administration"}</p>
                <p><b>Décision enregistrée par :</b> {approval.actor_name}</p>
                <p><b>PV d’habilitation :</b> {approval.mandate_reference || "Ancienne décision sans mandat lié"}</p>
                <p><b>Référence de validation :</b> {approval.validation_reference || approval.decision_reference || "—"}</p>
                <p><b>Date :</b> {formatDate(approval.decision_date || approval.signed_at)}</p>
                {approval.comment && <p><b>Observation :</b> {approval.comment}</p>}
                <code>{approval.content_hash}</code>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
