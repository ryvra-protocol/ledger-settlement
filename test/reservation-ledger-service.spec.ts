import assert from "node:assert/strict";
import test from "node:test";

import {
  ReservationLedgerService,
  verifyTimelineHashIntegrity,
  type ProvenanceFields
} from "../src/index.js";

const fullProvenance: ProvenanceFields = {
  agentId: "agent-1",
  mandateId: "mandate-1",
  riskAssessmentId: "risk-1",
  authorizationId: "auth-1",
  policyVersion: "1.2.3",
  policyHash: "policy-hash",
  sessionKeyId: "session-key-1",
  userOperationHash: "0xuserop",
  transactionHash: "0xtx"
};

test("reservation normal lifecycle transitions to reconciled", async () => {
  const service = new ReservationLedgerService();
  service.upsertAccount("acct-1", "USD", 1_000n);

  const reservation = await service.createReservation({
    accountId: "acct-1",
    assetId: "USD",
    intentId: "intent-lifecycle",
    amountMinor: 300n,
    idempotencyKey: "create-1",
    ...fullProvenance
  });

  assert.equal(reservation.state, "created");
  assert.deepEqual(service.getBalanceSnapshot("acct-1", "USD"), {
    settledBalanceMinor: 1_000n,
    activeReservedBalanceMinor: 300n,
    availableBalanceMinor: 700n
  });

  await service.transitionReservation({ reservationId: reservation.reservationId, toState: "validating" });
  await service.transitionReservation({ reservationId: reservation.reservationId, toState: "authorized" });
  await service.transitionReservation({ reservationId: reservation.reservationId, toState: "reserved" });

  await service.recordSettlementEvent({
    reservationId: reservation.reservationId,
    settlementId: "settlement-1",
    eventType: "submitted",
    idempotencyKey: "submitted-1"
  });
  await service.recordSettlementEvent({
    reservationId: reservation.reservationId,
    settlementId: "settlement-1",
    eventType: "included",
    idempotencyKey: "included-1"
  });
  await service.recordSettlementEvent({
    reservationId: reservation.reservationId,
    settlementId: "settlement-1",
    eventType: "confirmed",
    idempotencyKey: "confirmed-1"
  });
  await service.recordSettlementEvent({
    reservationId: reservation.reservationId,
    settlementId: "settlement-1",
    eventType: "finalized",
    idempotencyKey: "finalized-1"
  });

  const afterFinalization = service.getBalanceSnapshot("acct-1", "USD");
  assert.deepEqual(afterFinalization, {
    settledBalanceMinor: 700n,
    activeReservedBalanceMinor: 0n,
    availableBalanceMinor: 700n
  });

  const reconciliation = await service.runReconciliation({
    reservationId: reservation.reservationId,
    settlementId: "settlement-1",
    settledAmountMinor: 300n,
    retryWorkflowMarker: "retry-1",
    repairWorkflowMarker: "repair-1",
    evidence: { source: "unit-test" }
  });

  assert.equal(reconciliation.matched, true);
  assert.equal(reconciliation.discrepancyReasonCode, "exact_match");
  assert.equal(service.getReservation(reservation.reservationId)?.state, "reconciled");
  assert.equal(service.listLedgerEntries().length, 1);
});

test("expiry and cancellation paths release availability", async () => {
  const service = new ReservationLedgerService();
  service.upsertAccount("acct-2", "USD", 500n);

  const first = await service.createReservation({
    accountId: "acct-2",
    assetId: "USD",
    intentId: "intent-expiry",
    amountMinor: 200n,
    idempotencyKey: "create-expiry",
    expiresAt: new Date("2026-01-01T00:00:00.000Z")
  });

  const second = await service.createReservation({
    accountId: "acct-2",
    assetId: "USD",
    intentId: "intent-cancel",
    amountMinor: 100n,
    idempotencyKey: "create-cancel"
  });

  await service.expireDueReservations(new Date("2026-01-02T00:00:00.000Z"));
  await service.releaseReservation(second.reservationId, "release-cancel");

  assert.equal(service.getReservation(first.reservationId)?.state, "expired");
  assert.equal(service.getReservation(second.reservationId)?.state, "cancelled");
  assert.deepEqual(service.getBalanceSnapshot("acct-2", "USD"), {
    settledBalanceMinor: 500n,
    activeReservedBalanceMinor: 0n,
    availableBalanceMinor: 500n
  });
});

test("dispute and manual-review path preserves reservation safety", async () => {
  const service = new ReservationLedgerService();
  service.upsertAccount("acct-3", "USD", 400n);

  const reservation = await service.createReservation({
    accountId: "acct-3",
    assetId: "USD",
    intentId: "intent-dispute",
    amountMinor: 150n,
    idempotencyKey: "create-dispute"
  });

  await service.transitionReservation({ reservationId: reservation.reservationId, toState: "validating" });
  await service.transitionReservation({ reservationId: reservation.reservationId, toState: "authorized" });
  await service.transitionReservation({ reservationId: reservation.reservationId, toState: "reserved" });
  await service.disputeReservation(reservation.reservationId, "dispute-1");
  await service.transitionReservation({ reservationId: reservation.reservationId, toState: "manual_review" });

  assert.equal(service.getReservation(reservation.reservationId)?.state, "manual_review");
  assert.deepEqual(service.getBalanceSnapshot("acct-3", "USD"), {
    settledBalanceMinor: 400n,
    activeReservedBalanceMinor: 150n,
    availableBalanceMinor: 250n
  });
});

test("invariants and partial settlement handling", async () => {
  const service = new ReservationLedgerService();
  service.upsertAccount("acct-4", "USD", 1_000n);

  const first = await service.createReservation({
    accountId: "acct-4",
    assetId: "USD",
    intentId: "intent-a",
    amountMinor: 800n,
    idempotencyKey: "create-a"
  });

  await assert.rejects(
    () =>
      service.createReservation({
        accountId: "acct-4",
        assetId: "USD",
        intentId: "intent-b",
        amountMinor: 300n,
        idempotencyKey: "create-b"
      }),
    /insufficient available balance/
  );

  await service.releaseReservation(first.reservationId, "release-a");

  const second = await service.createReservation({
    accountId: "acct-4",
    assetId: "USD",
    intentId: "intent-c",
    amountMinor: 300n,
    idempotencyKey: "create-c"
  });

  await service.transitionReservation({ reservationId: second.reservationId, toState: "validating" });
  await service.transitionReservation({ reservationId: second.reservationId, toState: "authorized" });
  await service.transitionReservation({ reservationId: second.reservationId, toState: "reserved" });
  await service.recordSettlementEvent({ reservationId: second.reservationId, settlementId: "settlement-p", eventType: "submitted" });
  await service.recordSettlementEvent({ reservationId: second.reservationId, settlementId: "settlement-p", eventType: "included" });
  await service.recordSettlementEvent({ reservationId: second.reservationId, settlementId: "settlement-p", eventType: "confirmed" });
  await service.recordSettlementEvent({ reservationId: second.reservationId, settlementId: "settlement-p", eventType: "finalized" });

  const reconciliation = await service.runReconciliation({
    reservationId: second.reservationId,
    settlementId: "settlement-p",
    settledAmountMinor: 250n
  });

  assert.equal(reconciliation.matched, false);
  assert.equal(reconciliation.discrepancyReasonCode, "partial_settlement");
  assert.equal(service.getReservation(second.reservationId)?.state, "partial");
});

test("idempotency, replay safety, and out-of-order events are deterministic", async () => {
  const service = new ReservationLedgerService();
  service.upsertAccount("acct-5", "USD", 900n);

  const created = await service.createReservation({
    accountId: "acct-5",
    assetId: "USD",
    intentId: "intent-idem",
    amountMinor: 300n,
    idempotencyKey: "create-idem"
  });

  const replay = await service.createReservation({
    accountId: "acct-5",
    assetId: "USD",
    intentId: "intent-idem",
    amountMinor: 300n,
    idempotencyKey: "create-idem"
  });

  assert.equal(replay.reservationId, created.reservationId);

  await assert.rejects(
    () =>
      service.createReservation({
        accountId: "acct-5",
        assetId: "USD",
        intentId: "intent-idem",
        amountMinor: 200n,
        idempotencyKey: "create-idem"
      }),
    /idempotency payload mismatch/
  );

  await service.transitionReservation({ reservationId: created.reservationId, toState: "validating" });
  await service.transitionReservation({ reservationId: created.reservationId, toState: "authorized" });
  await service.transitionReservation({ reservationId: created.reservationId, toState: "reserved" });

  const outOfOrder = await service.recordSettlementEvent({
    reservationId: created.reservationId,
    settlementId: "settlement-idem",
    eventType: "confirmed",
    idempotencyKey: "out-of-order-confirmed"
  });
  assert.equal(outOfOrder.applied, false);
  assert.equal(outOfOrder.deferred, true);
  assert.equal(service.getReservation(created.reservationId)?.state, "reserved");

  await service.recordSettlementEvent({
    reservationId: created.reservationId,
    settlementId: "settlement-idem",
    eventType: "submitted",
    idempotencyKey: "submitted-idem"
  });
  await service.recordSettlementEvent({
    reservationId: created.reservationId,
    settlementId: "settlement-idem",
    eventType: "included",
    idempotencyKey: "included-idem"
  });

  assert.equal(service.getReservation(created.reservationId)?.state, "confirmed");

  await service.recordSettlementEvent({
    reservationId: created.reservationId,
    settlementId: "settlement-idem",
    eventType: "finalized",
    idempotencyKey: "finalized-idem"
  });
  await service.recordSettlementEvent({
    reservationId: created.reservationId,
    settlementId: "settlement-idem",
    eventType: "finalized",
    idempotencyKey: "finalized-idem"
  });

  assert.equal(service.listLedgerEntries().length, 1);
});

test("provenance fields persist and timeline hashes are verifiable", async () => {
  const service = new ReservationLedgerService();
  service.upsertAccount("acct-6", "USD", 600n);

  const reservation = await service.createReservation({
    accountId: "acct-6",
    assetId: "USD",
    intentId: "intent-prov",
    amountMinor: 200n,
    idempotencyKey: "create-prov",
    ...fullProvenance
  });

  await service.transitionReservation({ reservationId: reservation.reservationId, toState: "validating", ...fullProvenance });
  await service.transitionReservation({ reservationId: reservation.reservationId, toState: "authorized", ...fullProvenance });

  const timeline = service.getTimelineByIntentId("intent-prov");
  assert.equal(timeline.length >= 3, true);
  assert.equal(timeline[0]?.provenance.agentId, "agent-1");
  assert.equal(timeline[0]?.provenance.mandateId, "mandate-1");
  assert.equal(timeline[0]?.provenance.sessionKeyId, "session-key-1");
  assert.equal(timeline[0]?.provenance.userOperationHash, "0xuserop");
  assert.equal(verifyTimelineHashIntegrity(timeline), true);
});

test("concurrency safety prevents double-reserve", async () => {
  const service = new ReservationLedgerService();
  service.upsertAccount("acct-7", "USD", 100n);

  const tasks = [
    service.createReservation({
      accountId: "acct-7",
      assetId: "USD",
      intentId: "intent-race-1",
      amountMinor: 80n,
      idempotencyKey: "race-1"
    }),
    service.createReservation({
      accountId: "acct-7",
      assetId: "USD",
      intentId: "intent-race-2",
      amountMinor: 80n,
      idempotencyKey: "race-2"
    })
  ];

  const results = await Promise.allSettled(tasks);
  const succeeded = results.filter((result) => result.status === "fulfilled");
  const failed = results.filter((result) => result.status === "rejected");

  assert.equal(succeeded.length, 1);
  assert.equal(failed.length, 1);
  assert.deepEqual(service.getBalanceSnapshot("acct-7", "USD"), {
    settledBalanceMinor: 100n,
    activeReservedBalanceMinor: 80n,
    availableBalanceMinor: 20n
  });
});
