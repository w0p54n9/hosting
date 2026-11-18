-- Going Out: people can start from home or from a shared office.
-- Safe to run more than once.

-- The outing's office address, set by the host: { "address": "...", "lat": 43.6, "lng": -79.3 }
alter table events add column if not exists office jsonb;

-- Where each person is setting off from for this outing.
alter table participants add column if not exists start_from text not null default 'home';
do $$ begin
  alter table participants add constraint participants_start_from_check check (start_from in ('home', 'office'));
exception when duplicate_object then null; end $$;
