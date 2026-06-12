-- =============================================================================
-- Per-user Instamark billing totals (pages evaluated + cost)
-- Auto-updated when a row is inserted into instamark_evaluations.
-- YantraIAS can read this table for wallet / usage display.
-- =============================================================================

create table if not exists public.instamark_user_usage (
  yantra_user_id          varchar(255) primary key,
  total_pages_evaluated   integer not null default 0
    constraint instamark_user_usage_pages_nonneg check (total_pages_evaluated >= 0),
  total_amount_inr        numeric(12, 2) not null default 0
    constraint instamark_user_usage_amount_nonneg check (total_amount_inr >= 0),
  evaluation_count        integer not null default 0
    constraint instamark_user_usage_count_nonneg check (evaluation_count >= 0),
  last_evaluation_at      timestamptz,
  updated_at              timestamptz not null default now()
);

comment on table public.instamark_user_usage is
  'Running totals: pages evaluated and INR spent per YantraIAS user';
comment on column public.instamark_user_usage.yantra_user_id is
  'Same id as YantraIAS user (userId / _id from login)';

create index if not exists idx_instamark_user_usage_updated
  on public.instamark_user_usage (updated_at desc);

-- Backfill from existing evaluations (safe to re-run)
insert into public.instamark_user_usage (
  yantra_user_id,
  total_pages_evaluated,
  total_amount_inr,
  evaluation_count,
  last_evaluation_at,
  updated_at
)
select
  yantra_user_id,
  coalesce(sum(page_count), 0)::integer,
  coalesce(sum(amount_inr), 0),
  count(*)::integer,
  max(coalesce(completed_at, created_at)),
  now()
from public.instamark_evaluations
where yantra_user_id is not null
  and status = 'completed'
group by yantra_user_id
on conflict (yantra_user_id) do update set
  total_pages_evaluated = excluded.total_pages_evaluated,
  total_amount_inr      = excluded.total_amount_inr,
  evaluation_count      = excluded.evaluation_count,
  last_evaluation_at    = excluded.last_evaluation_at,
  updated_at            = now();

create or replace function public.sync_instamark_user_usage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.yantra_user_id is null or new.status is distinct from 'completed' then
    return new;
  end if;

  insert into public.instamark_user_usage (
    yantra_user_id,
    total_pages_evaluated,
    total_amount_inr,
    evaluation_count,
    last_evaluation_at,
    updated_at
  )
  values (
    new.yantra_user_id,
    coalesce(new.page_count, 0),
    coalesce(new.amount_inr, 0),
    1,
    coalesce(new.completed_at, new.created_at, now()),
    now()
  )
  on conflict (yantra_user_id) do update set
    total_pages_evaluated = public.instamark_user_usage.total_pages_evaluated
      + coalesce(excluded.total_pages_evaluated, 0),
    total_amount_inr = public.instamark_user_usage.total_amount_inr
      + coalesce(excluded.total_amount_inr, 0),
    evaluation_count = public.instamark_user_usage.evaluation_count + 1,
    last_evaluation_at = greatest(
      coalesce(public.instamark_user_usage.last_evaluation_at, '-infinity'::timestamptz),
      coalesce(excluded.last_evaluation_at, now())
    ),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists trg_instamark_evaluations_sync_usage on public.instamark_evaluations;
create trigger trg_instamark_evaluations_sync_usage
  after insert on public.instamark_evaluations
  for each row
  execute function public.sync_instamark_user_usage();

alter table public.instamark_user_usage enable row level security;

drop policy if exists "Users read own usage" on public.instamark_user_usage;
create policy "Users read own usage"
  on public.instamark_user_usage
  for select
  to authenticated
  using (
    yantra_user_id = coalesce(
      auth.jwt() ->> 'yantra_user_id',
      auth.jwt() ->> 'sub'
    )
  );

grant select on public.instamark_user_usage to authenticated;
