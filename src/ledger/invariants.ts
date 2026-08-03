import { PostingSide, type Posting } from "../types.js";
import type { AssetNormalizer } from "./asset-normalization.js";

export interface InvariantResult {
  ok: boolean;
  reason?: string;
}

export interface PostingValidationOptions {
  normalizer?: AssetNormalizer;
}

export function validateBalancedPostings(
  postings: Posting[],
  options: PostingValidationOptions = {}
): InvariantResult {
  const debitsByAsset = new Map<string, bigint>();
  const creditsByAsset = new Map<string, bigint>();
  const seenPostingIds = new Set<string>();

  for (const posting of postings) {
    const normalizedPosting = options.normalizer ? options.normalizer.normalizePosting(posting) : posting;

    if (seenPostingIds.has(posting.posting_id)) {
      return { ok: false, reason: "posting_id must be unique within a ledger event" };
    }
    seenPostingIds.add(posting.posting_id);

    if (normalizedPosting.asset_id.trim().length === 0) {
      return { ok: false, reason: "asset_id must be non-empty" };
    }

    if (normalizedPosting.amount_minor < 0n) {
      return { ok: false, reason: "amount_minor must be non-negative" };
    }

    if (normalizedPosting.side === PostingSide.Debit) {
      debitsByAsset.set(
        normalizedPosting.asset_id,
        (debitsByAsset.get(normalizedPosting.asset_id) ?? 0n) + normalizedPosting.amount_minor
      );
    } else {
      creditsByAsset.set(
        normalizedPosting.asset_id,
        (creditsByAsset.get(normalizedPosting.asset_id) ?? 0n) + normalizedPosting.amount_minor
      );
    }
  }

  const assets = new Set<string>([...debitsByAsset.keys(), ...creditsByAsset.keys()]);
  for (const assetId of assets) {
    const debits = debitsByAsset.get(assetId) ?? 0n;
    const credits = creditsByAsset.get(assetId) ?? 0n;
    if (debits !== credits) {
      return { ok: false, reason: `debit and credit totals must match per asset_id (${assetId})` };
    }
  }

  return { ok: true };
}
