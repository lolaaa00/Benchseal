// Write client — supports injected (MetaMask) and generated (localStorage) wallets.
// The caller must specify the wallet mode explicitly; this function does NOT
// fall through from injected to generated when MetaMask is present but a
// different mode is selected. That would cause the wrong signer to be used.
import { createClient, createAccount } from "genlayer-js";
import { STUDIONET_CHAIN, GENLAYER_ENDPOINT } from "./config";
import { loadStoredKey } from "./wallet-storage";

type WalletMode = "injected" | "generated";

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ethereum?: any;
  }
}

/**
 * Create a write client for the specified wallet mode.
 * Throws if the requested mode is unavailable.
 */
export async function createWriteClient(mode?: WalletMode) {
  const resolved = mode ?? detectMode();

  if (resolved === "injected") {
    if (typeof window === "undefined" || !window.ethereum) {
      throw new Error("No injected wallet found. Install MetaMask or a compatible wallet.");
    }
    const accounts: string[] = await window.ethereum.request({ method: "eth_requestAccounts" });
    if (!accounts?.length) {
      throw new Error("Injected wallet returned no accounts.");
    }
    const account = accounts[0] as `0x${string}`;
    return createClient({
      chain: STUDIONET_CHAIN,
      endpoint: GENLAYER_ENDPOINT,
      provider: window.ethereum,
      account,
    });
  }

  // generated mode
  const pk = loadStoredKey();
  if (!pk) {
    throw new Error("No generated wallet found. Generate or import a wallet first.");
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const account = createAccount(pk as `0x${string}`) as any;
  return createClient({
    chain: STUDIONET_CHAIN,
    endpoint: GENLAYER_ENDPOINT,
    account,
  });
}

function detectMode(): WalletMode {
  // If a generated key is stored and no injected wallet exists, use generated.
  // If both exist, prefer generated (the user explicitly generated it).
  if (loadStoredKey()) return "generated";
  return "injected";
}

// Keep legacy export for backward compatibility
export const createInjectedClient = createWriteClient;
