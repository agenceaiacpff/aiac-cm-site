"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { OperationProfile } from "@/components/OperationsPanel";
import type { InstitutionalSignatureAsset } from "@/lib/institutional-signatures";
import styles from "./HierarchicalValidationPanel.module.css";

type QueueRow = {
  report_id: string;
  report_number: string;
  title: string | null;
  summary: string;
  revision: number;
  current_hash: string | null;
  reporter_id: string;
  reporter_name: string;
  body_code: string;
  program_code: string;
  project_code: string;
  activity_code: string;
  task_code: string;
  task_title: string;
  submitted_at: string | null;
};
type Props = { profile: OperationProfile; signatureAssets: InstitutionalSignatureAsset[] };

export default function HierarchicalValidationPanel({ profile, signatureAssets }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const activeAssets = useMemo(
    () => signatureAssets.filter((asset) => asset.profile_id === profile.id && asset.status === "active" && asset.is_default),
    [profile.id, signatureAssets],
  );
  const hasSignature = activeAssets.some((asset) => ["signature", "composite_signature"].includes(asset.asset_type));
  const hasNominal = activeAssets.some((asset) => asset.asset_type === "nominal_seal");
  const hasRound = activeAssets.some((asset) => asset.asset_type === "round_seal");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.rpc("my_hierarchical_task_report_review_queue");
      if (cancelled) return;
      setLoading(false);
      if (error) { setNotice(error.message); return; }
      setRows((data || []) as QueueRow[]);
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => `${row.report_number} ${row.title || ""} ${row.summary} ${row.reporter_name} ${row.body_code} ${row.program_code} ${row.project_code} ${row.activity_code} ${row.task_code} ${row.task_title}`.toLowerCase().includes(q));
  }, [query, rows]);

  async function decide(event: FormEvent<HTMLFormElement>, row: QueueRow, decision: "approved" | "returned") {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const comment = String(data.get("comment") || "").trim();
    if (decision === "returned" && comment.length < 5) {
      setNotice("Indiquez précisément les corrections demandées.");
      return;
    }
    if (!hasSignature) {
      setNotice("Une signature officielle active est nécessaire avant toute validation.");
      return;
    }
    setBusyId(row.report_id);
    setNotice("");
    const { error } = await supabase.rpc("review_task_report_with_signature_options", {
      target_report_id: row.report_id,
      decision,
      review_comment: comment,
      signature_name: profile.full_name || profile.email || "Responsable AIAC",
      signature_asset_path: null,
      require_evidence: data.get("require_evidence") === "on",
      include_nominal_seal: data.get("include_nominal_seal") === "on",
      include_round_seal: data.get("include_round_seal") === "on",
      signature_block_side: "right",
    });
    setBusyId("");
    if (error) { setNotice(error.message); return; }
    setRows((items) => items.filter((item) => item.report_id !== row.report_id));
    setNotice(decision === "approved" ? "Rapport approuvé, signé et intégré aux consolidations." : "Rapport retourné à son auteur avec notification de correction.");
    router.refresh();
  }

  if (loading) return <section className={styles.panel}><h2>Validation hiérarchique</h2><p>Chargement des rapports à valider…</p></section>;
  if (!rows.length && !notice) return null;

  return (
    <section className={styles.panel} id="validation-hierarchique">
      <div className={styles.heading}>
        <div><p className={styles.eyebrow}>Workflow de validation</p><h2>Validation hiérarchique</h2><p>Cette file exclut les rapports relevant du Conseil d’administration, qui sont traités séparément dans la validation collégiale.</p></div>
        <span className={styles.count}>{rows.length} à traiter</span>
      </div>
      {notice && <div className={styles.notice} role="status">{notice}</div>}
      <input className={styles.search} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher rapport, auteur, programme, projet, activité ou tâche…" />
      {!visible.length ? <p>Aucun rapport ne correspond à cette recherche.</p> : visible.map((row) => (
        <article className={styles.card} key={row.report_id}>
          <div className={styles.cardHead}><div><h3>{row.report_number} · {row.title || row.task_title}</h3><p>{row.body_code} → {row.program_code} → {row.project_code} → {row.activity_code} → {row.task_code}</p><small>Auteur : {row.reporter_name} · révision {row.revision}</small></div><span>Soumis</span></div>
          <p className={styles.summary}>{row.summary}</p>
          <code className={styles.hash}>SHA-256 : {row.current_hash || "—"}</code>
          <div className={styles.actions}><a href={`/espace/terrain/complet?report=${row.report_id}`}>Ouvrir le dossier complet</a></div>
          <form className={styles.form} onSubmit={(event) => decide(event, row, "approved")}>
            <textarea name="comment" placeholder="Observation de validation — facultative" />
            <label><input name="include_nominal_seal" type="checkbox" defaultChecked={hasNominal} disabled={!hasNominal} /> Cachet nominatif</label>
            <label><input name="include_round_seal" type="checkbox" defaultChecked={hasRound} disabled={!hasRound} /> Cachet rond</label>
            <button disabled={busyId === row.report_id || !hasSignature}>{busyId === row.report_id ? "Enregistrement…" : "Approuver et signer"}</button>
          </form>
          <details className={styles.returnBox}><summary>Retourner pour correction</summary><form className={styles.form} onSubmit={(event) => decide(event, row, "returned")}><textarea name="comment" minLength={5} required placeholder="Corrections précises demandées" /><label><input name="require_evidence" type="checkbox" /> Exiger une preuve à la prochaine soumission</label><label><input name="include_nominal_seal" type="checkbox" defaultChecked={hasNominal} disabled={!hasNominal} /> Cachet nominatif</label><label><input name="include_round_seal" type="checkbox" defaultChecked={hasRound} disabled={!hasRound} /> Cachet rond</label><button disabled={busyId === row.report_id || !hasSignature}>Retourner et notifier l’auteur</button></form></details>
        </article>
      ))}
    </section>
  );
}
