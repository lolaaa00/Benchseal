"use client";

import { useEffect, useState } from "react";
import {
  listBenchmarks,
  listRuns,
  getRun,
  BenchmarkInfo,
  RunInfo,
  RunStatus,
} from "@/lib/genlayer/contract";
import { ContractGuard } from "@/components/ContractGuard";

interface AtlasCell {
  benchmarkId: number;
  benchmarkName: string;
  dimension: string;
  band: number;
  runId: number;
  modelName: string;
}

function BandCell({ band, count }: { band: number; count: number }) {
  const colors = [
    "rgba(255,90,90,",
    "rgba(241,102,35,",
    "rgba(201,195,232,",
    "rgba(61,220,138,",
    "rgba(61,220,138,",
  ];
  const opacity = Math.min(0.8, 0.15 + count * 0.2);
  const bg = colors[band] + opacity + ")";

  return (
    <div
      style={{
        width: "100%",
        height: 52,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: bg,
        border: "1px solid rgba(201,195,232,.08)",
      }}
    >
      {count > 0 && (
        <>
          <span style={{ fontFamily: "Sora, sans-serif", fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>{band}</span>
          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "var(--ink-faint)" }}>{count}x</span>
        </>
      )}
    </div>
  );
}

function AtlasContent() {
  const [cells, setCells] = useState<AtlasCell[]>([]);
  const [benchmarks, setBenchmarks] = useState<BenchmarkInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const bs = await listBenchmarks(0, 50);
      setBenchmarks(bs);

      const allCells: AtlasCell[] = [];
      for (const b of bs) {
        try {
          const runSummaries = await listRuns(b.benchmark_id, 0, 100);
          const sealedSummaries = runSummaries.filter((r) => r.status === RunStatus.SEALED);
          const fullRuns: RunInfo[] = await Promise.all(
            sealedSummaries.map((r) => getRun(r.run_id))
          );
          const dims: string[] = (() => {
            try { return JSON.parse(b.dimensions_json); } catch { return []; }
          })();

          for (const run of fullRuns) {
            const bands: Record<string, number> = (() => {
              try { return JSON.parse(run.dimension_bands_json); } catch { return {}; }
            })();
            for (const dim of dims) {
              const band = bands[dim];
              if (band !== undefined) {
                allCells.push({
                  benchmarkId: b.benchmark_id,
                  benchmarkName: b.name,
                  dimension: dim,
                  band,
                  runId: run.run_id,
                  modelName: run.model_name,
                });
              }
            }
          }
        } catch {
          // Skip benchmarks that error
        }
      }
      setCells(allCells);
    }

    load()
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="empty-state" style={{ color: "var(--ink-faint)" }}>Loading atlas...</div>;
  if (error) return <div style={{ padding: 24 }}><div className="error-banner">{error}</div></div>;

  const allDims = Array.from(new Set(cells.map((c) => c.dimension))).sort();

  if (allDims.length === 0) {
    return (
      <div className="empty-state" style={{ minHeight: "50vh" }}>
        <div
          style={{
            fontFamily: "Sora, sans-serif",
            fontSize: 32,
            fontWeight: 800,
            color: "rgba(201,195,232,.2)",
            marginBottom: 16,
          }}
        >
          Atlas Empty
        </div>
        <p style={{ color: "var(--ink-dim)", fontSize: 14, fontFamily: "Inter, sans-serif" }}>
          No sealed runs yet. Score some runs to populate the failure atlas.
        </p>
      </div>
    );
  }

  const matrix: Record<string, Record<number, AtlasCell[]>> = {};
  for (const dim of allDims) {
    matrix[dim] = {};
    for (const b of benchmarks) {
      matrix[dim][b.benchmark_id] = cells.filter(
        (c) => c.dimension === dim && c.benchmarkId === b.benchmark_id
      );
    }
  }

  const bandDist: Record<string, Record<number, number>> = {};
  for (const dim of allDims) {
    bandDist[dim] = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
    cells
      .filter((c) => c.dimension === dim)
      .forEach((c) => { bandDist[dim][c.band] = (bandDist[dim][c.band] ?? 0) + 1; });
  }

  const activeBenchmarks = benchmarks.filter((b) =>
    cells.some((c) => c.benchmarkId === b.benchmark_id)
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32, paddingBottom: 40 }}>
      {/* Matrix view */}
      <div
        style={{
          background: "rgba(16,12,41,.5)",
          border: "1.5px solid rgba(201,195,232,.1)",
          borderRadius: 16,
          overflow: "hidden",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `200px repeat(${activeBenchmarks.length}, 120px)`,
            }}
          >
            {/* Header row */}
            <div className="section-head" style={{ padding: "10px 16px" }}>Dimension</div>
            {activeBenchmarks.map((b) => (
              <div
                key={b.benchmark_id}
                className="section-head"
                style={{ padding: "10px 8px", borderLeft: "1px solid rgba(201,195,232,.08)", textAlign: "center" }}
              >
                <div>{b.name.slice(0, 12)}</div>
                <div style={{ color: "var(--ink-faint)", fontSize: 9, marginTop: 2 }}>#{b.benchmark_id}</div>
              </div>
            ))}

            {/* Data rows */}
            {allDims.map((dim) => (
              <>
                <div
                  key={`label-${dim}`}
                  style={{
                    padding: "8px 16px",
                    borderBottom: "1px solid rgba(201,195,232,.06)",
                    borderTop: "1px solid rgba(201,195,232,.06)",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--ink-dim)" }}>
                    {dim.replace(/_/g, " ")}
                  </span>
                </div>
                {activeBenchmarks.map((b) => {
                  const dimCells = matrix[dim]?.[b.benchmark_id] ?? [];
                  if (dimCells.length === 0) {
                    return (
                      <div
                        key={`empty-${dim}-${b.benchmark_id}`}
                        style={{
                          borderLeft: "1px solid rgba(201,195,232,.06)",
                          borderBottom: "1px solid rgba(201,195,232,.06)",
                          background: "rgba(16,12,41,.3)",
                        }}
                      />
                    );
                  }
                  const avgBand = Math.round(
                    dimCells.reduce((sum, c) => sum + c.band, 0) / dimCells.length
                  );
                  return (
                    <div
                      key={`cell-${dim}-${b.benchmark_id}`}
                      style={{ borderLeft: "1px solid rgba(201,195,232,.06)", borderBottom: "1px solid rgba(201,195,232,.06)" }}
                    >
                      <BandCell band={avgBand} count={dimCells.length} />
                    </div>
                  );
                })}
              </>
            ))}
          </div>
        </div>
      </div>

      {/* Band distribution */}
      <div
        style={{
          background: "rgba(16,12,41,.5)",
          border: "1.5px solid rgba(201,195,232,.1)",
          borderRadius: 16,
          padding: 24,
        }}
      >
        <div
          style={{
            fontFamily: "Sora, sans-serif",
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "var(--ink-faint)",
            marginBottom: 20,
          }}
        >
          Band Distribution by Dimension
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {allDims.map((dim) => {
            const dist = bandDist[dim];
            const total = Object.values(dist).reduce((a, b) => a + b, 0);
            return (
              <div key={dim}>
                <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 6 }}>
                  <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "var(--ink-dim)", minWidth: 200 }}>
                    {dim.replace(/_/g, " ")}
                  </span>
                  <div style={{ display: "flex", gap: 6, flex: 1, alignItems: "flex-end" }}>
                    {[0, 1, 2, 3, 4].map((band) => {
                      const count = dist[band] ?? 0;
                      const pct = total > 0 ? (count / total) * 100 : 0;
                      const colors = ["var(--red)", "var(--orange2)", "var(--ink-dim)", "var(--green)", "var(--green)"];
                      return (
                        <div key={band} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                          <div
                            style={{
                              width: 32,
                              height: Math.max(4, pct * 0.8),
                              background: colors[band],
                              borderRadius: "4px 4px 0 0",
                              opacity: 0.7,
                              transition: "height 0.3s",
                            }}
                          />
                          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "var(--ink-faint)", marginTop: 2 }}>
                            {count}
                          </span>
                          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "var(--ink-faint)" }}>
                            {band}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent failures */}
      <div
        style={{
          background: "rgba(16,12,41,.5)",
          border: "1.5px solid rgba(201,195,232,.1)",
          borderRadius: 16,
          padding: 24,
        }}
      >
        <div
          style={{
            fontFamily: "Sora, sans-serif",
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "var(--ink-faint)",
            marginBottom: 16,
          }}
        >
          Recent Failures (Band 0-1)
        </div>
        {cells
          .filter((c) => c.band <= 1)
          .slice(0, 20)
          .map((c, i) => (
            <div
              key={i}
              className="timing-row"
              style={{
                display: "grid",
                gridTemplateColumns: "140px 180px 200px 40px 60px",
                padding: "10px 0",
                alignItems: "center",
                gap: 16,
              }}
            >
              <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--ink)" }}>
                {c.benchmarkName.slice(0, 14)}
              </span>
              <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--ink-faint)" }}>
                {c.dimension.replace(/_/g, " ")}
              </span>
              <span style={{ fontFamily: "Sora, sans-serif", fontSize: 12, fontWeight: 600, color: "var(--ink-dim)" }}>
                {c.modelName}
              </span>
              <span className={`band-chip band-${c.band}`}>{c.band}</span>
              <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--ink-faint)" }}>
                #{c.runId}
              </span>
            </div>
          ))}
        {cells.filter((c) => c.band <= 1).length === 0 && (
          <div style={{ color: "var(--ink-faint)", fontSize: 13, fontFamily: "JetBrains Mono, monospace" }}>
            No failures recorded yet
          </div>
        )}
      </div>
    </div>
  );
}

export default function FailureAtlasPage() {
  return (
    <ContractGuard>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px 40px" }}>
        <div style={{ marginBottom: 32 }}>
          <h1
            style={{ fontFamily: "Sora, sans-serif", fontSize: 32, fontWeight: 800, margin: "0 0 8px" }}
            className="grad"
          >
            Failure Atlas
          </h1>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 14, color: "var(--ink-dim)", margin: 0 }}>
            Semantic memory matrix - dimension performance across benchmarks and models
          </p>
        </div>
        <AtlasContent />
      </div>
    </ContractGuard>
  );
}
