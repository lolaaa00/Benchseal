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
1. **Complete manifest evaluation** — every `task_id` in the task manifest must appear in the sample bundle. Partial evaluation of any subset is rejected; the submitter cannot cherry-pick easier tasks.
2. All sample `task_id` values are unique — repeated copies of one task are rejected; they cannot satisfy the sampling policy.
3. The run manifest content hashes to the committed `run_manifest_digest` — proves the claimed run description was not changed after the outputs were observed.
4. The run manifest is strictly parsed — malformed JSON is rejected outright. The required fields `model` and `inference_date` must be present.
5. The sampling policy's `min_samples` is satisfied by the actual count of tasks submitted.

If the run manifest declares an `attestation_url`, `attestation_digest` must also be present and must be a valid SHA-256 digest. The attestation reference commits a content-addressed pointer to external execution evidence (a signed inference log, TLS notary proof, or trusted executor certificate) before scoring begins. Validators see the reference during scoring and can verify the document independently.

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
  → contract requires all manifest tasks to be in sample bundle (no cherry-picking)
  → contract validates run manifest required fields (model, inference_date)
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
| Address | `0xbff0807284e1289f504d6aC006F87269830b1C5B` |
| Chain | StudioNet (chain ID 61999) |
| Explorer | https://studio.genlayer.com/transactions |

## Limitations

- **Attestation fetch is live but issuer identity is not verified.** When `attestation_url` is present in the run manifest, the contract fetches the document via GenLayer's nondeterministic web path, verifies its SHA-256 digest matches the committed `attestation_digest`, validates the JSON schema, and checks that any embedded `sample_bundle_digest` / `task_manifest_digest` fields match the run being scored. What the contract cannot do is verify *who* issued the attestation — a TLS notary proof or TEE certificate requires an off-chain verifier or a future trusted-hardware integration.
- **Consensus is non-deterministic.** `score_run` can return UNDETERMINED if validators disagree. The caller retries.
- **Size limits.** Sample bundle max 8 000 chars, rubric max 4 000 chars, task manifest max 8 000 chars, attestation document max 65 536 bytes. Rejected before scoring.
- **Score is final once SEALED.** Use `invalidate_run` to retract — original score preserved in `original_score_bps`. Only the benchmark owner can invalidate a SEALED run; submitters cannot erase an unfavourable certified result.
- **Model identity is not cryptographically proven on-chain.** The contract verifies the content of the attestation document and its binding to the run, but cannot verify that the named model produced the outputs without a TEE or TLS notary proof supplied in the attestation itself.
- **No on-chain storage of content.** Only digests are stored. If original content is lost the score cannot be re-verified off-chain, but the on-chain seal is permanent.

## Setup

```bash
# Prerequisites: Node 20+, Python 3.12 (for contract tests)

# 1. Install contract test dependencies
cd tests/direct && pip install -r requirements.txt 2>/dev/null || pip install gltest
cd ../..

# 2. Install frontend dependencies
cd apps/web && npm install
cd ../..

# 3. Configure environment
cp apps/web/.env.example apps/web/.env.local 2>/dev/null || true
# Edit apps/web/.env.local with:
#   NEXT_PUBLIC_GENLAYER_ENDPOINT=https://studio.genlayer.com/api
#   NEXT_PUBLIC_BENCHSEAL_CONTRACT=0xbff0807284e1289f504d6aC006F87269830b1C5B
#   NEXT_PUBLIC_BENCHSEAL_DATA=live

# 4. Run the frontend
cd apps/web && npm run dev
```

## Tests

```bash
# Contract tests (Python 3.12 required)
python3.12 -m pytest tests/direct/test_benchseal.py -q

# TypeScript typecheck
cd apps/web && npx tsc --noEmit

# Build
cd apps/web && npm run build
```

## StudioNet exercise script

Runs the full lifecycle (create → publish → commit → score → leaderboard):

```bash
GENLAYER_PRIVATE_KEY=0x<your_key> \
  node scripts/exercise-studionet.mjs \
  0xbff0807284e1289f504d6aC006F87269830b1C5B
```

The script computes real SHA-256 digests from inline content and exercises every write method including `score_run` with structured task-output pairs.

## Contract API

| Method | Type | Description |
|---|---|---|
| `create_benchmark(name, rubric_url, rubric_digest, dimensions_json, policy_json)` | write | Register a benchmark. Returns `benchmark_id`. |
| `publish_version(benchmark_id, url, digest, note)` | write | Publish a task manifest version. Returns `version`. Digest commits the canonical task inputs. |
| `commit_run(benchmark_id, version, model_name, manifest_url, manifest_digest, metrics_json, sample_url, sample_digest)` | write | Commit a run. Returns `run_id`. |
| `score_run(run_id, sample_bundle_content, rubric_content, task_manifest_content, run_manifest_content)` | write | Score via consensus. Verifies all four digests; requires every manifest task to be in the sample bundle; validates run manifest required fields; enforces min_samples policy. |
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
