import { NextRequest, NextResponse } from "next/server";

const GATEWAY = "https://fuvqhdhgilkltqwqitcr.supabase.co/functions/v1/listening-audio-purge-once-7e3f91c2";
const CHANNEL = "official-site-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return NextResponse.json({ error: "Référence de paiement invalide." }, { status: 400 });
    }

    const response = await fetch(GATEWAY, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-aiac-pay-channel": CHANNEL,
      },
      body: JSON.stringify({ action: "status", referenceId: id }),
      cache: "no-store",
    });

    const text = await response.text();
    let data: Record<string, unknown> = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { error: "Réponse MTN illisible." };
    }
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ error: "Impossible de vérifier le paiement MTN." }, { status: 503 });
  }
}
