"use client";
import React from "react";
import { parseContractError } from "@/lib/genlayer/execution";

const EXPLORER_BASE = "https://studio.genlayer.com/transactions";

const STAGE_ORDER = ["PENDING", "PROPOSING", "COMMITTING", "REVEALING", "ACCEPTED", "FINALIZED"];

interface TxStatusProps {
  txHash: string | null;
  status: string | null;
  error?: string | null;
}

export function TxStatus({ txHash, status, error }: TxStatusProps) {
  if (!txHash && !error) return null;

  const stageIndex = status ? STAGE_ORDER.indexOf(status) : -1;

  return (
    <div style={{
      background: "rgba(38,34,98,.5)",
      border: "1.5px solid rgba(201,195,232,.18)",
      borderRadius: 16,
      padding: "16px 20px",
      display: "flex",
      flexDirection: "column",
      gap: 12,
    }}>
      {txHash && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--ink-faint)" }}>
            TX: {txHash.slice(0, 12)}...{txHash.slice(-8)}
          </span>
          <a
            href={`${EXPLORER_BASE}/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--orange)", textDecoration: "none" }}
          >
            View on Explorer →
          </a>
        </div>
      )}

      {status && !error && (
        <div style={{ display: "flex", alignItems: "center", gap: 0, overflowX: "auto" }}>
          {STAGE_ORDER.map((stage, i) => {
            const done = stageIndex > i;
            const active = stageIndex === i;
            return (
              <React.Fragment key={stage}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 60 }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: "50%",
                    background: done ? "var(--orange)" : active ? "transparent" : "rgba(201,195,232,.2)",
                    border: active ? "2px solid var(--orange)" : done ? "2px solid var(--orange)" : "2px solid rgba(201,195,232,.2)",
                    boxShadow: active ? "0 0 8px var(--orange)" : "none",
                  }} />
                  <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: done || active ? "var(--orange2)" : "var(--ink-faint)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {stage}
                  </span>
                </div>
                {i < STAGE_ORDER.length - 1 && (
                  <div style={{ flex: 1, height: 2, background: done ? "var(--orange)" : "rgba(201,195,232,.12)", marginBottom: 14, minWidth: 4 }} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}

      {error && <div className="error-banner" style={{ fontSize: 12 }}>{parseContractError(error)}</div>}
    </div>
  );
}
