import type { ReferenceId } from "../types.js";
import type { AssetNormalizer } from "../ledger/asset-normalization.js";
import type { UserOperationLifecycleOutcome } from "../types.js";
import { SettlementState } from "../types.js";
import { mapUserOperationOutcomeToSettlementState } from "../settlement/state-machine.js";

export type ReconciliationMismatchCategory =
  | "timing"
  | "data_mismatch"
  | "unresolved_exception"
  | "aa_userop_failed"
  | "aa_context_mismatch";

export interface ReconciliationEntry {
  reference_id: ReferenceId;
  account_id: string;
  asset_id: string;
  amount_minor: bigint;
  user_op_hash?: string;
  entry_point?: string;
  user_operation_account?: string;
}

export interface UserOperationOutcomeReference {
  user_op_hash: string;
  outcome: UserOperationLifecycleOutcome;
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
  known_user_operation_outcomes?: UserOperationOutcomeReference[];
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
    const settlementStateByUserOpHash = toUserOperationSettlementStateMap(input.known_user_operation_outcomes ?? []);

    const allReferenceIds = [...new Set([...ledgerByReferenceId.keys(), ...externalByReferenceId.keys()])].sort();
    const matched: ReferenceId[] = [];
    const mismatches: ReconciliationMismatch[] = [];

    for (const referenceId of allReferenceIds) {
      const ledgerEntry = ledgerByReferenceId.get(referenceId);
      const externalEntry = externalByReferenceId.get(referenceId);

      if (!ledgerEntry || !externalEntry) {
        const contextEntry = ledgerEntry ?? externalEntry;
        mismatches.push({
          reference_id: referenceId,
          category: classifyMissing(referenceId, contextEntry, knownPending, knownExceptions, settlementStateByUserOpHash),
          reason: "reference missing from one side of reconciliation",
          ledger_entry: ledgerEntry,
          external_entry: externalEntry
        });
        continue;
      }

      const userOperationMismatchReason = describeUserOperationContextMismatch(ledgerEntry, externalEntry);
      if (userOperationMismatchReason) {
        mismatches.push({
          reference_id: referenceId,
          category: "aa_context_mismatch",
          reason: userOperationMismatchReason,
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
  contextEntry: ReconciliationEntry | undefined,
  knownPending: Set<ReferenceId>,
  knownExceptions: Set<ReferenceId>,
  settlementStateByUserOpHash: Map<string, SettlementState>
): ReconciliationMismatchCategory {
  if (contextEntry?.user_op_hash) {
    const state = settlementStateByUserOpHash.get(normalizeIdentifier(contextEntry.user_op_hash));
    if (state === SettlementState.Failed) {
      return "aa_userop_failed";
    }
  }
  if (knownExceptions.has(referenceId)) {
    return "unresolved_exception";
  }
  if (knownPending.has(referenceId)) {
    return "timing";
  }
  return "unresolved_exception";
}

function describeUserOperationContextMismatch(
  ledgerEntry: ReconciliationEntry,
  externalEntry: ReconciliationEntry
): string | undefined {
  const ledgerHash = normalizeIdentifier(ledgerEntry.user_op_hash);
  const externalHash = normalizeIdentifier(externalEntry.user_op_hash);
  if (ledgerHash && externalHash && ledgerHash !== externalHash) {
    return "user_op_hash mismatch";
  }

  const ledgerEntryPoint = normalizeIdentifier(ledgerEntry.entry_point);
  const externalEntryPoint = normalizeIdentifier(externalEntry.entry_point);
  if (ledgerEntryPoint && externalEntryPoint && ledgerEntryPoint !== externalEntryPoint) {
    return "entry_point mismatch";
  }

  const ledgerUserOperationAccount = normalizeIdentifier(ledgerEntry.user_operation_account);
  const externalUserOperationAccount = normalizeIdentifier(externalEntry.user_operation_account);
  if (ledgerUserOperationAccount && externalUserOperationAccount && ledgerUserOperationAccount !== externalUserOperationAccount) {
    return "user_operation_account mismatch";
  }

  return undefined;
}

function toUserOperationSettlementStateMap(
  outcomes: UserOperationOutcomeReference[]
): Map<string, SettlementState> {
  const result = new Map<string, SettlementState>();
  for (const item of outcomes) {
    result.set(normalizeIdentifier(item.user_op_hash), mapUserOperationOutcomeToSettlementState(item.outcome));
  }
  return result;
}

function normalizeIdentifier(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}
