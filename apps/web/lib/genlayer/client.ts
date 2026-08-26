// Write client — supports injected (MetaMask) and generated (localStorage) wallets
import { createClient, createAccount } from "genlayer-js";
import { STUDIONET_CHAIN, GENLAYER_ENDPOINT } from "./config";
import { loadStoredKey } from "./wallet-storage";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EthereumProvider = any;

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export async function createWriteClient() {
  // Prefer injected wallet
  if (typeof window !== "undefined" && window.ethereum) {
    try {
      const accounts: string[] = await window.ethereum.request({ method: "eth_requestAccounts" });
      if (accounts?.length > 0) {
        const account = accounts[0] as `0x${string}`;
        return createClient({
          chain: STUDIONET_CHAIN,
          endpoint: GENLAYER_ENDPOINT,
          provider: window.ethereum,
          account,
        });
      }
    } catch {
      // Fall through to generated wallet
    }
  }
  // Fall back to generated wallet
  const pk = loadStoredKey();
  if (pk) {
    const account = createAccount(pk as `0x${string}`);
    return createClient({
      chain: STUDIONET_CHAIN,
      endpoint: GENLAYER_ENDPOINT,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      account: account as any,
    });
  }
  throw new Error("No wallet available. Connect a wallet or use a browser wallet.");
}

// Keep legacy export for backward compatibility
export const createInjectedClient = createWriteClient;
