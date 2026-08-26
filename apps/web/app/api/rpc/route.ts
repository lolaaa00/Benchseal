// Proxy GenLayer RPC calls server-side to avoid browser CORS restrictions
import { NextRequest, NextResponse } from "next/server";

const GENLAYER_ENDPOINT = process.env.NEXT_PUBLIC_GENLAYER_ENDPOINT ?? "https://studio.genlayer.com/api";

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const response = await fetch(GENLAYER_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    const data = await response.text();
    return new NextResponse(data, {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
