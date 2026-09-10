# Ryvra Ledger Settlement

Ryvra Ledger Settlement is the source of truth for account balances and movement state across Ryvra modules.

It provides:
- append-only ledger events
- double-entry postings
- settlement state transitions
- reconciliation hooks and auditability

**Status: early draft / not production-ready.**

## Local setup

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
```

## Dependencies and integrations

This module depends on and integrates with:
- **asset-registry** for canonical `asset_id`
- **accounts** for account identity and balance surfaces
- **pay** for payment intents and execution callbacks
- **markets** for trade and settlement references
- **policy-risk** for settlement controls (TBD by policy/governance)

## Architecture overview

Ryvra Ledger Settlement is organized as a docs-first + interface-first baseline.

Core concerns:
1. Ledger recording: append-only ledger events and postings.
2. Posting invariants: deterministic, balanced, and auditable movement entries.
3. Settlement state machine: deterministic lifecycle transitions with compensating flows.
4. Reconciliation and operations: mismatch detection, exception queues, and operator workflows.
5. Reservation-backed accounting: balance safety and lifecycle provenance from intent to settlement.

## Module map

- `src/types.ts`: domain entities, state enums, and interfaces.
- `src/ledger/posting-engine.ts`: posting engine interface-first stub.
- `src/ledger/asset-normalization.ts`: canonical asset-id and amount normalization helpers.
- `src/ledger/invariants.ts`: debit/credit and posting-level invariant checks.
- `src/settlement/state-machine.ts`: settlement transition guard stub.
- `src/reconciliation/reconciliation-service.ts`: reconciliation service with unified mismatch classification hooks.
- `src/reservations/reservation-ledger-service.ts`: reservation-backed lifecycle, provenance, event hash chain, and reconciliation evidence service.
- `docs/rfc-0004-ledger-and-settlement-state-machine.md`: v1 state-machine and ledger RFC.
- `docs/accounting-model.md`: chart of accounts and balance semantics.
- `docs/reconciliation-and-ops.md`: daily reconciliation and ops model.

## Reservation model and balance invariants

Reservation-backed accounting enforces:

- `available_balance = settled_balance - active_reserved_balance`
- reservations are rejected when they would make available balance negative
- active reservation states hold funds until lifecycle completion/failure resolution
- release/expiry/cancellation return funds by moving reservations to non-active states
- finalization performs settlement posting exactly once per settlement reference

Concurrency safety:

- account-scoped transactional lock around balance check + reservation write
- optimistic token support on reservation transitions
- transactional lock around settlement finalization + ledger posting

## Lifecycle state machine

Primary progression:

`CREATED -> VALIDATING -> AUTHORIZED -> RESERVED -> SUBMITTED -> INCLUDED -> CONFIRMED -> FINALIZED -> RECONCILING -> RECONCILED`

Failure and exception states:

- `REJECTED`
- `EXPIRED`
- `CANCELLED`
- `DROPPED`
- `REVERTED`
- `RETRYING`
- `PARTIAL`
- `DISPUTED`
- `MANUAL_REVIEW`

Out-of-order settlement events are handled deterministically through deferred ingestion and ordered replay.

## Provenance chain and audit events

Optional provenance linkage fields are persisted on reservation, settlement, ledger entry, and lifecycle events:

- `agentId`
- `mandateId`
- `intentId`
- `riskAssessmentId`
- `authorizationId`
- `policyVersion` / `policyHash`
- `sessionKeyId`
- `userOperationHash`
- `transactionHash`

Each lifecycle transition emits an immutable event with:

- `eventHash`
- `previousEventHash`

This creates a tamper-evident hash chain per reservation timeline.

## Reconciliation evidence model

Reconciliation records store:

- expected amount vs settled amount
- `discrepancyReasonCode` (`exact_match`, `partial_settlement`, `over_settlement`, etc.)
- retry and repair workflow markers
- structured evidence payload
- hash-chain fields for immutable auditability

## RFC mapping

- **RFC-0008**: reservation safety, lifecycle persistence, idempotent reservation/settlement ingestion, replay protection.
- **RFC-0018**: provenance enrichment, end-to-end lineage to settlement, tamper-evident event hashing, reconciliation evidence.
- **RFC-0005 dependencies**: accounting model alignment and policy/risk linkage remain additive to the reservation lifecycle integration.
