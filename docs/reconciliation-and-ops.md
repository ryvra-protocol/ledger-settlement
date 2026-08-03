# Reconciliation and Operations

## Daily reconciliation flow

1. Snapshot ledger positions at reconciliation cut-off.
2. Ingest counterparty/external statements.
3. Match by `reference_id`, account, asset, and amount.
4. Classify differences: timing, data mismatch, unresolved exception, and AA-specific context/failure categories.
5. Emit reconciliation report and exception queue.

## Exception queues and operator review

- Exceptions are prioritized by materiality and risk classification.
- Operators must document disposition for each exception:
  - resolved (timing resolution or data clarification)
  - compensated (append-only compensation event)
  - escalated (policy/risk/legal)
- Auto-close thresholds and SLA targets are **TBD by policy/governance**.

## Break-glass procedures

- Break-glass actions must require dual authorization (TBD by policy/governance).
- Every break-glass invocation must produce immutable audit records.
- Break-glass cannot mutate historical posted events; only compensating events are allowed.

## Observability metrics

Track at minimum:

- `unreconciled_events_count`
- `settlement_latency`
- `failed_transitions`
- `duplicate_reference_attempts`
- `aa_userop_failed_count`
- `aa_context_mismatch_count`

Alert thresholds and paging policy are **TBD by policy/governance**.
