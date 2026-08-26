# BenchSeal

BenchSeal is a GenLayer application that lets AI researchers and benchmark owners publish tamper-proof model evaluation results on-chain. A model lab submits their run, GenLayer validators independently score it, and consensus seals the result — no single party controls the outcome.

## The problem

Model evaluation is self-reported. Labs run their own benchmarks, submit their own numbers, and the community largely has to take them at face value. Even third-party evaluations rely on a single organisation's judgment. There is no mechanism that requires independent agreement before a result is accepted.

## Why GenLayer

Without consensus, certification is just notarisation — any blockchain can timestamp a score, but none can verify it. GenLayer validators each independently run the scoring prompt against the submitted sample bundle and must agree on the dimension bands before the transaction finalises. The equivalence principle used is `prompt_comparative`: validators must match on the integer band values (0–4) for each named dimension. A majority that disagrees means the transaction returns UNDETERMINED and the caller retries. This is not possible with a deterministic smart contract.

The counterfactual is plain: remove consensus and the contract becomes a registry where anyone writes any score they claim is correct.

## How consensus is used

`score_run` calls `gl.eq_principle.prompt_comparative(leader, "The dimension_bands integer values (0-4) for each named dimension must match exactly")`. The leader function runs the scoring LLM prompt and strips JSON fences. Validators run the same prompt independently. If they agree on the dimension bands, the transaction finalises and the run is SEALED. If they disagree, the transaction is UNDETERMINED.

What is deliberately deterministic: all state mutations (creating benchmarks, committing runs, invalidating runs) are pure JSON writes with no LLM involvement. Consensus is only used in `score_run`.

## Architecture

```
Caller (browser)
    |
    | writeContract(score_run)
    v
GenLayer Node (leader)
    |-- exec scoring prompt
    |-- returns dimension_bands JSON
    v
GenLayer Validators (parallel)
    |-- each runs same prompt independently
    |-- eq_principle checks band agreement
    v
FINALIZED → run status = SEALED, score written on-chain
```

## Two-wallet model

The app supports two connection modes:

- **Injected wallet** (MetaMask, any EIP-1193 provider): standard web3 connection. Chain must be StudioNet (61999).
- **Browser wallet** (generated): a private key is created in-browser with `generatePrivateKey()` from genlayer-js and stored in `localStorage` under `benchseal_wallet_v1`. No extension required. Users should export the key before clearing browser storage.

## Deployed contract

- Address: `0x52ee02304de263C938b1c07a548638ca936fc1F4`
- Chain: StudioNet (chain ID 61999)
- Explorer: https://studio.genlayer.com/transactions

## Setup

```bash
cd apps/web
cp .env.example .env.local
# Fill in NEXT_PUBLIC_CONTRACT_ADDRESS and NEXT_PUBLIC_GENLAYER_ENDPOINT
npm install
npm run dev
```

Required env vars:
- `NEXT_PUBLIC_CONTRACT_ADDRESS` — deployed contract address
- `NEXT_PUBLIC_GENLAYER_ENDPOINT` — GenLayer JSON-RPC endpoint (e.g. https://studio.genlayer.com/api)

## Tests

Tests live in `tests/direct/` and use the `genlayer_test` direct-mode framework (not yet wired to a live VM in this environment). 27 tests across 6 classes: `TestCreateBenchmark`, `TestPublishVersion`, `TestCommitRun`, `TestScoreRun`, `TestSealLeaderboard`, `TestInvalidateRun`, `TestViews`.

```bash
pip install genlayer-test pytest
pytest tests/direct/
```

## Honest limits

- **Scoring requires inline content**: the contract VM cannot reliably fetch URLs at runtime in the current StudioNet version. Sample bundle content and rubric content must be passed directly to `score_run`. The URLs are stored for audit trail purposes.
- **UNDETERMINED is retryable, not auto-retried**: when validators disagree, the contract returns the status to the caller and the UI shows a "please retry" message. The contract does not retry internally.
- **Exemplar store grows unboundedly**: every sealed run appends exemplars to `exemplars_json`. There is no pruning mechanism yet.
- **Generated wallet security**: the browser wallet key is stored in `localStorage` in plaintext. It is suitable for testnet use. Export and back up the key if you submit anything you want to recover.

## What's next

- URL fetch support when GenLayer runtime supports it
- Exemplar pruning / relevance ranking (currently first-in, first-out)
- Staking/slashing for run submitters who submit fraudulent bundles
- Multi-sig benchmark ownership
