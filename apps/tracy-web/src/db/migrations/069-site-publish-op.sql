-- ONE PUBLISH OPERATION PER SITE AT A TIME, AND THE FLAG ONLY AFTER THE HOST SAID DONE (05/10/2026).
--
-- `POST /api/sites/:key/go-live` asked the host to open a site (mail, noindex) and set
-- `site.publish = 'published'` as soon as the host TOOK the job — before the job had run. A job
-- that then failed left a site reading Live that was still closed, and nothing kept two presses (a
-- double click, a second tab, a second replica) from starting two jobs on one site.
--
--   site_publish_op  the latest publish operation of a site: one row per site, so the row IS the
--                    reservation. A row in `starting` or `running` refuses the next press
--                    (`PUBLISH_BUSY`); `done` and `failed` are what the screen reads back after a
--                    reload, from any tab.
--       op           `live` · `draft`
--       state        `starting` (reserved, the host has not answered — or its answer was lost; it
--                    holds the site until the host says what became of it, however long that is)
--                    · `running` (the host named a job) · `done` · `failed`
--       ref          this operation's own name, minted with the reservation and sent to the host as
--                    the job key (`publish:<ref>`): asking the host again with it answers the job
--                    it already took, so an answer that never arrived is found out, not guessed
--       job_id       the host's job once it named one; the same id as the `job` row
--       actor        who pressed, for the audit line written when the job ends
--       code         why it failed, or why a held row is unconfirmed (`sites/publish-store.js`)
--       detail       the host's last lines, for an operator; never sent to the customer
--
-- 🔒 A new table: no scan, no backfill. A site with no row has never been published through this
-- door and reads as "no operation".
create table if not exists site_publish_op (
  site_key      text primary key references site(site_key) on delete cascade,
  op            text not null check (op in ('live', 'draft')),
  state         text not null check (state in ('starting', 'running', 'done', 'failed')),
  ref           text not null,
  job_id        text,
  actor         text,
  actor_account uuid,
  code          text,
  detail        text,
  started_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
