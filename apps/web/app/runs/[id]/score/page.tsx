"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  getRun,
  getBenchmark,
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
  const { account, isCorrectChain } = useWallet();
  const [run, setRun] = useState<RunInfo | null>(null);
  const [benchmark, setBenchmark] = useState<BenchmarkInfo | null>(null);
  const [exemplars, setExemplars] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
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
        const dims: string[] = (() => { try { return JSON.parse(b.dimensions_json); } catch { return []; } })();
        const exs: Record<string, string[]> = {};
        await Promise.all(
          dims.map(async (dim) => {
            try {
              const res = await previewExemplars(r.run_id, dim, 4);
              exs[dim] = res;
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

  async function handleScore() {
    setError(null);
    setScoreResult(null);
    setScoring(true);
    try {
      const exec = await scoreRun(runId, "", "", (hash) => {
        setScoreTxHash(hash);
        sessionStorage.setItem("benchseal_pending_tx_score_run", JSON.stringify({ txHash: hash, ts: Date.now() }));
      }, (status) => setScoreTxStatus(status));
      sessionStorage.removeItem("benchseal_pending_tx_score_run");
      if (exec.status === "SUCCESS") {
        setScoreResult("Scoring complete - reloading...");
        const updated = await getRun(runId);
        setRun(updated);
        setTimeout(() => window.location.reload(), 1500);
      } else if (exec.status === "UNKNOWN") {
        // Timed out waiting but tx may still finalize — reload to check
        setScoreResult("Consensus in progress - reloading to check status...");
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

  const statusClass =
    isSealed ? "tag-sealed" :
    run.status === RunStatus.RUN_COMMITTED ? "tag-committed" :
    run.status === RunStatus.SCORING ? "tag-scoring" :
    run.status === RunStatus.ABSTAINED ? "tag-abstained" : "tag-invalid";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 20, minHeight: "calc(100vh - 160px)" }}>
      {/* Left: Score console */}
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Header */}
        <div style={{ ...panelStyle, padding: 28 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontFamily: "Sora, sans-serif", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--ink-faint)" }}>
              Score Room - Run #{runId}
            </span>
            <span className={`tag ${statusClass}`}>{runStatusLabel(run.status as 0)}</span>
          </div>
          <div style={{ fontFamily: "Sora, sans-serif", fontSize: 24, fontWeight: 800, color: "var(--ink)" }}>
            {run.model_name}
          </div>
          <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--ink-faint)", marginTop: 4 }}>
            Benchmark #{run.benchmark_id} - v{run.version}
          </div>
        </div>

        {/* Score if sealed */}
        {isSealed && (
          <div style={{ ...panelStyle, padding: 28, border: "1.5px solid rgba(61,220,138,.25)" }}>
            <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--ink-faint)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Final Score
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
                          Exemplars ({dimExemplars.length})
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

        {/* Actions */}
        {!isSealed && (
          <div style={{ ...panelStyle, padding: 24 }}>
            {!account && <div className="error-banner" style={{ marginBottom: 14 }}>Connect wallet to trigger scoring</div>}
            {account && !isCorrectChain && <div className="error-banner" style={{ marginBottom: 14 }}>Switch to StudioNet (chain 61999)</div>}
            {scoreResult && <div className="success-banner" style={{ marginBottom: 14 }} aria-live="polite">{scoreResult}</div>}

            <button
              className="btn-p"
              onClick={handleScore}
              disabled={!canScore || scoring}
              style={{ width: "100%" }}
            >
              {scoring
                ? (scoreTxHash ? "Awaiting consensus..." : "Submitting...")
                : run.status === RunStatus.RUN_COMMITTED
                ? "Trigger Consensus Scoring"
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

      {/* Right: Evidence */}
      <div style={{ ...panelStyle }}>
        <div className="section-head" style={{ borderRadius: "16px 16px 0 0" }}>Evidence</div>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--ink-faint)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Sample Bundle</div>
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
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--ink-faint)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Rubric</div>
              <a
                href={benchmark.rubric_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--orange)", wordBreak: "break-all", textDecoration: "none" }}
              >
                {benchmark.rubric_url}
              </a>
            </div>
          )}

          <div style={{ borderTop: "1px solid rgba(201,195,232,.1)", paddingTop: 16, marginTop: 4 }}>
            <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--ink-faint)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              How Scoring Works
            </div>
            <ol style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--ink-faint)", lineHeight: 1.9, margin: 0, paddingLeft: 16 }}>
              <li>Contract fetches rubric + sample bundle from public URLs</li>
              <li>VecDB retrieves up to 4 historical exemplars per dimension</li>
              <li>GenLayer validators independently judge each dimension (band 0-4)</li>
              <li>Consensus requires validator agreement</li>
              <li>Weighted score computed in basis points (0-10000)</li>
              <li>Result written on-chain, immutable</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ScorePage() {
  const params = useParams();
  const runId = parseInt(params.id as string, 10);

  return (
    <ContractGuard>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 24px 40px" }}>
        <div style={{ marginBottom: 24 }}>
          <Link href={`/runs/${runId}`} style={{ color: "var(--ink-faint)", fontSize: 13, textDecoration: "none", fontFamily: "JetBrains Mono, monospace" }}>
            - Run #{runId}
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
