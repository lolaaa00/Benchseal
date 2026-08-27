# BenchSeal

BenchSeal is a GenLayer application that lets AI researchers publish tamper-proof model benchmark results on-chain. A model lab submits their run with content they hash locally; GenLayer validators independently score the exact same content; consensus seals the result — no single party controls the outcome.

## The problem

Model evaluation is self-reported. Labs run their own benchmarks, submit their own numbers, and the community has to take them at face value. Even third-party evaluations rely on a single organisation's judgment. There is no mechanism that requires independent agreement before a result is accepted.

## Why GenLayer

Without consensus, certification is just notarisation — any chain can timestamp a score, but none can verify it. GenLayer validators each independently run the scoring prompt against the submitted sample bundle and must agree on the dimension bands before the transaction finalises. The equivalence principle is `prompt_comparative`: validators must match on the integer band values (0–4) for each named dimension. This is not possible with a deterministic smart contract.

## Evidence binding

Evidence is bound at commit time, not scoring time:

1. **Commit phase** — the submitter computes `sha256(rubric_content)` and `sha256(sample_bundle_content)` in-browser, and commits those digests on-chain with `commit_run`.
2. **Score phase** — the scorer must supply the exact original content. The contract recomputes both digests and rejects any mismatch before any validator ever sees the content.

This means a malicious scorer cannot substitute a different rubric or sample bundle. The content judged by validators is provably the content committed at submission time.

## Architecture

```
Browser (submitter)
  sha256(sample) → commit_run(digest)       ← digest stored on-chain

Browser (scorer)
  supply(sample_content, rubric_content)
  → score_run verifies sha256(content) == stored_digest
  → GenLayer leader runs scoring prompt
  → validators run same prompt independently
  → eq_principle checks band agreement
  → FINALIZED → run.status = SEALED
```

## Scoring

Scores are an equal-weight average across dimensions:

```
score_bps = round(sum(bands) / (4 * N) * 10000)
```

where `N` is the number of dimensions and each band is an integer 0–4. Scores are stored as basis points (0–10000). Invalid bands (bool, float, string, negative, out-of-range, missing dimension, extra dimension) cause the transaction to ABSTAIN rather than write a wrong score.

## Two-wallet model

- **Browser wallet (MetaMask / injected)**: standard EIP-1193 connection. Chain must be StudioNet (61999).
- **Generated wallet**: a private key is generated in-browser with `generatePrivateKey()` from genlayer-js and stored in `localStorage` under `benchseal_wallet_v1`. No extension required. Export the key before clearing browser storage. The wallet selector explicitly uses the generated key — it does not fall through to MetaMask.

## Deployed contract

| Field | Value |
|---|---|
| Address | `0xCf5Aeb59Ae91095b7Ff22d8d5DCbD8312f6EaCc4` |
| Chain | StudioNet (chain ID 61999) |
| Explorer | https://studio.genlayer.com/transactions |

## Limitations

- **No URL fetching by the contract.** Content must be pasted into the UI. URLs are stored as metadata pointers only.
- **Consensus is non-deterministic.** `score_run` can return UNDETERMINED if validators disagree. The caller retries.
- **Sample bundle max 8 000 chars, rubric max 4 000 chars.** Content exceeding these limits is rejected before scoring.
- **Score is final once SEALED.** The only way to change a sealed result is `invalidate_run`, which preserves the original score in `original_score_bps` and sets status to INVALIDATED.
- **No on-chain storage of content.** The contract stores only digests. If the original content is lost, the score cannot be re-verified off-chain (but the on-chain seal is permanent).

## Setup

```bash
# Prerequisites: Node 20+, Python 3.12 (for tests)

# 1. Install dependencies
npm ci

# 2. Configure environment
cp apps/web/.env.example apps/web/.env.local
# Edit apps/web/.env.local:
#   NEXT_PUBLIC_GENLAYER_ENDPOINT=https://studio.genlayer.com/api
#   NEXT_PUBLIC_BENCHSEAL_CONTRACT=0xCf5Aeb59Ae91095b7Ff22d8d5DCbD8312f6EaCc4
#   NEXT_PUBLIC_BENCHSEAL_DATA=live

# 3. Run the frontend
cd apps/web && npm run dev
```

## Tests

```bash
# Contract tests (Python 3.12 required)
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
  0xCf5Aeb59Ae91095b7Ff22d8d5DCbD8312f6EaCc4
```

The script computes real SHA-256 digests from inline content strings and exercises every write method. `score_run` triggers consensus and may take a few minutes.

## Contract API

| Method | Type | Description |
|---|---|---|
| `create_benchmark(name, rubric_url, rubric_digest, dimensions_json, policy_json)` | write | Register a new benchmark. Returns `benchmark_id`. |
| `publish_version(benchmark_id, url, digest, note)` | write | Publish a new task manifest version. Returns `version`. |
| `commit_run(benchmark_id, version, model_name, manifest_url, manifest_digest, metrics_json, sample_url, sample_digest)` | write | Commit a run. Returns `run_id`. |
| `score_run(run_id, sample_bundle_content, rubric_content)` | write | Score via consensus. Verifies both digests before judging. |
| `seal_leaderboard(benchmark_id, version, ordered_run_ids_json)` | write | Publish a leaderboard snapshot. All SEALED runs must be included in descending score order. |
| `invalidate_run(run_id, public_reason_url)` | write | Invalidate a sealed run. Original score preserved in `original_*` fields. |
| `get_benchmark(id)` | view | |
| `get_run(id)` | view | |
| `list_benchmarks(offset, limit)` | view | |
| `list_runs(benchmark_id, offset, limit)` | view | |
| `get_snapshot(id)` | view | |
| `get_benchmark_version(benchmark_id, version)` | view | |
| `list_benchmark_versions(benchmark_id, offset, limit)` | view | |
| `preview_exemplars(run_id, dimension, k)` | view | Sample exemplar outputs for a dimension. |
