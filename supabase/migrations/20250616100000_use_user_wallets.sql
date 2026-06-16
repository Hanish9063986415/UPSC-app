-- Instamark uses the existing YantraIAS wallet tables in Supabase:
--   public.user_wallets (user_id, balance) — balance is wallet credits in INR
--   public.wallet_transactions — debit/credit ledger
--
-- The legacy instamark_wallets / instamark_wallet_ledger tables are not used.

comment on table public.user_wallets is
  'YantraIAS wallet credits per user (INR). Instamark debits this balance at ₹2/page.';
