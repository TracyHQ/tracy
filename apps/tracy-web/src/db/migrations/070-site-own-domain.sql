-- A SITE'S OWN DOMAIN GOES THROUGH THE SAME OPERATION AS ITS PUBLISH, AND WHAT DNS SAID IS KEPT AS
-- IT WAS MEASURED (06/10/2026).
--
-- `069-site-publish-op.sql` gave a site one publish operation at a time, at its Tracy address. A
-- domain of the customer's own could be reserved and its TXT record checked (`032`), and that was
-- all: nothing carried it to the host, and the screen showed one yes/no with no word on what was
-- looked up, what came back, or when.
--
--   site_publish_op.op         now also `drop-domain`: one own domain taken out of the host's
--                              ingress, under the same reservation, key and release rule
--                              and `delete`: the whole site taken off its host, under that same
--                              reservation — so nothing else can start on the site once a delete
--                              has — with the site's row kept until the host said the site is gone
--                              (`code = 'TORN_DOWN'` on the held row is that word, written down)
--   site_publish_op.domains    the own domains this operation hands to the host (`live`: the ones
--                              measured proven for it; `draft`: the ones the host may have a rule
--                              for; `drop-domain`: the one being removed)
--   site_publish_op.target     the host's routing target the carried domains were MEASURED against;
--                              sent with the job so the host refuses when its tunnel is another one
--   site_publish_op.attempt    how many times a cleanup that failed (`draft`, `drop-domain`) was
--                              asked for again under the SAME ref: sent to the host, which runs a
--                              failed job again only for a higher attempt than it has run
--   site_publish_op.sweep_at   when the background sweep next looks at an operation that is not
--                              ended (`cron.js` `sweepPublishOps`); pushed out, bounded, each time
--                              it looks and finds no outcome. Never a deadline: no age ends, frees
--                              or drops an operation
--   site_publish_op.sweep_tries  how many such looks found no outcome, for the back-off
--
--   site_name.routing_verified_at  when the domain was last MEASURED to point at the host's routing
--                              target (a CNAME chain ending at it); null = not measured to
--   site_name.routing_target   the target that measurement was made against; routing reads as
--                              proven only while this is the target the host names now
--   site_name.checked_at       when DNS was last read for the domain, whatever it said
--   site_name.dns_reading      that reading itself: per record what was asked, what was expected,
--                              what came back (or why nothing did). The screen shows this and
--                              nothing derived from it
--   site_name.dns_turn         which lookup that reading is from: every lookup takes the next number
--                              of `site_name_dns_turn` BEFORE it asks DNS, and a reading is written
--                              only over an older one. Two lookups that end in the other order than
--                              they began cannot leave the earlier one on record
--   site_name.carried_at       set when an operation that may add the domain's ingress rule is
--                              reserved, cleared when the host said the rule is gone. A domain still
--                              `pending` with this set may be in the ingress (the job's answer about
--                              it was lost), so it is removed through the host, like a connected one
--
-- 🔒 Nullable or defaulted columns on two small tables: no scan, no backfill. A domain checked
-- before these columns existed has no reading on record and reads as "not checked yet" until it is
-- checked again — one press of Check DNS. No row is rewritten here.
alter table site_publish_op add column if not exists domains jsonb not null default '[]'::jsonb;
alter table site_publish_op add column if not exists target text;
alter table site_publish_op add column if not exists attempt integer not null default 0;
alter table site_publish_op add column if not exists sweep_at timestamptz not null default now();
alter table site_publish_op add column if not exists sweep_tries integer not null default 0;
alter table site_publish_op drop constraint if exists site_publish_op_op_check;
alter table site_publish_op add constraint site_publish_op_op_check check (op in ('live', 'draft', 'drop-domain', 'delete'));
-- The sweep's one read: operations that are not ended, oldest look first.
create index if not exists site_publish_op_held on site_publish_op (sweep_at) where state in ('starting', 'running');

alter table site_name add column if not exists routing_verified_at timestamptz;
alter table site_name add column if not exists routing_target text;
alter table site_name add column if not exists checked_at timestamptz;
alter table site_name add column if not exists dns_reading jsonb;
alter table site_name add column if not exists carried_at timestamptz;
alter table site_name add column if not exists dns_turn bigint not null default 0;
create sequence if not exists site_name_dns_turn;
