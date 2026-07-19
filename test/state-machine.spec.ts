import test from "node:test";
import assert from "node:assert/strict";

import { SettlementState, canTransition, assertTransition } from "../src/index.js";

test("canTransition supports accepted -> executed", () => {
  assert.equal(canTransition(SettlementState.Accepted, SettlementState.Executed), true);
});

test("assertTransition rejects reconciled -> executed", () => {
  assert.throws(() => {
    assertTransition(SettlementState.Reconciled, SettlementState.Executed);
  });
});
