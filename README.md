# BenchSeal

A decentralized AI benchmark certification platform built on [GenLayer](https://genlayer.com). Model evaluation runs are committed on-chain, scored by validator consensus, and sealed into immutable leaderboards.

## How it works

1. **Register a Benchmark** — define evaluation dimensions and a rubric URL
2. **Publish a Version** — pin a task manifest to make the benchmark scoreable
3. **Submit a Run** — commit an off-chain model run (manifest URL + sample bundle URL)
4. **Trigger Scoring** — GenLayer validators independently score each semantic dimension (bands 0-4) via `gl.exec_prompt`, reach consensus, and write the result on-chain
5. **Seal the Leaderboard** — freeze a version's rankings into an immutable snapshot

## Stack

| Layer | Technology |
|---|---|
| Smart contract | Python — GenLayer Intelligent Contract |
| Consensus | GenLayer StudioNet (chain 61999) |
| Frontend | Next.js 16, React 19, TypeScript |
| Styling | Tailwind CSS v4, custom glassmorphism design system |
| Wallet | Injected wallet via `window.ethereum` (genlayer-js 1.1.8) |

## Project structure

```
benchseal/
├── contracts/
│   └── benchseal.py        # GenLayer contract
└── apps/web/               # Next.js frontend
    ├── app/                # Pages (registry, benchmarks, runs, scoring, leaderboards)
    ├── components/         # WalletBar, WalletProvider, ContractGuard
    └── lib/genlayer/       # Contract client, RPC config, finality polling
```

## Getting started

### Prerequisites

- Node.js 20+
- A wallet connected to GenLayer StudioNet (chain 61999, RPC `https://studio.genlayer.com/api`)
- A deployed `benchseal.py` contract (deploy via [GenLayer Studio](https://studio.genlayer.com))

### Install & run

```bash
cd apps/web
npm install
```

Create `.env.local`:

```env
NEXT_PUBLIC_GENLAYER_CHAIN=studionet
NEXT_PUBLIC_GENLAYER_ENDPOINT=https://studio.genlayer.com/api
NEXT_PUBLIC_BENCHSEAL_CONTRACT=0xYOUR_CONTRACT_ADDRESS
NEXT_PUBLIC_BENCHSEAL_DATA=live
```

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Deploy the contract

1. Open [studio.genlayer.com](https://studio.genlayer.com)
2. Paste `contracts/benchseal.py`
3. Deploy — copy the contract address into `.env.local`

## Contract API

| Method | Type | Description |
|---|---|---|
| `create_benchmark` | write | Register a new benchmark with dimensions and rubric |
| `publish_version` | write | Pin a task manifest to unlock run submission |
| `commit_run` | write | Submit an off-chain model run for scoring |
| `score_run` | write (consensus) | Validators score each dimension, result written on-chain |
| `seal_leaderboard` | write | Freeze a version's rankings as an immutable snapshot |
| `invalidate_run` | write | Mark a run invalid (benchmark owner only) |
| `get_benchmark` | view | Fetch benchmark metadata |
| `get_run` | view | Fetch run details and scores |
| `list_benchmarks` | view | Paginated benchmark list |
| `list_runs` | view | Runs for a benchmark |
| `list_snapshots` | view | Sealed leaderboard snapshots |

## Scoring

Each dimension is scored on a 0-4 band by GenLayer validators:

| Band | Meaning |
|---|---|
| 0 | Completely fails |
| 1 | Mostly fails |
| 2 | Mixed results |
| 3 | Mostly succeeds |
| 4 | Consistently exceeds expectations |

Bands are averaged and converted to basis points (0-10000). Consensus requires validator agreement on the band values.

## Environment variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_GENLAYER_CHAIN` | Chain name (`studionet`) |
| `NEXT_PUBLIC_GENLAYER_ENDPOINT` | RPC endpoint (used server-side; browser uses `/api/rpc` proxy) |
| `NEXT_PUBLIC_BENCHSEAL_CONTRACT` | Deployed contract address |
| `NEXT_PUBLIC_BENCHSEAL_DATA` | Set to `live` to read from chain |

## License

MIT
