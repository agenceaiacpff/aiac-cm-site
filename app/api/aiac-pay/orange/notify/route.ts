import { NextRequest, NextResponse } from "next/server";

const BRIDGE_URL = "https://fuvqhdhgilkltqwqitcr.supabase.co/functions/v1/listening-audio-purge-once-7e3f91c2";
const CHANNEL = "official-site-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function receive(request: NextRequest) {
  const raw = await request.text();
  let payload: unknown = {};

  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = { raw: raw.slice(0, 4000) };
  }

  try {
    const upstream = await fetch(BRIDGE_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-aiac-pay-channel": CHANNEL,
        "cache-control": "no-store",
      },
      body: JSON.stringify({
        provider: "orange",
        action: "callback",
        httpMethod: request.method,
        payload,
      }),
      cache: "no-store",
    });

    if (!upstream.ok) {
      console.error("AIAC Pay Orange callback bridge error", upstream.status);
    }
  } catch (error) {
    console.error("AIAC Pay Orange callback forwarding failed", error);
  }

  // Orange doit toujours recevoir un accusé HTTP 200. La vérité du paiement
  // est conservée côté serveur et peut être réconciliée par le statut API.
  return NextResponse.json({ received: true }, { status: 200 });
}

export async function POST(request: NextRequest) {
  return receive(request);
}

export async function PUT(request: NextRequest) {
  return receive(request);
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    provider: "Orange Money Web Payment",
    purpose: "AIAC Pay notification endpoint",
    methods: ["POST", "PUT"],
    country: "Cameroon",
    currency: "XAF",
    productionLocked: true,
  });
}
