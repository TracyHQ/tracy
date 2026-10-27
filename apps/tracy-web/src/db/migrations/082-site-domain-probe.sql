-- AN OWN DOMAIN IS CONNECTED ONLY AFTER TRACY OPENED IT (#1037, 08/10/2026).
--
-- Until now a domain became `active` on the host's log line "ingress: <domain> → …": the rule was
-- written, and nobody ever asked the domain anything. And that rule sent the name straight to the
-- site's own port, past tracy-web. Now the rule sends the name to tracy-web, the host's line only
-- says the route is installed, and the domain is connected when a fresh HTTPS request to the real
-- name — public DNS, a valid certificate — is answered by THIS site's row for THIS attempt.
--
--   site_name.routed_at       when the host last said this name's route is in its ingress (the
--                             shared-proxy route). Null: never installed by a host that knows the
--                             new route — a domain connected before this migration reads so, and
--                             the rollout sweep replaces its old rule (`migrate_next_at`)
--   site_name.probe_secret    the key of this connection attempt's proof. Minted when the name is
--                             handed to the host, never sent anywhere: the probe sends a random
--                             challenge, and only a process that reads this row can answer its HMAC.
--                             A new attempt mints a new one, so an answer for an older attempt, an
--                             echo of the challenge, and another site's row all fail the same way
--   site_name.probe_reading   what the last HTTPS probe found: {status, error?, attempt}
--   site_name.probed_at       when it was asked (the database's clock)
--   site_name.probe_next_at   when the background sweep asks again; null once connected
--   site_name.probe_tries     how many times the sweep has asked for this attempt
--   site_name.probe_page_nonce / probe_page_path / probe_page_until
--                             the page this attempt's probe is asking for RIGHT NOW: written by
--                             the prober just before an ordinary request for that path, read by
--                             the proxy with the row. While `until` is ahead, the proxy signs that
--                             page's status with the nonce, and a name still being connected is
--                             shown that one page. Nothing in the request itself marks the probe
--   site_name.connected_at    when an HTTPS probe of the real domain was first answered by this site
--                             for the connection the row stands for. THE ONLY THING THE CARD SAYS
--                             "connected" ON; null again whenever the name is taken out or reserved
--                             anew. A name made `active` before this migration has none
--   site_name.migrate_next_at for a name connected BEFORE this migration only (`active`, `routed_at`
--                             null): when the rollout sweep next asks its host to replace the old
--                             rule by the route through tracy-web (`cron.js` sweepLegacyOwnDomains).
--                             Such a name reads `pending` on the card until that is done and the
--                             domain itself has been asked
--   site_publish_op.route_gen the generation of the routes this operation writes or removes on the
--                             host, from one sequence: the host keeps the generation beside each
--                             own-domain route and an older operation never removes a newer route
--   site_name_released        a name a site let go. tracy-web answers a released name with its
--                             refusal page (never the Tracy app, never another site) for as long as
--                             the customer's DNS still points here; reserving the name again
--                             removes the row
alter table site_name add column if not exists routed_at timestamptz;
alter table site_name add column if not exists probe_secret text;
alter table site_name add column if not exists probe_reading jsonb;
alter table site_name add column if not exists probed_at timestamptz;
alter table site_name add column if not exists probe_next_at timestamptz;
alter table site_name add column if not exists probe_tries integer not null default 0;
alter table site_name add column if not exists connected_at timestamptz;
alter table site_name add column if not exists probe_page_nonce text;
alter table site_name add column if not exists probe_page_path text;
alter table site_name add column if not exists probe_page_until timestamptz;
alter table site_name add column if not exists migrate_next_at timestamptz;

create sequence if not exists site_route_gen;
alter table site_publish_op add column if not exists route_gen bigint;

create table if not exists site_name_released (
  name text primary key check (name = lower(name)),
  released_at timestamptz not null default now()
);

-- The sweep's one read: names whose route is installed and that are not connected yet.
create index if not exists site_name_probe_due on site_name (probe_next_at) where probe_next_at is not null;
