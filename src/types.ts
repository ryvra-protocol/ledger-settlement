export type AccountId = string;
export type AssetId = string;
export type LedgerEventId = string;
export type PostingId = string;
export type ReferenceId = string;
export type CorrelationId = string;
export type EventId = string;

export enum PostingSide {
  Debit = "debit",
  Credit = "credit"
}

export interface Posting {
  posting_id: PostingId;
  account_id: AccountId;
  asset_id: AssetId;
  side: PostingSide;
  amount_minor: bigint;
}

export interface LedgerEventPayload {
  ledger_event_id: LedgerEventId;
  postings: Posting[];
}

export interface EventEnvelope<TPayload> {
  event_id: EventId;
  correlation_id: CorrelationId;
  reference_id: ReferenceId;
  event_type: string;
  timestamp: Date;
  payload: TPayload;
}

export type LedgerEvent = EventEnvelope<LedgerEventPayload>;

export const CANONICAL_SETTLEMENT_STATES = [
  "accepted",
  "executed",
  "finalized",
  "reconciled",
  "failed"
] as const;

export type CanonicalSettlementState = (typeof CANONICAL_SETTLEMENT_STATES)[number];

export function isCanonicalSettlementState(value: string): value is CanonicalSettlementState {
  return CANONICAL_SETTLEMENT_STATES.includes(value as CanonicalSettlementState);
}

export enum SettlementState {
  Accepted = "accepted",
  Executed = "executed",
  Finalized = "finalized",
  Reconciled = "reconciled",
  Failed = "failed"
}
