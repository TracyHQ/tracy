-- AN OWN DOMAIN IS REGISTERED WITH CLOUDFLARE FOR SAAS BEFORE IT CAN CONNECT (#1037, slice 2).
--
-- A customer's own domain points at `connect.<site domain>` (a proxied record of the site zone).
-- Cloudflare answers such a name only once the zone holds a CUSTOM HOSTNAME for it, and only with
-- the certificate that hostname was issued. tracy-web creates that hostname through the Cloudflare
-- API (`sites/site-domain-provider.js`) once the reservation is proven (`_tracy.<name>` TXT, as
-- before), reads its status and its certificate's, and deletes it once the name is no longer one of
-- a site's.
--
-- 🔒 ONE ROW PER NAME, AND IT IS NOT A CHILD OF THE SITE OR OF THE RESERVATION. No foreign key: the
-- row is also the durable record of what is left to delete at Cloudflare. A reservation removed, a
-- reservation that lapsed, a site deleted (its `site_name` rows go with it) all leave this row, and
-- the reconcile sweep deletes the hostname it names before the row goes. While it is there no other
-- reservation of the name is taken (`PUT /address` answers `DOMAIN_RELEASING`).
--
--   name               the customer's host name, as `site_name.name`
--   zone_id            the zone the hostname is (to be) created in
--   site_key / token   the reservation it was made for: `site_name` (name, site_key, token). A row
--                      whose reservation is no longer that is deleted at Cloudflare, never re-used
--   provider_id        Cloudflare's id of the hostname; null until the create was answered
--   state              creating   nothing was sent yet, or a create was refused for certain
--                      posting    a create was sent and its answer never arrived: whatever exists
--                                 under this name at Cloudflare now is NOT taken as Tracy's
--                      created    Cloudflare answered with `provider_id`
--                      conflict   Cloudflare already holds a hostname of this name Tracy did not
--                                 create for this reservation: refused, never taken over
--                      deleting   the reservation is gone; the hostname is to be deleted
--   hostname_status / ssl_status   what Cloudflare said at the last read (`read_at`)
--   records            the DNS records Cloudflare asked for to validate the certificate, if any
--   reason             why the hostname is not ready, as a stable code (`HOSTNAME_PENDING`…)
--   next_at / tries    when the sweep looks again, and how many looks since the last change
--   claimed_until      while set and not past, one pass is acting on the row (a create may be in the
--                      air): no other pass takes it, a forced one (Check DNS, a probe) included
--   claim_id           that pass's generation: every write of a pass is fenced by it, so a pass that
--                      outlived its claim writes nothing on a row another pass took since
--   attempt            which create this is: raised when a create is sent, and the create's answer is
--                      written only on the row of that same attempt
create table if not exists site_custom_hostname (
  name text primary key check (name = lower(name)),
  zone_id text not null,
  site_key text not null,
  token text not null,
  provider_id text,
  state text not null check (state in ('creating', 'posting', 'created', 'conflict', 'deleting')),
  hostname_status text,
  ssl_status text,
  records jsonb not null default '[]'::jsonb,
  reason text,
  read_at timestamptz,
  next_at timestamptz not null default now(),
  tries integer not null default 0,
  claimed_until timestamptz,
  claim_id uuid,
  attempt integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists site_custom_hostname_due on site_custom_hostname (next_at);

-- 🔒 A HOSTNAME TRACY WAS TOLD IT CREATED IS NEVER FORGOTTEN. A create answered to a pass that can no
-- longer write it on its row (its claim taken by a later pass, its attempt superseded, the row gone)
-- is kept here by its id, and deleted at Cloudflare by that id until Cloudflare says it is gone. While
-- one is here, its name is not reserved again (`DOMAIN_RELEASING`).
create table if not exists site_custom_hostname_orphan (
  provider_id text primary key,
  zone_id text not null,
  name text not null,
  reason text,
  tries integer not null default 0,
  next_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists site_custom_hostname_orphan_due on site_custom_hostname_orphan (next_at);

-- When the background sweep next reads DNS for a pending own domain of a published site, so a
-- domain whose records are right connects without anyone pressing Check again (`cron.js`
-- `sweepOwnDomainStarts`).
alter table site_name add column if not exists dns_next_at timestamptz;
