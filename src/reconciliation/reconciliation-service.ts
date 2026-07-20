import type { ReferenceId } from "../types.js";

export interface ReconciliationResult {
  matchedReferenceIds: ReferenceId[];
  mismatchedReferenceIds: ReferenceId[];
}

export class ReconciliationService {
  reconcile(candidateReferenceIds: ReferenceId[]): ReconciliationResult {
    return {
      matchedReferenceIds: [],
      mismatchedReferenceIds: candidateReferenceIds
    };
  }
}
