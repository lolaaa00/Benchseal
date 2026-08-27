// Proxy GenLayer RPC calls server-side to avoid browser CORS restrictions
import { NextRequest, NextResponse } from "next/server";

const GENLAYER_ENDPOINT = process.env.NEXT_PUBLIC_GENLAYER_ENDPOINT ?? "https://studio.genlayer.com/api";

const ALLOWED_METHODS = new Set([
  // Standard Ethereum RPC
  "eth_sendRawTransaction",
  "eth_getTransactionByHash",
  "eth_call",
  "eth_estimateGas",
  "eth_gasPrice",
  "eth_chainId",
  "eth_blockNumber",
  "eth_getTransactionCount",
  "net_version",
  // GenLayer-specific
  "gen_call",
  "gen_getContractSchema",
  "gen_getTransactionByHash",
]);

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const method = (body as Record<string, unknown>).method;
  if (typeof method !== "string" || !ALLOWED_METHODS.has(method)) {
    return NextResponse.json({ error: "Method not allowed" }, { status: 400 });
  }

  try {
    const response = await fetch(GENLAYER_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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
