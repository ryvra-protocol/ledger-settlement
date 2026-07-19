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

## Module map

- `src/types.ts`: domain entities, state enums, and interfaces.
- `src/ledger/posting-engine.ts`: posting engine interface-first stub.
- `src/ledger/invariants.ts`: debit/credit and posting-level invariant checks.
- `src/settlement/state-machine.ts`: settlement transition guard stub.
- `src/reconciliation/reconciliation-service.ts`: reconciliation process stub.
- `docs/rfc-0004-ledger-and-settlement-state-machine.md`: v1 state-machine and ledger RFC.
- `docs/accounting-model.md`: chart of accounts and balance semantics.
- `docs/reconciliation-and-ops.md`: daily reconciliation and ops model.
