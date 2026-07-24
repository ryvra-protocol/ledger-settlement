# RFC-0004: Ledger and Settlement State Machine (v1)

## Scope

Defines the v1 baseline for ledger semantics and settlement lifecycle in Ryvra Ledger Settlement.

## Ledger principles

1. **Double-entry required**: every ledger event MUST be balanced (`total_debits == total_credits`) per `asset_id`.
2. **Append-only history**: posted ledger events are immutable. Corrections MUST use compensating events.
3. **Deterministic identifiers**: identifiers should be deterministic where feasible to support replay and idempotency (exact strategy TBD by policy/governance).

## Core entities

- `account_id`: canonical account identifier from accounts domain.
- `asset_id`: canonical asset identifier from asset-registry.
- `ledger_event_id`: immutable identifier for a ledger event envelope.
- `posting_id`: immutable identifier for a posting line.
- `reference_id`: external or cross-module idempotency/correlation reference.

### Event envelope contract

All emitted ledger/settlement events use:

- `event_id`
- `correlation_id`
- `reference_id`
- `event_type`
- `timestamp`
- `payload`

## Posting model

### Debit/credit invariants

- Each posting line contains exactly one side: debit **or** credit.
- For each `(ledger_event_id, asset_id)`: sum(debits) MUST equal sum(credits).
- Amounts MUST be non-negative integers in minor units.
- Multi-asset events are allowed only when balanced independently per asset.

### Precision and rounding rules

- Canonical unit scale comes from asset-registry metadata.
- Input amounts must be normalized to minor units before posting.
- Fractional residue handling strategy is **TBD by policy/governance**.
- Rounding mode defaults and tolerances are **TBD by policy/governance**.

## Transaction lifecycle

Primary state path:

`accepted -> executed -> finalized -> reconciled`

### State meanings

- `accepted`: request validated and reserved for execution.
- `executed`: postings written and execution outcome known.
- `finalized`: settlement is final per configured policy.
- `reconciled`: matched against external/internal reconciliation sources.

### Failure and rollback semantics

- No deletion or mutation of posted events.
- Rollback semantics are represented by compensating ledger events.
- Transition to failure paths records terminal reason and reference context.
- Retry behavior must preserve idempotency via `reference_id` and deterministic event construction.

## Idempotency strategy

- `reference_id` must be unique within a bounded idempotency namespace (window TBD by policy/governance).
- Duplicate callback/retry attempts must return prior result when payload is semantically identical.
- Divergent duplicate payloads must be rejected and routed to exception handling.

## Reconciliation requirements

- Daily reconciliation run compares ledger-derived positions vs external statements.
- Mismatches must produce exception records with severity and owner.
- Exceptions require explicit operator action: resolve, compensate, or escalate.
- Reconciliation adjustments MUST be expressed as append-only compensating events.

## Audit and retention

- All ledger events and state transitions must be durably retained.
- Audit trail must preserve actor/system source, timestamp, and reference lineage.
- Retention windows, archive tiers, and legal hold policy are **TBD by policy/governance**.
