-- RFC-0008/0018 additive schema upgrades

ALTER TABLE ledger_accounts
  ADD COLUMN IF NOT EXISTS settled_balance_minor NUMERIC(38, 0) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS active_reserved_balance_minor NUMERIC(38, 0) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS optimistic_token BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE ledger_entries
  ADD COLUMN IF NOT EXISTS reservation_id TEXT,
  ADD COLUMN IF NOT EXISTS settlement_id TEXT,
  ADD COLUMN IF NOT EXISTS intent_id TEXT,
  ADD COLUMN IF NOT EXISTS mandate_id TEXT,
  ADD COLUMN IF NOT EXISTS agent_id TEXT,
  ADD COLUMN IF NOT EXISTS risk_assessment_id TEXT,
  ADD COLUMN IF NOT EXISTS authorization_id TEXT,
  ADD COLUMN IF NOT EXISTS policy_version TEXT,
  ADD COLUMN IF NOT EXISTS policy_hash TEXT,
  ADD COLUMN IF NOT EXISTS session_key_id TEXT,
  ADD COLUMN IF NOT EXISTS user_operation_hash TEXT,
  ADD COLUMN IF NOT EXISTS transaction_hash TEXT,
  ADD COLUMN IF NOT EXISTS event_hash TEXT,
  ADD COLUMN IF NOT EXISTS previous_event_hash TEXT;

ALTER TABLE ledger_postings
  ADD COLUMN IF NOT EXISTS reservation_id TEXT,
  ADD COLUMN IF NOT EXISTS settlement_id TEXT,
  ADD COLUMN IF NOT EXISTS intent_id TEXT,
  ADD COLUMN IF NOT EXISTS mandate_id TEXT,
  ADD COLUMN IF NOT EXISTS user_operation_hash TEXT,
  ADD COLUMN IF NOT EXISTS transaction_hash TEXT,
  ADD COLUMN IF NOT EXISTS event_hash TEXT,
  ADD COLUMN IF NOT EXISTS previous_event_hash TEXT;

CREATE TABLE IF NOT EXISTS balance_reservations (
  reservation_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  intent_id TEXT NOT NULL,
  mandate_id TEXT,
  amount_minor NUMERIC(38, 0) NOT NULL CHECK (amount_minor > 0),
  state TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  risk_assessment_id TEXT,
  authorization_id TEXT,
  policy_version TEXT,
  policy_hash TEXT,
  session_key_id TEXT,
  user_operation_hash TEXT,
  transaction_hash TEXT,
  agent_id TEXT,
  optimistic_token BIGINT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event_hash TEXT,
  previous_event_hash TEXT,
  UNIQUE (intent_id, idempotency_key)
);

ALTER TABLE settlements
  ADD COLUMN IF NOT EXISTS reservation_id TEXT,
  ADD COLUMN IF NOT EXISTS intent_id TEXT,
  ADD COLUMN IF NOT EXISTS mandate_id TEXT,
  ADD COLUMN IF NOT EXISTS expected_amount_minor NUMERIC(38, 0),
  ADD COLUMN IF NOT EXISTS settled_amount_minor NUMERIC(38, 0),
  ADD COLUMN IF NOT EXISTS risk_assessment_id TEXT,
  ADD COLUMN IF NOT EXISTS authorization_id TEXT,
  ADD COLUMN IF NOT EXISTS policy_version TEXT,
  ADD COLUMN IF NOT EXISTS policy_hash TEXT,
  ADD COLUMN IF NOT EXISTS session_key_id TEXT,
  ADD COLUMN IF NOT EXISTS user_operation_hash TEXT,
  ADD COLUMN IF NOT EXISTS transaction_hash TEXT,
  ADD COLUMN IF NOT EXISTS chain_tx_hash TEXT,
  ADD COLUMN IF NOT EXISTS finality_marker TEXT,
  ADD COLUMN IF NOT EXISTS event_hash TEXT,
  ADD COLUMN IF NOT EXISTS previous_event_hash TEXT;

CREATE TABLE IF NOT EXISTS settlement_events (
  settlement_event_id TEXT PRIMARY KEY,
  settlement_id TEXT NOT NULL,
  reservation_id TEXT,
  intent_id TEXT,
  state TEXT NOT NULL,
  event_type TEXT NOT NULL,
  chain_tx_hash TEXT,
  block_number NUMERIC(38, 0),
  finality_marker TEXT,
  ingestion_idempotency_key TEXT,
  discrepancy_reason_code TEXT,
  retry_workflow_marker TEXT,
  repair_workflow_marker TEXT,
  metadata JSONB,
  agent_id TEXT,
  mandate_id TEXT,
  risk_assessment_id TEXT,
  authorization_id TEXT,
  policy_version TEXT,
  policy_hash TEXT,
  session_key_id TEXT,
  user_operation_hash TEXT,
  transaction_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event_hash TEXT NOT NULL,
  previous_event_hash TEXT,
  UNIQUE (settlement_id, event_type, COALESCE(chain_tx_hash, ''), COALESCE(block_number::text, ''))
);

CREATE TABLE IF NOT EXISTS reconciliation_records (
  reconciliation_id TEXT PRIMARY KEY,
  settlement_id TEXT NOT NULL,
  reservation_id TEXT,
  intent_id TEXT,
  expected_amount_minor NUMERIC(38, 0) NOT NULL,
  settled_amount_minor NUMERIC(38, 0) NOT NULL,
  discrepancy_reason_code TEXT NOT NULL,
  retry_workflow_marker TEXT,
  repair_workflow_marker TEXT,
  evidence JSONB NOT NULL,
  matched BOOLEAN NOT NULL,
  agent_id TEXT,
  mandate_id TEXT,
  risk_assessment_id TEXT,
  authorization_id TEXT,
  policy_version TEXT,
  policy_hash TEXT,
  session_key_id TEXT,
  user_operation_hash TEXT,
  transaction_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event_hash TEXT NOT NULL,
  previous_event_hash TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_balance_reservation_intent_idempotency
  ON balance_reservations (intent_id, idempotency_key);

CREATE UNIQUE INDEX IF NOT EXISTS ux_settlement_events_idempotency
  ON settlement_events (settlement_id, COALESCE(ingestion_idempotency_key, event_type));

CREATE UNIQUE INDEX IF NOT EXISTS ux_settlements_external_ref
  ON settlements (COALESCE(chain_tx_hash, ''), COALESCE(transaction_hash, ''), COALESCE(finality_marker, ''));

CREATE INDEX IF NOT EXISTS ix_balance_reservations_intent_id
  ON balance_reservations (intent_id);

CREATE INDEX IF NOT EXISTS ix_balance_reservations_mandate_id
  ON balance_reservations (mandate_id);

CREATE INDEX IF NOT EXISTS ix_balance_reservations_created_at
  ON balance_reservations (created_at);

CREATE INDEX IF NOT EXISTS ix_settlements_settlement_id
  ON settlements (id);

CREATE INDEX IF NOT EXISTS ix_settlements_intent_id
  ON settlements (intent_id);

CREATE INDEX IF NOT EXISTS ix_settlements_tx_hash
  ON settlements (transaction_hash);

CREATE INDEX IF NOT EXISTS ix_settlement_events_settlement_id
  ON settlement_events (settlement_id);

CREATE INDEX IF NOT EXISTS ix_settlement_events_tx_hash
  ON settlement_events (transaction_hash);

CREATE INDEX IF NOT EXISTS ix_settlement_events_created_at
  ON settlement_events (created_at);

CREATE INDEX IF NOT EXISTS ix_reconciliation_records_settlement_id
  ON reconciliation_records (settlement_id);

CREATE INDEX IF NOT EXISTS ix_reconciliation_records_created_at
  ON reconciliation_records (created_at);
