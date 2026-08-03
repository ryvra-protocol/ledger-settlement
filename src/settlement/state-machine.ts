import { SettlementState, type UserOperationLifecycleOutcome } from "../types.js";

const allowedTransitions: Record<SettlementState, Set<SettlementState>> = {
  [SettlementState.Accepted]: new Set([SettlementState.Executed, SettlementState.Failed]),
  [SettlementState.Executed]: new Set([SettlementState.Finalized, SettlementState.Failed]),
  [SettlementState.Finalized]: new Set([SettlementState.Reconciled]),
  [SettlementState.Reconciled]: new Set(),
  [SettlementState.Failed]: new Set()
};

export function canTransition(from: SettlementState, to: SettlementState): boolean {
  return allowedTransitions[from].has(to);
}

export function assertTransition(from: SettlementState, to: SettlementState): void {
  if (!canTransition(from, to)) {
    throw new Error(`invalid settlement transition: ${from} -> ${to}`);
  }
}

export function mapUserOperationOutcomeToSettlementState(
  outcome: UserOperationLifecycleOutcome
): SettlementState {
  switch (outcome) {
    case "received":
      return SettlementState.Accepted;
    case "included":
      return SettlementState.Executed;
    case "confirmed":
      return SettlementState.Finalized;
    case "settled":
      return SettlementState.Reconciled;
    case "failed":
    case "reverted":
    case "dropped":
      return SettlementState.Failed;
  }
}
