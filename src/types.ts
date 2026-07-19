export type AccountId = string;
export type AssetId = string;
export type LedgerEventId = string;
export type PostingId = string;
export type ReferenceId = string;

export enum PostingSide {
  Debit = "debit",
  Credit = "credit"
}

export interface Posting {
  postingId: PostingId;
  accountId: AccountId;
  assetId: AssetId;
  side: PostingSide;
  amountMinor: bigint;
}

export interface LedgerEvent {
  ledgerEventId: LedgerEventId;
  referenceId: ReferenceId;
  postings: Posting[];
  createdAt: Date;
}

export enum SettlementState {
  Accepted = "accepted",
  Executed = "executed",
  Finalized = "finalized",
  Reconciled = "reconciled",
  Failed = "failed"
}
