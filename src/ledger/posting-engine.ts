import type { LedgerEvent } from "../types.js";
import { validateBalancedPostings } from "./invariants.js";

export interface PostingEngine {
  prepare(event: LedgerEvent): LedgerEvent;
}

export class StubPostingEngine implements PostingEngine {
  prepare(event: LedgerEvent): LedgerEvent {
    const invariant = validateBalancedPostings(event.postings);
    if (!invariant.ok) {
      throw new Error(invariant.reason ?? "invalid postings");
    }
    return event;
  }
}
