import test from "node:test";
import assert from "node:assert/strict";

import { AssetNormalizer, ReconciliationService } from "../src/index.js";

test("reconcileUnified classifies mismatches deterministically", () => {
  const normalizer = new AssetNormalizer({
    assets: [{ canonical_asset_id: "USD", decimals: 2, aliases: ["usd"] }]
  });
  const service = new ReconciliationService();

  const result = service.reconcileUnified({
    normalizer,
    known_pending_reference_ids: ["ref-3"],
    known_exception_reference_ids: ["ref-4"],
    ledger_entries: [
      { reference_id: "ref-1", account_id: "a1", asset_id: "usd", amount_minor: 100n },
      { reference_id: "ref-2", account_id: "a1", asset_id: "USD", amount_minor: 100n },
      { reference_id: "ref-3", account_id: "a1", asset_id: "USD", amount_minor: 50n }
    ],
    external_entries: [
      { reference_id: "ref-1", account_id: "a1", asset_id: "USD", amount_minor: 100n },
      { reference_id: "ref-2", account_id: "a1", asset_id: "USD", amount_minor: 90n },
      { reference_id: "ref-4", account_id: "a1", asset_id: "USD", amount_minor: 12n }
    ]
  });

  assert.deepEqual(result.matched_reference_ids, ["ref-1"]);
  assert.deepEqual(result.mismatched_reference_ids, ["ref-2", "ref-3", "ref-4"]);
  assert.deepEqual(
    result.mismatches?.map((mismatch) => ({ reference_id: mismatch.reference_id, category: mismatch.category })),
    [
      { reference_id: "ref-2", category: "data_mismatch" },
      { reference_id: "ref-3", category: "timing" },
      { reference_id: "ref-4", category: "unresolved_exception" }
    ]
  );
});
