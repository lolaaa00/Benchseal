"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listBenchmarks, BenchmarkInfo } from "@/lib/genlayer/contract";
import { ContractGuard } from "@/components/ContractGuard";

function BenchmarkCard({ b }: { b: BenchmarkInfo }) {
  const dims: string[] = (() => {
    try { return JSON.parse(b.dimensions_json); } catch { return []; }
  })();

  return (
    <Link href={`/benchmarks/${b.benchmark_id}`} style={{ textDecoration: "none", color: "inherit" }}>
      <div
        className="glass"
        style={{
          padding: "20px 24px",
          cursor: "pointer",
          display: "grid",
          gridTemplateColumns: "48px 1fr auto",
          alignItems: "center",
          gap: 16,
          borderRadius: 16,
        }}
      >
        {/* ID */}
        <span
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 13,
            fontWeight: 600,
            color: "var(--orange)",
          }}
        >
          #{b.benchmark_id}
        </span>

        {/* Name + meta */}
        <div>
          <div
            style={{
              fontFamily: "Sora, sans-serif",
              fontSize: 15,
              fontWeight: 700,
              color: "var(--ink)",
              marginBottom: 4,
            }}
          >
            {b.name}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span className="digest">{b.owner.slice(0, 10)}...</span>
            <span
              style={{
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 11,
                color: "var(--ink-faint)",
              }}
            >
              v{b.current_version}
            </span>
            <span
              style={{
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 11,
                color: "var(--ink-faint)",
              }}
            >
              {b.run_count} runs
            </span>
          </div>
        </div>

        {/* Dimension tags */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 240 }}>
          {dims.slice(0, 3).map((d: string) => (
            <span key={d} className="tag tag-committed" style={{ fontSize: 10 }}>
              {d.replace(/_/g, " ")}
            </span>
          ))}
          {dims.length > 3 && (
            <span className="tag" style={{ fontSize: 10, color: "var(--ink-faint)", background: "rgba(78,71,160,.2)", border: "1px solid rgba(201,195,232,.15)" }}>
              +{dims.length - 3}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function RegistryContent() {
  const [benchmarks, setBenchmarks] = useState<BenchmarkInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listBenchmarks(0, 100)
      .then(setBenchmarks)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="empty-state">
        <div style={{ fontFamily: "JetBrains Mono, monospace", color: "var(--ink-faint)", fontSize: 13 }}>
          Loading registry...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <div className="error-banner">{error}</div>
      </div>
    );
  }

  if (benchmarks.length === 0) {
    return (
      <div className="empty-state" style={{ minHeight: "50vh" }}>
        <div
          style={{
            fontFamily: "Sora, sans-serif",
            fontSize: 36,
            fontWeight: 800,
            color: "rgba(201,195,232,.2)",
            marginBottom: 16,
          }}
        >
          No Benchmarks
        </div>
        <p style={{ color: "var(--ink-dim)", marginBottom: 24, fontSize: 14, fontFamily: "Inter, sans-serif" }}>
          No benchmarks have been registered yet.
        </p>
        <Link href="/benchmarks/create" className="btn-p">
          Register First Benchmark
        </Link>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {benchmarks.map((b) => (
        <BenchmarkCard key={b.benchmark_id} b={b} />
      ))}
    </div>
  );
}

export default function RegistryPage() {
  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>
      {/* Page header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <div className="badge">
            <div className="badge-dot" />
            StudioNet - Chain 61999
          </div>
        </div>
        <h1
          style={{
            fontFamily: "Sora, sans-serif",
            fontSize: 32,
            fontWeight: 800,
            margin: "0 0 8px",
            lineHeight: 1.1,
          }}
          className="grad"
        >
          Benchmark Registry
        </h1>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <p
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: 14,
              color: "var(--ink-dim)",
              margin: 0,
            }}
          >
            Consensus-certified AI benchmark runs on GenLayer
          </p>
          <Link href="/benchmarks/create" className="btn-p" style={{ fontSize: 13, padding: "9px 20px" }}>
            + New Benchmark
          </Link>
        </div>
      </div>

      {/* Hero / product explanation */}
      <div
        style={{
          background: "rgba(38,34,98,.3)",
          border: "1.5px solid rgba(201,195,232,.12)",
          borderRadius: 20,
          padding: "28px 32px",
          marginBottom: 32,
        }}
      >
        <p
          style={{
            fontFamily: "Inter, sans-serif",
            fontSize: 15,
            color: "var(--ink)",
            margin: "0 0 20px",
            lineHeight: 1.6,
            fontWeight: 500,
          }}
        >
          Model evaluation happens off-chain. Certification happens on GenLayer.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 20 }}>
          {[
            { n: "1", title: "Submit Run", desc: "Commit your model's manifest URL and sample output bundle on-chain" },
            { n: "2", title: "Validators Score", desc: "GenLayer validators independently score each quality dimension (0–4)" },
            { n: "3", title: "Sealed On-Chain", desc: "Consensus seals the result — immutable, verifiable, trustless" },
          ].map(({ n, title, desc }) => (
            <div key={n} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <span style={{
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 13,
                fontWeight: 700,
                color: "var(--orange)",
                minWidth: 20,
              }}>
                {n}.
              </span>
              <div>
                <div style={{ fontFamily: "Sora, sans-serif", fontSize: 13, fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>{title}</div>
                <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: "var(--ink-dim)", lineHeight: 1.5 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: "var(--ink-dim)", margin: 0, lineHeight: 1.6 }}>
          Without consensus, a single party decides if your model passes. BenchSeal removes that trust assumption — no lab can certify its own results.
        </p>
      </div>

      <ContractGuard>
        <RegistryContent />
      </ContractGuard>
    </div>
  );
}
