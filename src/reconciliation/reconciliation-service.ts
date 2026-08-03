import type { ReferenceId } from "../types.js";
import type { AssetNormalizer } from "../ledger/asset-normalization.js";

export type ReconciliationMismatchCategory = "timing" | "data_mismatch" | "unresolved_exception";

export interface ReconciliationEntry {
  reference_id: ReferenceId;
  account_id: string;
  asset_id: string;
  amount_minor: bigint;
}

export interface ReconciliationMismatch {
  reference_id: ReferenceId;
  category: ReconciliationMismatchCategory;
  reason: string;
  ledger_entry?: ReconciliationEntry;
  external_entry?: ReconciliationEntry;
}

export interface ReconciliationResult {
  matched_reference_ids: ReferenceId[];
  mismatched_reference_ids: ReferenceId[];
  mismatches?: ReconciliationMismatch[];
}

export interface ReconcileUnifiedInput {
  ledger_entries: ReconciliationEntry[];
  external_entries: ReconciliationEntry[];
  known_pending_reference_ids?: ReferenceId[];
  known_exception_reference_ids?: ReferenceId[];
  normalizer?: AssetNormalizer;
}

export class ReconciliationService {
  reconcile(candidate_reference_ids: ReferenceId[]): ReconciliationResult {
    return {
      matched_reference_ids: [],
      mismatched_reference_ids: candidate_reference_ids
    };
  }

  reconcileUnified(input: ReconcileUnifiedInput): ReconciliationResult {
    const ledgerByReferenceId = toReferenceMap(input.ledger_entries, input.normalizer);
    const externalByReferenceId = toReferenceMap(input.external_entries, input.normalizer);
    const knownPending = new Set(input.known_pending_reference_ids ?? []);
    const knownExceptions = new Set(input.known_exception_reference_ids ?? []);

    const allReferenceIds = [...new Set([...ledgerByReferenceId.keys(), ...externalByReferenceId.keys()])].sort();
    const matched: ReferenceId[] = [];
    const mismatches: ReconciliationMismatch[] = [];

    for (const referenceId of allReferenceIds) {
      const ledgerEntry = ledgerByReferenceId.get(referenceId);
      const externalEntry = externalByReferenceId.get(referenceId);

      if (!ledgerEntry || !externalEntry) {
        mismatches.push({
          reference_id: referenceId,
          category: classifyMissing(referenceId, knownPending, knownExceptions),
          reason: "reference missing from one side of reconciliation",
          ledger_entry: ledgerEntry,
          external_entry: externalEntry
        });
        continue;
      }

      if (ledgerEntry.asset_id !== externalEntry.asset_id || ledgerEntry.amount_minor !== externalEntry.amount_minor) {
        mismatches.push({
          reference_id: referenceId,
          category: "data_mismatch",
          reason: "asset_id or amount_minor mismatch",
          ledger_entry: ledgerEntry,
          external_entry: externalEntry
        });
        continue;
      }

      matched.push(referenceId);
    }

    return {
      matched_reference_ids: matched,
      mismatched_reference_ids: mismatches.map((mismatch) => mismatch.reference_id),
      mismatches
    };
  }
}

function toReferenceMap(
  entries: ReconciliationEntry[],
  normalizer?: AssetNormalizer
): Map<ReferenceId, ReconciliationEntry> {
  const result = new Map<ReferenceId, ReconciliationEntry>();

  for (const entry of entries) {
    const normalized = normalizer
      ? {
          ...entry,
          asset_id: normalizer.normalizeAssetId(entry.asset_id),
          amount_minor: normalizer.normalizeMinorAmount(entry.amount_minor)
        }
      : entry;
    result.set(normalized.reference_id, normalized);
  }

  return result;
}

function classifyMissing(
  referenceId: ReferenceId,
  knownPending: Set<ReferenceId>,
  knownExceptions: Set<ReferenceId>
): ReconciliationMismatchCategory {
  if (knownExceptions.has(referenceId)) {
    return "unresolved_exception";
  }
  if (knownPending.has(referenceId)) {
    return "timing";
  }
  return "unresolved_exception";
}
