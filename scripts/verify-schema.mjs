#!/usr/bin/env node
/**
 * verify-schema.mjs — Verify deployed BenchSeal contract has required methods
 *
 * Usage:
 *   node scripts/verify-schema.mjs <contract_address>
 */

const CONTRACT_ADDRESS = process.argv[2];
const ENDPOINT = process.env.GENLAYER_ENDPOINT ?? "https://studio.genlayer.com/api";

if (!CONTRACT_ADDRESS) {
  console.error("Usage: node scripts/verify-schema.mjs <contract_address>");
  process.exit(1);
}

const REQUIRED_METHODS = [
  "create_benchmark",
  "publish_version",
  "commit_run",
  "score_run",
  "seal_leaderboard",
  "invalidate_run",
  "get_run",
  "get_benchmark",
  "get_snapshot",
  "preview_exemplars",
  "list_benchmarks",
  "list_runs",
  "list_snapshots",
];

console.log(`=== BenchSeal Schema Verification ===`);
console.log(`Contract: ${CONTRACT_ADDRESS}`);
console.log(`Endpoint: ${ENDPOINT}`);
console.log("");

async function getContractSchema(address) {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "gen_getContractSchema",
      params: [address],
      id: 1,
    }),
  });
  const data = await response.json();
  if (data.error) throw new Error(JSON.stringify(data.error));
  return data.result;
}

try {
  console.log("Fetching contract schema...");
  const schema = await getContractSchema(CONTRACT_ADDRESS);

  const methods = Array.isArray(schema?.methods)
    ? schema.methods.map((m) => m.name)
    : Object.keys(schema?.methods ?? {});

  console.log(`Found ${methods.length} methods: ${methods.join(", ")}`);
  console.log("");

  const missing = REQUIRED_METHODS.filter((m) => !methods.includes(m));
  const present = REQUIRED_METHODS.filter((m) => methods.includes(m));

  for (const m of present) {
    console.log(`  ✓ ${m}`);
  }
  for (const m of missing) {
    console.log(`  ✗ ${m} (MISSING)`);
  }

  console.log("");
  if (missing.length === 0) {
    console.log(`✓ All ${REQUIRED_METHODS.length} required methods verified`);
    process.exit(0);
  } else {
    console.error(`✗ Missing ${missing.length} required methods`);
    process.exit(1);
  }
} catch (err) {
  console.error("Schema verification failed:", err.message);
  process.exit(1);
}
