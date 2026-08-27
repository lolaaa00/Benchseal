"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  getRun,
  getBenchmark,
  getBenchmarkVersion,
  scoreRun,
  previewExemplars,
  RunInfo,
  BenchmarkInfo,
  RunStatus,
  runStatusLabel,
  scoreBpsToPercent,
} from "@/lib/genlayer/contract";
import { useWallet } from "@/components/WalletProvider";
import { ContractGuard } from "@/components/ContractGuard";
import { TxStatus } from "@/components/TxStatus";
import { computeSHA256 } from "@/lib/crypto";

const MAX_RUBRIC_SIZE = 4000;         // must match contract constant
const MAX_SAMPLE_SIZE = 8000;         // must match contract constant
const MAX_MANIFEST_SIZE = 8000;       // must match contract constant
const MAX_RUN_MANIFEST_SIZE = 4000;   // must match contract constant

function BandChip({ band }: { band: number }) {
  return <span className={`band-chip band-${band}`}>{band}</span>;
}

const panelStyle: React.CSSProperties = {
  background: "rgba(16,12,41,.5)",
  border: "1.5px solid rgba(201,195,232,.1)",
  borderRadius: 16,
  backdropFilter: "blur(12px)",
};

function ScoreRoom({ runId }: { runId: number }) {
  const { account, isCorrectChain, walletMode } = useWallet();
  const [run, setRun] = useState<RunInfo | null>(null);
  const [benchmark, setBenchmark] = useState<BenchmarkInfo | null>(null);
  const [exemplars, setExemplars] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);

  // Evidence inputs
  const [sampleContent, setSampleContent] = useState("");
  const [rubricContent, setRubricContent] = useState("");
  const [manifestContent, setManifestContent] = useState("");
  const [runManifestContent, setRunManifestContent] = useState("");
  const [sampleDigest, setSampleDigest] = useState<string | null>(null);
  const [rubricDigest, setRubricDigest] = useState<string | null>(null);
  const [manifestDigest, setManifestDigest] = useState<string | null>(null);
  const [runManifestDigest, setRunManifestDigest] = useState<string | null>(null);
  const [sampleDigestMatch, setSampleDigestMatch] = useState<boolean | null>(null);
  const [rubricDigestMatch, setRubricDigestMatch] = useState<boolean | null>(null);
  const [manifestDigestMatch, setManifestDigestMatch] = useState<boolean | null>(null);
  const [runManifestDigestMatch, setRunManifestDigestMatch] = useState<boolean | null>(null);
  const [versionRecord, setVersionRecord] = useState<{ task_manifest_digest: string } | null>(null);

  const [scoring, setScoring] = useState(false);
  const [scoreTxHash, setScoreTxHash] = useState<string | null>(null);
  const [scoreTxStatus, setScoreTxStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scoreResult, setScoreResult] = useState<string | null>(null);

  useEffect(() => {
    getRun(runId)
      .then(async (r) => {
        setRun(r);
        const b = await getBenchmark(r.benchmark_id);
        setBenchmark(b);
        try {
          const vr = await getBenchmarkVersion(r.benchmark_id, r.version);
          setVersionRecord(vr as { task_manifest_digest: string });
        } catch { /* version record may not exist yet */ }
        const dims: string[] = (() => { try { return JSON.parse(b.dimensions_json); } catch { return []; } })();
        const exs: Record<string, string[]> = {};
        await Promise.all(
          dims.map(async (dim) => {
            try {
              exs[dim] = await previewExemplars(r.run_id, dim, 4);
            } catch {
              exs[dim] = [];
            }
          })
        );
        setExemplars(exs);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [runId]);

  async function onSampleChange(content: string) {
    setSampleContent(content);
    if (content && run) {
      const digest = await computeSHA256(content);
      setSampleDigest(digest);
      setSampleDigestMatch(digest === run.sample_bundle_digest);
    } else {
      setSampleDigest(null);
      setSampleDigestMatch(null);
    }
  }

  async function onRubricChange(content: string) {
    setRubricContent(content);
    if (content && benchmark) {
      const digest = await computeSHA256(content);
      setRubricDigest(digest);
      setRubricDigestMatch(digest === benchmark.rubric_digest);
    } else {
      setRubricDigest(null);
      setRubricDigestMatch(null);
    }
  }

  async function onManifestChange(content: string) {
    setManifestContent(content);
    if (content && versionRecord) {
      const digest = await computeSHA256(content);
      setManifestDigest(digest);
      setManifestDigestMatch(digest === versionRecord.task_manifest_digest);
    } else {
      setManifestDigest(null);
      setManifestDigestMatch(null);
    }
  }

  async function onRunManifestChange(content: string) {
    setRunManifestContent(content);
    if (content && run) {
      const digest = await computeSHA256(content);
      setRunManifestDigest(digest);
      setRunManifestDigestMatch(digest === run.run_manifest_digest);
    } else {
      setRunManifestDigest(null);
      setRunManifestDigestMatch(null);
    }
  }

  async function handleScore() {
    setError(null);
    setScoreResult(null);
    setScoring(true);
    try {
      if (!sampleContent) throw new Error("Sample bundle content is required.");
      if (!rubricContent) throw new Error("Rubric content is required.");
      if (!manifestContent) throw new Error("Task manifest content is required.");
      if (!runManifestContent) throw new Error("Run manifest content is required.");
      if (sampleContent.length > MAX_SAMPLE_SIZE) {
        throw new Error(`Sample content exceeds ${MAX_SAMPLE_SIZE}-character limit.`);
      }
      if (rubricContent.length > MAX_RUBRIC_SIZE) {
        throw new Error(`Rubric content exceeds ${MAX_RUBRIC_SIZE}-character limit.`);
      }
      if (manifestContent.length > MAX_MANIFEST_SIZE) {
        throw new Error(`Task manifest content exceeds ${MAX_MANIFEST_SIZE}-character limit.`);
      }
      if (runManifestContent.length > MAX_RUN_MANIFEST_SIZE) {
        throw new Error(`Run manifest content exceeds ${MAX_RUN_MANIFEST_SIZE}-character limit.`);
      }
      if (sampleDigestMatch === false) {
        throw new Error("Sample content digest does not match the stored commitment. Provide the exact content.");
      }
      if (rubricDigestMatch === false) {
        throw new Error("Rubric content digest does not match the stored commitment. Provide the exact rubric.");
      }
      if (manifestDigestMatch === false) {
        throw new Error("Task manifest digest does not match the version's stored commitment. Provide the exact manifest.");
      }
      if (runManifestDigestMatch === false) {
        throw new Error("Run manifest digest does not match the stored commitment. Provide the exact run manifest.");
      }

      const mode = walletMode === "none" ? undefined : (walletMode as "injected" | "generated");
      const exec = await scoreRun(
        runId,
        sampleContent,
        rubricContent,
        manifestContent,
        runManifestContent,
        (hash) => {
          setScoreTxHash(hash);
          sessionStorage.setItem("benchseal_pending_tx_score_run", JSON.stringify({ txHash: hash, ts: Date.now() }));
        },
        (status) => setScoreTxStatus(status),
        mode,
      );
      sessionStorage.removeItem("benchseal_pending_tx_score_run");
      if (exec.status === "SUCCESS") {
        setScoreResult("Scoring complete — reloading...");
        const updated = await getRun(runId);
        setRun(updated);
        setTimeout(() => window.location.reload(), 1500);
      } else if (exec.status === "UNKNOWN") {
        setScoreResult("Consensus in progress — reloading to check status...");
        setTimeout(() => window.location.reload(), 2000);
      } else {
        setError(exec.errorMessage ?? "Scoring failed or abstained");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setScoring(false);
    }
  }

  if (loading) return <div className="empty-state" style={{ color: "var(--ink-faint)" }}>Loading scoring room...</div>;
  if (error && !run) return <div style={{ padding: 24 }}><div className="error-banner">{error}</div></div>;
  if (!run) return <div className="empty-state">Run not found</div>;

  const dims: string[] = benchmark
    ? (() => { try { return JSON.parse(benchmark.dimensions_json); } catch { return []; } })()
    : [];

  const bands: Record<string, number> = (() => {
    try { return JSON.parse(run.dimension_bands_json); } catch { return {}; }
  })();

  const isSealed = run.status === RunStatus.SEALED;
  const canScore = account && isCorrectChain && run.status === RunStatus.RUN_COMMITTED;
  const evidenceReady = sampleContent && rubricContent && manifestContent && runManifestContent
    && sampleDigestMatch !== false && rubricDigestMatch !== false
    && manifestDigestMatch !== false && runManifestDigestMatch !== false;

  const statusClass =
    isSealed ? "tag-sealed" :
    run.status === RunStatus.RUN_COMMITTED ? "tag-committed" :
    run.status === RunStatus.SCORING ? "tag-scoring" :
    run.status === RunStatus.ABSTAINED ? "tag-abstained" : "tag-invalid";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 400px", gap: 20, minHeight: "calc(100vh - 160px)" }}>
      {/* Left: Score console */}
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Header */}
        <div style={{ ...panelStyle, padding: 28 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontFamily: "Sora, sans-serif", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--ink-faint)" }}>
              Score Room — Run #{runId}
            </span>
            <span className={`tag ${statusClass}`}>{runStatusLabel(run.status as 0)}</span>
          </div>
          <div style={{ fontFamily: "Sora, sans-serif", fontSize: 24, fontWeight: 800, color: "var(--ink)" }}>
            {run.model_name}
          </div>
          <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--ink-faint)", marginTop: 4 }}>
            Benchmark #{run.benchmark_id} — v{run.version}
          </div>
        </div>

        {/* Score if sealed */}
        {isSealed && (
          <div style={{ ...panelStyle, padding: 28, border: "1.5px solid rgba(61,220,138,.25)" }}>
            <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--ink-faint)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Final Score (equal-weight average of dimension bands)
            </div>
            <div style={{ fontFamily: "Sora, sans-serif", fontSize: 48, fontWeight: 800, color: "var(--green)" }}>
              {scoreBpsToPercent(run.final_score_bps)}
            </div>
            <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--ink-faint)", marginTop: 4 }}>
              {run.final_score_bps.toLocaleString()} basis points
            </div>
          </div>
        )}

        {/* Dimension judgments */}
        {dims.length > 0 && (
          <div style={{ ...panelStyle, padding: 24 }}>
            <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--ink-faint)", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Dimension Judgments
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {dims.map((dim) => {
                const band = bands[dim];
                const dimExemplars = exemplars[dim] ?? [];
                const pct = band !== undefined ? (band / 4) * 100 : 0;
                return (
                  <div
                    key={dim}
                    style={{
                      background: "rgba(38,34,98,.3)",
                      border: "1px solid rgba(201,195,232,.1)",
                      borderRadius: 12,
                      padding: 16,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "var(--ink)" }}>
                        {dim.replace(/_/g, " ")}
                      </span>
                      {band !== undefined ? (
                        <BandChip band={band} />
                      ) : (
                        <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--ink-faint)" }}>pending</span>
                      )}
                    </div>
                    {band !== undefined && (
                      <div className="score-bar-track" style={{ marginBottom: 10 }}>
                        <div className="score-bar-fill" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                    {dimExemplars.length > 0 && (
                      <div>
                        <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--ink-faint)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                          Historical Exemplars ({dimExemplars.length})
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {dimExemplars.map((ex, i) => (
                            <div
                              key={i}
                              style={{
                                fontFamily: "JetBrains Mono, monospace",
                                fontSize: 10,
                                color: "var(--ink-faint)",
                                padding: "6px 10px",
                                background: "rgba(16,12,41,.6)",
                                border: "1px solid rgba(201,195,232,.08)",
                                borderRadius: 8,
                                wordBreak: "break-word",
                              }}
                            >
                              {ex.slice(0, 160)}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Rationale */}
        {run.rationale && (
          <div style={{ ...panelStyle, padding: 24 }}>
            <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--ink-faint)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>Rationale</div>
            <p style={{ fontSize: 13, fontFamily: "Inter, sans-serif", color: "var(--ink-dim)", lineHeight: 1.7, margin: 0 }}>{run.rationale}</p>
          </div>
        )}

        {/* Score action */}
        {!isSealed && (
          <div style={{ ...panelStyle, padding: 24 }}>
            {!account && <div className="error-banner" style={{ marginBottom: 14 }}>Connect wallet to trigger scoring</div>}
            {account && !isCorrectChain && <div className="error-banner" style={{ marginBottom: 14 }}>Switch to StudioNet (chain 61999)</div>}
            {scoreResult && <div className="success-banner" style={{ marginBottom: 14 }} aria-live="polite">{scoreResult}</div>}

            <button
              className="btn-p"
              onClick={handleScore}
              disabled={!canScore || scoring || !evidenceReady}
              style={{ width: "100%" }}
            >
              {scoring
                ? (scoreTxHash ? "Awaiting consensus..." : "Submitting...")
                : run.status === RunStatus.RUN_COMMITTED
                ? (evidenceReady ? "Trigger Consensus Scoring" : "Provide evidence to score")
                : "Run is " + runStatusLabel(run.status as 0)}
            </button>

            <div aria-live="polite" style={{ marginTop: 12 }}>
              <TxStatus txHash={scoreTxHash} status={scoreTxStatus} error={error} />
            </div>

            {run.status === RunStatus.SCORING && !scoring && (
              <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--ink-faint)", marginTop: 10, marginBottom: 0 }}>
                Scoring in progress. Check back in a minute.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Right: Evidence panel */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Stored commitments */}
        <div style={{ ...panelStyle }}>
          <div className="section-head" style={{ borderRadius: "16px 16px 0 0" }}>Stored Commitments</div>
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--ink-faint)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Sample Bundle URL</div>
              <a
                href={run.sample_bundle_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--orange)", wordBreak: "break-all", textDecoration: "none" }}
              >
                {run.sample_bundle_url}
              </a>
              <div className="digest" style={{ marginTop: 4, fontSize: 10 }}>{run.sample_bundle_digest}</div>
            </div>

            {benchmark && (
              <div>
                <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--ink-faint)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Rubric URL</div>
                <a
                  href={benchmark.rubric_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--orange)", wordBreak: "break-all", textDecoration: "none" }}
                >
                  {benchmark.rubric_url}
                </a>
                <div className="digest" style={{ marginTop: 4, fontSize: 10 }}>{benchmark.rubric_digest}</div>
              </div>
            )}

            {versionRecord && (
              <div>
                <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--ink-faint)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Task Manifest Digest (v{run.version})</div>
                <div className="digest" style={{ fontSize: 10 }}>{versionRecord.task_manifest_digest}</div>
                <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--ink-faint)", marginTop: 4 }}>
                  Paste the task manifest content below — its SHA-256 must match this.
                </div>
              </div>
            )}

            <div>
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--ink-faint)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Run Manifest URL</div>
              <a
                href={run.run_manifest_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--orange)", wordBreak: "break-all", textDecoration: "none" }}
              >
                {run.run_manifest_url}
              </a>
              <div className="digest" style={{ marginTop: 4, fontSize: 10 }}>{run.run_manifest_digest}</div>
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--ink-faint)", marginTop: 4 }}>
                Paste the run manifest content below — proves claimed provenance was committed before outputs were seen.
              </div>
            </div>
          </div>
        </div>

        {/* Evidence input — only shown when run is scoreable */}
        {run.status === RunStatus.RUN_COMMITTED && (
          <div style={{ ...panelStyle }}>
            <div className="section-head" style={{ borderRadius: "16px 16px 0 0" }}>Provide Evidence to Score</div>
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
              <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: "var(--ink-dim)", margin: 0, lineHeight: 1.6 }}>
                Paste the exact content from the URLs above. The contract verifies each piece against its stored SHA-256 commitment before validators judge it.
              </p>

              <div>
                <label style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--ink-faint)", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Sample Bundle Content
                  <span style={{ marginLeft: 6, color: "var(--ink-faint)" }}>(max {MAX_SAMPLE_SIZE} chars)</span>
                </label>
                <textarea
                  className="field-input"
                  rows={6}
                  placeholder="Paste the sample bundle content (model outputs)..."
                  value={sampleContent}
                  onChange={(e) => onSampleChange(e.target.value)}
                  style={{ fontSize: 11 }}
                />
                {sampleDigest && (
                  <div style={{ marginTop: 4, fontSize: 10, fontFamily: "JetBrains Mono, monospace", wordBreak: "break-all",
                    color: sampleDigestMatch === true ? "var(--green)" : sampleDigestMatch === false ? "var(--red, #f56)" : "var(--ink-faint)" }}>
                    {sampleDigest}
                    {sampleDigestMatch === true && " ✓ matches stored"}
                    {sampleDigestMatch === false && " ✗ does not match stored digest"}
                  </div>
                )}
              </div>

              <div>
                <label style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--ink-faint)", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Rubric Content
                  <span style={{ marginLeft: 6, color: "var(--ink-faint)" }}>(max {MAX_RUBRIC_SIZE} chars)</span>
                </label>
                <textarea
                  className="field-input"
                  rows={6}
                  placeholder="Paste the rubric content (evaluation criteria)..."
                  value={rubricContent}
                  onChange={(e) => onRubricChange(e.target.value)}
                  style={{ fontSize: 11 }}
                />
                {rubricDigest && (
                  <div style={{ marginTop: 4, fontSize: 10, fontFamily: "JetBrains Mono, monospace", wordBreak: "break-all",
                    color: rubricDigestMatch === true ? "var(--green)" : rubricDigestMatch === false ? "var(--red, #f56)" : "var(--ink-faint)" }}>
                    {rubricDigest}
                    {rubricDigestMatch === true && " ✓ matches stored"}
                    {rubricDigestMatch === false && " ✗ does not match stored digest"}
                  </div>
                )}
              </div>

              <div>
                <label style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--ink-faint)", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Task Manifest Content
                  <span style={{ marginLeft: 6, color: "var(--ink-faint)" }}>(max {MAX_MANIFEST_SIZE} chars)</span>
                </label>
                <textarea
                  className="field-input"
                  rows={6}
                  placeholder={'Paste the task manifest JSON, e.g. {"tasks":[{"task_id":"t1","prompt":"..."}]}'}
                  value={manifestContent}
                  onChange={(e) => onManifestChange(e.target.value)}
                  style={{ fontSize: 11 }}
                />
                {manifestDigest && (
                  <div style={{ marginTop: 4, fontSize: 10, fontFamily: "JetBrains Mono, monospace", wordBreak: "break-all",
                    color: manifestDigestMatch === true ? "var(--green)" : manifestDigestMatch === false ? "var(--red, #f56)" : "var(--ink-faint)" }}>
                    {manifestDigest}
                    {manifestDigestMatch === true && " ✓ matches version commitment"}
                    {manifestDigestMatch === false && " ✗ does not match version digest"}
                  </div>
                )}
                <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--ink-faint)", marginTop: 6, marginBottom: 0 }}>
                  The canonical task inputs the model was given. Sample bundle task IDs must all appear here — this binds scoring to verifiable task-output pairs.
                </p>
              </div>

              <div>
                <label style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--ink-faint)", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Run Manifest Content
                  <span style={{ marginLeft: 6, color: "var(--ink-faint)" }}>(max {MAX_RUN_MANIFEST_SIZE} chars)</span>
                </label>
                <textarea
                  className="field-input"
                  rows={5}
                  placeholder={'Paste the run manifest content, e.g. {"model":"GPT-4o","temperature":0,"hardware":"A100",...}'}
                  value={runManifestContent}
                  onChange={(e) => onRunManifestChange(e.target.value)}
                  style={{ fontSize: 11 }}
                />
                {runManifestDigest && (
                  <div style={{ marginTop: 4, fontSize: 10, fontFamily: "JetBrains Mono, monospace", wordBreak: "break-all",
                    color: runManifestDigestMatch === true ? "var(--green)" : runManifestDigestMatch === false ? "var(--red, #f56)" : "var(--ink-faint)" }}>
                    {runManifestDigest}
                    {runManifestDigestMatch === true && " ✓ matches stored"}
                    {runManifestDigestMatch === false && " ✗ does not match stored digest"}
                  </div>
                )}
                <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--ink-faint)", marginTop: 6, marginBottom: 0 }}>
                  The claimed provenance committed at submit time. Proves the run description (model config, inference params) was not changed after outputs were observed.
                </p>
              </div>

              <div style={{ borderTop: "1px solid rgba(201,195,232,.1)", paddingTop: 12 }}>
                <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--ink-faint)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  How Scoring Works
                </div>
                <ol style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--ink-faint)", lineHeight: 1.9, margin: 0, paddingLeft: 16 }}>
                  <li>Supply sample bundle, rubric, task manifest, and run manifest content</li>
                  <li>Contract verifies all four against their SHA-256 commitments</li>
                  <li>Sample task IDs verified against manifest — provenance check</li>
                  <li>Sampling policy min_samples enforced against actual sample count</li>
                  <li>Validators score each task-output pair independently (band 0–4)</li>
                  <li>Consensus requires agreement on dimension bands</li>
                  <li>Equal-weight average score sealed on-chain</li>
                </ol>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ScorePage() {
  const params = useParams();
  const runId = parseInt(params.id as string, 10);

  return (
    <ContractGuard>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 24px 40px" }}>
        <div style={{ marginBottom: 24 }}>
          <Link href={`/runs/${runId}`} style={{ color: "var(--ink-faint)", fontSize: 13, textDecoration: "none", fontFamily: "JetBrains Mono, monospace" }}>
            ← Run #{runId}
          </Link>
          <h1 style={{ fontFamily: "Sora, sans-serif", fontSize: 24, fontWeight: 800, margin: "6px 0 0", color: "var(--ink)" }}>
            Scoring Room
          </h1>
        </div>
        <ScoreRoom runId={runId} />
      </div>
    </ContractGuard>
  );
}
