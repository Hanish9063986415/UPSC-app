-- =============================================================================
-- Instamark × Supabase — full database setup
-- =============================================================================
-- Run once in: Supabase Dashboard → SQL Editor → New query → Run
--
-- Backend connection (Render / local):
--   DATABASE_URL=postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
--   Use the "Transaction" pooler URL (port 6543) for serverless / async workloads.
--   SQLAlchemy auto-converts postgresql:// → postgresql+asyncpg://
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 2. Core table — matches backend/app/models/instamark_evaluation.py
-- ---------------------------------------------------------------------------
create table if not exists public.instamark_evaluations (
  id                    uuid primary key default gen_random_uuid(),
  yantra_user_id        varchar(255),
  client_transaction_id varchar(64),
  service               varchar(32)  not null default 'instamark',
  file_name             varchar(512) not null,
  page_count            integer      not null default 0
    constraint instamark_evaluations_page_count_nonneg check (page_count >= 0),
  amount_inr            numeric(10, 2) not null default 0
    constraint instamark_evaluations_amount_nonneg check (amount_inr >= 0),
  rate_per_page         numeric(10, 2) not null default 1
    constraint instamark_evaluations_rate_positive check (rate_per_page > 0),
  status                varchar(32)  not null default 'completed',
  question_count        integer
    constraint instamark_evaluations_question_count_nonneg
      check (question_count is null or question_count >= 0),
  duration_seconds      numeric(10, 2)
    constraint instamark_evaluations_duration_nonneg
      check (duration_seconds is null or duration_seconds >= 0),
  marks_awarded         numeric(10, 2),
  marks_possible        numeric(10, 2),
  marks_percent         integer
    constraint instamark_evaluations_marks_percent_range
      check (marks_percent is null or marks_percent between 0 and 100),
  total_tokens          integer
    constraint instamark_evaluations_tokens_nonneg
      check (total_tokens is null or total_tokens >= 0),
  complete_package      jsonb        not null,
  created_at            timestamptz  not null default now(),
  completed_at          timestamptz,

  constraint instamark_evaluations_status_valid check (
    status in ('processing', 'completed', 'failed')
  ),
  constraint instamark_evaluations_complete_package_object check (
    jsonb_typeof(complete_package) = 'object'
  )
);

comment on table public.instamark_evaluations is
  'Instamark AI answer-sheet evaluations linked to YantraIAS users';
comment on column public.instamark_evaluations.yantra_user_id is
  'External YantraIAS user id (X-Yantra-User-Id header)';
comment on column public.instamark_evaluations.client_transaction_id is
  'Browser localStorage transaction id for idempotent sync';
comment on column public.instamark_evaluations.complete_package is
  'Full evaluation payload: metadata + per-question evaluations and model answers';

-- ---------------------------------------------------------------------------
-- 3. Indexes
-- ---------------------------------------------------------------------------
create index if not exists idx_instamark_evaluations_user_id
  on public.instamark_evaluations (yantra_user_id);

create index if not exists idx_instamark_evaluations_client_tx
  on public.instamark_evaluations (client_transaction_id)
  where client_transaction_id is not null;

-- User history: newest first (primary list query)
create index if not exists idx_instamark_evaluations_user_created
  on public.instamark_evaluations (yantra_user_id, created_at desc)
  where yantra_user_id is not null;

create index if not exists idx_instamark_evaluations_created_at
  on public.instamark_evaluations (created_at desc);

-- JSONB search inside complete_package (analytics / admin queries)
create index if not exists idx_instamark_evaluations_package_gin
  on public.instamark_evaluations using gin (complete_package jsonb_path_ops);

-- Prevent duplicate sync of the same browser transaction per user
create unique index if not exists uq_instamark_evaluations_user_client_tx
  on public.instamark_evaluations (yantra_user_id, client_transaction_id)
  where yantra_user_id is not null
    and client_transaction_id is not null;

-- ---------------------------------------------------------------------------
-- 4. Row Level Security
--    Backend (postgres / service_role connection) bypasses RLS automatically.
--    Policies below lock down direct Supabase client access.
-- ---------------------------------------------------------------------------
alter table public.instamark_evaluations enable row level security;

-- Service role & postgres superuser bypass RLS by default — no policy needed.

-- Future: Supabase Auth users with custom JWT claim "yantra_user_id"
drop policy if exists "Users read own evaluations" on public.instamark_evaluations;
create policy "Users read own evaluations"
  on public.instamark_evaluations
  for select
  to authenticated
  using (
    yantra_user_id is not null
    and yantra_user_id = coalesce(
      auth.jwt() ->> 'yantra_user_id',
      auth.jwt() ->> 'sub'
    )
  );

drop policy if exists "Users insert own evaluations" on public.instamark_evaluations;
create policy "Users insert own evaluations"
  on public.instamark_evaluations
  for insert
  to authenticated
  with check (
    yantra_user_id is not null
    and yantra_user_id = coalesce(
      auth.jwt() ->> 'yantra_user_id',
      auth.jwt() ->> 'sub'
    )
  );

-- ---------------------------------------------------------------------------
-- 5. Storage bucket for answer-sheet PDFs (optional — replaces IndexedDB)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'answer-sheets',
  'answer-sheets',
  false,
  52428800,  -- 50 MB (matches backend max_upload_size)
  array['application/pdf']::text[]
)
on conflict (id) do update set
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users upload own answer sheets" on storage.objects;
create policy "Users upload own answer sheets"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'answer-sheets'
    and (storage.foldername(name))[1] = coalesce(
      auth.jwt() ->> 'yantra_user_id',
      auth.jwt() ->> 'sub'
    )
  );

drop policy if exists "Users read own answer sheets" on storage.objects;
create policy "Users read own answer sheets"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'answer-sheets'
    and (storage.foldername(name))[1] = coalesce(
      auth.jwt() ->> 'yantra_user_id',
      auth.jwt() ->> 'sub'
    )
  );

drop policy if exists "Users delete own answer sheets" on storage.objects;
create policy "Users delete own answer sheets"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'answer-sheets'
    and (storage.foldername(name))[1] = coalesce(
      auth.jwt() ->> 'yantra_user_id',
      auth.jwt() ->> 'sub'
    )
  );

-- ---------------------------------------------------------------------------
-- 6. Helper view — lightweight list without full JSONB payload
-- ---------------------------------------------------------------------------
create or replace view public.instamark_evaluation_summaries
with (security_invoker = true) as
select
  id,
  yantra_user_id,
  client_transaction_id,
  service,
  file_name,
  page_count,
  amount_inr,
  rate_per_page,
  status,
  question_count,
  duration_seconds,
  marks_awarded,
  marks_possible,
  marks_percent,
  total_tokens,
  created_at,
  completed_at
from public.instamark_evaluations;

comment on view public.instamark_evaluation_summaries is
  'List/history view without complete_package JSONB (faster queries)';

grant select on public.instamark_evaluation_summaries to authenticated;
