import { createHash } from "node:crypto";

export const RESERVATION_STATES = [
  "created",
  "validating",
  "authorized",
  "reserved",
  "submitted",
  "included",
  "confirmed",
  "finalized",
  "reconciling",
  "reconciled",
  "rejected",
  "expired",
  "cancelled",
  "dropped",
  "reverted",
  "retrying",
  "partial",
  "disputed",
  "manual_review"
] as const;

export type ReservationState = (typeof RESERVATION_STATES)[number];

export const ACTIVE_RESERVED_STATES = new Set<ReservationState>([
  "created",
  "validating",
  "authorized",
  "reserved",
  "submitted",
  "included",
  "confirmed",
  "retrying",
  "partial",
  "disputed",
  "manual_review"
]);

const FORWARD_PATH: ReservationState[] = [
  "created",
  "validating",
  "authorized",
  "reserved",
  "submitted",
  "included",
  "confirmed",
  "finalized",
  "reconciling",
  "reconciled"
];

export const DISCREPANCY_REASON_CODES = [
  "exact_match",
  "amount_mismatch",
  "partial_settlement",
  "over_settlement",
  "external_revert",
  "missing_settlement",
  "policy_violation",
  "manual_override"
] as const;

export type DiscrepancyReasonCode = (typeof DISCREPANCY_REASON_CODES)[number];

export interface ProvenanceFields {
  agentId?: string;
  mandateId?: string;
  intentId?: string;
  riskAssessmentId?: string;
  authorizationId?: string;
  policyVersion?: string;
  policyHash?: string;
  sessionKeyId?: string;
  userOperationHash?: string;
  transactionHash?: string;
}

export interface LedgerAccount {
  accountId: string;
  assetId: string;
  settledBalanceMinor: bigint;
  createdAt: Date;
  updatedAt: Date;
  optimisticToken: number;
}

export interface ReservationRecord extends ProvenanceFields {
  reservationId: string;
  accountId: string;
  assetId: string;
  intentId: string;
  amountMinor: bigint;
  idempotencyKey: string;
  state: ReservationState;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
  settlementId?: string;
  optimisticToken: number;
}

export interface LedgerEntryRecord extends ProvenanceFields {
  entryId: string;
  reservationId: string;
  settlementId: string;
  accountId: string;
  assetId: string;
  amountMinor: bigint;
  side: "debit" | "credit";
  transactionHash?: string;
  postedAt: Date;
}

export interface SettlementRecord extends ProvenanceFields {
  settlementId: string;
  reservationId: string;
  intentId: string;
  state: ReservationState;
  expectedAmountMinor: bigint;
  settledAmountMinor?: bigint;
  chainTransactionHash?: string;
  blockNumber?: bigint;
  finalityMarker?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SettlementEventRecord extends ProvenanceFields {
  eventId: string;
  reservationId: string;
  settlementId?: string;
  intentId: string;
  state: ReservationState;
  eventType: string;
  idempotencyKey?: string;
  chainEventId?: string;
  blockNumber?: bigint;
  finalityMarker?: string;
  transactionHash?: string;
  metadata?: Record<string, string | number | boolean>;
  previousEventHash?: string;
  eventHash: string;
  createdAt: Date;
}

export interface ReconciliationRecord extends ProvenanceFields {
  reconciliationId: string;
  reservationId: string;
  settlementId: string;
  expectedAmountMinor: bigint;
  settledAmountMinor: bigint;
  discrepancyReasonCode: DiscrepancyReasonCode;
  matched: boolean;
  retryWorkflowMarker?: string;
  repairWorkflowMarker?: string;
  evidence: Record<string, string | number | boolean>;
  previousEventHash?: string;
  eventHash: string;
  createdAt: Date;
}

export interface CreateReservationInput extends ProvenanceFields {
  reservationId?: string;
  accountId: string;
  assetId: string;
  intentId: string;
  amountMinor: bigint;
  idempotencyKey: string;
  expiresAt?: Date;
}

export interface TransitionReservationInput extends ProvenanceFields {
  reservationId: string;
  toState: ReservationState;
  idempotencyKey?: string;
  settlementId?: string;
  chainEventId?: string;
  transactionHash?: string;
  blockNumber?: bigint;
  finalityMarker?: string;
  expectedOptimisticToken?: number;
  metadata?: Record<string, string | number | boolean>;
}

export interface RecordSettlementEventInput extends ProvenanceFields {
  reservationId: string;
  settlementId: string;
  eventType: "submitted" | "included" | "confirmed" | "finalized" | "reconciling" | "reconciled" | "dropped" | "reverted";
  chainEventId?: string;
  idempotencyKey?: string;
  transactionHash?: string;
  blockNumber?: bigint;
  finalityMarker?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface RunReconciliationInput extends ProvenanceFields {
  reservationId: string;
  settlementId: string;
  settledAmountMinor: bigint;
  discrepancyReasonCode?: DiscrepancyReasonCode;
  retryWorkflowMarker?: string;
  repairWorkflowMarker?: string;
  evidence?: Record<string, string | number | boolean>;
}

export interface ReservationBalanceSnapshot {
  settledBalanceMinor: bigint;
  activeReservedBalanceMinor: bigint;
  availableBalanceMinor: bigint;
}

export interface LifecycleTimelineItem {
  eventId: string;
  intentId: string;
  reservationId: string;
  settlementId?: string;
  eventType: string;
  state: ReservationState;
  eventHash: string;
  previousEventHash?: string;
  createdAt: Date;
  provenance: ProvenanceFields;
}

export interface RecordSettlementEventResult {
  applied: boolean;
  deferred: boolean;
  reservation: ReservationRecord;
}

export class ReservationLedgerService {
  private readonly accounts = new Map<string, LedgerAccount>();
  private readonly reservations = new Map<string, ReservationRecord>();
  private readonly settlements = new Map<string, SettlementRecord>();
  private readonly settlementEvents: SettlementEventRecord[] = [];
  private readonly ledgerEntries: LedgerEntryRecord[] = [];
  private readonly reconciliationRecords = new Map<string, ReconciliationRecord>();
  private readonly reservationByIntent = new Map<string, string>();
  private readonly operationByIdempotency = new Map<string, { fingerprint: string; resultId: string }>();
  private readonly ingestionKeys = new Set<string>();
  private readonly deferredEvents = new Map<string, RecordSettlementEventInput[]>();
  private readonly lastEventHashByReservation = new Map<string, string>();
  private readonly accountLocks = new Map<string, Promise<void>>();

  private reservationCounter = 0;
  private entryCounter = 0;
  private eventCounter = 0;
  private reconciliationCounter = 0;

  upsertAccount(accountId: string, assetId: string, settledBalanceMinor: bigint): LedgerAccount {
    const key = this.accountKey(accountId, assetId);
    const now = new Date();
    const existing = this.accounts.get(key);
    if (existing) {
      existing.settledBalanceMinor = settledBalanceMinor;
      existing.updatedAt = now;
      existing.optimisticToken += 1;
      return cloneAccount(existing);
    }

    const created: LedgerAccount = {
      accountId,
      assetId,
      settledBalanceMinor,
      createdAt: now,
      updatedAt: now,
      optimisticToken: 0
    };
    this.accounts.set(key, created);
    return cloneAccount(created);
  }

  async createReservation(input: CreateReservationInput): Promise<ReservationRecord> {
    if (input.amountMinor <= 0n) {
      throw new Error("reservation amount_minor must be positive");
    }

    const reservationId = input.reservationId ?? `res-${++this.reservationCounter}`;
    const idempotencyScope = `create:${input.intentId}:${input.idempotencyKey}`;
    const fingerprint = stableStringify({
      accountId: input.accountId,
      assetId: input.assetId,
      intentId: input.intentId,
      amountMinor: input.amountMinor,
      expiresAt: input.expiresAt?.toISOString()
    });

    return this.withAccountLock(input.accountId, async () => {
      const replay = this.operationByIdempotency.get(idempotencyScope);
      if (replay) {
        if (replay.fingerprint !== fingerprint) {
          throw new Error("idempotency payload mismatch for create reservation");
        }
        return cloneReservation(this.requireReservation(replay.resultId));
      }

      if (this.reservationByIntent.has(input.intentId)) {
        throw new Error(`intent already reserved: ${input.intentId}`);
      }

      const account = this.requireAccount(input.accountId, input.assetId);
      const balances = this.computeBalances(input.accountId, input.assetId);
      if (input.amountMinor > balances.availableBalanceMinor) {
        throw new Error("insufficient available balance for reservation");
      }

      const now = new Date();
      const reservation: ReservationRecord = {
        reservationId,
        accountId: input.accountId,
        assetId: input.assetId,
        intentId: input.intentId,
        amountMinor: input.amountMinor,
        idempotencyKey: input.idempotencyKey,
        state: "created",
        createdAt: now,
        updatedAt: now,
        expiresAt: input.expiresAt,
        optimisticToken: 0,
        ...sanitizeProvenance(input)
      };

      this.reservations.set(reservationId, reservation);
      this.reservationByIntent.set(reservation.intentId, reservation.reservationId);
      this.operationByIdempotency.set(idempotencyScope, { fingerprint, resultId: reservationId });
      account.updatedAt = now;
      this.accounts.set(this.accountKey(account.accountId, account.assetId), account);

      this.appendLifecycleEvent({
        reservation,
        settlementId: undefined,
        eventType: "reservation.created",
        state: reservation.state,
        idempotencyKey: input.idempotencyKey,
        provenance: input
      });

      return cloneReservation(reservation);
    });
  }

  async transitionReservation(input: TransitionReservationInput): Promise<ReservationRecord> {
    const reservation = this.requireReservation(input.reservationId);
    return this.withAccountLock(reservation.accountId, async () => {
      const current = this.requireReservation(input.reservationId);
      if (input.expectedOptimisticToken !== undefined && current.optimisticToken !== input.expectedOptimisticToken) {
        throw new Error("optimistic token mismatch");
      }

      const idempotencyScope = input.idempotencyKey
        ? `transition:${current.reservationId}:${current.state}:${input.toState}:${input.idempotencyKey}`
        : undefined;
      const fingerprint = idempotencyScope
        ? stableStringify({
            settlementId: input.settlementId,
            chainEventId: input.chainEventId,
            transactionHash: input.transactionHash,
            blockNumber: input.blockNumber,
            finalityMarker: input.finalityMarker,
            metadata: input.metadata
          })
        : undefined;

      if (idempotencyScope && fingerprint) {
        const replay = this.operationByIdempotency.get(idempotencyScope);
        if (replay) {
          if (replay.fingerprint !== fingerprint) {
            throw new Error("idempotency payload mismatch for reservation transition");
          }
          return cloneReservation(this.requireReservation(replay.resultId));
        }
      }

      if (current.state === input.toState) {
        return cloneReservation(current);
      }

      if (!canTransitionReservation(current.state, input.toState)) {
        throw new Error(`invalid reservation transition: ${current.state} -> ${input.toState}`);
      }

      const now = new Date();
      current.state = input.toState;
      current.updatedAt = now;
      current.optimisticToken += 1;
      if (input.settlementId) {
        current.settlementId = input.settlementId;
      }
      mergeProvenance(current, input);
      this.reservations.set(current.reservationId, current);

      if (input.toState === "finalized") {
        this.postSettlementLedgerEntry(current, input.settlementId);
      }

      this.appendLifecycleEvent({
        reservation: current,
        settlementId: current.settlementId,
        eventType: `reservation.${input.toState}`,
        state: current.state,
        idempotencyKey: input.idempotencyKey,
        chainEventId: input.chainEventId,
        transactionHash: input.transactionHash,
        blockNumber: input.blockNumber,
        finalityMarker: input.finalityMarker,
        metadata: input.metadata,
        provenance: input
      });

      if (idempotencyScope && fingerprint) {
        this.operationByIdempotency.set(idempotencyScope, { fingerprint, resultId: current.reservationId });
      }

      await this.applyDeferredEvents(current.reservationId);
      return cloneReservation(current);
    });
  }

  async releaseReservation(
    reservationId: string,
    idempotencyKey: string,
    provenance: ProvenanceFields = {}
  ): Promise<ReservationRecord> {
    return this.transitionReservation({ reservationId, toState: "cancelled", idempotencyKey, ...provenance });
  }

  async expireReservation(
    reservationId: string,
    idempotencyKey: string,
    provenance: ProvenanceFields = {}
  ): Promise<ReservationRecord> {
    return this.transitionReservation({ reservationId, toState: "expired", idempotencyKey, ...provenance });
  }

  async disputeReservation(
    reservationId: string,
    idempotencyKey: string,
    provenance: ProvenanceFields = {}
  ): Promise<ReservationRecord> {
    return this.transitionReservation({ reservationId, toState: "disputed", idempotencyKey, ...provenance });
  }

  async expireDueReservations(asOf: Date): Promise<ReservationRecord[]> {
    const expired: ReservationRecord[] = [];
    const candidates = [...this.reservations.values()]
      .filter((reservation) => reservation.expiresAt && reservation.expiresAt <= asOf && ACTIVE_RESERVED_STATES.has(reservation.state))
      .map((reservation) => reservation.reservationId);

    for (const reservationId of candidates) {
      const updated = await this.expireReservation(reservationId, `expiry:${asOf.toISOString()}`);
      expired.push(updated);
    }

    return expired;
  }

  async recordSettlementEvent(input: RecordSettlementEventInput): Promise<RecordSettlementEventResult> {
    const reservation = this.requireReservation(input.reservationId);
    return this.withAccountLock(reservation.accountId, async () => {
      const current = this.requireReservation(input.reservationId);
      if (current.settlementId && current.settlementId !== input.settlementId) {
        throw new Error(`reservation ${current.reservationId} already linked to settlement ${current.settlementId}`);
      }

      const ingestionKey = input.idempotencyKey
        ? `settlement:${input.intentId ?? current.intentId}:${input.eventType}:${input.idempotencyKey}`
        : `settlement:${input.settlementId}:${input.eventType}:${input.chainEventId ?? ""}:${input.blockNumber?.toString() ?? ""}`;
      if (this.ingestionKeys.has(ingestionKey)) {
        return { applied: false, deferred: false, reservation: cloneReservation(current) };
      }

      const targetState = eventTypeToState(input.eventType);
      if (current.state === targetState) {
        this.ingestionKeys.add(ingestionKey);
        return { applied: false, deferred: false, reservation: cloneReservation(current) };
      }

      if (!canTransitionReservation(current.state, targetState)) {
        if (isOutOfOrderForwardTransition(current.state, targetState)) {
          this.enqueueDeferredEvent(current.reservationId, input);
          this.ingestionKeys.add(ingestionKey);
          this.appendLifecycleEvent({
            reservation: current,
            settlementId: input.settlementId,
            eventType: `settlement.${input.eventType}.deferred`,
            state: current.state,
            idempotencyKey: input.idempotencyKey,
            chainEventId: input.chainEventId,
            transactionHash: input.transactionHash,
            blockNumber: input.blockNumber,
            finalityMarker: input.finalityMarker,
            metadata: input.metadata,
            provenance: input
          });
          return { applied: false, deferred: true, reservation: cloneReservation(current) };
        }
        throw new Error(`invalid settlement event transition: ${current.state} -> ${targetState}`);
      }

      const transitioned = await this.transitionReservation({
        reservationId: current.reservationId,
        toState: targetState,
        idempotencyKey: input.idempotencyKey,
        settlementId: input.settlementId,
        chainEventId: input.chainEventId,
        transactionHash: input.transactionHash,
        blockNumber: input.blockNumber,
        finalityMarker: input.finalityMarker,
        metadata: input.metadata,
        ...sanitizeProvenance(input)
      });

      this.ingestionKeys.add(ingestionKey);
      this.upsertSettlementRecord(transitioned, input);
      return { applied: true, deferred: false, reservation: transitioned };
    });
  }

  async runReconciliation(input: RunReconciliationInput): Promise<ReconciliationRecord> {
    const reservation = this.requireReservation(input.reservationId);
    return this.withAccountLock(reservation.accountId, async () => {
      const current = this.requireReservation(input.reservationId);
      const settlementId = input.settlementId;
      if (current.settlementId && current.settlementId !== settlementId) {
        throw new Error(`reconciliation settlement mismatch for reservation ${current.reservationId}`);
      }

      const matched = current.amountMinor === input.settledAmountMinor;
      const inferredReason = inferDiscrepancyReason(current.amountMinor, input.settledAmountMinor, matched);
      const discrepancyReasonCode = input.discrepancyReasonCode ?? inferredReason;

      if (canTransitionReservation(current.state, "reconciling")) {
        await this.transitionReservation({
          reservationId: current.reservationId,
          toState: "reconciling",
          idempotencyKey: `reconciling:${settlementId}`,
          settlementId,
          ...sanitizeProvenance(input)
        });
      }

      const finalState: ReservationState = matched ? "reconciled" : "partial";
      if (canTransitionReservation(this.requireReservation(current.reservationId).state, finalState)) {
        await this.transitionReservation({
          reservationId: current.reservationId,
          toState: finalState,
          idempotencyKey: `reconciled:${settlementId}:${discrepancyReasonCode}`,
          settlementId,
          ...sanitizeProvenance(input)
        });
      }

      const reconciliationId = `rec-${++this.reconciliationCounter}`;
      const now = new Date();
      const reservationAfter = this.requireReservation(current.reservationId);
      const previousHash = this.lastEventHashByReservation.get(current.reservationId);
      const payload = {
        reservationId: reservationAfter.reservationId,
        settlementId,
        expectedAmountMinor: reservationAfter.amountMinor,
        settledAmountMinor: input.settledAmountMinor,
        discrepancyReasonCode,
        matched,
        retryWorkflowMarker: input.retryWorkflowMarker,
        repairWorkflowMarker: input.repairWorkflowMarker,
        evidence: input.evidence ?? {},
        provenance: sanitizeProvenance(input),
        createdAt: now.toISOString(),
        previousHash
      };

      const eventHash = hashPayload(payload);
      const record: ReconciliationRecord = {
        reconciliationId,
        reservationId: reservationAfter.reservationId,
        settlementId,
        expectedAmountMinor: reservationAfter.amountMinor,
        settledAmountMinor: input.settledAmountMinor,
        discrepancyReasonCode,
        matched,
        retryWorkflowMarker: input.retryWorkflowMarker,
        repairWorkflowMarker: input.repairWorkflowMarker,
        evidence: input.evidence ?? {},
        previousEventHash: previousHash,
        eventHash,
        createdAt: now,
        ...sanitizeProvenance(input)
      };

      this.reconciliationRecords.set(reconciliationId, record);
      this.lastEventHashByReservation.set(reservationAfter.reservationId, eventHash);
      this.upsertSettlementRecord(reservationAfter, {
        reservationId: reservationAfter.reservationId,
        settlementId,
        settledAmountMinor: input.settledAmountMinor,
        ...sanitizeProvenance(input)
      });

      return cloneReconciliation(record);
    });
  }

  getReservation(reservationId: string): ReservationRecord | undefined {
    const reservation = this.reservations.get(reservationId);
    return reservation ? cloneReservation(reservation) : undefined;
  }

  getBalanceSnapshot(accountId: string, assetId: string): ReservationBalanceSnapshot {
    return this.computeBalances(accountId, assetId);
  }

  getTimelineByIntentId(intentId: string): LifecycleTimelineItem[] {
    return this.settlementEvents
      .filter((event) => event.intentId === intentId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map(toTimelineItem);
  }

  getTimelineBySettlementId(settlementId: string): LifecycleTimelineItem[] {
    return this.settlementEvents
      .filter((event) => event.settlementId === settlementId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map(toTimelineItem);
  }

  listLedgerEntries(): LedgerEntryRecord[] {
    return this.ledgerEntries.map(cloneLedgerEntry);
  }

  listReconciliationRecords(): ReconciliationRecord[] {
    return [...this.reconciliationRecords.values()].map(cloneReconciliation);
  }

  private async applyDeferredEvents(reservationId: string): Promise<void> {
    const queue = this.deferredEvents.get(reservationId);
    if (!queue || queue.length === 0) {
      return;
    }

    const sorted = [...queue].sort((a, b) => transitionIndex(eventTypeToState(a.eventType)) - transitionIndex(eventTypeToState(b.eventType)));
    this.deferredEvents.set(reservationId, []);

    for (const deferred of sorted) {
      const latest = this.requireReservation(reservationId);
      const target = eventTypeToState(deferred.eventType);
      if (latest.state === target) {
        continue;
      }
      if (!canTransitionReservation(latest.state, target)) {
        this.enqueueDeferredEvent(reservationId, deferred);
        continue;
      }
      await this.transitionReservation({
        reservationId,
        toState: target,
        settlementId: deferred.settlementId,
        chainEventId: deferred.chainEventId,
        idempotencyKey: deferred.idempotencyKey,
        transactionHash: deferred.transactionHash,
        blockNumber: deferred.blockNumber,
        finalityMarker: deferred.finalityMarker,
        metadata: deferred.metadata,
        ...sanitizeProvenance(deferred)
      });
      this.upsertSettlementRecord(this.requireReservation(reservationId), deferred);
    }

    if ((this.deferredEvents.get(reservationId)?.length ?? 0) === 0) {
      this.deferredEvents.delete(reservationId);
    }
  }

  private enqueueDeferredEvent(reservationId: string, input: RecordSettlementEventInput): void {
    const queue = this.deferredEvents.get(reservationId) ?? [];
    queue.push(input);
    this.deferredEvents.set(reservationId, queue);
  }

  private upsertSettlementRecord(
    reservation: ReservationRecord,
    input: (RecordSettlementEventInput | RunReconciliationInput) & { settledAmountMinor?: bigint }
  ): void {
    const existing = this.settlements.get(input.settlementId);
    const now = new Date();
    const state = "eventType" in input ? eventTypeToState(input.eventType) : reservation.state;

    if (existing) {
      existing.state = state;
      existing.updatedAt = now;
      if (input.settledAmountMinor !== undefined) {
        existing.settledAmountMinor = input.settledAmountMinor;
      }
      if (input.transactionHash) {
        existing.transactionHash = input.transactionHash;
        existing.chainTransactionHash = input.transactionHash;
      }
      if ("blockNumber" in input && input.blockNumber !== undefined) {
        existing.blockNumber = input.blockNumber;
      }
      if ("finalityMarker" in input && input.finalityMarker !== undefined) {
        existing.finalityMarker = input.finalityMarker;
      }
      mergeProvenance(existing, input);
      return;
    }

    const settlement: SettlementRecord = {
      settlementId: input.settlementId,
      reservationId: reservation.reservationId,
      intentId: reservation.intentId,
      state,
      expectedAmountMinor: reservation.amountMinor,
      settledAmountMinor: input.settledAmountMinor,
      chainTransactionHash: input.transactionHash,
      transactionHash: input.transactionHash ?? reservation.transactionHash,
      blockNumber: "blockNumber" in input ? input.blockNumber : undefined,
      finalityMarker: "finalityMarker" in input ? input.finalityMarker : undefined,
      createdAt: now,
      updatedAt: now,
      ...sanitizeProvenance(reservation),
      ...sanitizeProvenance(input),
      intentId: reservation.intentId
    };
    this.settlements.set(settlement.settlementId, settlement);
  }

  private postSettlementLedgerEntry(reservation: ReservationRecord, settlementId?: string): void {
    if (!settlementId) {
      throw new Error("finalization requires settlementId");
    }
    if (this.ledgerEntries.some((entry) => entry.settlementId === settlementId)) {
      return;
    }

    const account = this.requireAccount(reservation.accountId, reservation.assetId);
    if (reservation.amountMinor > account.settledBalanceMinor) {
      throw new Error("cannot post settlement larger than settled balance");
    }

    account.settledBalanceMinor -= reservation.amountMinor;
    account.updatedAt = new Date();
    account.optimisticToken += 1;
    this.accounts.set(this.accountKey(account.accountId, account.assetId), account);

    const entry: LedgerEntryRecord = {
      entryId: `entry-${++this.entryCounter}`,
      reservationId: reservation.reservationId,
      settlementId,
      accountId: reservation.accountId,
      assetId: reservation.assetId,
      amountMinor: reservation.amountMinor,
      side: "debit",
      transactionHash: reservation.transactionHash,
      postedAt: new Date(),
      ...sanitizeProvenance(reservation)
    };
    this.ledgerEntries.push(entry);
  }

  private appendLifecycleEvent(input: {
    reservation: ReservationRecord;
    settlementId?: string;
    eventType: string;
    state: ReservationState;
    idempotencyKey?: string;
    chainEventId?: string;
    blockNumber?: bigint;
    finalityMarker?: string;
    transactionHash?: string;
    metadata?: Record<string, string | number | boolean>;
    provenance: ProvenanceFields;
  }): void {
    const now = new Date();
    const previousEventHash = this.lastEventHashByReservation.get(input.reservation.reservationId);
    const payload = {
      reservationId: input.reservation.reservationId,
      settlementId: input.settlementId,
      intentId: input.reservation.intentId,
      eventType: input.eventType,
      state: input.state,
      idempotencyKey: input.idempotencyKey,
      chainEventId: input.chainEventId,
      blockNumber: input.blockNumber,
      finalityMarker: input.finalityMarker,
      transactionHash: input.transactionHash,
      metadata: input.metadata,
      provenance: sanitizeProvenance({ ...input.reservation, ...input.provenance }),
      createdAt: now.toISOString(),
      previousEventHash
    };

    const eventHash = hashPayload(payload);
    const event: SettlementEventRecord = {
      eventId: `evt-${++this.eventCounter}`,
      reservationId: input.reservation.reservationId,
      settlementId: input.settlementId,
      intentId: input.reservation.intentId,
      eventType: input.eventType,
      state: input.state,
      idempotencyKey: input.idempotencyKey,
      chainEventId: input.chainEventId,
      blockNumber: input.blockNumber,
      finalityMarker: input.finalityMarker,
      transactionHash: input.transactionHash,
      metadata: input.metadata,
      previousEventHash,
      eventHash,
      createdAt: now,
      ...sanitizeProvenance({ ...input.reservation, ...input.provenance })
    };

    this.settlementEvents.push(event);
    this.lastEventHashByReservation.set(input.reservation.reservationId, eventHash);
  }

  private computeBalances(accountId: string, assetId: string): ReservationBalanceSnapshot {
    const account = this.requireAccount(accountId, assetId);
    const activeReservedBalanceMinor = [...this.reservations.values()]
      .filter((reservation) => reservation.accountId === accountId && reservation.assetId === assetId && ACTIVE_RESERVED_STATES.has(reservation.state))
      .reduce((sum, reservation) => sum + reservation.amountMinor, 0n);

    return {
      settledBalanceMinor: account.settledBalanceMinor,
      activeReservedBalanceMinor,
      availableBalanceMinor: account.settledBalanceMinor - activeReservedBalanceMinor
    };
  }

  private accountKey(accountId: string, assetId: string): string {
    return `${accountId}::${assetId}`;
  }

  private requireAccount(accountId: string, assetId: string): LedgerAccount {
    const account = this.accounts.get(this.accountKey(accountId, assetId));
    if (!account) {
      throw new Error(`unknown ledger account: ${accountId}/${assetId}`);
    }
    return account;
  }

  private requireReservation(reservationId: string): ReservationRecord {
    const reservation = this.reservations.get(reservationId);
    if (!reservation) {
      throw new Error(`unknown reservation: ${reservationId}`);
    }
    return reservation;
  }

  private async withAccountLock<T>(accountId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.accountLocks.get(accountId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    this.accountLocks.set(accountId, previous.then(() => gate));
    await previous;

    try {
      return await fn();
    } finally {
      release();
      const pending = this.accountLocks.get(accountId);
      if (pending === previous.then(() => gate)) {
        this.accountLocks.delete(accountId);
      }
    }
  }
}

export function canTransitionReservation(from: ReservationState, to: ReservationState): boolean {
  if (from === to) {
    return true;
  }

  const transitions: Record<ReservationState, Set<ReservationState>> = {
    created: new Set(["validating", "cancelled", "expired", "rejected"]),
    validating: new Set(["authorized", "rejected", "expired", "cancelled"]),
    authorized: new Set(["reserved", "rejected", "cancelled", "expired"]),
    reserved: new Set(["submitted", "cancelled", "expired", "disputed", "manual_review"]),
    submitted: new Set(["included", "dropped", "retrying", "reverted", "disputed", "manual_review"]),
    included: new Set(["confirmed", "dropped", "retrying", "reverted", "disputed", "manual_review"]),
    confirmed: new Set(["finalized", "dropped", "reverted", "retrying", "disputed", "manual_review"]),
    finalized: new Set(["reconciling", "partial", "disputed", "manual_review"]),
    reconciling: new Set(["reconciled", "partial", "disputed", "manual_review", "retrying"]),
    reconciled: new Set(),
    rejected: new Set(),
    expired: new Set(),
    cancelled: new Set(),
    dropped: new Set(["retrying", "manual_review"]),
    reverted: new Set(["retrying", "manual_review", "disputed"]),
    retrying: new Set(["submitted", "included", "confirmed", "finalized", "reconciling", "manual_review"]),
    partial: new Set(["reconciling", "manual_review", "disputed", "reconciled"]),
    disputed: new Set(["manual_review", "reconciling", "reconciled"]),
    manual_review: new Set(["retrying", "reconciling", "reconciled", "cancelled", "disputed"])
  };

  return transitions[from].has(to);
}

export function verifyTimelineHashIntegrity(timeline: LifecycleTimelineItem[]): boolean {
  const sorted = [...timeline].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  let previousEventHash: string | undefined;

  for (const event of sorted) {
    if (event.previousEventHash !== previousEventHash) {
      return false;
    }

    const payload = {
      reservationId: event.reservationId,
      settlementId: event.settlementId,
      intentId: event.intentId,
      eventType: event.eventType,
      state: event.state,
      previousEventHash,
      createdAt: event.createdAt.toISOString(),
      provenance: sanitizeProvenance(event.provenance)
    };
    const computedHash = hashPayload(payload);
    if (computedHash !== event.eventHash) {
      return false;
    }

    previousEventHash = event.eventHash;
  }

  return true;
}

function isOutOfOrderForwardTransition(from: ReservationState, to: ReservationState): boolean {
  return transitionIndex(to) > transitionIndex(from) && !canTransitionReservation(from, to);
}

function transitionIndex(state: ReservationState): number {
  const index = FORWARD_PATH.indexOf(state);
  return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
}

function eventTypeToState(eventType: RecordSettlementEventInput["eventType"]): ReservationState {
  switch (eventType) {
    case "submitted":
      return "submitted";
    case "included":
      return "included";
    case "confirmed":
      return "confirmed";
    case "finalized":
      return "finalized";
    case "reconciling":
      return "reconciling";
    case "reconciled":
      return "reconciled";
    case "dropped":
      return "dropped";
    case "reverted":
      return "reverted";
  }
}

function inferDiscrepancyReason(expected: bigint, settled: bigint, matched: boolean): DiscrepancyReasonCode {
  if (matched) {
    return "exact_match";
  }
  if (settled < expected) {
    return "partial_settlement";
  }
  if (settled > expected) {
    return "over_settlement";
  }
  return "amount_mismatch";
}

function hashPayload(payload: unknown): string {
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

function toTimelineItem(event: SettlementEventRecord): LifecycleTimelineItem {
  return {
    eventId: event.eventId,
    intentId: event.intentId,
    reservationId: event.reservationId,
    settlementId: event.settlementId,
    eventType: event.eventType,
    state: event.state,
    eventHash: event.eventHash,
    previousEventHash: event.previousEventHash,
    createdAt: new Date(event.createdAt),
    provenance: sanitizeProvenance(event)
  };
}

function sanitizeProvenance(input: ProvenanceFields): ProvenanceFields {
  return {
    agentId: input.agentId,
    mandateId: input.mandateId,
    intentId: input.intentId,
    riskAssessmentId: input.riskAssessmentId,
    authorizationId: input.authorizationId,
    policyVersion: input.policyVersion,
    policyHash: input.policyHash,
    sessionKeyId: input.sessionKeyId,
    userOperationHash: input.userOperationHash,
    transactionHash: input.transactionHash
  };
}

function mergeProvenance(target: ProvenanceFields, input: ProvenanceFields): void {
  const incoming = sanitizeProvenance(input);
  for (const [key, value] of Object.entries(incoming)) {
    if (value !== undefined) {
      (target as Record<string, unknown>)[key] = value;
    }
  }
}

function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeForStableSerialization(value));
}

function normalizeForStableSerialization(value: unknown): unknown {
  if (typeof value === "bigint") {
    return `${value.toString()}n`;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeForStableSerialization(item));
  }
  if (value && typeof value === "object") {
    const normalizedEntries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, normalizeForStableSerialization(item)]);
    return Object.fromEntries(normalizedEntries);
  }
  return value;
}

function cloneAccount(account: LedgerAccount): LedgerAccount {
  return {
    ...account,
    createdAt: new Date(account.createdAt),
    updatedAt: new Date(account.updatedAt)
  };
}

function cloneReservation(reservation: ReservationRecord): ReservationRecord {
  return {
    ...reservation,
    createdAt: new Date(reservation.createdAt),
    updatedAt: new Date(reservation.updatedAt),
    expiresAt: reservation.expiresAt ? new Date(reservation.expiresAt) : undefined
  };
}

function cloneLedgerEntry(entry: LedgerEntryRecord): LedgerEntryRecord {
  return {
    ...entry,
    postedAt: new Date(entry.postedAt)
  };
}

function cloneReconciliation(record: ReconciliationRecord): ReconciliationRecord {
  return {
    ...record,
    createdAt: new Date(record.createdAt),
    evidence: { ...record.evidence }
  };
}
