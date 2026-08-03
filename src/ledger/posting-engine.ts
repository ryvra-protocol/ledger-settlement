import type { LedgerEvent } from "../types.js";
import type { AssetNormalizer } from "./asset-normalization.js";
import { validateBalancedPostings } from "./invariants.js";

export interface PostingEngine {
  prepare(event: LedgerEvent): LedgerEvent;
}

export class StubPostingEngine implements PostingEngine {
  private readonly eventByReferenceId = new Map<string, string>();
  private readonly postingIds = new Set<string>();

  constructor(private readonly normalizer?: AssetNormalizer) {}

  prepare(event: LedgerEvent): LedgerEvent {
    const normalizedEvent = this.normalizeEvent(event);
    const normalizedPayload = JSON.stringify(normalizedEvent.payload, (_, value) =>
      typeof value === "bigint" ? value.toString() : value
    );

    const existingPayload = this.eventByReferenceId.get(normalizedEvent.reference_id);
    if (existingPayload !== undefined) {
      if (existingPayload !== normalizedPayload) {
        throw new Error("idempotent replay payload mismatch");
      }
      return normalizedEvent;
    }

    const invariant = validateBalancedPostings(normalizedEvent.payload.postings, {
      normalizer: this.normalizer
    });
    if (!invariant.ok) {
      throw new Error(invariant.reason ?? "invalid postings");
    }

    for (const posting of normalizedEvent.payload.postings) {
      if (this.postingIds.has(posting.posting_id)) {
        throw new Error(`duplicate posting_id: ${posting.posting_id}`);
      }
    }

    for (const posting of normalizedEvent.payload.postings) {
      this.postingIds.add(posting.posting_id);
    }

    this.eventByReferenceId.set(normalizedEvent.reference_id, normalizedPayload);
    return normalizedEvent;
  }

  private normalizeEvent(event: LedgerEvent): LedgerEvent {
    if (!this.normalizer) {
      return event;
    }

    return {
      ...event,
      payload: {
        ...event.payload,
        postings: event.payload.postings.map((posting) => this.normalizer!.normalizePosting(posting))
      }
    };
  }
}
