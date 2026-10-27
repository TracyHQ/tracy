-- WHAT A DOOR STILL HAS TO DO WITH A HOST JOB IT STOPPED WAITING FOR (ledger L31, 05/10/2026).
--
-- `POST /moment` and `POST /turn` each run one webroot job on the host, called by the host dsh, which
-- gives each call 15 s; the doors now wait 10 s (moment) and 12 s (seal) so they answer inside it.
-- The host may need far longer: one site's webroot jobs wait for each other (`webroot-git.sh`
-- `locked`, up to 120 s for the site's lock alone), and on the local stand a moment took a median
-- 89 s, a seal 44 s. Before this, when the wait ran out the door answered and forgot the job, so what
-- it does with a finished job was never done: the turn was not closed with its commit (it read
-- `stale` while the host had committed its files) and the outside commits a seal made were never
-- kept. Measured on the stand: turn `session-aa4ee53e…:1` stale, its moment job committed.
--
--   site_job_follow_up  one row per job whose door still owes its work. Written in the same statement
--                       as the job's own `job` row, before the door's first poll, so a tracy-web
--                       restart mid-wait loses nothing; deleted in the SAME transaction that does the
--                       work, by the door when the job ends within its wait or by the cron's follow-up
--                       sweep afterwards — so the work is done once, whoever gets there first. A row
--                       the host never ends is dropped after a bound (`door-follow-up.js`
--                       `FOLLOW_UP_MAX_MS`).
--       door            `moment` (audit + close the turn) · `seal` (keep the outside commits)
--       turn_id         the chat turn the job closes or opens; null for an older dsh's moment
--       payload         what the door had in hand and the host does not return: for a moment the
--                       title, who typed, Tracy's answer and how the turn ended
--       attempts        how many more moment jobs the sweep asked for after one failed because the
--                       site was busy; `job_id` then names the latest (at most two)
--       next_at         when the sweep may look at it next: after the door's own wait; immediately
--                       when the door hands it over; then later and later while the host works; pushed
--                       out while one sweep holds it
--
--   site_turn.close_filed_at  when the job of the close that last wrote the turn's head, answer and
--                       end reason was filed. A close whose job was filed earlier (a turn that stopped
--                       twice, its first moment heard late) adds its files and writes over nothing.
--
-- 🔒 A new table and a nullable column: no scan, no backfill (migrations run in one transaction before
-- the server listens).
create table if not exists site_job_follow_up (
  job_id     text primary key,
  site_key   text not null,
  door       text not null,
  turn_id    text,
  payload    jsonb not null default '{}'::jsonb,
  attempts   integer not null default 0,
  created_at timestamptz not null default now(),
  next_at    timestamptz not null default now()
);

create index if not exists site_job_follow_up_next on site_job_follow_up (next_at);

alter table site_turn add column if not exists close_filed_at timestamptz;
