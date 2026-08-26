"use client";

import { isContractConfigured } from "@/lib/genlayer/data-source";

export function ContractGuard({ children }: { children: React.ReactNode }) {
  if (!isContractConfigured()) {
    return (
      <div className="empty-state" style={{ minHeight: "40vh" }}>
        <div
          className="glass"
          style={{ padding: 40, maxWidth: 500, textAlign: "center" }}
        >
          <div
            style={{
              fontFamily: "Sora, sans-serif",
              fontSize: 20,
              fontWeight: 700,
              color: "var(--orange)",
              marginBottom: 16,
            }}
          >
            Contract Not Configured
          </div>
          <p
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: 14,
              color: "var(--ink-dim)",
              marginBottom: 20,
              lineHeight: 1.6,
            }}
          >
            Set{" "}
            <span style={{ color: "var(--ink)", fontFamily: "JetBrains Mono, monospace" }}>
              NEXT_PUBLIC_BENCHSEAL_CONTRACT
            </span>{" "}
            in your environment to a deployed BenchSeal contract address on StudioNet (chain 61999).
          </p>
          <code
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 12,
              display: "block",
              background: "rgba(16,12,41,.7)",
              border: "1px solid rgba(201,195,232,.15)",
              borderRadius: 10,
              padding: "10px 16px",
              color: "var(--ink-faint)",
            }}
          >
            NEXT_PUBLIC_BENCHSEAL_CONTRACT=0x...
          </code>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
