-- Component custody (ADR 0051): the write-back credential a site's CMS component registers with
-- Tracy so `POST /api/sites/:key/apply` can proxy a write into it. Same table as
-- `workers/seat-registry/schema.sql:519-529` (`site_component`) — carried, unlike `site_mcp` in
-- that same file: `site_mcp` is Shopify's own table (the schema comment above it says so), while
-- `site_component` is the generic write-back credential every platform this app creates
-- (`CREATE_PLATFORMS` in `sites/route.js`) can register — Joomla's `claude-cowork` component,
-- WordPress's own plugin. Task 6's own 501 stub read `site_component`/`site_mcp` as one
-- Shopify-only pair and declined to carry either; this migration is the correction (task 6b brief).
--
-- No `enable row level security` here: that clause locks the row to a Supabase service-role user,
-- a split this app has no equivalent of — one application role talks to this whole database, same
-- note `002-book.sql` already makes about `site_role_policy`. The protection in this app's shape
-- is narrower but real: only this process's own code ever queries `site_component`
-- (`sites/store.js`'s `writeComponent`/`currentComponent`), and no route puts `config.token` into
-- a response body, a log line, or an error message.
--
-- Append-only, same discipline as `site_role_policy_history`: re-registering a component (a
-- rotated token) INSERTs a new row rather than updating the old one, so the newest row
-- (`created_at desc`) is always the one a reader treats as current, and a revoked or leaked token
-- never gets silently overwritten out of the append-only trail.
--
-- `config` carries `{endpoint, token}` today. Production's `site_component` also carries three
-- Shopify-only credential "doors" sharing this same table (`config.door in ('theme', 'content',
-- 'born-admin')` — schema.sql's comment above `site_component`); this app never writes one, since
-- Shopify is out of scope for this plan, but `currentComponent` still filters for an ABSENT `door`
-- field, matching the Worker's own `siteComponent()` predicate — so a future task that adds one of
-- those doors to this table does not silently become "the" current row Apply reads.
create table site_component (
  id uuid primary key default gen_random_uuid(),
  site_key text not null references site(site_key) on delete cascade,
  config jsonb not null,
  created_at timestamptz not null default now(),
  created_by text not null
);
create index site_component_site_created on site_component (site_key, created_at desc);

-- `apply_audit` (schema.sql:539-545) does NOT get its own table — the plan's own §4.3 already
-- says `token_issue`/`apply_audit` fold into `audit` (002-book.sql's `audit` table, shipped in
-- Task 1), and `audit` already carries everything an Apply needs to record: actor, action,
-- site_key, and a jsonb `detail` for the rest (`ok`, `apply_id`). No column added here.
