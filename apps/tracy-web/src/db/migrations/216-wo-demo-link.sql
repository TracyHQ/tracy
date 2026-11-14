-- The share link of a demo (`lib/wo-demo-links.js`, `opportunities-build/demo-link-route.js`): `GET /d/<token>` sends
-- whoever opens it to the demo's address and counts the open, so a seller knows when the business owner looked.
--
-- wo_demo_link  one link of one build. `token` is 32 random base64url characters (192 bits): it opens nothing but a
--               redirect to an address that is public anyway, so it is kept as it is, to be shown again in every
--               outreach draft. At most one live link per build; revoking sets `revoked_at`, and the next outreach
--               read makes a new one. `first_opened_at`: the first counted open of this link.
-- wo_demo_open  one counted open: when, the path asked after the token, and the device class read from the
--               User-Agent. Nothing else of the visitor: no address, no cookie, no User-Agent, no referrer.
--               Bots, link previews, HEAD requests and the seller's own signed-in session are never written.
-- Expand-only: an older image never reads them.
create table if not exists wo_demo_link (
  id uuid primary key,
  account_id uuid not null references account (id) on delete cascade,
  build_id uuid not null references wo_build (id) on delete cascade,
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{32}$'),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  first_opened_at timestamptz
);
create unique index if not exists wo_demo_link_live on wo_demo_link (build_id) where revoked_at is null;
create index if not exists wo_demo_link_build on wo_demo_link (build_id);

create table if not exists wo_demo_open (
  id uuid primary key,
  link_id uuid not null references wo_demo_link (id) on delete cascade,
  opened_at timestamptz not null default now(),
  path text not null check (length(path) between 1 and 200),
  device text not null check (device in ('phone', 'desktop'))
);
create index if not exists wo_demo_open_link on wo_demo_open (link_id, opened_at desc);
create index if not exists wo_demo_open_at on wo_demo_open (opened_at);
