-- Hosting: initial schema
-- Run this in the Supabase SQL editor (or with `supabase db push`).
--
-- Privacy model: row-level security is ON for every table and there are NO
-- policies, so the public anon key can read nothing. All access goes through
-- the Next.js server using the service role key. Exact addresses live in their
-- own table and are only ever returned to (a) the person themselves and
-- (b) the driver assigned to pick them up.

create extension if not exists pgcrypto;

create table if not exists events (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null unique,
  title                 text not null check (char_length(title) between 1 and 80),
  starts_at             timestamptz not null,
  kind                  text not null default 'food' check (kind in ('food', 'activity')),
  midpoint_mode         text not null default 'fair' check (midpoint_mode in ('fair', 'total')),
  chosen_place_id       text,
  chosen_place          jsonb,           -- snapshot of the host's pick, so it survives re-ranking
  organizer_token_hash  text not null,   -- sha256 of the host's secret link token
  created_at            timestamptz not null default now()
);

create table if not exists participants (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references events(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 40),
  role        text not null check (role in ('driver', 'rider', 'transit', 'bike', 'walk')),
  seats       int  not null default 0 check (seats between 0 and 8),
  likes       text[] not null default '{}',
  token_hash  text not null,             -- sha256 of the participant's secret token
  created_at  timestamptz not null default now()
);
create index if not exists participants_event_idx on participants(event_id);
create unique index if not exists participants_token_idx on participants(token_hash);

-- Private: exact home address + coordinates. Never selected into public responses.
create table if not exists participant_locations (
  participant_id  uuid primary key references participants(id) on delete cascade,
  address         text not null,
  lat             double precision not null,
  lng             double precision not null,
  updated_at      timestamptz not null default now()
);

-- Cached venue search + travel-time matrix, to keep Google API costs down.
create table if not exists plan_cache (
  event_id    uuid primary key references events(id) on delete cascade,
  input_hash  text not null,
  plan        jsonb not null,
  updated_at  timestamptz not null default now()
);

alter table events                enable row level security;
alter table participants          enable row level security;
alter table participant_locations enable row level security;
alter table plan_cache            enable row level security;
-- Intentionally no policies: only the service role (server) can read or write.
