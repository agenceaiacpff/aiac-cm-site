import { NextRequest, NextResponse } from "next/server";

const GATEWAY = "https://fuvqhdhgilkltqwqitcr.supabase.co/functions/v1/listening-audio-purge-once-7e3f91c2";
const CHANNEL = "official-site-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function parseResponse(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: "Réponse MTN illisible." };
  }
}

export async function GET() {
  try {
    const response = await fetch(GATEWAY, { cache: "no-store" });
    const data = await parseResponse(response);
    return NextResponse.json(data, { status: response.ok ? 200 : 502 });
  } catch {
    return NextResponse.json({ error: "Passerelle MTN indisponible." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const response = await fetch(GATEWAY, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-aiac-pay-channel": CHANNEL,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = await parseResponse(response);
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ error: "Impossible de joindre MTN MoMo." }, { status: 503 });
  }
}
