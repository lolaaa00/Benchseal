"use client";

import { useState } from "react";
import { createBenchmark, parseReturnedId } from "@/lib/genlayer/contract";
import { useWallet } from "@/components/WalletProvider";
import { TxStatus } from "@/components/TxStatus";
import { computeSHA256 } from "@/lib/crypto";

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
  const { account, isCorrectChain, walletMode } = useWallet();

  const [form, setForm] = useState({
    name: "",
    rubricUrl: "",
    rubricContent: "",
    dimensionsRaw: "factual_grounding, instruction_adherence, usefulness",
    samplingPolicy: JSON.stringify({ sample_rate: 0.1, min_samples: 10 }, null, 2),
  });
  const [computedDigest, setComputedDigest] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const canSubmit =
    account && isCorrectChain && form.name && form.rubricUrl && form.rubricContent;

  async function onRubricContentChange(content: string) {
    setForm((f) => ({ ...f, rubricContent: content }));
    if (content.trim()) {
      const digest = await computeSHA256(content);
      setComputedDigest(digest);
    } else {
      setComputedDigest(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setSubmitting(true);

    try {
      if (!form.rubricContent.trim()) {
        throw new Error("Rubric content is required. Paste the rubric text to commit its digest.");
      }
      const dims = form.dimensionsRaw
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean);
      if (dims.length === 0) throw new Error("At least one dimension is required");

      const policy = form.samplingPolicy;
      JSON.parse(policy); // validate JSON

      // Compute real digest from actual rubric content
      const rubricDigest = await computeSHA256(form.rubricContent);

      const mode = walletMode === "none" ? undefined : (walletMode as "injected" | "generated");
      const exec = await createBenchmark(
        form.name,
        form.rubricUrl,
        rubricDigest,
        JSON.stringify(dims),
        policy,
        (hash) => {
          setTxHash(hash);
          sessionStorage.setItem("benchseal_pending_tx_create_benchmark", JSON.stringify({ txHash: hash, ts: Date.now() }));
        },
        (status) => setTxStatus(status),
        mode,
      );

      sessionStorage.removeItem("benchseal_pending_tx_create_benchmark");
      if (exec.status === "ROLLBACK") {
        setError(exec.errorMessage ?? "Transaction rolled back");
        return;
      }

      const benchmarkId = parseReturnedId(exec);
      setResult(benchmarkId !== null ? `Benchmark #${benchmarkId} created` : "Benchmark created");
      setTimeout(() => {
        window.location.href = benchmarkId !== null ? `/benchmarks/${benchmarkId}` : "/";
      }, 1500);
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

      <div className="glass" style={{ padding: 32 }}>
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
            <label style={labelStyle}>Rubric Content <span style={{ color: "var(--orange)" }}>*</span></label>
            <textarea
              className="field-input"
              rows={10}
              placeholder="Paste the full rubric text here. The SHA-256 digest is computed in-browser and committed on-chain. Validators will judge runs against exactly this content."
              value={form.rubricContent}
              onChange={(e) => onRubricContentChange(e.target.value)}
              required
            />
            {computedDigest && (
              <p style={{ ...hintStyle, color: "var(--green)", fontFamily: "JetBrains Mono, monospace", fontSize: 10, wordBreak: "break-all" }}>
                Digest: {computedDigest}
              </p>
            )}
            <p style={hintStyle}>
              The digest of this exact content will be stored on-chain. When scoring a run, you must supply this same rubric text.
            </p>
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
            <p style={hintStyle}>Semantic dimensions validators will score (1–32, underscore_separated)</p>
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

          {result && <div className="success-banner" aria-live="polite">{result} — redirecting...</div>}
          <div aria-live="polite">
            <TxStatus txHash={txHash} status={txStatus} error={error} />
          </div>

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
