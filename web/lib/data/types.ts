export type DecisionStatus = 'accepted' | 'rejected';
export type Direction = 'UP' | 'DOWN' | 'FLAT';
export type RejectReason =
  | 'BadSigner' | 'BadNonce' | 'BadEpoch' | 'BadCommit' | 'BadHash' | 'NotOperator' | 'BadAnchor';

export interface Decision { dir: Direction; conf: number; size: number } // conf,size in 0..1

export interface DecisionEntry {
  index: number;               // on-chain entry index for this agent
  status: DecisionStatus;      // green | red
  rejectReason?: RejectReason; // present iff status==='rejected'
  decision: Decision;          // parsed from the signed response content
  nonce: number;
  epoch: number;
  reqSha: `0x${string}`;       // 32-byte hash (request body; sealed — hash only)
  respSha: `0x${string}`;      // 32-byte hash (signed response bytes)
  teeSigner: `0x${string}`;    // 20-byte address (recovered TEE signer)
  provider: `0x${string}`;     // 20-byte 0G Compute provider address
  inputHash: `0x${string}`;    // 32-byte sha256 of the market snapshot
  renter: `0x${string}`;       // 20-byte; zero address if none
  txHash: `0x${string}`;
  chainScanUrl: string;        // https://chainscan.0g.ai/tx/<txHash>
  blockTime: string;           // ISO 8601
}

export interface Agent {
  tokenId: string;
  name: string;
  owner: `0x${string}`;
  operator: `0x${string}`;     // runtime EOA allowed to append entries
  epoch: number;
  strategyHash: `0x${string}`; // H — public commitment; the strategy itself is sealed
  storageRoot: `0x${string}`;  // 0G Storage merkle root of the AES-256-GCM blob
  network: 'mainnet' | 'testnet';
  domain: string;              // e.g. "BTC short-horizon direction"
  decisionCount: number;
  brainBoundPct: number;       // % accepted & provenance-verified (target 100)
  createdAt: string;
  pnlContext?: {               // context only — NEVER labeled as verified
    window: string;
    note: string;
    series?: { t: string; v: number }[];
  };
}

export interface Listing {
  tokenId: string;
  feePerDecisionWei: string;   // bigint serialized as string
  minEscrowWei: string;
  active: boolean;
}

export interface Grant {
  tokenId: string;
  renter: `0x${string}`;
  expiry: string;              // ISO
  maxDecisions: number;
  remainingEscrowWei: string;
  status: 'active' | 'expired' | 'revoked';
}

export interface RenterFeedMessage {
  entryIndex: number;          // links to the on-chain DecisionEntry
  tokenId: string;
  decision: Decision;
  at: string;                  // ISO
  txHash: `0x${string}`;
}

export interface VerifyCheck { name: string; pass: boolean; detail?: string }
export interface VerifyResult {
  txHash: `0x${string}`;
  ok: boolean;
  network: 'mainnet' | 'testnet';
  checks: VerifyCheck[];       // e.g. "signer matches getService().teeSignerAddress", "commit matches", "nonce fresh"
  entry?: DecisionEntry;
}

export interface DataSource {
  listAgents(): Promise<Agent[]>;
  getAgent(tokenId: string): Promise<Agent | null>;
  getEntries(tokenId: string, opts?: { limit?: number; cursor?: number }): Promise<DecisionEntry[]>;
  getListing(tokenId: string): Promise<Listing | null>;
  getAgentsForOwner(address: `0x${string}`): Promise<Agent[]>;
  getGrantsForRenter(address: `0x${string}`): Promise<Grant[]>;
  subscribeRenterFeed(tokenId: string, onMessage: (m: RenterFeedMessage) => void): () => void; // returns unsubscribe
  verifyTx(txHash: string): Promise<VerifyResult>;
  // stubbed mutations (mock returns optimistic results; owner wires wallet writes later):
  rent(tokenId: string, escrowWei: string): Promise<Grant>;
}
