"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Account = {
  accountId: string;
  label: string;
  priority: number;
  active: boolean;
  status: string;
  environment: string;
  ready: boolean;
};

type Config = {
  provider: string;
  mode: string;
  currency: string;
  platformFeePercent: number;
  productionLocked: boolean;
  accounts: Account[];
};

type ViewState = "idle" | "loading" | "pending" | "success" | "error";

const initialConfig: Config = {
  provider: "MTN MoMo Collections",
  mode: "sandbox",
  currency: "EUR",
  platformFeePercent: 2,
  productionLocked: true,
  accounts: [],
};

export default function PayClient() {
  const [config, setConfig] = useState<Config>(initialConfig);
  const [amount, setAmount] = useState("98");
  const [state, setState] = useState<ViewState>("idle");
  const [message, setMessage] = useState("");
  const [referenceId, setReferenceId] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const attempts = useRef(0);

  useEffect(() => {
    fetch("/api/aiac-pay", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || "Configuration indisponible");
        setConfig(data);
      })
      .catch(() => setMessage("La configuration MTN est momentanément indisponible."));

    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  const pricing = useMemo(() => {
    const base = Number(amount || 0);
    const fee = Math.round((base * Number(config.platformFeePercent || 2)) / 100);
    return { base, fee, total: base + fee };
  }, [amount, config.platformFeePercent]);

  async function checkStatus(id: string) {
    attempts.current += 1;
    const response = await fetch(`/api/aiac-pay/status/${id}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || "Statut indisponible");

    const status = String(data?.status || "").toUpperCase();
    if (status === "SUCCESSFUL") {
      if (timer.current) clearInterval(timer.current);
      setState("success");
      setMessage("Test réussi : MTN a confirmé la transaction Sandbox. Aucun argent réel n’a été débité.");
      return;
    }
    if (["FAILED", "REJECTED"].includes(status)) {
      if (timer.current) clearInterval(timer.current);
      setState("error");
      setMessage("MTN a refusé cette transaction de test.");
      return;
    }
    if (attempts.current >= 12) {
      if (timer.current) clearInterval(timer.current);
      setState("pending");
      setMessage("La demande est encore en traitement. Vous pouvez relancer un test dans quelques instants.");
      return;
    }
    setState("pending");
    setMessage("Demande acceptée. Vérification du statut chez MTN…");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (timer.current) clearInterval(timer.current);
    attempts.current = 0;
    setReferenceId("");
    setState("loading");
    setMessage("Connexion sécurisée à MTN MoMo…");

    try {
      const response = await fetch("/api/aiac-pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pay", amount: pricing.base }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Paiement test impossible");

      setReferenceId(data.referenceId);
      setState("pending");
      setMessage("Demande acceptée par MTN. Contrôle du résultat…");
      await checkStatus(data.referenceId);
      timer.current = setInterval(() => {
        void checkStatus(data.referenceId).catch(() => undefined);
      }, 1800);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Une erreur est survenue.");
    }
  }

  return (
    <main className="payShell">
      <section className="hero">
        <div className="brandRow">
          <Link className="brand" href="/" aria-label="Retour au site AIAC">
            <span className="logo">A</span>
            <span><strong>AIAC Pay</strong><small>Passerelle Mobile Money</small></span>
          </Link>
          <span className="mode">MODE TEST</span>
        </div>
        <h1>Recevoir des paiements MTN MoMo, simplement.</h1>
        <p>
          Le premier canal AIAC Pay est connecté à MTN MoMo Collections. Cette étape valide tout le circuit technique avant le passage aux vrais FCFA.
        </p>
        <div className="chips">
          <span>✓ MTN connecté</span><span>✓ Clés protégées</span><span>✓ Deux comptes prévus</span>
        </div>
      </section>

      <section className="columns">
        <article className="card">
          <div className="cardHead">
            <div><small className="eyebrow">TRANSACTION SANDBOX</small><h2>Paiement test</h2></div>
            <span className="online">● Connecté</span>
          </div>

          <div className="notice">
            <strong>Aucun argent réel.</strong> Ce test utilise le Sandbox officiel MTN et la devise EUR. Aucun portefeuille camerounais n’est débité ou crédité.
          </div>

          <form onSubmit={submit}>
            <label htmlFor="amount">Montant de base simulé</label>
            <div className="moneyField">
              <input id="amount" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value.replace(/\D/g, ""))} required />
              <span>{config.currency}</span>
            </div>
            <p className="hint">Le compte test MTN est choisi automatiquement par le serveur.</p>

            <div className="summary">
              <div><span>Montant</span><strong>{pricing.base.toLocaleString("fr-FR")} {config.currency}</strong></div>
              <div><span>Frais AIAC Pay ({config.platformFeePercent} %)</span><strong>{pricing.fee.toLocaleString("fr-FR")} {config.currency}</strong></div>
              <div className="total"><span>Total simulé</span><strong>{pricing.total.toLocaleString("fr-FR")} {config.currency}</strong></div>
            </div>

            <button type="submit" disabled={state === "loading" || pricing.base < 1}>
              {state === "loading" ? "Connexion à MTN…" : "Lancer un paiement test"}
            </button>
          </form>

          {state !== "idle" && (
            <div className={`result ${state}`}>
              <strong>{state === "success" ? "✓ Test réussi" : state === "error" ? "Attention" : "Traitement"}</strong>
              <span>{message}</span>
              {referenceId && <small>Référence : {referenceId}</small>}
            </div>
          )}
        </article>

        <aside className="card accountsCard">
          <small className="eyebrow">COMPTES MTN COLLECTIONS</small>
          <h2>Ordre d’utilisation</h2>
          {config.accounts.length === 0 && <p className="muted">Chargement des comptes…</p>}
          {config.accounts.map((account, index) => (
            <div className="account" key={account.accountId}>
              <span className="rank">{index + 1}</span>
              <div className="accountText"><strong>{account.label}</strong><small>{index === 0 ? "Compte principal" : "Compte de secours"}</small></div>
              <span className={account.ready ? "ready" : "waiting"}>{account.ready ? "Prêt" : "En attente"}</span>
            </div>
          ))}
          <div className="lockBox">
            <strong>🔒 Production verrouillée</strong>
            <p>Les vrais numéros MTN et les FCFA seront activés seulement après validation Go-Live de MTN Cameroun.</p>
          </div>
        </aside>
      </section>

      <style jsx>{`
        :global(body){margin:0;background:#f2f6f8;color:#132a35;font-family:Arial,Helvetica,sans-serif}.payShell{max-width:1160px;margin:0 auto;padding:28px 20px 64px}.hero{background:linear-gradient(135deg,#07556b,#07808c);color:#fff;border-radius:28px;padding:30px 34px 36px;box-shadow:0 20px 52px rgba(5,63,77,.18)}.brandRow{display:flex;align-items:center;justify-content:space-between;gap:16px}.brand{display:flex;align-items:center;gap:12px;color:#fff;text-decoration:none}.brand>span:last-child{display:flex;flex-direction:column}.brand small{opacity:.8}.logo{width:46px;height:46px;border-radius:14px;display:grid;place-items:center;background:#ffd400;color:#0a4659;font-size:24px;font-weight:900}.mode{background:#ffd400;color:#173c49;padding:9px 13px;border-radius:999px;font-size:12px;font-weight:900}.hero h1{max-width:760px;font-size:clamp(34px,5vw,50px);line-height:1.03;margin:32px 0 14px}.hero p{max-width:790px;font-size:16px;line-height:1.65;color:#e8fbfd}.chips{display:flex;flex-wrap:wrap;gap:9px;margin-top:20px}.chips span{padding:8px 11px;border-radius:999px;background:rgba(255,255,255,.11);border:1px solid rgba(255,255,255,.18);font-size:13px}.columns{display:grid;grid-template-columns:1.3fr .8fr;gap:22px;margin-top:24px}.card{background:#fff;border:1px solid #e0eaee;border-radius:22px;padding:25px;box-shadow:0 14px 36px rgba(18,58,72,.08)}.cardHead{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.eyebrow{font-size:11px;letter-spacing:.11em;color:#66808b;font-weight:900}.card h2{font-size:25px;margin:6px 0 18px}.online{background:#e7f8ef;color:#10704a;border-radius:999px;padding:8px 11px;font-size:12px;font-weight:900}.notice{background:#fff8d9;border:1px solid #efd67c;border-radius:14px;padding:14px 15px;font-size:14px;line-height:1.5;margin:2px 0 20px}label{display:block;font-size:13px;font-weight:800;margin-bottom:8px}.moneyField{display:flex;border:1px solid #d3e0e5;border-radius:13px;overflow:hidden;background:#fbfdfe}.moneyField input{width:100%;border:0;outline:0;background:transparent;padding:15px;font-size:18px}.moneyField span{display:grid;place-items:center;padding:0 15px;background:#eef4f6;font-weight:900}.hint{font-size:12px;color:#6d848f;margin:7px 0 0}.summary{background:#f5f9fa;border-radius:15px;padding:12px 16px;margin:20px 0}.summary div{display:flex;justify-content:space-between;gap:14px;padding:8px 0;font-size:14px}.summary .total{border-top:1px solid #dce7eb;margin-top:4px;padding-top:13px;font-size:16px}button{width:100%;border:0;border-radius:14px;background:#08758a;color:white;padding:15px;font-size:16px;font-weight:900;cursor:pointer}button:disabled{opacity:.55;cursor:not-allowed}.result{display:flex;flex-direction:column;gap:5px;margin-top:17px;padding:14px;border-radius:14px}.result.loading,.result.pending{background:#eaf4ff;color:#245b85}.result.success{background:#e7f8ef;color:#116442}.result.error{background:#fff0ef;color:#96362e}.result small{overflow-wrap:anywhere}.account{display:grid;grid-template-columns:34px 1fr auto;align-items:center;gap:11px;padding:15px 0;border-top:1px solid #edf2f4}.rank{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:#edf5f6;font-weight:900}.accountText{display:flex;flex-direction:column;gap:4px}.accountText small{color:#738690}.ready,.waiting{font-size:11px;font-weight:900;padding:6px 9px;border-radius:999px}.ready{background:#e7f8ef;color:#116c48}.waiting{background:#fff4dc;color:#8a6515}.lockBox{margin-top:22px;border-radius:15px;background:#f1f5f7;padding:16px}.lockBox p,.muted{color:#607681;font-size:13px;line-height:1.55}.lockBox p{margin-bottom:0}@media(max-width:780px){.payShell{padding:14px 11px 40px}.hero{padding:23px 21px}.columns{grid-template-columns:1fr}.card{padding:20px}.account{grid-template-columns:32px 1fr}.account>.ready,.account>.waiting{grid-column:2;width:max-content}}
      `}</style>
    </main>
  );
}
