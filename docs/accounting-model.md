# Accounting Model (v1 baseline)

## Chart of accounts approach

The baseline chart of accounts includes:

- **User liabilities**: obligations owed to user accounts.
- **Treasury**: platform-owned balances and operating funds.
- **Fees**: fee accrual and recognition accounts.
- **Reserves**: policy-mandated reserve pools and buffers.
- **External settlement**: clearing/settlement bridge accounts.

Final account taxonomy and numbering are **TBD by policy/governance**.

## Balance dimensions

Each account may expose:

- `available`: spendable immediately.
- `reserved`: ring-fenced for pending operations.
- `pending`: execution initiated but not finalized.

Transitions between dimensions must remain double-entry balanced and append-only.

## Fee accounting and treasury attribution

- Fees should be posted explicitly, not netted invisibly.
- Fee source and destination must be attributable per `reference_id`.
- Treasury attribution dimensions (desk/product/region) are **TBD by policy/governance**.

## Examples

### 1) Payment transfer

- Debit: payer user liability (available)
- Credit: receiver user liability (pending/available by policy)
- Optional fee leg:
  - Debit: payer user liability
  - Credit: fee revenue / treasury fee account

### 2) Spot trade settlement

- Asset A leg transfers from buyer settlement bridge to seller settlement bridge.
- Asset B leg transfers from seller settlement bridge to buyer settlement bridge.
- Fees posted as separate legs to fee/treasury accounts.
- Each asset remains independently balanced.

### 3) Failed settlement compensation event

- Original execution postings remain immutable.
- Compensation event mirrors economic reversal via new `ledger_event_id`.
- State machine marks failed/compensated outcome with linked `reference_id`.
