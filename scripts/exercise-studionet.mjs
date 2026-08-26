#!/usr/bin/env node
/**
 * exercise-studionet.mjs — Reference demo transactions for BenchSeal on StudioNet
 *
 * Usage:
 *   node scripts/exercise-studionet.mjs <contract_address>
 *
 * Requires:
 *   - GENLAYER_PRIVATE_KEY env var (funded StudioNet account)
 */

import { createClient } from "genlayer-js";

const CONTRACT_ADDRESS = process.argv[2];
const ENDPOINT = process.env.GENLAYER_ENDPOINT ?? "https://studio.genlayer.com/api";
const PRIVATE_KEY = process.env.GENLAYER_PRIVATE_KEY;

if (!CONTRACT_ADDRESS) {
  console.error("Usage: node scripts/exercise-studionet.mjs <contract_address>");
  process.exit(1);
}

if (!PRIVATE_KEY) {
  console.error("Set GENLAYER_PRIVATE_KEY env var to a funded StudioNet account");
  process.exit(1);
}

const CHAIN_ID = 61999;
const POLL_MS = 5000;
const MAX_RETRIES = 90;

console.log("=== BenchSeal StudioNet Exercise ===");
console.log(`Contract: ${CONTRACT_ADDRESS}`);
console.log(`Endpoint: ${ENDPOINT}`);
console.log("");

const client = createClient({
  endpoint: ENDPOINT,
  chainId: CHAIN_ID,
  privateKey: PRIVATE_KEY,
});

async function waitFinalized(txHash) {
  process.stdout.write(`  Waiting for finality [${txHash.slice(0, 10)}...]`);
  for (let i = 0; i < MAX_RETRIES; i++) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    process.stdout.write(".");
    const tx = await client.getTransaction(txHash);
    const status = tx?.status?.toUpperCase();
    if (status === "FINALIZED") {
      console.log(" FINALIZED");
      return tx;
    }
    if (status === "ROLLBACK" || status === "FAILED") {
      console.log(" ROLLBACK");
      return tx;
    }
  }
  console.log(" TIMEOUT");
  return null;
}

async function write(method, args) {
  console.log(`→ ${method}(${args.map((a) => JSON.stringify(a).slice(0, 40)).join(", ")})`);
  const txHash = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: method,
    args,
  });
  const tx = await waitFinalized(txHash);
  if (!tx) throw new Error(`${method} timed out`);
  const status = tx?.status?.toUpperCase();
  if (status === "ROLLBACK") throw new Error(`${method} rolled back: ${JSON.stringify(tx)}`);
  // Try to extract return value
  const rv = tx?.execution?.return_value ?? tx?.return_value ?? tx?.result;
  console.log(`  → Return: ${JSON.stringify(rv)}`);
  return rv;
}

async function read(method, args) {
  const result = await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: method,
    args,
  });
  console.log(`← ${method}:`, JSON.stringify(result, null, 2).slice(0, 200));
  return result;
}

// ---- Demo sequence ----
try {
  // 1. Create benchmark
  console.log("\n[1] Create benchmark");
  const benchmarkId = await write("create_benchmark", [
    "Demo-MathBench",
    "https://raw.githubusercontent.com/benchseal/rubrics/main/math-v1.md",
    "sha256:demo-rubric-digest",
    JSON.stringify(["factual_grounding", "instruction_adherence", "usefulness"]),
    JSON.stringify({ sample_rate: 0.1, min_samples: 5 }),
  ]);

  // 2. Publish version
  console.log("\n[2] Publish version");
  const version = await write("publish_version", [
    benchmarkId ?? 0,
    "https://raw.githubusercontent.com/benchseal/tasks/main/math-v1-tasks.json",
    "sha256:demo-task-digest",
    "Initial demo version",
  ]);

  // 3. Commit run
  console.log("\n[3] Commit run");
  const runId = await write("commit_run", [
    benchmarkId ?? 0,
    version ?? 1,
    "Demo-Model-v1",
    "https://gist.github.com/benchseal/demo-run-manifest.json",
    "sha256:demo-manifest-digest",
    JSON.stringify({ accuracy: 0.82, exact_match: 0.71 }),
    "https://gist.github.com/benchseal/demo-samples.json",
    "sha256:demo-sample-digest",
  ]);

  // 4. Read back
  console.log("\n[4] Read benchmark");
  await read("get_benchmark", [benchmarkId ?? 0]);

  console.log("\n[5] Read run");
  await read("get_run", [runId ?? 0]);

  console.log("\n[6] List benchmarks");
  await read("list_benchmarks", [0, 10]);

  console.log("\nNote: score_run requires consensus and cannot be exercised in a script.");
  console.log("Trigger it from the frontend scoring room after the run is committed.");
  console.log("\n✓ Demo sequence complete");
} catch (err) {
  console.error("\n✗ Exercise failed:", err.message);
  process.exit(1);
}
