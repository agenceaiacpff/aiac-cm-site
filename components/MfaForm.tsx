"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Setup = { factorId: string; qr: string; secret: string };

export default function MfaForm() {
  const supabase = useRef(createClient()).current;
  const router = useRouter();
  const started = useRef(false);
  const [verifiedFactorId, setVerifiedFactorId] = useState("");
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("Préparation de la sécurité…");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assurance.data?.currentLevel === "aal2") {
        router.replace("/espace");
        router.refresh();
        return;
      }

      const factors = await supabase.auth.mfa.listFactors();
      if (factors.error) {
        setMessage(factors.error.message);
        setLoading(false);
        return;
      }

      const verified = factors.data.totp.find((factor) => factor.status === "verified");
      if (verified) {
        setVerifiedFactorId(verified.id);
        setMessage("Saisissez le code à 6 chiffres affiché dans votre application d’authentification.");
        setLoading(false);
        return;
      }

      const enrollment = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Portail AIAC"
      });
      if (enrollment.error) {
        setMessage(enrollment.error.message);
        setLoading(false);
        return;
      }
      setSetup({
        factorId: enrollment.data.id,
        qr: enrollment.data.totp.qr_code,
        secret: enrollment.data.totp.secret
      });
      setMessage("Scannez le QR code avec Google Authenticator, Microsoft Authenticator ou une application compatible.");
      setLoading(false);
    })();
  }, [router, supabase]);

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const factorId = verifiedFactorId || setup?.factorId;
    if (!factorId || code.trim().length < 6) return;
    setLoading(true);
    setMessage("Vérification…");
    const challenge = await supabase.auth.mfa.challenge({ factorId });
    if (challenge.error) {
      setMessage(challenge.error.message);
      setLoading(false);
      return;
    }
    const result = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.data.id,
      code: code.trim()
    });
    if (result.error) {
      setMessage("Code incorrect ou expiré. Attendez le prochain code puis réessayez.");
      setLoading(false);
      return;
    }
    router.replace("/espace");
    router.refresh();
  }

  return (
    <form className="authForm mfaForm" onSubmit={verify}>
      <p className="formMessage" role="status">{message}</p>
      {setup && <>
        <img className="mfaQr" src={setup.qr} alt="QR code d’activation de l’authentification à deux facteurs" />
        <details><summary>Impossible de scanner le QR code ?</summary><code>{setup.secret}</code></details>
      </>}
      {!loading && <label>Code de sécurité<input name="code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 8))} required /></label>}
      <button disabled={loading || code.length < 6}>{loading ? "Traitement…" : "Vérifier et continuer"}</button>
    </form>
  );
}
