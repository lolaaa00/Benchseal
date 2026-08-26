# BenchSeal — Project Decision Record

## 8+ Candidates Evaluated

| # | Idea | Capabilities Used | Notes |
|---|------|-------------------|-------|
| 1 | **BenchSeal** (chosen) | Semantic scoring via eq_principle, VecDB exemplar memory | Combines all four GenLayer capabilities naturally; clear two-party trust failure |
| 2 | Staked Bug Bounty | Native GEN value, web evidence fetch | Strong staking angle, but the semantic judgment (is this really a bug?) is thin; disputes too open-ended |
| 3 | On-chain Code Review | Semantic analysis, web fetch | Appealing, but "good code" is subjective in a way that's hard to bound; no obvious second party |
| 4 | Escrow Freelance | Native GEN value, semantic deliverable check | Classic two-party design, but the deliverable check is very application-specific and hard to generalise |
| 5 | Fact-Check Oracle | Web fetch, comparative equivalence principle | Web fetch is the core capability; validators agree on web content retrieval, not on judgment — weaker use of eq_principle |
| 6 | Model Output Registry | Semantic comparison, embedding search | Essentially a read-only archive; no clear write path that requires consensus |
| 7 | Grant Milestone Verifier | Native GEN, web fetch, image evidence | Good multi-capability story, but milestone text is so variable that prompt construction gets messy fast |
| 8 | AI Model Licensing Marketplace | Native GEN, semantic license compliance | Interesting, but license compliance is more parse-and-match than semantically graded; reduces to a simpler problem |

## Why BenchSeal Was Chosen

Two things stood out. First, the trust failure is clean and obvious: a lab cannot credibly certify its own model's quality on a benchmark it controls. You need a disinterested third party, and that third party needs to independently reproduce the judgment — not just attest to a hash. Second, quality judgment is irreducibly semantic. You cannot write a deterministic function that says whether a model "mostly succeeds" on instruction adherence. That is exactly what GenLayer's equivalence principle is for.

The other candidates either had a weaker trust argument (Fact-Check Oracle — validators mostly agree on web retrieval, not on meaning), or collapsed to a simpler problem once examined (Code Review — what counts as a bug is a product decision, not a semantic fact), or relied mainly on the value-transfer capability without a strong semantic component (Escrow Freelance, Staked Bug Bounty — usable, but GenLayer's semantic layer is an afterthought).

## Gate Analysis

**Gate A — Counterfactual test: what breaks without GenLayer?**
Without consensus, someone uploads a score and you have to trust them. A model lab could submit fabricated outputs and sign off on them. There is no on-chain mechanism to require independent re-judgment. The whole certification collapses to a notarisation, which any blockchain can do. GenLayer's validators independently reconstruct the judgment — so falsifying a result requires compromising a majority of validators, not just one key.

**Gate B — Two distrusting parties:**
Model submitters (who want high scores) and benchmark owners (who want honest scores for their community) are naturally opposed. Neither party should control the outcome. Validators act as neutral arbiters.

**Gate C — Irreducibly semantic:**
Judging output quality is not parseable. Whether a model "mostly succeeds" on factual grounding requires reading and understanding the outputs against the rubric. No regex, no hash check, no numeric threshold can substitute for that. The prompt_comparative principle forces validators to produce the same judgment or the transaction does not finalise.

**Gate D — Evidence fetched or passed:**
Validators score using the sample bundle content passed at call time (or referenced via URL). Each validator independently evaluates the same material. The contract does not accept a pre-computed score — it computes the score itself via the consensus prompt.

**Gate E — A stranger returns:**
Academic and industry benchmark users are not the same person each time. They need the result to remain valid after the original submitter has moved on. On-chain sealed results satisfy this: the score is immutable, the digest is auditable, and anyone can re-read it without trusting the original submitter.

**Gate F — Beyond submission:**
The exemplar store grows over time, feeding future scoring with historical context. The leaderboard sealing mechanism creates a public, time-stamped record of which models ranked where — useful for academic citation and regulatory compliance long after the initial submission.

**Gate G — Latency budget:**
Write transactions (create benchmark, commit run) are fast — they are simple state mutations that finalise in under 30 seconds on StudioNet. Scoring is slow (1–3 minutes) because it involves LLM inference and multi-validator consensus. These are deliberately separated so submitters do not block on scoring at commit time.

## Self-Audit

- **Capabilities covered:** semantic scoring (eq_principle.prompt_comparative), VecDB/exemplar memory (exemplars_json store with per-dimension retrieval), on-chain leaderboards (seal_leaderboard + snapshot digest).
- **Two candidates involving native GEN value:** Staked Bug Bounty (#2) and Escrow Freelance (#4). Neither was chosen because the semantic judgment component was weaker than in BenchSeal.
- **If web access did not exist:** the sample bundle must be passed directly to the contract at score time (which is already the primary path). The contract would still work; validators would score purely from passed content rather than fetching. This is also the current production path since GenLayer URL fetch in contracts is unreliable at submission time.
- **Honest limits:** the exemplar store grows unboundedly (no pruning); UNDETERMINED consensus is returned to the caller as a retryable error rather than retried internally; scoring requires content to be passed inline because URL-fetching from within the contract VM is not guaranteed in the current runtime.
