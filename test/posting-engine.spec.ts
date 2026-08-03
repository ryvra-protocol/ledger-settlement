import test from "node:test";
import assert from "node:assert/strict";

import { AssetNormalizer, PostingSide, StubPostingEngine, type LedgerEvent } from "../src/index.js";

const baseEvent = (): LedgerEvent => ({
  event_id: "evt-1",
  correlation_id: "corr-1",
  reference_id: "ref-1",
  event_type: "ledger.posted",
  timestamp: new Date("2026-01-01T00:00:00.000Z"),
  payload: {
    ledger_event_id: "le-1",
    postings: [
      {
        posting_id: "post-1",
        account_id: "acct-1",
        asset_id: "usd",
        side: PostingSide.Debit,
        amount_minor: 100n
      },
      {
        posting_id: "post-2",
        account_id: "acct-2",
        asset_id: "usd",
        side: PostingSide.Credit,
        amount_minor: 100n
      }
    ]
  }
});

test("prepare is idempotent for semantically identical replays", () => {
  const engine = new StubPostingEngine();
  const event = baseEvent();

  assert.equal(engine.prepare(event), event);
  assert.equal(engine.prepare(baseEvent()).reference_id, event.reference_id);
});

test("prepare rejects divergent duplicate payloads for same reference_id", () => {
  const engine = new StubPostingEngine();
  engine.prepare(baseEvent());

  const divergentReplay = baseEvent();
  divergentReplay.payload.postings[1] = {
    ...divergentReplay.payload.postings[1],
    amount_minor: 90n
  };

  assert.throws(() => {
    engine.prepare(divergentReplay);
  }, /idempotent replay payload mismatch/);
});

test("prepare rejects posting reuse across different ledger events", () => {
  const engine = new StubPostingEngine();
  engine.prepare(baseEvent());

  const newEvent = baseEvent();
  newEvent.event_id = "evt-2";
  newEvent.correlation_id = "corr-2";
  newEvent.reference_id = "ref-2";
  newEvent.payload.ledger_event_id = "le-2";
  newEvent.payload.postings[0] = {
    ...newEvent.payload.postings[0],
    posting_id: "post-1"
  };
  newEvent.payload.postings[1] = {
    ...newEvent.payload.postings[1],
    posting_id: "post-3"
  };

  assert.throws(() => {
    engine.prepare(newEvent);
  }, /duplicate posting_id: post-1/);
});

test("prepare normalizes asset aliases when normalizer is configured", () => {
  const normalizer = new AssetNormalizer({
    assets: [{ canonical_asset_id: "USD", decimals: 2, aliases: ["usd"] }]
  });
  const engine = new StubPostingEngine(normalizer);
  const event = baseEvent();

  const prepared = engine.prepare(event);
  assert.equal(prepared.payload.postings[0]?.asset_id, "USD");
  assert.equal(prepared.payload.postings[1]?.asset_id, "USD");
});
