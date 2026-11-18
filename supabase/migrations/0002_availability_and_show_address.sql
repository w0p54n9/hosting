-- Going Out: calendar availability + optional "show my address to the group".
-- Safe to run more than once, and safe on a live database.

-- Address stays required for planning; this only controls whether the group can SEE it.
alter table participants add column if not exists show_address boolean not null default false;
alter table participants drop column if exists share_location; -- from an earlier draft, never used live

-- 'voting' = people mark the days they're free and the best day is used automatically.
-- 'set'    = the date is fixed (host picked it or locked in the best day).
alter table events add column if not exists date_status text not null default 'set';
do $$ begin
  alter table events add constraint events_date_status_check check (date_status in ('set', 'voting'));
exception when duplicate_object then null; end $$;
alter table events add column if not exists arrive_time text;  -- 'HH:MM', in the host's time zone
alter table events add column if not exists timezone text;     -- IANA name, e.g. America/Toronto

create table if not exists availability (
  participant_id  uuid not null references participants(id) on delete cascade,
  day             date not null,
  primary key (participant_id, day)
);
alter table availability enable row level security; -- no policies: server only

-- From an earlier draft (host-proposed date options), never used live.
drop table if exists date_votes;
drop table if exists date_options;
