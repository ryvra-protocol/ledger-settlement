import { PostingSide, type Posting } from "../types.js";

export interface InvariantResult {
  ok: boolean;
  reason?: string;
}

export function validateBalancedPostings(postings: Posting[]): InvariantResult {
  let debits = 0n;
  let credits = 0n;

  for (const posting of postings) {
    if (posting.amountMinor < 0n) {
      return { ok: false, reason: "amountMinor must be non-negative" };
    }

    if (posting.side === PostingSide.Debit) {
      debits += posting.amountMinor;
    } else {
      credits += posting.amountMinor;
    }
  }

  if (debits !== credits) {
    return { ok: false, reason: "debit and credit totals must match" };
  }

  return { ok: true };
}
