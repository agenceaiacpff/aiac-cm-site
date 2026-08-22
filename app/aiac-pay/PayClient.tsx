"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type ProviderId = "mtn" | "orange";
type ViewState = "idle" | "loading" | "pending" | "success" | "error";

type Account = {
  accountId: string;
  label: string;
  priority: number;
  active: boolean;
  status: string;
  environment: string;
  ready: boolean;
};

type GoLive = {
  provider?: string;
  country?: string;
  product?: string;
  target_environment?: string;
  currency?: string;
  status?: string;
  sandbox_validated?: boolean;
  submitted_at?: string | null;
  approved_at?: string | null;
};

type ProviderConfig = {
  id: ProviderId;
  provider: string;
  mode: string;
  currency: string;
  platformFeePercent: number;
  productionLocked: boolean;
  ready: boolean;
  status: string;
  accounts?: Account[];
  account?: {
    accountId: string;
    label: string;
    merchantMsisdnMasked?: string;
    environment?: string;
  } | null;
  goLive?: GoLive | null;
  applyUrl?: string;
  callbackUrl?: string;
};

type Config = {
  providers: {
    mtn: ProviderConfig;
    orange: ProviderConfig;
  };
};

const fallbackMtn: ProviderConfig = {
  id: "mtn",
  provider: "MTN MoMo Collections",
  mode: "sandbox",
  currency: "EUR",
  platformFeePercent: 2,
  productionLocked: true,
  ready: false,
  status: "loading",
  accounts: [],
};

const fallbackOrange: ProviderConfig = {
  id: "orange",
  provider: "Orange Money Web Payment",
  mode: "onboarding",
  currency: "XAF",
  platformFeePercent: 2,
  productionLocked: true,
  ready: false,
  status: "onboarding_required",
  account: null,
  applyUrl: "https://developer.orange.com/products/payment/apply-orange-money/",
};

const initialConfig: Config = {
  providers: { mtn: fallbackMtn, orange: fallbackOrange },
};

export default function PayClient() {
  const [config, setConfig] = useState<Config>(initialConfig);
  const [providerId, setProviderId] = useState<ProviderId>("mtn");
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
        const providers = data?.providers;
        if (providers?.mtn && providers?.orange) {
          setConfig({ providers });
        }
      })
      .catch(() => setMessage("La configuration AIAC Pay est momentanément indisponible."));

    const params = new URLSearchParams(window.location.search);
    if (params.get("provider") === "orange") {
      setProviderId("orange");
      setAmount("1000");
      if (params.get("result") === "return") {
        setState("pending");
        setMessage("Retour depuis Orange Money reçu. La confirmation serveur fait foi pour valider définitivement le paiement.");
      } else if (params.get("result") === "cancel") {
        setState("error");
        setMessage("Le paiement Orange Money a été annulé avant confirmation.");
      }
    }

    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  const provider = config.providers[providerId] || (providerId === "mtn" ? fallbackMtn : fallbackOrange);

  const pricing = useMemo(() => {
    const base = Number(amount || 0);
    const fee = Math.round((base * Number(provider.platformFeePercent || 0)) / 100);
    return { base, fee, total: base + fee };
  }, [amount, provider.platformFeePercent]);

  function switchProvider(next: ProviderId) {
    if (timer.current) clearInterval(timer.current);
    setProviderId(next);
    setAmount(next === "mtn" ? "98" : "1000");
    setState("idle");
    setMessage("");
    setReferenceId("");
    attempts.current = 0;
  }

  async function checkMtnStatus(id: string) {
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
    setMessage(providerId === "mtn" ? "Connexion sécurisée à MTN MoMo…" : "Connexion sécurisée à Orange Money…");

    try {
      const response = await fetch("/api/aiac-pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: providerId, action: "pay", amount: pricing.base }),
      });
      const data = await response.json();

      if (!response.ok) {
        if (data?.error === "ORANGE_ONBOARDING_REQUIRED") {
          setState("pending");
          setMessage("La partie technique Orange est prête, mais Orange doit encore activer le statut marchand Web Payment de l’AIAC.");
          return;
        }
        throw new Error(data?.message || data?.error || "Paiement impossible");
      }

      if (providerId === "orange") {
        if (!data?.paymentUrl) throw new Error("Orange n’a pas renvoyé de page de paiement.");
        setReferenceId(data.orderId || data.payToken || "");
        setState("pending");
        setMessage("Paiement initialisé. Redirection vers la page sécurisée Orange Money…");
        window.location.assign(data.paymentUrl);
        return;
      }

      setReferenceId(data.referenceId);
      setState("pending");
      setMessage("Demande acceptée par MTN. Contrôle du résultat…");
      await checkMtnStatus(data.referenceId);
      timer.current = setInterval(() => {
        void checkMtnStatus(data.referenceId).catch(() => undefined);
      }, 1800);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Une erreur est survenue.");
    }
  }

  const mtn = config.providers.mtn;
  const orange = config.providers.orange;
  const mtnGoLivePending = Boolean(mtn?.goLive?.status && mtn.goLive.status !== "approved");
  const orangeOnboarding = !orange?.ready;

  return (
    <main className="payShell">
      <section className="hero">
        <div className="brandRow">
          <Link className="brand" href="/" aria-label="Retour au site AIAC">
            <span className="logo">A</span>
            <span><strong>AIAC Pay</strong><small>Passerelle de paiement</small></span>
          </Link>
          <span className="mode">MTN + ORANGE</span>
        </div>
        <h1>Recevoir des paiements Mobile Money, simplement.</h1>
        <p>
          AIAC Pay réunit progressivement les moyens de paiement de l’AIAC dans une seule interface. MTN MoMo est déjà validé en Sandbox ; Orange Money Web Payment est préparé et passe maintenant à l’onboarding marchand.
        </p>
        <div className="chips">
          <span>✓ MTN Sandbox validé</span>
          <span>✓ Orange intégré côté serveur</span>
          <span>✓ Clés protégées côté serveur</span>
        </div>
      </section>

      <section className="providerPicker" aria-label="Choisir un moyen de paiement">
        <button className={`providerChoice ${providerId === "mtn" ? "selected" : ""}`} type="button" onClick={() => switchProvider("mtn")}>
          <span className="providerMark mtnMark">MTN</span>
          <span><strong>MTN MoMo</strong><small>{mtn?.ready ? "Sandbox prêt" : "Configuration"}</small></span>
          <em className={mtn?.ready ? "okBadge" : "waitBadge"}>{mtn?.ready ? "Prêt" : "Attente"}</em>
        </button>
        <button className={`providerChoice ${providerId === "orange" ? "selected orangeSelected" : ""}`} type="button" onClick={() => switchProvider("orange")}>
          <span className="providerMark orangeMark">OM</span>
          <span><strong>Orange Money</strong><small>{orange?.ready ? "Web Payment prêt" : "Onboarding marchand"}</small></span>
          <em className={orange?.ready ? "okBadge" : "waitBadge"}>{orange?.ready ? "Prêt" : "En cours"}</em>
        </button>
      </section>

      <section className="columns">
        <article className="card">
          <div className="cardHead">
            <div>
              <small className="eyebrow">{providerId === "mtn" ? "MTN MOMO COLLECTIONS" : "ORANGE MONEY WEB PAYMENT"}</small>
              <h2>{providerId === "mtn" ? "Paiement test" : orange?.ready ? "Paiement Orange Money" : "Préparation Orange Money"}</h2>
            </div>
            <span className={provider.ready ? "online" : "preparing"}>{provider.ready ? "● Connecté" : "● Préparation"}</span>
          </div>

          {providerId === "mtn" ? (
            <div className="notice mtnNotice">
              <strong>Aucun argent réel.</strong> Ce canal utilise encore le Sandbox officiel MTN et la devise EUR. La demande Go-Live Cameroun est déjà soumise à MTN.
            </div>
          ) : (
            <div className="notice orangeNotice">
              <strong>Orange Cameroun : intégration préparée.</strong> Le serveur AIAC Pay, le registre de transactions et l’adresse de notification sont prêts. Il reste l’activation Orange Money marchand/KYA et la remise des identifiants Web Payment par Orange.
            </div>
          )}

          <form onSubmit={submit}>
            <label htmlFor="amount">{providerId === "mtn" ? "Montant de base simulé" : "Montant de base"}</label>
            <div className="moneyField">
              <input
                id="amount"
                inputMode="numeric"
                value={amount}
                onChange={(event) => setAmount(event.target.value.replace(/\D/g, ""))}
                required
              />
              <span>{provider.currency}</span>
            </div>
            <p className="hint">
              {providerId === "mtn"
                ? "Le compte test MTN est choisi automatiquement par le serveur."
                : orange?.ready
                  ? "Après validation, le client sera redirigé vers la page sécurisée Orange Money."
                  : "Aucun débit Orange ne peut être déclenché tant que l’accès marchand n’est pas approuvé."}
            </p>

            <div className="summary">
              <div><span>Montant</span><strong>{pricing.base.toLocaleString("fr-FR")} {provider.currency}</strong></div>
              <div><span>Frais AIAC Pay configurés ({provider.platformFeePercent} %)</span><strong>{pricing.fee.toLocaleString("fr-FR")} {provider.currency}</strong></div>
              <div className="total"><span>Total</span><strong>{pricing.total.toLocaleString("fr-FR")} {provider.currency}</strong></div>
            </div>

            {providerId === "orange" && !orange?.ready ? (
              <a className="primaryAction orangeAction" href={orange?.applyUrl || fallbackOrange.applyUrl} target="_blank" rel="noreferrer">
                Activer Orange Money Web Payment
              </a>
            ) : (
              <button className={providerId === "orange" ? "orangeButton" : ""} type="submit" disabled={state === "loading" || pricing.base < 1}>
                {state === "loading"
                  ? providerId === "mtn" ? "Connexion à MTN…" : "Connexion à Orange…"
                  : providerId === "mtn" ? "Lancer un paiement test" : "Payer avec Orange Money"}
              </button>
            )}
          </form>

          {state !== "idle" && (
            <div className={`result ${state}`}>
              <strong>{state === "success" ? "✓ Paiement confirmé" : state === "error" ? "Attention" : "Traitement"}</strong>
              <span>{message}</span>
              {referenceId && <small>Référence : {referenceId}</small>}
            </div>
          )}
        </article>

        <aside className="card accountsCard">
          <small className="eyebrow">CANAUX AIAC PAY</small>
          <h2>État des connexions</h2>

          <div className="channelRow">
            <span className="channelIcon mtnMark">MTN</span>
            <div className="channelText">
              <strong>MTN MoMo Collections</strong>
              <small>{mtnGoLivePending ? "Go-Live Cameroun soumis à MTN" : "Production MTN"}</small>
            </div>
            <span className="okBadge">Sandbox ✓</span>
          </div>

          <div className="channelRow">
            <span className="channelIcon orangeMark">OM</span>
            <div className="channelText">
              <strong>{orange?.account?.label || "Orange Money AIAC"}</strong>
              <small>{orange?.account?.merchantMsisdnMasked || "+237 699 *** 020"}</small>
            </div>
            <span className={orange?.ready ? "okBadge" : "waitBadge"}>{orange?.ready ? "API prête" : "KYA / API"}</span>
          </div>

          <div className="milestones">
            <div><span className="doneDot">✓</span><p><strong>Orange ajouté à AIAC Pay</strong><small>Interface, registre serveur et sécurité préparés.</small></p></div>
            <div><span className={orangeOnboarding ? "currentDot" : "doneDot"}>{orangeOnboarding ? "2" : "✓"}</span><p><strong>Statut marchand Orange</strong><small>Demande Orange Money Web Payment / KYA.</small></p></div>
            <div><span className="futureDot">3</span><p><strong>Clés API et test</strong><small>OAuth, paiement test, notification et vérification.</small></p></div>
            <div><span className="futureDot">4</span><p><strong>Production XAF</strong><small>Activation des vrais paiements Orange Cameroun.</small></p></div>
          </div>

          <div className="lockBox">
            <strong>🔒 Débits réels contrôlés</strong>
            <p>MTN reste en Sandbox jusqu’à son approbation Go-Live. Orange reste verrouillé jusqu’à la validation marchand et à l’installation des clés officielles.</p>
          </div>
        </aside>
      </section>

      <style jsx>{`
        :global(body){margin:0;background:#f2f6f8;color:#132a35;font-family:Arial,Helvetica,sans-serif}.payShell{max-width:1160px;margin:0 auto;padding:28px 20px 64px}.hero{background:linear-gradient(135deg,#07556b,#07808c);color:#fff;border-radius:28px;padding:30px 34px 36px;box-shadow:0 20px 52px rgba(5,63,77,.18)}.brandRow{display:flex;align-items:center;justify-content:space-between;gap:16px}.brand{display:flex;align-items:center;gap:12px;color:#fff;text-decoration:none}.brand>span:last-child{display:flex;flex-direction:column}.brand small{opacity:.8}.logo{width:46px;height:46px;border-radius:14px;display:grid;place-items:center;background:#ffd400;color:#0a4659;font-size:24px;font-weight:900}.mode{background:#fff;color:#173c49;padding:9px 13px;border-radius:999px;font-size:12px;font-weight:900}.hero h1{max-width:810px;font-size:clamp(34px,5vw,50px);line-height:1.03;margin:32px 0 14px}.hero p{max-width:850px;font-size:16px;line-height:1.65;color:#e8fbfd}.chips{display:flex;flex-wrap:wrap;gap:9px;margin-top:20px}.chips span{padding:8px 11px;border-radius:999px;background:rgba(255,255,255,.11);border:1px solid rgba(255,255,255,.18);font-size:13px}.providerPicker{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:22px}.providerChoice{display:grid;grid-template-columns:48px 1fr auto;align-items:center;text-align:left;gap:12px;background:#fff;color:#16303a;border:1px solid #dfe8ec;border-radius:17px;padding:14px 16px;box-shadow:0 8px 22px rgba(18,58,72,.05);cursor:pointer}.providerChoice>span:nth-child(2){display:flex;flex-direction:column;gap:3px}.providerChoice small{font-weight:500;color:#71858e}.providerChoice.selected{border:2px solid #07808c;padding:13px 15px}.providerChoice.orangeSelected{border-color:#f07c00}.providerMark,.channelIcon{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;font-weight:900;font-size:12px}.mtnMark{background:#ffd400;color:#111}.orangeMark{background:#ff7900;color:#fff}.providerChoice em{font-style:normal}.columns{display:grid;grid-template-columns:1.3fr .8fr;gap:22px;margin-top:18px}.card{background:#fff;border:1px solid #e0eaee;border-radius:22px;padding:25px;box-shadow:0 14px 36px rgba(18,58,72,.08)}.cardHead{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.eyebrow{font-size:11px;letter-spacing:.11em;color:#66808b;font-weight:900}.card h2{font-size:25px;margin:6px 0 18px}.online,.preparing{border-radius:999px;padding:8px 11px;font-size:12px;font-weight:900}.online{background:#e7f8ef;color:#10704a}.preparing{background:#fff4e8;color:#9a5400}.notice{border-radius:14px;padding:14px 15px;font-size:14px;line-height:1.5;margin:2px 0 20px}.mtnNotice{background:#fff8d9;border:1px solid #efd67c}.orangeNotice{background:#fff4e8;border:1px solid #ffc98f}label{display:block;font-size:13px;font-weight:800;margin-bottom:8px}.moneyField{display:flex;border:1px solid #d3e0e5;border-radius:13px;overflow:hidden;background:#fbfdfe}.moneyField input{width:100%;border:0;outline:0;background:transparent;padding:15px;font-size:18px}.moneyField span{display:grid;place-items:center;padding:0 15px;background:#eef4f6;font-weight:900}.hint{font-size:12px;color:#6d848f;margin:7px 0 0;line-height:1.5}.summary{background:#f5f9fa;border-radius:15px;padding:12px 16px;margin:20px 0}.summary div{display:flex;justify-content:space-between;gap:14px;padding:8px 0;font-size:14px}.summary .total{border-top:1px solid #dce7eb;margin-top:4px;padding-top:13px;font-size:16px}button,.primaryAction{width:100%;box-sizing:border-box;border:0;border-radius:14px;background:#08758a;color:white;padding:15px;font-size:16px;font-weight:900;cursor:pointer;text-align:center;text-decoration:none;display:block}.orangeButton,.orangeAction{background:#ff7900}.providerChoice{width:auto;font-size:inherit;font-weight:inherit}.providerChoice:disabled,button:disabled{opacity:.55;cursor:not-allowed}.result{display:flex;flex-direction:column;gap:5px;margin-top:17px;padding:14px;border-radius:14px}.result.loading,.result.pending{background:#eaf4ff;color:#245b85}.result.success{background:#e7f8ef;color:#116442}.result.error{background:#fff0ef;color:#96362e}.result small{overflow-wrap:anywhere}.channelRow{display:grid;grid-template-columns:46px 1fr auto;align-items:center;gap:11px;padding:15px 0;border-top:1px solid #edf2f4}.channelText{display:flex;flex-direction:column;gap:4px}.channelText small{color:#738690}.okBadge,.waitBadge{font-size:11px;font-weight:900;padding:6px 9px;border-radius:999px;white-space:nowrap}.okBadge{background:#e7f8ef;color:#116c48}.waitBadge{background:#fff4dc;color:#8a6515}.milestones{margin-top:20px;border-top:1px solid #edf2f4;padding-top:14px}.milestones>div{display:grid;grid-template-columns:29px 1fr;gap:10px;align-items:start;margin:11px 0}.milestones p{display:flex;flex-direction:column;gap:3px;margin:0;font-size:13px}.milestones p small{color:#728690;line-height:1.4}.doneDot,.currentDot,.futureDot{width:27px;height:27px;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:900}.doneDot{background:#e7f8ef;color:#116c48}.currentDot{background:#fff0df;color:#a65400}.futureDot{background:#eef3f5;color:#78909a}.lockBox{margin-top:22px;border-radius:15px;background:#f1f5f7;padding:16px}.lockBox p{color:#607681;font-size:13px;line-height:1.55;margin-bottom:0}@media(max-width:780px){.payShell{padding:14px 11px 40px}.hero{padding:23px 21px}.providerPicker,.columns{grid-template-columns:1fr}.card{padding:20px}.providerChoice{grid-template-columns:46px 1fr auto}.channelRow{grid-template-columns:44px 1fr}.channelRow>.okBadge,.channelRow>.waitBadge{grid-column:2;width:max-content}}
      `}</style>
    </main>
  );
}
