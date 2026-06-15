-- Instamark wallet tables (SQLAlchemy / Alembic-free deploys)

CREATE TABLE IF NOT EXISTS instamark_wallets (
    yantra_user_id VARCHAR(255) PRIMARY KEY,
    balance_inr NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (balance_inr >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS instamark_wallet_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    yantra_user_id VARCHAR(255) NOT NULL,
    amount_inr NUMERIC(12, 2) NOT NULL,
    entry_type VARCHAR(32) NOT NULL,
    page_count INTEGER,
    client_transaction_id VARCHAR(64),
    note VARCHAR(512),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_instamark_wallet_ledger_user
    ON instamark_wallet_ledger (yantra_user_id, created_at DESC);
