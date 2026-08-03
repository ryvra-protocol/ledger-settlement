import test from "node:test";
import assert from "node:assert/strict";

import {
  CANONICAL_SETTLEMENT_STATES,
  SettlementState,
  canTransition,
  assertTransition,
  mapUserOperationOutcomeToSettlementState
} from "../src/index.js";

test("canTransition supports accepted -> executed", () => {
  assert.equal(canTransition(SettlementState.Accepted, SettlementState.Executed), true);
});

test("assertTransition rejects reconciled -> executed", () => {
  assert.throws(() => {
    assertTransition(SettlementState.Reconciled, SettlementState.Executed);
  });
});

test("SettlementState values match canonical vocabulary exactly", () => {
  const stateValues = Object.values(SettlementState).sort();
  const canonicalValues = [...CANONICAL_SETTLEMENT_STATES].sort();
  assert.deepEqual(stateValues, canonicalValues);
});

test("mapUserOperationOutcomeToSettlementState maps success and failure outcomes", () => {
  assert.equal(mapUserOperationOutcomeToSettlementState("received"), SettlementState.Accepted);
  assert.equal(mapUserOperationOutcomeToSettlementState("included"), SettlementState.Executed);
  assert.equal(mapUserOperationOutcomeToSettlementState("confirmed"), SettlementState.Finalized);
  assert.equal(mapUserOperationOutcomeToSettlementState("settled"), SettlementState.Reconciled);
  assert.equal(mapUserOperationOutcomeToSettlementState("failed"), SettlementState.Failed);
  assert.equal(mapUserOperationOutcomeToSettlementState("reverted"), SettlementState.Failed);
  assert.equal(mapUserOperationOutcomeToSettlementState("dropped"), SettlementState.Failed);
});
