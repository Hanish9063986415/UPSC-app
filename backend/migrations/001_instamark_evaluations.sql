-- YantraIAS shared database: Instamark AI evaluation history
-- Run once on the YantraIAS PostgreSQL database (e.g. psql $DATABASE_URL -f 001_instamark_evaluations.sql)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS instamark_evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    yantra_user_id VARCHAR(255),
    client_transaction_id VARCHAR(64),
    service VARCHAR(32) NOT NULL DEFAULT 'instamark',
    file_name VARCHAR(512) NOT NULL,
    page_count INTEGER NOT NULL DEFAULT 0,
    amount_inr NUMERIC(10, 2) NOT NULL DEFAULT 0,
    rate_per_page NUMERIC(10, 2) NOT NULL DEFAULT 1,
    status VARCHAR(32) NOT NULL DEFAULT 'completed',
    question_count INTEGER,
    duration_seconds NUMERIC(10, 2),
    marks_awarded NUMERIC(10, 2),
    marks_possible NUMERIC(10, 2),
    marks_percent INTEGER,
    total_tokens INTEGER,
    complete_package JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_instamark_evaluations_user_id
    ON instamark_evaluations (yantra_user_id);

CREATE INDEX IF NOT EXISTS idx_instamark_evaluations_client_tx
    ON instamark_evaluations (client_transaction_id);

CREATE INDEX IF NOT EXISTS idx_instamark_evaluations_created_at
    ON instamark_evaluations (created_at DESC);

COMMENT ON TABLE instamark_evaluations IS
    'Instamark AI answer-sheet evaluations linked to YantraIAS users';
