import { PostingSide, type Posting } from "../types.js";

export interface InvariantResult {
  ok: boolean;
  reason?: string;
}

export function validateBalancedPostings(postings: Posting[]): InvariantResult {
  let debits = 0n;
  let credits = 0n;
  const seenPostingIds = new Set<string>();

  for (const posting of postings) {
    if (seenPostingIds.has(posting.posting_id)) {
      return { ok: false, reason: "posting_id must be unique within a ledger event" };
    }
    seenPostingIds.add(posting.posting_id);

    if (posting.amount_minor < 0n) {
      return { ok: false, reason: "amount_minor must be non-negative" };
    }

    if (posting.side === PostingSide.Debit) {
      debits += posting.amount_minor;
    } else {
      credits += posting.amount_minor;
    }
  }

  if (debits !== credits) {
    return { ok: false, reason: "debit and credit totals must match" };
  }

  return { ok: true };
}
