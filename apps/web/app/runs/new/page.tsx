"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { commitRun, listBenchmarks, getBenchmark, listRuns, BenchmarkInfo } from "@/lib/genlayer/contract";
import { useWallet } from "@/components/WalletProvider";
import { ContractGuard } from "@/components/ContractGuard";
import { TxStatus } from "@/components/TxStatus";
import { Suspense } from "react";
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

function RunSubmitForm() {
  const searchParams = useSearchParams();
  const defaultBenchmark = searchParams.get("benchmark") ?? "";
  const { account, isCorrectChain } = useWallet();

  const [benchmarks, setBenchmarks] = useState<BenchmarkInfo[]>([]);
  const [selectedBenchmark, setSelectedBenchmark] = useState<BenchmarkInfo | null>(null);
  const [form, setForm] = useState({
    benchmarkId: defaultBenchmark,
    version: "1",
    modelName: "",
    runManifestUrl: "",
    runManifestDigest: "",
    sampleBundleUrl: "",
    sampleBundleDigest: "",
    deterministicMetrics: JSON.stringify({ accuracy: 0.0, exact_match: 0.0 }, null, 2),
  });
  const [submitting, setSubmitting] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    listBenchmarks(0, 100).then(setBenchmarks).catch(() => {});
  }, []);

  useEffect(() => {
    if (form.benchmarkId) {
      getBenchmark(parseInt(form.benchmarkId, 10))
        .then(setSelectedBenchmark)
        .catch(() => setSelectedBenchmark(null));
    }
  }, [form.benchmarkId]);

  const canSubmit = account && isCorrectChain && form.benchmarkId && form.modelName && form.runManifestUrl && form.sampleBundleUrl;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setSubmitting(true);

    try {
      JSON.parse(form.deterministicMetrics);
      const runManifestDigest = form.runManifestDigest || await computeSHA256(form.runManifestUrl);
      const sampleBundleDigest = form.sampleBundleDigest || await computeSHA256(form.sampleBundleUrl);
      const exec = await commitRun(
        parseInt(form.benchmarkId, 10),
        parseInt(form.version, 10),
        form.modelName,
        form.runManifestUrl,
        runManifestDigest,
        form.deterministicMetrics,
        form.sampleBundleUrl,
        sampleBundleDigest,
        (hash) => {
          setTxHash(hash);
          sessionStorage.setItem("benchseal_pending_tx_commit_run", JSON.stringify({ txHash: hash, ts: Date.now() }));
        },
        (status) => setTxStatus(status),
      );

      sessionStorage.removeItem("benchseal_pending_tx_commit_run");
      if (exec.status === "ROLLBACK") {
        setError(exec.errorMessage ?? "Transaction rolled back");
        return;
      }
      const bid = parseInt(form.benchmarkId, 10);
      const runs = await listRuns(bid, 0, 100);
      const newest = runs.length > 0 ? runs[runs.length - 1] : null;
      const runId = newest?.run_id ?? null;
      setResult(runId !== null ? `Run #${runId} committed` : "Run committed");
      setTimeout(() => { window.location.href = runId !== null ? `/runs/${runId}` : `/benchmarks/${bid}`; }, 1000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const dims: string[] = selectedBenchmark
    ? (() => { try { return JSON.parse(selectedBenchmark.dimensions_json); } catch { return []; } })()
    : [];

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "32px 24px 60px" }}>
      <div style={{ marginBottom: 32 }}>
        <h1
          style={{ fontFamily: "Sora, sans-serif", fontSize: 28, fontWeight: 800, margin: "0 0 8px" }}
          className="grad"
        >
          Submit Run
        </h1>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 14, color: "var(--ink-dim)", margin: 0 }}>
          Commit an off-chain model run for consensus scoring
        </p>
      </div>

      {!account && <div className="error-banner" style={{ marginBottom: 20 }}>Connect wallet to submit a run</div>}
      {account && !isCorrectChain && <div className="error-banner" style={{ marginBottom: 20 }}>Switch to StudioNet (chain 61999)</div>}

      <div className="glass" style={{ padding: 32 }}>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div>
            <label style={labelStyle}>Benchmark</label>
            {benchmarks.length > 0 ? (
              <select
                className="field-input"
                value={form.benchmarkId}
                onChange={(e) => setForm({ ...form, benchmarkId: e.target.value, version: "1" })}
                required
              >
                <option value="">Select benchmark...</option>
                {benchmarks.map((b) => (
                  <option key={b.benchmark_id} value={b.benchmark_id}>
                    #{b.benchmark_id} {b.name} (v{b.current_version})
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="field-input"
                type="number"
                placeholder="Benchmark ID"
                value={form.benchmarkId}
                onChange={(e) => setForm({ ...form, benchmarkId: e.target.value })}
                required
              />
            )}
          </div>

          {selectedBenchmark && dims.length > 0 && (
            <div
              style={{
                padding: 16,
                background: "rgba(78,71,160,.2)",
                border: "1px solid rgba(201,195,232,.14)",
                borderRadius: 12,
              }}
            >
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--ink-faint)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Dimensions to be scored
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {dims.map((d: string) => (
                  <span key={d} className="tag tag-committed">{d.replace(/_/g, " ")}</span>
                ))}
              </div>
            </div>
          )}

          <div>
            <label style={labelStyle}>Version</label>
            <input
              className="field-input"
              type="number"
              min="1"
              value={form.version}
              onChange={(e) => setForm({ ...form, version: e.target.value })}
              required
            />
          </div>

          <div>
            <label style={labelStyle}>Model Name</label>
            <input
              className="field-input"
              placeholder="e.g. GPT-4o, Claude-3.5-Sonnet, Llama-3.1-70B"
              value={form.modelName}
              onChange={(e) => setForm({ ...form, modelName: e.target.value })}
              required
            />
          </div>

          <div>
            <label style={labelStyle}>Run Manifest URL</label>
            <input
              className="field-input"
              placeholder="https://... or ipfs://..."
              value={form.runManifestUrl}
              onChange={(e) => setForm({ ...form, runManifestUrl: e.target.value })}
              required
            />
            <p style={hintStyle}>Public URL to the run manifest JSON (task prompts, model params, execution metadata)</p>
          </div>

          <div>
            <label style={labelStyle}>Run Manifest Digest</label>
            <input
              className="field-input"
              placeholder="sha256:..."
              value={form.runManifestDigest}
              onChange={(e) => setForm({ ...form, runManifestDigest: e.target.value })}
            />
            <p style={hintStyle}>SHA-256 of the manifest file. Leave blank to use a URL-based placeholder.</p>
          </div>

          <div>
            <label style={labelStyle}>Sample Bundle URL</label>
            <input
              className="field-input"
              placeholder="https://... or ipfs://..."
              value={form.sampleBundleUrl}
              onChange={(e) => setForm({ ...form, sampleBundleUrl: e.target.value })}
              required
            />
            <p style={hintStyle}>Public URL to the sample bundle (model outputs for validator inspection)</p>
          </div>

          <div>
            <label style={labelStyle}>Sample Bundle Digest</label>
            <input
              className="field-input"
              placeholder="sha256:..."
              value={form.sampleBundleDigest}
              onChange={(e) => setForm({ ...form, sampleBundleDigest: e.target.value })}
            />
          </div>

          <div>
            <label style={labelStyle}>Deterministic Metrics (JSON)</label>
            <textarea
              className="field-input"
              rows={5}
              value={form.deterministicMetrics}
              onChange={(e) => setForm({ ...form, deterministicMetrics: e.target.value })}
            />
            <p style={hintStyle}>Deterministic metrics computed before submission (accuracy, exact_match, BLEU, etc.)</p>
          </div>

          {result && <div className="success-banner" aria-live="polite">{result} - redirecting...</div>}
          <div aria-live="polite">
            <TxStatus txHash={txHash} status={txStatus} error={error} />
          </div>

          <div style={{ display: "flex", gap: 12, paddingTop: 4 }}>
            <button type="submit" className="btn-p" disabled={!canSubmit || submitting}>
              {submitting ? (txHash ? "Awaiting consensus..." : "Submitting...") : "Commit Run"}
            </button>
            <a href="/" className="btn-g">Cancel</a>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function RunNewPage() {
  return (
    <ContractGuard>
      <Suspense fallback={<div className="empty-state" style={{ color: "var(--ink-faint)" }}>Loading...</div>}>
        <RunSubmitForm />
      </Suspense>
    </ContractGuard>
  );
}
