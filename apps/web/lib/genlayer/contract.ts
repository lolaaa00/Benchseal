// Typed contract views, write helper, FINALIZED + GenVM check

import { getReadClient } from "./read-client";
import { createWriteClient } from "./client";
import { requireContractAddress } from "./data-source";
import { parseLeaderResult, parseReturnedId, ExecutionResult } from "./execution";
export { parseReturnedId } from "./execution";
import { POLL_INTERVAL_MS, POLL_MAX_RETRIES } from "./config";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const RunStatus = {
  REGISTERED: 0,
  RUN_COMMITTED: 1,
  SCORING: 2,
  SEALED: 3,
  ABSTAINED: 4,
  INVALIDATED: 5,
} as const;

export type RunStatusValue = (typeof RunStatus)[keyof typeof RunStatus];

export interface BenchmarkInfo {
  benchmark_id: number;
  owner: string;
  name: string;
  rubric_url: string;
  rubric_digest: string;
  dimensions_json: string;
  sampling_policy_json: string;
  current_version: number;
  run_count: number;
}

export interface RunInfo {
  run_id: number;
  benchmark_id: number;
  version: number;
  submitter: string;
  model_name: string;
  run_manifest_url: string;
  run_manifest_digest: string;
  deterministic_metrics_json: string;
  sample_bundle_url: string;
  sample_bundle_digest: string;
  status: RunStatusValue;
  dimension_bands_json: string;
  final_score_bps: number;
  rationale: string;
  sealed_at: number;
}

export interface SnapshotInfo {
  snapshot_id: number;
  benchmark_id: number;
  version: number;
  ordered_run_ids_json: string;
  digest: string;
  sealed_at: number;
}

export interface RunSummary {
  run_id: number;
  version: number;
  submitter: string;
  model_name: string;
  status: RunStatusValue;
  final_score_bps: number;
  sealed_at: number;
}

// ---------------------------------------------------------------------------
// Read views
// ---------------------------------------------------------------------------

async function callView<T>(method: string, args: unknown[]): Promise<T> {
  const client = getReadClient();
  const address = requireContractAddress() as `0x${string}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await client.readContract({
    address,
    functionName: method,
    args: args as never[],
  });
  return result as T;
}

export async function getBenchmark(id: number): Promise<BenchmarkInfo> {
  return callView<BenchmarkInfo>("get_benchmark", [id]);
}

export async function getRun(id: number): Promise<RunInfo> {
  return callView<RunInfo>("get_run", [id]);
}

export async function getSnapshot(id: number): Promise<SnapshotInfo> {
  return callView<SnapshotInfo>("get_snapshot", [id]);
}

export async function listBenchmarks(offset = 0, limit = 50): Promise<BenchmarkInfo[]> {
  return callView<BenchmarkInfo[]>("list_benchmarks", [offset, limit]);
}

export async function listRuns(
  benchmarkId: number,
  offset = 0,
  limit = 50
): Promise<RunSummary[]> {
  return callView<RunSummary[]>("list_runs", [benchmarkId, offset, limit]);
}

export async function listSnapshots(
  benchmarkId: number,
  offset = 0,
  limit = 50
): Promise<SnapshotInfo[]> {
  return callView<SnapshotInfo[]>("list_snapshots", [benchmarkId, offset, limit]);
}

export async function previewExemplars(
  runId: number,
  dimension: string,
  k: number
): Promise<string[]> {
  return callView<string[]>("preview_exemplars", [runId, dimension, k]);
}

// ---------------------------------------------------------------------------
// Write helper with finality polling + GenVM inspection
// ---------------------------------------------------------------------------

export async function writeContract(
  method: string,
  args: unknown[],
  onTxHash?: (hash: string) => void,
  onStatusChange?: (status: string) => void,
  walletMode?: "injected" | "generated",
): Promise<ExecutionResult> {
  const client = await createWriteClient(walletMode);
  const address = requireContractAddress() as `0x${string}`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const txHash = await (client as any).writeContract({
    address,
    functionName: method,
    args: args as never[],
    value: BigInt(0),
  });

  onTxHash?.(txHash as string);
  onStatusChange?.("PENDING");

  let retries = 0;
  while (retries < POLL_MAX_RETRIES) {
    await sleep(POLL_INTERVAL_MS);
    retries++;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tx = await (client as any).getTransaction({ hash: txHash });
      // genlayer-js on StudioNet converts status to a number and puts the name in statusName
      const status = (
        (tx?.statusName as string | undefined) ??
        (typeof tx?.status === "string" ? tx.status : undefined)
      )?.toUpperCase();
      if (status) onStatusChange?.(status);
      if (status === "FINALIZED") {
        return parseLeaderResult(tx);
      }
      if (status === "ROLLBACK" || status === "FAILED") {
        return { status: "ROLLBACK", returnValue: null, errorMessage: "Transaction rolled back", rawExecution: tx };
      }
      if (status === "UNDETERMINED" || status === "VALIDATORS_TIMEOUT" || status === "LEADER_TIMEOUT") {
        return { status: "ROLLBACK", returnValue: null, errorMessage: `Consensus not reached (${status}) — please retry`, rawExecution: tx };
      }
    } catch {
      // transient error — keep polling
    }
  }

  return {
    status: "UNKNOWN",
    returnValue: null,
    errorMessage: "Timed out waiting for finality",
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Specific write wrappers
// ---------------------------------------------------------------------------

export async function createBenchmark(
  name: string,
  rubricUrl: string,
  rubricDigest: string,
  dimensionsJson: string,
  samplingPolicyJson: string,
  onTxHash?: (h: string) => void,
  onStatusChange?: (status: string) => void,
  walletMode?: "injected" | "generated",
): Promise<ExecutionResult> {
  return writeContract("create_benchmark", [name, rubricUrl, rubricDigest, dimensionsJson, samplingPolicyJson], onTxHash, onStatusChange, walletMode);
}

export async function publishVersion(
  benchmarkId: number,
  taskManifestUrl: string,
  taskManifestDigest: string,
  versionNote: string,
  onTxHash?: (h: string) => void,
  onStatusChange?: (status: string) => void,
  walletMode?: "injected" | "generated",
): Promise<ExecutionResult> {
  return writeContract("publish_version", [benchmarkId, taskManifestUrl, taskManifestDigest, versionNote], onTxHash, onStatusChange, walletMode);
}

export async function commitRun(
  benchmarkId: number,
  version: number,
  modelName: string,
  runManifestUrl: string,
  runManifestDigest: string,
  deterministicMetricsJson: string,
  sampleBundleUrl: string,
  sampleBundleDigest: string,
  onTxHash?: (h: string) => void,
  onStatusChange?: (status: string) => void,
  walletMode?: "injected" | "generated",
): Promise<ExecutionResult> {
  return writeContract("commit_run", [benchmarkId, version, modelName, runManifestUrl, runManifestDigest, deterministicMetricsJson, sampleBundleUrl, sampleBundleDigest], onTxHash, onStatusChange, walletMode);
}

export async function scoreRun(
  runId: number,
  sampleBundleContent: string,
  rubricContent: string,
  onTxHash?: (h: string) => void,
  onStatusChange?: (status: string) => void,
  walletMode?: "injected" | "generated",
): Promise<ExecutionResult> {
  if (!sampleBundleContent) throw new Error("sample_bundle_content is required");
  if (!rubricContent) throw new Error("rubric_content is required");
  return writeContract("score_run", [runId, sampleBundleContent, rubricContent], onTxHash, onStatusChange, walletMode);
}

export async function sealLeaderboard(
  benchmarkId: number,
  version: number,
  orderedRunIdsJson: string,
  onTxHash?: (h: string) => void,
  onStatusChange?: (status: string) => void,
  walletMode?: "injected" | "generated",
): Promise<ExecutionResult> {
  return writeContract("seal_leaderboard", [benchmarkId, version, orderedRunIdsJson], onTxHash, onStatusChange, walletMode);
}

export async function invalidateRun(
  runId: number,
  publicReasonUrl: string,
  onTxHash?: (h: string) => void,
  onStatusChange?: (status: string) => void,
  walletMode?: "injected" | "generated",
): Promise<ExecutionResult> {
  return writeContract("invalidate_run", [runId, publicReasonUrl], onTxHash, onStatusChange, walletMode);
}

export async function getBenchmarkVersion(
  benchmarkId: number,
  version: number,
): Promise<{benchmark_id: number; version: number; task_manifest_url: string; task_manifest_digest: string; version_note: string; created_by: string}> {
  return callView("get_benchmark_version", [benchmarkId, version]);
}

export async function listBenchmarkVersions(
  benchmarkId: number,
  offset = 0,
  limit = 50,
): Promise<{benchmark_id: number; version: number; task_manifest_url: string; task_manifest_digest: string; version_note: string; created_by: string}[]> {
  return callView("list_benchmark_versions", [benchmarkId, offset, limit]);
}

export function runStatusLabel(status: RunStatusValue): string {
  const labels: Record<number, string> = {
    0: "REGISTERED",
    1: "COMMITTED",
    2: "SCORING",
    3: "SEALED",
    4: "ABSTAINED",
    5: "INVALIDATED",
  };
  return labels[status] ?? "UNKNOWN";
}

export function scoreBpsToPercent(bps: number): string {
  return (bps / 100).toFixed(2) + "%";
}

export function scoreBpsToBand(bps: number): number {
  return Math.round((bps / 10000) * 4);
}
