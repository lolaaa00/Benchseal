// Injected wallet client — uses window.ethereum
import { createClient } from "genlayer-js";
import { STUDIONET_CHAIN, GENLAYER_ENDPOINT } from "./config";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EthereumProvider = any;

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export async function createInjectedClient() {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("No injected wallet found. Please install MetaMask or a compatible wallet.");
  }
  // Request accounts and get the active account to pass to genlayer-js
  const accounts: string[] = await window.ethereum.request({
    method: "eth_requestAccounts",
  });
  if (!accounts || accounts.length === 0) {
    throw new Error("Wallet connection refused or no accounts available.");
  }
  const account = accounts[0] as `0x${string}`;
  return createClient({
    chain: STUDIONET_CHAIN,
    endpoint: GENLAYER_ENDPOINT,
    provider: window.ethereum,
    account,
  });
}
