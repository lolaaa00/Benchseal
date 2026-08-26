// Parse GenVM execution results from finalized transactions

export type GenVMStatus = "SUCCESS" | "ROLLBACK" | "PENDING" | "UNKNOWN";

export interface ExecutionResult {
  status: GenVMStatus;
  returnValue: unknown;
  errorMessage?: string;
  rawExecution?: unknown;
}

// Recursively search an object tree for a return value
function findReturnValue(obj: Record<string, unknown>): unknown {
  for (const key of ["return_value", "returnValue", "result"]) {
    if (key in obj && obj[key] !== null && obj[key] !== undefined) {
      return obj[key];
    }
  }
  for (const val of Object.values(obj)) {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      const found = findReturnValue(val as Record<string, unknown>);
      if (found !== null && found !== undefined) return found;
    }
  }
  return null;
}

// Recursively search for an execution status string
function findExecStatus(obj: Record<string, unknown>): string | null {
  for (const key of ["execution_result", "vm_status", "genvm_status"]) {
    if (typeof obj[key] === "string") return (obj[key] as string).toUpperCase();
  }
  for (const val of Object.values(obj)) {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      const found = findExecStatus(val as Record<string, unknown>);
      if (found) return found;
    }
  }
  return null;
}

export function parseLeaderResult(tx: unknown): ExecutionResult {
  if (!tx || typeof tx !== "object") {
    return { status: "UNKNOWN", returnValue: null };
  }

  const t = tx as Record<string, unknown>;
  // genlayer-js on StudioNet puts status as a number and string name in statusName
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

  // Try direct execution envelope first
  const execution = t.execution ?? t.result ?? t.genvm_execution ?? t.leader_receipt;

  if (execution && typeof execution === "object") {
    const ex = execution as Record<string, unknown>;
    const vmStatus = (
      (ex.status as string | undefined) ??
      (ex.execution_result as string | undefined) ??
      findExecStatus(ex) ?? ""
    ).toUpperCase();

    if (vmStatus === "SUCCESS" || vmStatus === "OK") {
      return {
        status: "SUCCESS",
        returnValue: findReturnValue(ex),
        rawExecution: tx,
      };
    }
    if (vmStatus === "ROLLBACK" || vmStatus === "ERROR") {
      return {
        status: "ROLLBACK",
        returnValue: null,
        errorMessage: (ex.error as string) ?? (ex.message as string) ?? "GenVM rollback",
        rawExecution: tx,
      };
    }
  }

  // Fallback: if tx is FINALIZED, treat as SUCCESS and search entire tx tree
  if (txStatus === "FINALIZED") {
    return {
      status: "SUCCESS",
      returnValue: findReturnValue(t),
      rawExecution: tx,
    };
  }

  return {
    status: "UNKNOWN",
    returnValue: null,
    rawExecution: tx,
  };
}
