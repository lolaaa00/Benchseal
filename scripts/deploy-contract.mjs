#!/usr/bin/env node
/**
 * deploy-contract.mjs — Deploy BenchSeal to StudioNet using genlayer CLI
 *
 * Usage:
 *   node scripts/deploy-contract.mjs
 *
 * Prerequisites:
 *   - genlayer CLI installed: pip install genlayer-cli
 *   - Account funded on StudioNet: https://studio.genlayer.com
 *   - GENLAYER_PRIVATE_KEY or GENLAYER_ACCOUNT env var set
 */

import { execSync } from "child_process";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTRACT_PATH = resolve(__dirname, "../contracts/benchseal.py");

if (!existsSync(CONTRACT_PATH)) {
  console.error(`Contract not found at: ${CONTRACT_PATH}`);
  process.exit(1);
}

console.log("=== BenchSeal Contract Deployment ===");
console.log(`Contract: ${CONTRACT_PATH}`);
console.log("Network: StudioNet (chain 61999)");
console.log("");

// Check for genlayer CLI
let glCmd = null;
for (const candidate of ["genlayer", "gl"]) {
  try {
    execSync(`which ${candidate}`, { stdio: "pipe" });
    glCmd = candidate;
    break;
  } catch {
    // not found
  }
}

if (!glCmd) {
  console.error("genlayer CLI not found. Install with: pip install genlayer-cli");
  console.error("Or check: https://docs.genlayer.com/tools/genlayer-cli");
  process.exit(1);
}

console.log(`Found CLI: ${glCmd}`);
console.log("");

// Deploy
console.log("Deploying contract...");
try {
  const result = execSync(
    `${glCmd} deploy ${CONTRACT_PATH} --network studionet`,
    { encoding: "utf8", stdio: ["inherit", "pipe", "pipe"] }
  );
  console.log(result);

  // Extract contract address from output
  const addressMatch = result.match(/0x[0-9a-fA-F]{40}/);
  if (addressMatch) {
    const address = addressMatch[0];
    console.log("");
    console.log(`✓ Contract deployed at: ${address}`);
    console.log("");
    console.log("Next steps:");
    console.log(`1. Set in apps/web/.env.local:`);
    console.log(`   NEXT_PUBLIC_BENCHSEAL_CONTRACT=${address}`);
    console.log(`2. Run: node scripts/verify-schema.mjs ${address}`);
    console.log(`3. Run: node scripts/exercise-studionet.mjs ${address}`);
  }
} catch (err) {
  console.error("Deployment failed:");
  console.error(err.message);
  if (err.stderr) console.error(err.stderr);
  process.exit(1);
}
