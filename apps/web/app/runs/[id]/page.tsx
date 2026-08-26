"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  getRun,
  getBenchmark,
  RunInfo,
  BenchmarkInfo,
  runStatusLabel,
  scoreBpsToPercent,
  RunStatus,
} from "@/lib/genlayer/contract";
import { ContractGuard } from "@/components/ContractGuard";

function BandChip({ band }: { band: number }) {
  return <span className={`band-chip band-${band}`}>{band}</span>;
}

function ScoreBar({ bps }: { bps: number }) {
  const pct = Math.min(100, (bps / 10000) * 100);
  return (
    <div className="score-bar-track">
      <div className="score-bar-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  background: "rgba(16,12,41,.5)",
  border: "1.5px solid rgba(201,195,232,.1)",
  borderRadius: 16,
  backdropFilter: "blur(12px)",
};

function RunReceipt({ runId }: { runId: number }) {
  const [run, setRun] = useState<RunInfo | null>(null);
  const [benchmark, setBenchmark] = useState<BenchmarkInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getRun(runId)
      .then(async (r) => {
        setRun(r);
        try {
          const b = await getBenchmark(r.benchmark_id);
          setBenchmark(b);
        } catch {/* ignore */}
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [runId]);

  if (loading) return <div className="empty-state" style={{ color: "var(--ink-faint)" }}>Loading run...</div>;
  if (error) return <div style={{ padding: 24 }}><div className="error-banner">{error}</div></div>;
  if (!run) return <div className="empty-state">Run not found</div>;

  const statusLabel = runStatusLabel(run.status as 0);
  const isSealed = run.status === RunStatus.SEALED;

  const bands: Record<string, number> = (() => {
    try { return JSON.parse(run.dimension_bands_json); } catch { return {}; }
  })();

  const dims: string[] = benchmark
    ? (() => { try { return JSON.parse(benchmark.dimensions_json); } catch { return []; } })()
    : Object.keys(bands);

  const statusClass =
    run.status === RunStatus.SEALED ? "tag-sealed" :
    run.status === RunStatus.RUN_COMMITTED ? "tag-committed" :
    run.status === RunStatus.SCORING ? "tag-scoring" :
    run.status === RunStatus.ABSTAINED ? "tag-abstained" : "tag-invalid";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 20, minHeight: "calc(100vh - 160px)" }}>
      {/* Left: Main receipt */}
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Header card */}
        <div style={{ ...panelStyle, padding: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <span className={`tag ${statusClass}`}>{statusLabel}</span>
          </div>
          <div style={{ fontFamily: "Sora, sans-serif", fontSize: 28, fontWeight: 800, color: "var(--ink)", marginBottom: 6 }}>
            {run.model_name}
          </div>
          <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--ink-faint)" }}>
            Run #{runId} - Benchmark #{run.benchmark_id} - v{run.version}
          </div>
        </div>

        {/* Score section if sealed */}
        {isSealed && (
          <div style={{ ...panelStyle, padding: 28 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 16 }}>
              <span
                style={{
                  fontFamily: "Sora, sans-serif",
                  fontSize: 56,
                  fontWeight: 800,
                  color: "var(--green)",
                  lineHeight: 1,
                }}
              >
                {scoreBpsToPercent(run.final_score_bps)}
              </span>
              <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "var(--ink-faint)" }}>
                {run.final_score_bps.toLocaleString()} bps
              </span>
            </div>
            <ScoreBar bps={run.final_score_bps} />

            {dims.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--ink-faint)", marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Dimension Bands
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {dims.map((d: string) => {
                    const band = bands[d] ?? null;
                    const pct = band !== null ? (band / 4) * 100 : 0;
                    return (
                      <div key={d} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--ink-dim)", minWidth: 180 }}>
                          {d.replace(/_/g, " ")}
                        </span>
                        <div style={{ flex: 1 }}>
                          <div className="score-bar-track">
                            {band !== null && (
                              <div
                                className="score-bar-fill"
                                style={{ width: `${pct}%` }}
                              />
                            )}
                          </div>
                        </div>
                        {band !== null && <BandChip band={band} />}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {run.rationale && (
              <div style={{ marginTop: 20, borderTop: "1px solid rgba(201,195,232,.1)", paddingTop: 16 }}>
                <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--ink-faint)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>Rationale</div>
                <p style={{ fontSize: 13, fontFamily: "Inter, sans-serif", color: "var(--ink-dim)", lineHeight: 1.7, margin: 0 }}>
                  {run.rationale}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Score action */}
        {run.status === RunStatus.RUN_COMMITTED && (
          <div>
            <Link href={`/runs/${runId}/score`} className="btn-p" style={{ display: "inline-flex" }}>
              Score This Run
            </Link>
          </div>
        )}

        {/* Submission metadata */}
        <div style={{ ...panelStyle, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--ink-faint)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>Submitter</div>
            <div className="digest">{run.submitter}</div>
          </div>
          {run.sealed_at > 0 && (
            <div>
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--ink-faint)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>Sealed At</div>
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "var(--ink)" }}>
                {new Date(run.sealed_at * 1000).toISOString()}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right: Evidence panel */}
      <div style={{ ...panelStyle }}>
        <div
          className="section-head"
          style={{ borderRadius: "16px 16px 0 0" }}
        >
          Evidence & Integrity
        </div>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 20 }}>
          <div>
            <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--ink-faint)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Run Manifest</div>
            <a
              href={run.run_manifest_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--orange)", wordBreak: "break-all", textDecoration: "none" }}
            >
              {run.run_manifest_url}
            </a>
            <div className="digest" style={{ marginTop: 4 }}>{run.run_manifest_digest}</div>
          </div>

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
            <div className="digest" style={{ marginTop: 4 }}>{run.sample_bundle_digest}</div>
          </div>

          <div>
            <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--ink-faint)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Deterministic Metrics</div>
            <pre
              style={{
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 11,
                color: "var(--ink)",
                background: "rgba(16,12,41,.6)",
                border: "1px solid rgba(201,195,232,.12)",
                borderRadius: 10,
                padding: 12,
                margin: 0,
                overflowX: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {(() => {
                try {
                  return JSON.stringify(JSON.parse(run.deterministic_metrics_json), null, 2);
                } catch {
                  return run.deterministic_metrics_json;
                }
              })()}
            </pre>
          </div>

          {benchmark && (
            <div>
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--ink-faint)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Benchmark</div>
              <Link
                href={`/benchmarks/${benchmark.benchmark_id}`}
                style={{ fontFamily: "Sora, sans-serif", fontSize: 14, fontWeight: 600, color: "var(--ink)", textDecoration: "none" }}
              >
                {benchmark.name}
              </Link>
            </div>
          )}

          {isSealed && dims.length > 0 && (
            <div>
              <Link href={`/runs/${runId}/score`} className="btn-g" style={{ display: "block", textAlign: "center", fontSize: 13 }}>
                View Score Room
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RunPage() {
  const params = useParams();
  const runId = parseInt(params.id as string, 10);

  return (
    <ContractGuard>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 24px 40px" }}>
        <div style={{ marginBottom: 24 }}>
          <Link href="/" style={{ color: "var(--ink-faint)", fontSize: 13, textDecoration: "none", fontFamily: "JetBrains Mono, monospace" }}>
            - Registry
          </Link>
          <h1 style={{ fontFamily: "Sora, sans-serif", fontSize: 24, fontWeight: 800, margin: "6px 0 0", color: "var(--ink)" }}>
            Run Receipt
          </h1>
        </div>
        <RunReceipt runId={runId} />
      </div>
    </ContractGuard>
  );
}
