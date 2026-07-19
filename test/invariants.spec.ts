import test from "node:test";
import assert from "node:assert/strict";

import { PostingSide, validateBalancedPostings, type Posting } from "../src/index.js";

test("validateBalancedPostings accepts balanced entries", () => {
  const postings: Posting[] = [
    { postingId: "p1", accountId: "a1", assetId: "usd", side: PostingSide.Debit, amountMinor: 100n },
    { postingId: "p2", accountId: "a2", assetId: "usd", side: PostingSide.Credit, amountMinor: 100n }
  ];

  assert.deepEqual(validateBalancedPostings(postings), { ok: true });
});

test("validateBalancedPostings rejects unbalanced entries", () => {
  const postings: Posting[] = [
    { postingId: "p1", accountId: "a1", assetId: "usd", side: PostingSide.Debit, amountMinor: 100n },
    { postingId: "p2", accountId: "a2", assetId: "usd", side: PostingSide.Credit, amountMinor: 90n }
  ];

  assert.equal(validateBalancedPostings(postings).ok, false);
});
