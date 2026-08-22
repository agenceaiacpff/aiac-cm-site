import { NextRequest, NextResponse } from "next/server";

const GATEWAY = "https://fuvqhdhgilkltqwqitcr.supabase.co/functions/v1/listening-audio-purge-once-7e3f91c2";
const CHANNEL = "official-site-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validToken(value: string) {
  return /^[A-Za-z0-9._~-]{8,256}$/.test(value);
}

export async function GET(_request: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    if (!validToken(token)) {
      return NextResponse.json({ error: "Référence Orange Money invalide." }, { status: 400 });
    }

    const response = await fetch(GATEWAY, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-aiac-pay-channel": CHANNEL,
      },
      body: JSON.stringify({ provider: "orange", action: "status", payToken: token }),
      cache: "no-store",
    });

    const text = await response.text();
    let data: Record<string, unknown> = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { error: "Réponse Orange Money illisible." };
    }

    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ error: "Impossible de vérifier le paiement Orange Money." }, { status: 503 });
  }
}
