# BenchSeal

BenchSeal is a GenLayer application that lets AI researchers publish tamper-proof model benchmark results on-chain. A lab submits their run with content they hash locally; GenLayer validators independently score structured task-output pairs against the committed rubric; consensus seals the result — no single party controls the outcome.

## The problem

Model evaluation is self-reported. Labs run their own benchmarks, submit their own numbers, and the community has to take them at face value. Even third-party evaluations rely on a single organisation's judgment. There is no mechanism that requires independent agreement before a result is accepted.

## Why GenLayer

Without consensus, certification is just notarisation — any chain can timestamp a score, but none can verify it. GenLayer validators each independently run the scoring prompt and must agree on the dimension bands before the transaction finalises. The equivalence principle is `prompt_comparative`: validators must match on the integer band values (0–4) for each named dimension. This is not possible with a deterministic smart contract.

## Evidence binding

Four pieces of content are committed on-chain before scoring can begin:

| Content | Committed where | Verified how |
|---|---|---|
| Rubric | `create_benchmark` → `rubric_digest` | `sha256(rubric_content)` at score time |
| Sample bundle | `commit_run` → `sample_bundle_digest` | `sha256(sample_bundle_content)` at score time |
| Run manifest | `commit_run` → `run_manifest_digest` | `sha256(run_manifest_content)` at score time |
| Task manifest | `publish_version` → `task_manifest_digest` | `sha256(task_manifest_content)` at score time |

At `score_run` the caller supplies all four content strings. The contract recomputes all four digests and rejects any mismatch before any validator sees the content.

## Run provenance

The sample bundle is not an opaque output blob. It must be a JSON array of task-output pairs:

```json
[
  { "task_id": "t1", "input": "What is 12 * 8?", "output": "96" },
  { "task_id": "t2", "input": "Solve x^2 = 16",  "output": "x = ±4" }
]
```

The task manifest (committed in `publish_version`) defines the canonical task inputs:

```json
{ "tasks": [
  { "task_id": "t1", "prompt": "What is 12 * 8?" },
  { "task_id": "t2", "prompt": "Solve x^2 = 16" }
]}
```

The run manifest (committed in `commit_run`) records the claimed provenance of the run:

```json
{
  "model": "GPT-4o",
  "inference_date": "2026-08-27",
  "temperature": 0.0,
  "hardware": "A100",
  "attestation_url": "https://example.com/inference-attestation.json",
  "attestation_digest": "sha256:<hex>"
}
```

`attestation_url` and `attestation_digest` are optional but if either is present both are required. The attestation document — a signed inference log, TLS notary proof, or trusted executor certificate — is referenced by its digest, which is committed on-chain as part of the run manifest. Validators see the attestation reference during scoring and can independently verify it at the supplied URL. This provides the authenticated execution path: the on-chain commitment proves the attestation reference was not changed after outputs were observed.

At score time the contract verifies:
1. Every sample `task_id` exists in the manifest — cannot score outputs for tasks not in the benchmark
2. All sample `task_id` values are unique — repeated copies of one task cannot satisfy either threshold
3. The run manifest content hashes to the committed `run_manifest_digest` — proves the claimed run description was not changed after outputs were observed
4. The sampling policy's `min_samples` is satisfied by the actual count of distinct tasks
5. The sampling policy's `sample_rate` × manifest size is also satisfied — coverage scales with the benchmark, so a submitter cannot commit a large manifest and cherry-pick a small easy subset

If the run manifest declares an `attestation_url`, `attestation_digest` must also be present and must be a valid SHA-256 digest. The attestation reference is committed on-chain before scoring; validators see it during scoring and can independently verify the attestation document.

Validators see the canonical prompt, model response, and run provenance together — not just an opaque output blob.

## Architecture

```
Browser (submitter)
  sha256(rubric)            → create_benchmark(rubric_digest)
  sha256(task_manifest)     → publish_version(manifest_digest)
  sha256(run_manifest)      → commit_run(run_manifest_digest)
  sha256(sample_bundle)     → commit_run(sample_digest)

Browser (scorer)
  supply(sample_content, rubric_content, task_manifest_content, run_manifest_content)
  → score_run verifies sha256 of all four against stored digests
  → contract verifies every sample task_id exists in manifest
  → contract enforces min_samples from sampling policy
  → GenLayer leader runs scoring prompt with task-output pairs + run provenance
  → validators run same prompt independently
  → eq_principle checks band agreement
  → FINALIZED → run.status = SEALED
```

## Scoring

Equal-weight average across dimensions:

```
score_bps = round(sum(bands) / (4 * N) * 10000)
```

`N` is the number of dimensions; each band is 0–4. Scores are stored as basis points (0–10000). Invalid bands (bool, float, string, negative, out-of-range, missing, extra) cause the transaction to ABSTAIN rather than write a wrong score.

## Two-wallet model

- **Browser wallet (MetaMask / injected)**: standard EIP-1193 connection. Chain must be StudioNet (61999).
- **Generated wallet**: private key generated in-browser, stored in `localStorage` under `benchseal_wallet_v1`. No extension required. Export the key before clearing browser storage. Explicitly uses the generated key — does not fall through to MetaMask.

## Deployed contract

| Field | Value |
|---|---|
| Address | `0x3802e88e48471622d7745884982dB30d27592190` |
| Chain | StudioNet (chain ID 61999) |
| Explorer | https://studio.genlayer.com/transactions |

## Limitations

- **No URL fetching by the contract.** Content must be pasted into the UI. URLs are stored as metadata pointers only.
- **Consensus is non-deterministic.** `score_run` can return UNDETERMINED if validators disagree. The caller retries.
- **Size limits.** Sample bundle max 8 000 chars, rubric max 4 000 chars, task manifest max 8 000 chars. Rejected before scoring.
- **Score is final once SEALED.** Use `invalidate_run` to retract — original score preserved in `original_score_bps`.
- **Model identity requires off-chain attestation.** The contract cannot cryptographically prove outputs came from the claimed model without a TEE or TLS notary. The run manifest supports an `attestation_url` + `attestation_digest` pair for this purpose — the reference is committed on-chain before scoring, validators can verify it independently, and its digest is structurally enforced. Submitters who do not provide an attestation are not rejected, but validators see the absence during scoring.
- **No on-chain storage of content.** Only digests are stored. If original content is lost the score cannot be re-verified off-chain, but the on-chain seal is permanent.

## Setup

```bash
# Prerequisites: Node 20+, Python 3.12 (for contract tests)

# 1. Install dependencies
npm ci

# 2. Configure environment
cp apps/web/.env.example apps/web/.env.local
# Edit apps/web/.env.local:
#   NEXT_PUBLIC_GENLAYER_ENDPOINT=https://studio.genlayer.com/api
#   NEXT_PUBLIC_BENCHSEAL_CONTRACT=0x3802e88e48471622d7745884982dB30d27592190
#   NEXT_PUBLIC_BENCHSEAL_DATA=live

# 3. Run the frontend
cd apps/web && npm run dev
```

## Tests

```bash
# Contract tests (Python 3.12 required — 84 tests)
python3.12 -m pytest tests/direct/test_benchseal.py -q

# TypeScript typecheck
npm run typecheck --workspace=apps/web

# Build
npm run build --workspace=apps/web
```

## StudioNet exercise script

Runs the full lifecycle (create → publish → commit → score → leaderboard):

```bash
GENLAYER_PRIVATE_KEY=0x<your_key> \
  node scripts/exercise-studionet.mjs \
  0x3802e88e48471622d7745884982dB30d27592190
```

The script computes real SHA-256 digests from inline content and exercises every write method including `score_run` with structured task-output pairs.

## Contract API

| Method | Type | Description |
|---|---|---|
| `create_benchmark(name, rubric_url, rubric_digest, dimensions_json, policy_json)` | write | Register a benchmark. Returns `benchmark_id`. |
| `publish_version(benchmark_id, url, digest, note)` | write | Publish a task manifest version. Returns `version`. Digest commits the canonical task inputs. |
| `commit_run(benchmark_id, version, model_name, manifest_url, manifest_digest, metrics_json, sample_url, sample_digest)` | write | Commit a run. Returns `run_id`. |
| `score_run(run_id, sample_bundle_content, rubric_content, task_manifest_content, run_manifest_content)` | write | Score via consensus. Verifies all four digests; validates sample task IDs against manifest; enforces sampling policy min_samples. |
| `seal_leaderboard(benchmark_id, version, ordered_run_ids_json)` | write | Publish a leaderboard snapshot. All SEALED runs must be included in descending score order. |
| `invalidate_run(run_id, public_reason_url)` | write | Invalidate a run. Original score preserved in `original_*` fields. |
| `get_benchmark(id)` | view | |
| `get_run(id)` | view | |
| `get_benchmark_version(benchmark_id, version)` | view | Returns the immutable version record including task manifest digest. |
| `list_benchmark_versions(benchmark_id, offset, limit)` | view | |
| `list_benchmarks(offset, limit)` | view | |
| `list_runs(benchmark_id, offset, limit)` | view | |
| `get_snapshot(id)` | view | |
| `preview_exemplars(run_id, dimension, k)` | view | Sample exemplar outputs for a dimension. |
