"use client";

import { useWallet } from "./WalletProvider";
import { GENLAYER_CHAIN_ID } from "@/lib/genlayer/config";

function shortAddr(addr: string) {
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

export function WalletBar() {
  const { account, chainId, isConnecting, isCorrectChain, error, walletMode, connect, generateWallet, exportKey, importKey, switchChain, disconnect } = useWallet();

  const handleExport = () => {
    const pk = exportKey();
    if (pk) {
      navigator.clipboard.writeText(pk).then(() => {
        alert("Private key copied to clipboard. Keep it safe!");
      }).catch(() => {
        alert("Private key: " + pk);
      });
    }
  };

  const handleImport = () => {
    const pk = prompt("Paste your private key (0x...):");
    if (pk) {
      importKey(pk.trim());
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      {error && (
        <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--red)" }}>
          {error.slice(0, 60)}
        </span>
      )}

      {walletMode === "none" && (
        <>
          <button className="btn-p" style={{ fontSize: 12, padding: "7px 16px" }} onClick={connect} disabled={isConnecting}>
            {isConnecting ? "Connecting..." : "Connect Wallet"}
          </button>
          <button className="btn-g" style={{ fontSize: 12, padding: "7px 16px" }} onClick={generateWallet}>
            Use Browser Wallet
          </button>
        </>
      )}

      {walletMode === "generated" && account && (
        <>
          <span style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 10,
            color: "var(--orange2)",
            background: "rgba(241,102,35,.1)",
            border: "1px solid rgba(241,102,35,.35)",
            borderRadius: 6,
            padding: "2px 8px",
          }}>
            Generated
          </span>
          <span style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 11,
            color: "var(--ink-dim)",
            background: "rgba(38,34,98,.5)",
            border: "1px solid rgba(201,195,232,.15)",
            borderRadius: 8,
            padding: "4px 10px",
          }}>
            {shortAddr(account)}
          </span>
          <button className="btn-g" style={{ fontSize: 11, padding: "5px 12px" }} onClick={handleExport} title="Copy private key to clipboard">
            Export Key
          </button>
          <button className="btn-g" style={{ fontSize: 11, padding: "5px 12px" }} onClick={handleImport} title="Import an existing private key">
            Import Key
          </button>
          <button className="btn-g" style={{ fontSize: 11, padding: "5px 12px" }} onClick={disconnect}>
            Disconnect
          </button>
          <span style={{ fontFamily: "Inter, sans-serif", fontSize: 10, color: "var(--orange2)", opacity: 0.8 }}>
            Key stored in this browser only — export to keep it.
          </span>
        </>
      )}

      {walletMode === "injected" && account && (
        <>
          <span style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 11,
            color: isCorrectChain ? "var(--green)" : "var(--red)",
            background: "rgba(16,12,41,.6)",
            border: `1px solid ${isCorrectChain ? "rgba(61,220,138,.3)" : "rgba(255,90,90,.3)"}`,
            borderRadius: 8,
            padding: "4px 10px",
          }}>
            Chain {chainId ?? "?"}{chainId === GENLAYER_CHAIN_ID ? " ✓" : " ✗"}
          </span>
          <span style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 11,
            color: "var(--ink-dim)",
            background: "rgba(38,34,98,.5)",
            border: "1px solid rgba(201,195,232,.15)",
            borderRadius: 8,
            padding: "4px 10px",
          }}>
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
