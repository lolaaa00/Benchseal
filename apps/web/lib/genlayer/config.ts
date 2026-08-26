// StudioNet configuration for BenchSeal
import { chains } from "genlayer-js";

export const GENLAYER_CHAIN_ID = 61999;
export const GENLAYER_CHAIN_ID_HEX = "0xF21F"; // 61999 in hex

// Use local proxy in browser to avoid CORS; direct endpoint server-side
export const GENLAYER_ENDPOINT =
  typeof window !== "undefined"
    ? "/api/rpc"
    : (process.env.NEXT_PUBLIC_GENLAYER_ENDPOINT ?? "https://studio.genlayer.com/api");

export const BENCHSEAL_CONTRACT =
  process.env.NEXT_PUBLIC_BENCHSEAL_CONTRACT ?? "";

export const DATA_MODE =
  process.env.NEXT_PUBLIC_BENCHSEAL_DATA ?? "live";

export const STUDIONET_CHAIN = chains.studionet;

export const POLL_INTERVAL_MS = 5_000;
export const POLL_MAX_RETRIES = 90;
