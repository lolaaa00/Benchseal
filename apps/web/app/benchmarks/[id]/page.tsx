"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  getBenchmark,
  listRuns,
  listSnapshots,
  publishVersion,
  BenchmarkInfo,
  RunSummary,
  SnapshotInfo,
  runStatusLabel,
  scoreBpsToPercent,
  RunStatus,
  parseReturnedId,
} from "@/lib/genlayer/contract";
import { ContractGuard } from "@/components/ContractGuard";
import { useWallet } from "@/components/WalletProvider";
import { TxStatus } from "@/components/TxStatus";

function StatusTag({ status }: { status: number }) {
  const label = runStatusLabel(status as 0);
  const cls =
    status === RunStatus.SEALED
      ? "tag-sealed"
      : status === RunStatus.RUN_COMMITTED
      ? "tag-committed"
      : status === RunStatus.SCORING
      ? "tag-scoring"
      : status === RunStatus.ABSTAINED
      ? "tag-abstained"
      : "tag-invalid";
  return <span className={`tag ${cls}`}>{label}</span>;
}

const panelStyle: React.CSSProperties = {
  background: "rgba(16,12,41,.5)",
  border: "1.5px solid rgba(201,195,232,.1)",
  borderRadius: 16,
  backdropFilter: "blur(12px)",
};

function BenchmarkDetail({ id }: { id: number }) {
  const { account, isCorrectChain, walletMode } = useWallet();
  const [benchmark, setBenchmark] = useState<BenchmarkInfo | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPublish, setShowPublish] = useState(false);
  const [publishForm, setPublishForm] = useState({ url: "", digest: "", note: "" });
  const [publishing, setPublishing] = useState(false);
  const [publishTxHash, setPublishTxHash] = useState<string | null>(null);
  const [publishTxStatus, setPublishTxStatus] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  async function handlePublishVersion(e: React.FormEvent) {
    e.preventDefault();
    setPublishError(null);
    setPublishing(true);
    try {
      if (!publishForm.digest || !publishForm.digest.match(/^sha256:[0-9a-f]{64}$/)) {
        throw new Error("A valid SHA-256 digest (sha256:<64 hex chars>) is required for the task manifest.");
      }
      const mode = walletMode === "none" ? undefined : (walletMode as "injected" | "generated");
      const exec = await publishVersion(
        id,
        publishForm.url,
        publishForm.digest,
        publishForm.note || "new version",
        (hash) => setPublishTxHash(hash),
        (status) => setPublishTxStatus(status),
        mode,
      );
      if (exec.status === "ROLLBACK") throw new Error(exec.errorMessage ?? "Transaction rolled back");
      const newVersion = parseReturnedId(exec);
      void newVersion; // version number; page reload will reflect it
      window.location.reload();
    } catch (err: unknown) {
      setPublishError(err instanceof Error ? err.message : String(err));
    } finally {
      setPublishing(false);
    }
  }

  useEffect(() => {
    Promise.all([
      getBenchmark(id),
      listRuns(id, 0, 50),
      listSnapshots(id, 0, 50),
    ])
      .then(([b, r, s]) => {
        setBenchmark(b);
        setRuns(r);
        setSnapshots(s);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="empty-state" style={{ color: "var(--ink-faint)", fontFamily: "JetBrains Mono, monospace" }}>Loading...</div>;
  if (error) return <div style={{ padding: 24 }}><div className="error-banner">{error}</div></div>;
  if (!benchmark) return <div className="empty-state">Benchmark not found</div>;

  const dims: string[] = (() => {
    try { return JSON.parse(benchmark.dimensions_json); } catch { return []; }
  })();

  return (
    <div className="benchmark-layout">
      {/* Left: Spec panel */}
      <div style={{ ...panelStyle, padding: 20, display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ fontFamily: "Sora, sans-serif", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--ink-faint)" }}>
          Benchmark Spec
        </div>

        <div>
          <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--ink-faint)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>Owner</div>
          <div className="digest">{benchmark.owner}</div>
        </div>

        <div>
          <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--ink-faint)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>Rubric URL</div>
          <a
            href={benchmark.rubric_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--orange)", wordBreak: "break-all", textDecoration: "none" }}
          >
            {benchmark.rubric_url}
          </a>
        </div>

        <div>
          <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--ink-faint)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>Rubric Digest</div>
          <div className="digest">{benchmark.rubric_digest}</div>
        </div>

        <div>
          <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--ink-faint)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Dimensions ({dims.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {dims.map((d: string, i: number) => (
              <div key={d} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--ink-faint)", width: 16 }}>{i + 1}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--ink-dim)" }}>{d.replace(/_/g, " ")}</span>
                  </div>
                  <div className="score-bar-track">
                    <div className="score-bar-fill" style={{ width: "100%" }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--ink-faint)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>Current Version</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontFamily: "Sora, sans-serif", fontSize: 24, fontWeight: 700, color: "var(--ink)" }}>
              v{benchmark.current_version}
            </span>
            {account && isCorrectChain && benchmark.owner.toLowerCase() === account.toLowerCase() && (
              <button
                onClick={() => setShowPublish(!showPublish)}
                style={{
                  fontSize: 11,
                  padding: "4px 10px",
                  border: "1px solid rgba(201,195,232,.2)",
                  background: "rgba(38,34,98,.3)",
                  color: "var(--ink-dim)",
                  cursor: "pointer",
                  fontFamily: "JetBrains Mono, monospace",
                  borderRadius: 8,
                  letterSpacing: "0.03em",
                }}
              >
                {showPublish ? "Cancel" : "+ Publish Version"}
              </button>
            )}
          </div>
          {showPublish && (
            <form onSubmit={handlePublishVersion} style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              <input
                className="field-input"
                placeholder="Task manifest URL"
                value={publishForm.url}
                onChange={(e) => setPublishForm({ ...publishForm, url: e.target.value })}
                required
                style={{ fontSize: 12 }}
              />
              <input
                className="field-input"
                placeholder="sha256:<64 hex chars> (required)"
                value={publishForm.digest}
                onChange={(e) => setPublishForm({ ...publishForm, digest: e.target.value })}
                style={{ fontSize: 12 }}
                required
              />
              <input
                className="field-input"
                placeholder="Version note"
                value={publishForm.note}
                onChange={(e) => setPublishForm({ ...publishForm, note: e.target.value })}
                style={{ fontSize: 12 }}
              />
              <div aria-live="polite">
                <TxStatus txHash={publishTxHash} status={publishTxStatus} error={publishError} />
              </div>
              <button type="submit" className="btn-p" disabled={publishing} style={{ fontSize: 12, padding: "8px 14px" }}>
                {publishing ? (publishTxHash ? "Awaiting consensus..." : "Publishing...") : "Publish Version"}
              </button>
            </form>
          )}
        </div>

        {snapshots.length > 0 && (
          <div>
            <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--ink-faint)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>Leaderboards</div>
            {snapshots.map((s) => (
              <Link key={s.snapshot_id} href={`/leaderboards/${id}/${s.version}`} style={{ textDecoration: "none" }}>
                <div
                  style={{
                    padding: "8px 12px",
                    border: "1px solid rgba(201,195,232,.14)",
                    borderRadius: 10,
                    marginBottom: 6,
                    cursor: "pointer",
                    background: "rgba(78,71,160,.15)",
                    transition: "background 150ms, border-color 150ms",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "var(--ink)" }}>
                    v{s.version}
                  </span>
                  <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--ink-faint)" }}>
                    #{s.snapshot_id}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}

        <div>
          <Link href={`/runs/new?benchmark=${id}`} className="btn-p" style={{ display: "block", textAlign: "center", fontSize: 13 }}>
            Submit Run
          </Link>
        </div>
      </div>

      {/* Right: Runs table */}
      <div style={{ ...panelStyle }}>
        <div
          className="section-head"
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderRadius: "16px 16px 0 0" }}
        >
          <span>Runs ({runs.length})</span>
        </div>

        {runs.length === 0 ? (
          <div className="empty-state" style={{ minHeight: 200 }}>
            <div style={{ color: "var(--ink-faint)", fontSize: 14 }}>No runs submitted yet</div>
            <Link href={`/runs/new?benchmark=${id}`} className="btn-p" style={{ marginTop: 16, fontSize: 13 }}>
              Submit First Run
            </Link>
          </div>
        ) : (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "48px 1fr 110px 130px 130px 70px",
                padding: "8px 20px",
                borderBottom: "1px solid rgba(201,195,232,.08)",
                background: "rgba(16,12,41,.3)",
              }}
            >
              {["#", "Model", "Status", "Score", "Submitter", "Ver"].map((h) => (
                <span key={h} style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--ink-faint)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  {h}
                </span>
              ))}
            </div>

            {runs.map((r) => (
              <Link key={r.run_id} href={`/runs/${r.run_id}`} style={{ textDecoration: "none", color: "inherit" }}>
                <div
                  className="timing-row"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "48px 1fr 110px 130px 130px 70px",
                    padding: "12px 20px",
                    alignItems: "center",
                  }}
                >
                  <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "var(--orange)" }}>
                    #{r.run_id}
                  </span>
                  <span style={{ fontFamily: "Sora, sans-serif", fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>
                    {r.model_name}
                  </span>
                  <StatusTag status={r.status} />
                  <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: r.status === RunStatus.SEALED ? "var(--green)" : "var(--ink-faint)" }}>
                    {r.status === RunStatus.SEALED ? scoreBpsToPercent(r.final_score_bps) : "-"}
                  </span>
                  <span className="digest">{r.submitter.slice(0, 10)}...</span>
                  <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--ink-faint)" }}>
                    v{r.version}
                  </span>
                </div>
              </Link>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

export default function BenchmarkPage() {
  const params = useParams();
  const id = parseInt(params.id as string, 10);

  return (
    <ContractGuard>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 24px 40px" }}>
        <div style={{ marginBottom: 24 }}>
          <Link href="/" style={{ color: "var(--ink-faint)", fontSize: 13, textDecoration: "none", fontFamily: "JetBrains Mono, monospace" }}>
            - Registry
          </Link>
          <h1
            style={{
              fontFamily: "Sora, sans-serif",
              fontSize: 24,
              fontWeight: 800,
              margin: "6px 0 0",
              color: "var(--ink)",
            }}
          >
            Benchmark #{id}
          </h1>
        </div>
        <BenchmarkDetail id={id} />
      </div>
    </ContractGuard>
  );
}
