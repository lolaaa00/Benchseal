// Verify that a deployed contract has the required BenchSeal methods
import { getReadClient } from "./read-client";

export const REQUIRED_METHODS = [
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
] as const;

export type RequiredMethod = (typeof REQUIRED_METHODS)[number];

export async function verifyContractSchema(contractAddress: string): Promise<{
  ok: boolean;
  missing: string[];
  schema: unknown;
}> {
  try {
    const client = getReadClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schema = await client.getContractSchema(contractAddress as `0x${string}`);
    const methods: string[] = Array.isArray(schema?.methods)
      ? schema.methods.map((m: { name: string }) => m.name)
      : Object.keys(schema?.methods ?? {});
    const missing = REQUIRED_METHODS.filter((m) => !methods.includes(m));
    return { ok: missing.length === 0, missing, schema };
  } catch {
    return {
      ok: false,
      missing: [...REQUIRED_METHODS],
      schema: null,
    };
  }
}
