-- Instamark per-user wallet (INR credits) + ledger

create table if not exists public.instamark_wallets (
  yantra_user_id varchar(255) primary key,
  balance_inr numeric(12, 2) not null default 0
    constraint instamark_wallets_balance_nonneg check (balance_inr >= 0),
  updated_at timestamptz not null default now()
);

comment on table public.instamark_wallets is
  'Instamark wallet credits per YantraIAS user (INR)';

create table if not exists public.instamark_wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  yantra_user_id varchar(255) not null,
  amount_inr numeric(12, 2) not null,
  entry_type varchar(32) not null,
  page_count integer,
  client_transaction_id varchar(64),
  note varchar(512),
  created_at timestamptz not null default now()
);

create index if not exists idx_instamark_wallet_ledger_user
  on public.instamark_wallet_ledger (yantra_user_id, created_at desc);

alter table public.instamark_wallets enable row level security;
alter table public.instamark_wallet_ledger enable row level security;

drop policy if exists "Users read own wallet" on public.instamark_wallets;
create policy "Users read own wallet"
  on public.instamark_wallets
  for select
  to authenticated
  using (
    yantra_user_id = coalesce(
      auth.jwt() ->> 'yantra_user_id',
      auth.jwt() ->> 'sub'
    )
  );

grant select on public.instamark_wallets to authenticated;
