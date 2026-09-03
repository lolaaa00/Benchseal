"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { GENLAYER_CHAIN_ID, GENLAYER_CHAIN_ID_HEX, STUDIONET_CHAIN } from "@/lib/genlayer/config";
import { loadStoredKey, saveStoredKey, clearStoredKey } from "@/lib/genlayer/wallet-storage";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GenLayerAccount = any;

interface WalletState {
  account: string | null;
  chainId: number | null;
  isConnecting: boolean;
  isCorrectChain: boolean;
  error: string | null;
  walletMode: "none" | "injected" | "generated";
  connect: () => Promise<void>;
  generateWallet: () => void;
  exportKey: () => string | null;
  importKey: (pk: string) => void;
  switchChain: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletState>({
  account: null,
  chainId: null,
  isConnecting: false,
  isCorrectChain: false,
  error: null,
  walletMode: "none",
  connect: async () => {},
  generateWallet: () => {},
  exportKey: () => null,
  importKey: () => {},
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
  const [walletMode, setWalletMode] = useState<"none" | "injected" | "generated">("none");
  const [generatedPk, setGeneratedPk] = useState<string | null>(null);

  const isCorrectChain = walletMode === "generated" ? true : chainId === GENLAYER_CHAIN_ID;

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

  // On mount: restore generated wallet if stored, or rehydrate injected wallet if already authorized
  useEffect(() => {
    const pk = loadStoredKey();
    if (pk) {
      try {
        // Dynamically import to avoid SSR issues
        import("genlayer-js").then(({ createAccount }) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const acct: GenLayerAccount = createAccount(pk as `0x${string}`);
          setGeneratedPk(pk);
          setAccount(acct.address);
          setWalletMode("generated");
        }).catch(() => {
          // If import fails, clear stored key
          clearStoredKey();
        });
      } catch {
        clearStoredKey();
      }
    } else {
      // Rehydrate injected wallet silently (eth_accounts does NOT prompt the user)
      const eth = getEthereum();
      if (eth) {
        eth.request({ method: "eth_accounts" })
          .then((accounts: string[]) => {
            if (accounts && accounts.length > 0) {
              setAccount(accounts[0]);
              setWalletMode("injected");
              readChain();
            }
          })
          .catch(() => { /* ignore */ });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Subscribe to injected wallet events
  useEffect(() => {
    const eth = getEthereum();
    if (!eth) return;

    const onAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        if (walletMode === "injected") {
          setAccount(null);
          setWalletMode("none");
        }
      } else {
        setAccount(accounts[0]);
        setWalletMode("injected");
      }
    };

    const onChainChanged = (hex: string) => {
      setChainId(parseInt(hex, 16));
    };

    const onDisconnect = () => {
      if (walletMode === "injected") {
        setAccount(null);
        setChainId(null);
        setWalletMode("none");
      }
    };

    eth.on("accountsChanged", onAccountsChanged);
    eth.on("chainChanged", onChainChanged);
    eth.on("disconnect", onDisconnect);

    return () => {
      eth.removeListener?.("accountsChanged", onAccountsChanged);
      eth.removeListener?.("chainChanged", onChainChanged);
      eth.removeListener?.("disconnect", onDisconnect);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletMode]);

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
      setWalletMode("injected");
      await readChain();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setIsConnecting(false);
    }
  }, [readChain]);

  const generateWallet = useCallback(() => {
    import("genlayer-js").then(({ generatePrivateKey, createAccount }) => {
      const pk = generatePrivateKey();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const acct: GenLayerAccount = createAccount(pk as `0x${string}`);
      saveStoredKey(pk as string);
      setGeneratedPk(pk as string);
      setAccount(acct.address);
      setWalletMode("generated");
      setError(null);
    }).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : String(e));
    });
  }, []);

  const exportKey = useCallback((): string | null => {
    return generatedPk;
  }, [generatedPk]);

  const importKey = useCallback((pk: string) => {
    import("genlayer-js").then(({ createAccount }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const acct: GenLayerAccount = createAccount(pk as `0x${string}`);
      saveStoredKey(pk);
      setGeneratedPk(pk);
      setAccount(acct.address);
      setWalletMode("generated");
      setError(null);
    }).catch((e: unknown) => {
      setError("Invalid private key: " + (e instanceof Error ? e.message : String(e)));
    });
  }, []);

  const switchChain = useCallback(async () => {
    const eth = getEthereum();
    if (!eth) return;
    setError(null);
    try {
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: GENLAYER_CHAIN_ID_HEX }],
      });
      // Update chain state immediately after successful switch
      await readChain();
    } catch (switchErr: unknown) {
      const errCode = (switchErr as { code?: number }).code;
      if (errCode === 4902) {
        // Chain not found in wallet — add it first, then switch
        try {
          await eth.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: GENLAYER_CHAIN_ID_HEX,
                chainName: "GenLayer StudioNet",
                nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
                rpcUrls: ["https://studio.genlayer.com/api"],
                blockExplorerUrls: ["https://studio.genlayer.com/transactions"],
              },
            ],
          });
          // After adding, attempt to switch again
          try {
            await eth.request({
              method: "wallet_switchEthereumChain",
              params: [{ chainId: GENLAYER_CHAIN_ID_HEX }],
            });
            await readChain();
          } catch (switchAfterAddErr: unknown) {
            if ((switchAfterAddErr as { code?: number }).code !== 4001) {
              const msg = switchAfterAddErr instanceof Error ? switchAfterAddErr.message : String(switchAfterAddErr);
              setError(msg);
            }
          }
        } catch (addErr: unknown) {
          if ((addErr as { code?: number }).code !== 4001) {
            const msg = addErr instanceof Error ? addErr.message : String(addErr);
            setError(msg);
          }
        }
      } else if (errCode === 4001) {
        // User rejected — silent, no error shown
      } else {
        const msg = switchErr instanceof Error ? switchErr.message : String(switchErr);
        setError(msg);
      }
    }
  }, [readChain]);

  const disconnect = useCallback(() => {
    setAccount(null);
    setChainId(null);
    setError(null);
    setWalletMode("none");
    if (generatedPk) {
      clearStoredKey();
      setGeneratedPk(null);
    }
  }, [generatedPk]);

  return (
    <WalletContext.Provider
      value={{
        account,
        chainId,
        isConnecting,
        isCorrectChain,
        error,
        walletMode,
        connect,
        generateWallet,
        exportKey,
        importKey,
        switchChain,
        disconnect,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}
