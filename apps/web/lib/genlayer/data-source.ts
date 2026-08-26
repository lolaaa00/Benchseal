// Live data boundary — no silent fixture fallback.
// If contract address is not configured, surfaces a clear error.

import { BENCHSEAL_CONTRACT } from "./config";

export class ContractNotConfiguredError extends Error {
  constructor() {
    super(
      "BenchSeal contract address is not configured. " +
      "Set NEXT_PUBLIC_BENCHSEAL_CONTRACT in your environment."
    );
    this.name = "ContractNotConfiguredError";
  }
}

export function requireContractAddress(): string {
  if (!BENCHSEAL_CONTRACT) {
    throw new ContractNotConfiguredError();
  }
  return BENCHSEAL_CONTRACT;
}

export function isContractConfigured(): boolean {
  return Boolean(BENCHSEAL_CONTRACT);
}
