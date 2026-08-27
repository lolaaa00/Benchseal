# AGENTS.md — BenchSeal

## Purpose

This file is intentionally short. **Do not copy the full project documentation into agent memory or into this file.** The repository documents are the source of truth. When starting a task, read the relevant files from disk.

Consensus certification for off-chain AI benchmark runs.

## Required read order for a fresh agent

1. `memory.md` — current project truth, constraints, decisions and status.
2. `prd.md` — product behavior, users, scope and acceptance criteria.
3. `architecture.md` — system boundaries, state ownership and end-to-end flows.
4. `trd.md` — exact technical/contract/frontend/backend requirements.
5. `ui/ux.md` — visual system, layout rules and interaction behavior.
6. `project-plan.md` — implementation sequence and release gates.
7. `handoff.md` — latest work log, blockers and exact next action.

Do not begin implementation after reading only this file.

## Mandatory operating loop

For **every meaningful work unit**:

1. Read the relevant plan/docs before changing code.
2. Make the smallest coherent change.
3. Run the checks relevant to that change.
4. **Immediately append a log entry to `handoff.md` before starting the next work unit.**
5. If the change alters a durable project decision, update `memory.md`.
6. If it changes architecture, contract API, data model or UI behavior, update the corresponding source document in the same work unit.
7. Never leave `handoff.md` describing work that did not actually happen.

A meaningful work unit includes: a feature, bug fix, deployment, contract method change, schema change, dependency change, UI route completion, test suite run, discovered blocker, or corrected false assumption.

## Non-negotiables

- Target StudioNet, chain **61999**.
- Use `genlayer-js` **1.1.8** unless the owner explicitly approves a version change.
- **Injected wallet only for writes. No generated/local/server signer.**
- Never present a finalized GenLayer transaction as success until the GenVM execution is explicitly successful.
- Never silently fall back to mock data in live mode.
- VecDB retrieves related memory; it never determines truth, authorization, payout, merge or final status by itself.
- Public storage is public. Do not put secrets/private source material in contract storage or VecDB.
- Keep consensus bounded and fail closed.
- No generic “AI decides X” implementation. The state machine and deterministic constraints are load-bearing.
- The UI must follow `ui/ux.md`; do not replace it with a generic purple/blue gradient SaaS template.

## Core product invariant

**Benchmark dimensions/weights are version-pinned before any run commits.**

## Definition of done

A task is not done merely because code compiles. It is done when implementation, relevant tests, documentation and `handoff.md` agree about reality.
