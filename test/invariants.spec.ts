import test from "node:test";
import assert from "node:assert/strict";

import { PostingSide, validateBalancedPostings, type Posting } from "../src/index.js";

test("validateBalancedPostings accepts balanced entries", () => {
  const postings: Posting[] = [
    { posting_id: "p1", account_id: "a1", asset_id: "usd", side: PostingSide.Debit, amount_minor: 100n },
    { posting_id: "p2", account_id: "a2", asset_id: "usd", side: PostingSide.Credit, amount_minor: 100n }
  ];

  assert.deepEqual(validateBalancedPostings(postings), { ok: true });
});

test("validateBalancedPostings rejects unbalanced entries", () => {
  const postings: Posting[] = [
    { posting_id: "p1", account_id: "a1", asset_id: "usd", side: PostingSide.Debit, amount_minor: 100n },
    { posting_id: "p2", account_id: "a2", asset_id: "usd", side: PostingSide.Credit, amount_minor: 90n }
  ];

  assert.equal(validateBalancedPostings(postings).ok, false);
});

test("validateBalancedPostings rejects duplicate posting_id entries", () => {
  const postings: Posting[] = [
    { posting_id: "p1", account_id: "a1", asset_id: "usd", side: PostingSide.Debit, amount_minor: 100n },
    { posting_id: "p1", account_id: "a2", asset_id: "usd", side: PostingSide.Credit, amount_minor: 100n }
  ];

  assert.equal(validateBalancedPostings(postings).ok, false);
});

test("validateBalancedPostings rejects cross-asset netting", () => {
  const postings: Posting[] = [
    { posting_id: "p1", account_id: "a1", asset_id: "usd", side: PostingSide.Debit, amount_minor: 100n },
    { posting_id: "p2", account_id: "a2", asset_id: "eur", side: PostingSide.Credit, amount_minor: 100n }
  ];

  assert.equal(validateBalancedPostings(postings).ok, false);
});

test("validateBalancedPostings accepts independent multi-asset balancing", () => {
  const postings: Posting[] = [
    { posting_id: "p1", account_id: "a1", asset_id: "usd", side: PostingSide.Debit, amount_minor: 100n },
    { posting_id: "p2", account_id: "a2", asset_id: "usd", side: PostingSide.Credit, amount_minor: 100n },
    { posting_id: "p3", account_id: "a3", asset_id: "eur", side: PostingSide.Debit, amount_minor: 30n },
    { posting_id: "p4", account_id: "a4", asset_id: "eur", side: PostingSide.Credit, amount_minor: 30n }
  ];

  assert.equal(validateBalancedPostings(postings).ok, true);
});
