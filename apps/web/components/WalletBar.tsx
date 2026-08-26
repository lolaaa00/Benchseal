"use client";

import { useWallet } from "./WalletProvider";
import { GENLAYER_CHAIN_ID } from "@/lib/genlayer/config";

function shortAddr(addr: string) {
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

export function WalletBar() {
  const { account, chainId, isConnecting, isCorrectChain, error, connect, switchChain, disconnect } = useWallet();

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {error && (
        <span
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 11,
            color: "var(--red)",
          }}
        >
          {error.slice(0, 50)}
        </span>
      )}
      {!account ? (
        <button className="btn-p" style={{ fontSize: 13, padding: "7px 18px" }} onClick={connect} disabled={isConnecting}>
          {isConnecting ? "Connecting..." : "Connect Wallet"}
        </button>
      ) : (
        <>
          <span
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 11,
              color: isCorrectChain ? "var(--green)" : "var(--red)",
              background: "rgba(16,12,41,.6)",
              border: `1px solid ${isCorrectChain ? "rgba(61,220,138,.3)" : "rgba(255,90,90,.3)"}`,
              borderRadius: 8,
              padding: "4px 10px",
            }}
          >
            Chain {chainId ?? "?"}{chainId === GENLAYER_CHAIN_ID ? " ✓" : " ✗"}
          </span>
          <span
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 11,
              color: "var(--ink-dim)",
              background: "rgba(38,34,98,.5)",
              border: "1px solid rgba(201,195,232,.15)",
              borderRadius: 8,
              padding: "4px 10px",
            }}
          >
            {shortAddr(account)}
          </span>
          {!isCorrectChain && (
            <button className="btn-p" style={{ fontSize: 12, padding: "6px 14px" }} onClick={switchChain}>
              Switch Network
            </button>
          )}
          <button className="btn-g" style={{ fontSize: 12, padding: "6px 14px" }} onClick={disconnect}>
            Disconnect
          </button>
        </>
      )}
    </div>
  );
}
