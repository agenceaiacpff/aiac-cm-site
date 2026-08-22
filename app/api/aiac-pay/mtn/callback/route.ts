import { NextRequest, NextResponse } from "next/server";

const BRIDGE_URL = "https://fuvqhdhgilkltqwqitcr.supabase.co/functions/v1/listening-audio-purge-once-7e3f91c2";
const CHANNEL = "official-site-v1";

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
        action: "callback",
        httpMethod: request.method,
        payload,
      }),
      cache: "no-store",
    });

    if (!upstream.ok) {
      console.error("AIAC Pay MTN callback bridge error", upstream.status);
      return NextResponse.json({ received: true }, { status: 200 });
    }
  } catch (error) {
    console.error("AIAC Pay MTN callback forwarding failed", error);
  }

  // MTN sends a callback once. We acknowledge receipt even if our audit
  // forwarding is temporarily unavailable; payment truth is reconciled
  // independently through RequestToPay status polling.
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
    provider: "MTN MoMo",
    purpose: "AIAC Pay callback endpoint",
    methods: ["POST", "PUT"],
    productionTarget: "mtncameroon",
    currency: "XAF",
  });
}
