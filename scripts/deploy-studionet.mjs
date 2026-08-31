#!/usr/bin/env node
/**
 * deploy-studionet.mjs — Deploy BenchSeal contract to StudioNet
 *
 * Usage:
 *   GENLAYER_PRIVATE_KEY=0x... node scripts/deploy-studionet.mjs
 */

import { createClient, createAccount, chains } from "genlayer-js";
import { readFileSync } from "fs";

const ENDPOINT = process.env.GENLAYER_ENDPOINT ?? "https://studio.genlayer.com/api";
const PRIVATE_KEY = process.env.GENLAYER_PRIVATE_KEY;

if (!PRIVATE_KEY) {
  console.error("Error: Set GENLAYER_PRIVATE_KEY");
  process.exit(1);
}

const POLL_MS = 5000;
const MAX_RETRIES = 120;

const account = createAccount(PRIVATE_KEY);
const client = createClient({ endpoint: ENDPOINT, account, chain: chains.studionet });

const contractCode = readFileSync("contracts/benchseal.py", "utf8");

console.log("=== BenchSeal Deploy to StudioNet ===");
console.log(`Endpoint : ${ENDPOINT}`);
console.log(`Deployer : ${account.address}`);
console.log(`Contract size: ${contractCode.length} chars`);
console.log("");

console.log("Deploying...");
let txHash;
try {
  txHash = await client.deployContract({
    code: contractCode,
    args: [],
    leaderOnly: false,
  });
} catch (err) {
  console.error("Deploy failed:", err.message);
  process.exit(1);
}

console.log(`txHash: ${txHash}`);
console.log("Waiting for finalization...");

process.stdout.write("  Polling");
let contractAddress = null;
for (let i = 0; i < MAX_RETRIES; i++) {
  await new Promise((r) => setTimeout(r, POLL_MS));
  process.stdout.write(".");
  let tx;
  try { tx = await client.getTransaction(txHash); } catch { continue; }
  const status = (tx?.status ?? "").toUpperCase();
  const statusName = (tx?.statusName ?? "").toUpperCase();
  const s = statusName || status;
  if (s === "FINALIZED") {
    // Extract contract address from transaction
    contractAddress =
      tx?.execution_result?.contract_address ??
      tx?.result?.contract_address ??
      tx?.contract_address ??
      tx?.data?.contract_address;
    console.log(" FINALIZED");
    console.log("\nRaw tx keys:", Object.keys(tx || {}));
    console.log("execution_result:", JSON.stringify(tx?.execution_result ?? null, null, 2).slice(0, 500));
    break;
  }
  if (s === "ROLLBACK" || s === "FAILED") {
    console.log(` ${s}`);
    console.error("Deploy rolled back:", JSON.stringify(tx).slice(0, 400));
    process.exit(1);
  }
}

if (!contractAddress) {
  console.log("\nCould not extract address from tx — full tx dump:");
  try {
    const tx = await client.getTransaction(txHash);
    console.log(JSON.stringify(tx, null, 2).slice(0, 2000));
  } catch (e) {
    console.error(e.message);
  }
  process.exit(1);
}

console.log("\n=== DEPLOYED ===");
console.log(`Contract address: ${contractAddress}`);
console.log(`\nUpdate .env.local:`);
console.log(`NEXT_PUBLIC_BENCHSEAL_CONTRACT=${contractAddress}`);
