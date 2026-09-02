// Parse GenVM execution results from finalized transactions

export type GenVMStatus = "SUCCESS" | "ROLLBACK" | "PENDING" | "UNKNOWN";

export interface ExecutionResult {
  status: GenVMStatus;
  returnValue: unknown;
  errorMessage?: string;
  rawExecution?: unknown;
}

/**
 * Extract a scalar return value from the execution envelope.
 * Only looks at the direct leader_receipt / execution level to avoid
 * mistakenly matching deeply-nested unrelated values.
 */
function extractReturnValue(execution: Record<string, unknown>): unknown {
  for (const key of ["return_value", "returnValue"]) {
    if (key in execution && execution[key] !== null && execution[key] !== undefined) {
      return execution[key];
    }
  }
  return null;
}

/**
 * Identify the execution-level VM status string.
 * Only checks the direct execution object — not the transaction wrapper.
 */
function execStatus(execution: Record<string, unknown>): string | null {
  for (const key of ["execution_result", "vm_status", "genvm_status", "status"]) {
    if (typeof execution[key] === "string") {
      return (execution[key] as string).toUpperCase();
    }
  }
  return null;
}

export function parseLeaderResult(tx: unknown): ExecutionResult {
  if (!tx || typeof tx !== "object") {
    return { status: "UNKNOWN", returnValue: null };
  }

  const t = tx as Record<string, unknown>;

  // genlayer-js on StudioNet: statusName is the string form of the tx status
  const txStatus = (
    (t.statusName as string | undefined) ??
    (typeof t.status === "string" ? t.status : undefined)
  )?.toUpperCase();

  if (txStatus === "ROLLBACK" || txStatus === "FAILED") {
    return {
      status: "ROLLBACK",
      returnValue: null,
      errorMessage: (t.error as string) ?? "Transaction rolled back",
      rawExecution: tx,
    };
  }

  // Look for the execution envelope at known locations only
  const execution = (
    t.execution ??
    t.result ??
    t.genvm_execution ??
    t.leader_receipt
  );

  if (execution && typeof execution === "object") {
    const ex = execution as Record<string, unknown>;
    const vmStatus = execStatus(ex) ?? "";

    if (vmStatus === "SUCCESS" || vmStatus === "OK") {
      return {
        status: "SUCCESS",
        returnValue: extractReturnValue(ex),
        rawExecution: tx,
      };
    }
    if (vmStatus === "ROLLBACK" || vmStatus === "ERROR") {
      const msg =
        (ex.error as string) ??
        (ex.message as string) ??
        "GenVM rollback";
      return {
        status: "ROLLBACK",
        returnValue: null,
        errorMessage: msg,
        rawExecution: tx,
      };
    }
  }

  // Fallback: FINALIZED tx with no clear execution envelope — treat as SUCCESS
  // but do NOT search the entire tx tree for return values (that risks false matches).
  if (txStatus === "FINALIZED") {
    return {
      status: "SUCCESS",
      returnValue: null,
      rawExecution: tx,
    };
  }

  return {
    status: "UNKNOWN",
    returnValue: null,
    rawExecution: tx,
  };
}

/**
 * Translate raw contract error messages into human-readable strings.
 * Matches known EXPECTED: prefixed error patterns from the BenchSeal contract.
 */
export function parseContractError(msg: string): string {
  if (!msg) return "Unknown error";

  // User-rejected wallet signature
  if (/user rejected|user denied|rejected the request/i.test(msg)) {
    return "Wallet signature rejected.";
  }

  const m = msg.match(/EXPECTED:\s*(.*)/s);
  const body = m ? m[1].trim() : msg;

  if (/sample bundle is missing/i.test(body)) {
    return "Sample bundle does not cover all manifest tasks. Every task in the benchmark must be evaluated.";
  }
  if (/sampling_policy/i.test(body)) {
    return `Sampling policy error: ${body}`;
  }
  if (/run manifest/i.test(body)) {
    return `Run manifest validation failed: ${body}`;
  }
  if (/attestation.*digest mismatch|digest mismatch.*attestation/i.test(body)) {
    return "Evidence digest mismatch — the content you supplied does not match what was committed on-chain.";
  }
  if (/attestation/i.test(body)) {
    return `Attestation verification failed: ${body}`;
  }
  if (/digest mismatch/i.test(body)) {
    return "Evidence digest mismatch — the content you supplied does not match what was committed on-chain.";
  }

  if (/ROLLBACK/i.test(msg) && !m) {
    return "Transaction rolled back by contract.";
  }
  if (/UNDETERMINED/i.test(msg)) {
    return "GenLayer validators could not reach consensus. Try again.";
  }

  // Return the EXPECTED body if matched, else original
  return m ? body : msg;
}

/**
 * Parse an integer ID from a write transaction result.
 * Returns null if the result does not contain a numeric ID.
 */
export function parseReturnedId(result: ExecutionResult): number | null {
  const rv = result.returnValue;
  if (typeof rv === "number" && Number.isInteger(rv) && rv >= 0) return rv;
  if (typeof rv === "string") {
    const n = parseInt(rv, 10);
    if (!isNaN(n) && n >= 0) return n;
  }
  // BigInt from some JSON parsers
  if (typeof rv === "bigint") return Number(rv);
  return null;
}
