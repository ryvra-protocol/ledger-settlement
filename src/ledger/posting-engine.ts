import type { LedgerEvent } from "../types.js";
import { validateBalancedPostings } from "./invariants.js";

export interface PostingEngine {
  prepare(event: LedgerEvent): LedgerEvent;
}

export class StubPostingEngine implements PostingEngine {
  private readonly eventByReferenceId = new Map<string, string>();
  private readonly postingIds = new Set<string>();

  prepare(event: LedgerEvent): LedgerEvent {
    const normalizedPayload = JSON.stringify(event.payload, (_, value) =>
      typeof value === "bigint" ? value.toString() : value
    );

    const existingPayload = this.eventByReferenceId.get(event.reference_id);
    if (existingPayload !== undefined) {
      if (existingPayload !== normalizedPayload) {
        throw new Error("idempotent replay payload mismatch");
      }
      return event;
    }

    const invariant = validateBalancedPostings(event.payload.postings);
    if (!invariant.ok) {
      throw new Error(invariant.reason ?? "invalid postings");
    }

    for (const posting of event.payload.postings) {
      if (this.postingIds.has(posting.posting_id)) {
        throw new Error(`duplicate posting_id: ${posting.posting_id}`);
      }
    }

    for (const posting of event.payload.postings) {
      this.postingIds.add(posting.posting_id);
    }

    this.eventByReferenceId.set(event.reference_id, normalizedPayload);
    return event;
  }
}
