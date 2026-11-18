-- Going Out: each person's vote among tied top places (a Google place id).
alter table participants add column if not exists place_vote text;
