-- Going Out: RSVP, final plan, deadlines, budget, needs, ride contact,
-- custom starting point, and automatic address clean-up. Safe to run more than once.

alter table participants add column if not exists rsvp text not null default 'going';
do $$ begin
  alter table participants add constraint participants_rsvp_check check (rsvp in ('going', 'maybe', 'no'));
exception when duplicate_object then null; end $$;

alter table participants add column if not exists phone text;                       -- only shared within a carpool
alter table participants add column if not exists needs text[] not null default '{}'; -- e.g. vegetarian, step_free
alter table participants add column if not exists alt_start jsonb;                  -- private "somewhere else" start

alter table participants drop constraint if exists participants_start_from_check;
alter table participants add constraint participants_start_from_check check (start_from in ('home', 'office', 'other'));

alter table events add column if not exists finalized_at timestamptz;
alter table events add column if not exists reply_by date;
alter table events add column if not exists max_price text;
alter table events add column if not exists addresses_purged_at timestamptz;

-- Delete addresses, phone numbers and custom starting points 3 days after each outing.
-- (The app also does this whenever an old outing is opened, in case pg_cron isn't available.)
do $outer$ begin
  create extension if not exists pg_cron;
  perform cron.schedule('going-out-purge-addresses', '17 9 * * *', $cmd$
    delete from participant_locations pl using participants p, events e
      where pl.participant_id = p.id and p.event_id = e.id and e.starts_at < now() - interval '3 days';
    update participants p set phone = null, alt_start = null from events e
      where p.event_id = e.id and e.starts_at < now() - interval '3 days' and (p.phone is not null or p.alt_start is not null);
    update events set addresses_purged_at = now()
      where starts_at < now() - interval '3 days' and addresses_purged_at is null;
  $cmd$);
exception when others then
  raise notice 'pg_cron not available (%); the app will clean up instead.', sqlerrm;
end $outer$;
