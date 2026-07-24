import test from "node:test";
import assert from "node:assert/strict";

import {
  CANONICAL_SETTLEMENT_STATES,
  SettlementState,
  canTransition,
  assertTransition
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
