"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { GENLAYER_CHAIN_ID, GENLAYER_CHAIN_ID_HEX, STUDIONET_CHAIN } from "@/lib/genlayer/config";

interface WalletState {
  account: string | null;
  chainId: number | null;
  isConnecting: boolean;
  isCorrectChain: boolean;
  error: string | null;
  connect: () => Promise<void>;
  switchChain: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletState>({
  account: null,
  chainId: null,
  isConnecting: false,
  isCorrectChain: false,
  error: null,
  connect: async () => {},
  switchChain: async () => {},
  disconnect: () => {},
});

export function useWallet(): WalletState {
  return useContext(WalletContext);
}

function getEthereum() {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).ethereum ?? null;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCorrectChain = chainId === GENLAYER_CHAIN_ID;

  const readChain = useCallback(async () => {
    const eth = getEthereum();
    if (!eth) return;
    try {
      const hex: string = await eth.request({ method: "eth_chainId" });
      setChainId(parseInt(hex, 16));
    } catch {
      // ignore
    }
  }, []);

  // Subscribe to wallet events — no auto-connect on load
  useEffect(() => {
    const eth = getEthereum();
    if (!eth) return;

    const onAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        setAccount(null);
      } else {
        setAccount(accounts[0]);
      }
    };

    const onChainChanged = (hex: string) => {
      setChainId(parseInt(hex, 16));
    };

    const onDisconnect = () => {
      setAccount(null);
      setChainId(null);
    };

    eth.on("accountsChanged", onAccountsChanged);
    eth.on("chainChanged", onChainChanged);
    eth.on("disconnect", onDisconnect);

    return () => {
      eth.removeListener?.("accountsChanged", onAccountsChanged);
      eth.removeListener?.("chainChanged", onChainChanged);
      eth.removeListener?.("disconnect", onDisconnect);
    };
  }, []);

  const connect = useCallback(async () => {
    const eth = getEthereum();
    if (!eth) {
      setError("No injected wallet found. Install MetaMask or a compatible wallet.");
      return;
    }
    setIsConnecting(true);
    setError(null);
    try {
      const accounts: string[] = await eth.request({ method: "eth_requestAccounts" });
      setAccount(accounts[0] ?? null);
      await readChain();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setIsConnecting(false);
    }
  }, [readChain]);

  const switchChain = useCallback(async () => {
    const eth = getEthereum();
    if (!eth) return;
    setError(null);
    try {
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: GENLAYER_CHAIN_ID_HEX }],
      });
    } catch (switchErr: unknown) {
      // Chain not added — add it
      if ((switchErr as { code?: number }).code === 4902) {
        try {
          await eth.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: GENLAYER_CHAIN_ID_HEX,
                chainName: STUDIONET_CHAIN.name,
                rpcUrls: [STUDIONET_CHAIN.rpcUrls.default.http[0]],
                nativeCurrency: STUDIONET_CHAIN.nativeCurrency,
              },
            ],
          });
        } catch (addErr: unknown) {
          const msg = addErr instanceof Error ? addErr.message : String(addErr);
          setError(msg);
        }
      } else {
        const msg = switchErr instanceof Error ? switchErr.message : String(switchErr);
        setError(msg);
      }
    }
  }, []);

  const disconnect = useCallback(() => {
    setAccount(null);
    setChainId(null);
    setError(null);
  }, []);

  return (
    <WalletContext.Provider
      value={{
        account,
        chainId,
        isConnecting,
        isCorrectChain,
        error,
        connect,
        switchChain,
        disconnect,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}
