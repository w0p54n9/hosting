-- Hosting: date voting + per-person "use my address" switch.
-- Safe to run more than once.

-- Each person can switch their address on or off for planning.
alter table participants add column if not exists share_location boolean not null default true;

-- 'set' = the date is fixed; 'voting' = people are voting on date options.
alter table events add column if not exists date_status text not null default 'set';
do $$ begin
  alter table events add constraint events_date_status_check check (date_status in ('set', 'voting'));
exception when duplicate_object then null; end $$;

create table if not exists date_options (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references events(id) on delete cascade,
  starts_at   timestamptz not null,
  created_at  timestamptz not null default now(),
  unique (event_id, starts_at)
);
create index if not exists date_options_event_idx on date_options(event_id);

create table if not exists date_votes (
  option_id       uuid not null references date_options(id) on delete cascade,
  participant_id  uuid not null references participants(id) on delete cascade,
  vote            text not null check (vote in ('yes', 'maybe', 'no')),
  updated_at      timestamptz not null default now(),
  primary key (option_id, participant_id)
);

alter table date_options enable row level security;
alter table date_votes   enable row level security;
-- No policies: only the server (service role) can read or write.
