const KEY = "benchseal_wallet_v1";

export function loadStoredKey(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(KEY);
}

export function saveStoredKey(pk: string): void {
  localStorage.setItem(KEY, pk);
}

export function clearStoredKey(): void {
  localStorage.removeItem(KEY);
}
