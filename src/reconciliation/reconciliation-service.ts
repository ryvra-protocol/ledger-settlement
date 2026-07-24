import type { ReferenceId } from "../types.js";

export interface ReconciliationResult {
  matched_reference_ids: ReferenceId[];
  mismatched_reference_ids: ReferenceId[];
}

export class ReconciliationService {
  reconcile(candidate_reference_ids: ReferenceId[]): ReconciliationResult {
    return {
      matched_reference_ids: [],
      mismatched_reference_ids: candidate_reference_ids
    };
  }
}
