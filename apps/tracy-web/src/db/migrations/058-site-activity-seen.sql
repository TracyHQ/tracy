-- What one person has looked at in Site changes, per PERSON and per SITE (the badge on the start
-- screen's Site changes card, plan `tasks/todo-site-changes-badge-count.md` §2).
--
-- THE WATERMARK IS ONE PERSON'S, ON THE SERVER. A row says: this account has seen the site's changes
-- up to `seen_at`. The badge counts the ledger rows RECORDED after it that the person did not make
-- through Tracy; the tab moves it forward once it has drawn the list. One row per (site, account),
-- not a mark per change: nobody opens a change row the way they open a comment thread, and 100 rows
-- × every seat would be marks nobody reads. Not the browser's storage, for the reason
-- `045-site-comment-read.sql` gives: it would differ per machine and per browser, and a badge people
-- trust and that lies is worse than none.
--
-- NO ROW = NEVER ASKED. The first ask of the badge writes `now()` and answers 0: a person who joins a
-- site with 300 changes in its history is not told they missed 300 things.
create table site_activity_seen (
  site_key text not null references site(site_key) on delete cascade,
  account_id uuid not null references account(id) on delete cascade,
  seen_at timestamptz not null,
  primary key (site_key, account_id)
);

-- 🔒 RECORDED, NOT OCCURRED. The badge compares the watermark with the moment TRACY WROTE the row,
-- never with the moment the change happened: a WordPress row the collector pulls five minutes after
-- the edit (measured 04/10/2026 on scv2: occurred 10:10:29, pulled 10:14:57) and a seal Tracy commits
-- after the person looked both carry an earlier time, and comparing that would swallow them. Every
-- ledger table has such a column but `site_outside`, whose `at` is the Git commit time the host
-- sends (`turns.js` `recordOutside`) — so it gets one here. Rows already there are backfilled with
-- `at`: they are history, and the first ask of the badge sets the watermark after them anyway.
alter table site_outside add column recorded_at timestamptz not null default now();
update site_outside set recorded_at = at;
