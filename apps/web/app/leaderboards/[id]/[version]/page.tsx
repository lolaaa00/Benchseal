"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  getBenchmark,
  listRuns,
  listSnapshots,
  getRun,
  sealLeaderboard,
  BenchmarkInfo,
  RunInfo,
  SnapshotInfo,
  RunStatus,
  scoreBpsToPercent,
  runStatusLabel,
} from "@/lib/genlayer/contract";
import { useWallet } from "@/components/WalletProvider";
import { ContractGuard } from "@/components/ContractGuard";

const panelStyle: React.CSSProperties = {
  background: "rgba(16,12,41,.5)",
  border: "1.5px solid rgba(201,195,232,.1)",
  borderRadius: 16,
  backdropFilter: "blur(12px)",
};

function ScoreBarWide({ bps }: { bps: number }) {
  const pct = Math.min(100, (bps / 10000) * 100);
  return (
    <div className="score-bar-track" style={{ width: 80 }}>
      <div className="score-bar-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

function LeaderboardContent({ benchmarkId, version }: { benchmarkId: number; version: number }) {
  const { account, isCorrectChain } = useWallet();
  const [benchmark, setBenchmark] = useState<BenchmarkInfo | null>(null);
  const [runs, setRuns] = useState<RunInfo[]>([]);
  const [snapshot, setSnapshot] = useState<SnapshotInfo | null>(null);
  const [selectedRun, setSelectedRun] = useState<RunInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [sealing, setSealing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sealResult, setSealResult] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getBenchmark(benchmarkId),
      listRuns(benchmarkId, 0, 100),
      listSnapshots(benchmarkId, 0, 100),
    ])
      .then(async ([b, runSummaries, snaps]) => {
        setBenchmark(b);
        const versionRuns = runSummaries.filter(
          (r) => r.version === version && r.status === RunStatus.SEALED
        );
        const fullRuns = await Promise.all(
          versionRuns.map((r) => getRun(r.run_id))
        );
        fullRuns.sort((a, b) => b.final_score_bps - a.final_score_bps);
        setRuns(fullRuns);
        const snap = snaps.find((s) => s.version === version) ?? null;
        setSnapshot(snap);
        if (fullRuns.length > 0) setSelectedRun(fullRuns[0]);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [benchmarkId, version]);

  async function handleSeal() {
    if (runs.length === 0) return;
    setError(null);
    setSealResult(null);
    setSealing(true);
    try {
      const orderedIds = runs.map((r) => r.run_id);
      const exec = await sealLeaderboard(benchmarkId, version, JSON.stringify(orderedIds));
      if (exec.status === "SUCCESS") {
        setSealResult(`Leaderboard sealed. Snapshot #${exec.returnValue}`);
        const snaps = await listSnapshots(benchmarkId, 0, 100);
        const snap = snaps.find((s) => s.version === version) ?? null;
        setSnapshot(snap);
      } else {
        setError(exec.errorMessage ?? "Sealing failed");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSealing(false);
    }
  }

  if (loading) return <div className="empty-state" style={{ color: "var(--ink-faint)" }}>Loading leaderboard...</div>;
  if (error && !benchmark) return <div style={{ padding: 24 }}><div className="error-banner">{error}</div></div>;

  const dims: string[] = benchmark
    ? (() => { try { return JSON.parse(benchmark.dimensions_json); } catch { return []; } })()
    : [];

  const isOwner = benchmark?.owner === account;
  const canSeal = isOwner && isCorrectChain && runs.length > 0 && !snapshot;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 20, minHeight: "calc(100vh - 160px)" }}>
      {/* Left: Tower */}
      <div style={{ ...panelStyle }}>
        <div className="section-head" style={{ borderRadius: "16px 16px 0 0", display: "flex", justifyContent: "space-between" }}>
          <span>{benchmark?.name ?? `Benchmark #${benchmarkId}`}</span>
          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10 }}>v{version}</span>
        </div>

        {runs.length === 0 ? (
          <div className="empty-state" style={{ minHeight: 200, padding: 24 }}>
            <div style={{ color: "var(--ink-faint)", fontSize: 13 }}>No sealed runs for v{version}</div>
          </div>
        ) : (
          <>
            {runs.map((r, i) => {
              const isSelected = selectedRun?.run_id === r.run_id;
              return (
                <button
                  key={r.run_id}
                  onClick={() => setSelectedRun(r)}
                  style={{
                    width: "100%",
                    display: "grid",
                    gridTemplateColumns: "32px 1fr 72px",
                    padding: "12px 16px",
                    borderBottom: "1px solid rgba(201,195,232,.08)",
                    alignItems: "center",
                    background: isSelected ? "rgba(78,71,160,.3)" : "transparent",
                    borderLeft: isSelected ? "3px solid var(--orange)" : "3px solid transparent",
                    cursor: "pointer",
                    textAlign: "left",
                    gap: 10,
                    transition: "background 150ms",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "Sora, sans-serif",
                      fontSize: 18,
                      fontWeight: 800,
                      color: i === 0 ? "var(--orange)" : i === 1 ? "var(--ink-dim)" : "var(--ink-faint)",
                    }}
                  >
                    {i + 1}
                  </span>
                  <div>
                    <div style={{ fontFamily: "Sora, sans-serif", fontSize: 13, fontWeight: 600, color: "var(--ink)", marginBottom: 4 }}>{r.model_name}</div>
                    <ScoreBarWide bps={r.final_score_bps} />
                  </div>
                  <div
                    style={{
                      fontFamily: "JetBrains Mono, monospace",
                      fontSize: 12,
                      color: "var(--green)",
                      textAlign: "right",
                    }}
                  >
                    {scoreBpsToPercent(r.final_score_bps)}
                  </div>
                </button>
              );
            })}
          </>
        )}

        {/* Seal action */}
        <div style={{ padding: 16, borderTop: "1px solid rgba(201,195,232,.08)" }}>
          {snapshot ? (
            <div>
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--ink-faint)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Snapshot</div>
              <div className="digest" style={{ fontSize: 10 }}>{snapshot.digest.slice(0, 20)}...</div>
            </div>
          ) : (
            <>
              {!account && <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--ink-faint)" }}>Connect wallet to seal</div>}
              {account && !isCorrectChain && <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--red)" }}>Wrong network</div>}
              {error && <div className="error-banner" style={{ fontSize: 11, marginBottom: 10 }}>{error}</div>}
              {sealResult && <div className="success-banner" style={{ fontSize: 11, marginBottom: 10 }}>{sealResult}</div>}
              {canSeal && (
                <button className="btn-p" style={{ width: "100%", fontSize: 12 }} onClick={handleSeal} disabled={sealing}>
                  {sealing ? "Sealing..." : "Seal Leaderboard"}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Right: Run detail */}
      <div style={{ ...panelStyle }}>
        {selectedRun ? (
          <>
            <div className="section-head" style={{ borderRadius: "16px 16px 0 0", display: "flex", justifyContent: "space-between" }}>
              <span>Run #{selectedRun.run_id} - {selectedRun.model_name}</span>
              <Link href={`/runs/${selectedRun.run_id}`} style={{ color: "var(--orange)", fontSize: 11, textDecoration: "none", fontFamily: "JetBrains Mono, monospace" }}>
                Full Receipt
              </Link>
            </div>
            <div style={{ padding: "28px 32px" }}>
              <div style={{ marginBottom: 28 }}>
                <div style={{ fontFamily: "Sora, sans-serif", fontSize: 60, fontWeight: 800, color: "var(--green)", lineHeight: 1 }}>
                  {scoreBpsToPercent(selectedRun.final_score_bps)}
                </div>
                <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "var(--ink-faint)", marginTop: 6 }}>
                  {selectedRun.final_score_bps.toLocaleString()} bps - Sealed {new Date(selectedRun.sealed_at * 1000).toLocaleDateString()}
                </div>
              </div>

              {dims.length > 0 && (() => {
                const bands: Record<string, number> = (() => {
                  try { return JSON.parse(selectedRun.dimension_bands_json); } catch { return {}; }
                })();
                return (
                  <div style={{ marginBottom: 28 }}>
                    <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--ink-faint)", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      Dimension Breakdown
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {dims.map((dim) => {
                        const band = bands[dim] ?? 0;
                        const pct = (band / 4) * 100;
                        return (
                          <div key={dim} style={{ display: "grid", gridTemplateColumns: "180px 1fr 32px", alignItems: "center", gap: 14 }}>
                            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "var(--ink-dim)" }}>
                              {dim.replace(/_/g, " ")}
                            </span>
                            <div className="score-bar-track">
                              <div className="score-bar-fill" style={{ width: `${pct}%` }} />
                            </div>
                            <span className={`band-chip band-${band}`}>{band}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {selectedRun.rationale && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--ink-faint)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Validator Rationale
                  </div>
                  <p style={{ fontSize: 13, fontFamily: "Inter, sans-serif", color: "var(--ink-dim)", lineHeight: 1.7, margin: 0, maxWidth: 600 }}>
                    {selectedRun.rationale}
                  </p>
                </div>
              )}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 16,
                  borderTop: "1px solid rgba(201,195,232,.1)",
                  paddingTop: 20,
                }}
              >
                {[
                  { label: "Submitter", value: selectedRun.submitter.slice(0, 12) + "..." },
                  { label: "Version", value: `v${selectedRun.version}` },
                  { label: "Status", value: runStatusLabel(selectedRun.status as 0) },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--ink-faint)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
                    <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "var(--ink)" }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="empty-state" style={{ minHeight: 300 }}>
            <div style={{ color: "var(--ink-faint)" }}>Select a run from the leaderboard</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LeaderboardPage() {
  const params = useParams();
  const benchmarkId = parseInt(params.id as string, 10);
  const version = parseInt(params.version as string, 10);

  return (
    <ContractGuard>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 24px 40px" }}>
        <div style={{ marginBottom: 24 }}>
          <Link
            href={`/benchmarks/${benchmarkId}`}
            style={{ color: "var(--ink-faint)", fontSize: 13, textDecoration: "none", fontFamily: "JetBrains Mono, monospace" }}
          >
            - Benchmark #{benchmarkId}
          </Link>
          <h1 style={{ fontFamily: "Sora, sans-serif", fontSize: 24, fontWeight: 800, margin: "6px 0 0", color: "var(--ink)" }}>
            Leaderboard - v{version}
          </h1>
        </div>
        <LeaderboardContent benchmarkId={benchmarkId} version={version} />
      </div>
    </ContractGuard>
  );
}
