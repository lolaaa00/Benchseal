"use client";

import { useState } from "react";
import { createBenchmark, listBenchmarks } from "@/lib/genlayer/contract";
import { useWallet } from "@/components/WalletProvider";

const labelStyle: React.CSSProperties = {
  fontFamily: "Sora, sans-serif",
  fontSize: 12,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--ink-faint)",
  display: "block",
  marginBottom: 8,
};

const hintStyle: React.CSSProperties = {
  fontFamily: "JetBrains Mono, monospace",
  fontSize: 11,
  color: "var(--ink-faint)",
  marginTop: 6,
};

export default function CreateBenchmarkPage() {
  const { account, isCorrectChain } = useWallet();

  const [form, setForm] = useState({
    name: "",
    rubricUrl: "",
    rubricDigest: "",
    dimensionsRaw: "factual_grounding, instruction_adherence, usefulness",
    samplingPolicy: JSON.stringify({ sample_rate: 0.1, min_samples: 10 }, null, 2),
  });
  const [submitting, setSubmitting] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const canSubmit = account && isCorrectChain && form.name && form.rubricUrl && form.rubricDigest;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setSubmitting(true);

    try {
      const dims = form.dimensionsRaw
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean);
      if (dims.length === 0) throw new Error("At least one dimension is required");

      const policy = form.samplingPolicy;
      JSON.parse(policy); // validate

      const exec = await createBenchmark(
        form.name,
        form.rubricUrl,
        form.rubricDigest,
        JSON.stringify(dims),
        policy,
        (hash) => setTxHash(hash)
      );

      if (exec.status === "ROLLBACK") {
        setError(exec.errorMessage ?? "Transaction rolled back");
        return;
      }
      const all = await listBenchmarks(0, 100);
      const newest = all.length > 0 ? all[all.length - 1] : null;
      const benchmarkId = newest?.benchmark_id ?? null;
      setResult(benchmarkId !== null ? `Benchmark #${benchmarkId} created` : "Benchmark created");
      setTimeout(() => { window.location.href = benchmarkId !== null ? `/benchmarks/${benchmarkId}` : "/"; }, 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "32px 24px 60px" }}>
      <div style={{ marginBottom: 32 }}>
        <h1
          style={{
            fontFamily: "Sora, sans-serif",
            fontSize: 28,
            fontWeight: 800,
            margin: "0 0 8px",
          }}
          className="grad"
        >
          Register Benchmark
        </h1>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 14, color: "var(--ink-dim)", margin: 0 }}>
          Create a new benchmark specification on BenchSeal
        </p>
      </div>

      {!account && (
        <div className="error-banner" style={{ marginBottom: 20 }}>
          Connect your wallet to register a benchmark
        </div>
      )}
      {account && !isCorrectChain && (
        <div className="error-banner" style={{ marginBottom: 20 }}>
          Switch to StudioNet (chain 61999) to submit
        </div>
      )}

      <div
        className="glass"
        style={{ padding: 32 }}
      >
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div>
            <label style={labelStyle}>Benchmark Name</label>
            <input
              className="field-input"
              placeholder="e.g. MathBench-2025"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>

          <div>
            <label style={labelStyle}>Rubric URL</label>
            <input
              className="field-input"
              placeholder="https://... or ipfs://..."
              value={form.rubricUrl}
              onChange={(e) => setForm({ ...form, rubricUrl: e.target.value })}
              required
            />
            <p style={hintStyle}>Public URL to the rubric document (IPFS, GitHub raw, or any HTTPS URL)</p>
          </div>

          <div>
            <label style={labelStyle}>Rubric Digest</label>
            <input
              className="field-input"
              placeholder="sha256:abc123..."
              value={form.rubricDigest}
              onChange={(e) => setForm({ ...form, rubricDigest: e.target.value })}
              required
            />
            <p style={hintStyle}>SHA-256 digest of the rubric file for integrity verification</p>
          </div>

          <div>
            <label style={labelStyle}>Dimensions (comma-separated)</label>
            <input
              className="field-input"
              placeholder="factual_grounding, instruction_adherence, usefulness"
              value={form.dimensionsRaw}
              onChange={(e) => setForm({ ...form, dimensionsRaw: e.target.value })}
              required
            />
            <p style={hintStyle}>Semantic dimensions validators will score (1-32, underscore_separated)</p>
          </div>

          <div>
            <label style={labelStyle}>Sampling Policy (JSON)</label>
            <textarea
              className="field-input"
              rows={4}
              value={form.samplingPolicy}
              onChange={(e) => setForm({ ...form, samplingPolicy: e.target.value })}
            />
          </div>

          {error && <div className="error-banner">{error}</div>}
          {result && <div className="success-banner">{result} - redirecting...</div>}

          {submitting && txHash && (
            <div style={{ padding: "12px 16px", background: "rgba(78,71,160,.25)", border: "1px solid rgba(201,195,232,.2)", borderRadius: 12 }}>
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--orange)", marginBottom: 6 }}>
                Transaction submitted - waiting for consensus...
              </div>
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--ink-faint)", wordBreak: "break-all" }}>
                {txHash}
              </div>
              <div style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: "var(--ink-faint)", marginTop: 6 }}>
                GenLayer consensus typically takes 30-90 seconds. This page will redirect automatically.
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 12, paddingTop: 4 }}>
            <button type="submit" className="btn-p" disabled={!canSubmit || submitting}>
              {submitting ? (txHash ? "Awaiting consensus..." : "Submitting...") : "Register Benchmark"}
            </button>
            <a href="/" className="btn-g">Cancel</a>
          </div>
        </form>
      </div>
    </div>
  );
}
