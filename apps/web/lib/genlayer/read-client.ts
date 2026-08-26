// Ephemeral read-only client — no wallet required
import { createClient } from "genlayer-js";
import { STUDIONET_CHAIN, GENLAYER_ENDPOINT } from "./config";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _readClient: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getReadClient(): any {
  if (!_readClient) {
    _readClient = createClient({
      chain: STUDIONET_CHAIN,
      endpoint: GENLAYER_ENDPOINT,
    });
  }
  return _readClient;
}
