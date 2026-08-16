"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function CollectiveValidationAlert({ profileId }: { profileId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [count, setCount] = useState(0);
  const [firstReport, setFirstReport] = useState("");

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("task_reports")
      .select("id,report_number", { count: "exact" })
      .eq("status", "submitted")
      .eq("validation_authority_type", "collective_body")
      .neq("reporter_id", profileId)
      .order("submitted_at", { ascending: true })
      .limit(10)
      .then(({ data, count: total }) => {
        if (cancelled) return;
        setCount(total || data?.length || 0);
        setFirstReport(data?.[0]?.report_number || "");
      });
    return () => {
      cancelled = true;
    };
  }, [profileId, supabase]);

  if (!count) return null;

  return (
    <div className="portalPanel warningBox" role="status">
      <div className="panelTitle">
        <div>
          <p className="eyebrow">Conseil d’administration</p>
          <h2>{count} rapport{count > 1 ? "s" : ""} à valider au nom du CA</h2>
          <p>
            {firstReport ? `${firstReport} est en attente de décision collégiale. ` : ""}
            Référence/PV, date et signature officielle seront enregistrés avec la décision.
          </p>
        </div>
        <button type="button" onClick={() => router.push("/espace/terrain/complet?mode=validation") }>
          Ouvrir les validations du CA
        </button>
      </div>
    </div>
  );
}
