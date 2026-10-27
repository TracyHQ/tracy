-- WHAT A PERSON CHANGED IN THE CMS ADMIN, OUTSIDE TRACY (site changes plan §5–§6, P2).
--
-- tracy-host's `cms-log-pull` job reads the CMS's own admin log after a cursor (Joomla's User
-- Actions Log, EmDash's audit-log plugin, the WordPress hook of P2.1) and `sites/cms-log.js` stores
-- one row here per admin action. The Site changes tab reads these as `outside-cms` rows.
--
-- 🔒 NAMES, NEVER VALUES. A row says who (the CMS's own user, not a Tracy seat — no mapping), which
-- resource, which op and when. The CMS keeps field values (EmDash's entry holds the whole record
-- before and after); none of them is copied here.
--
-- 🔒 `(site_key, source, cursor_key)` IS THE ROW'S IDENTITY, so a pull that runs twice — a timer and
-- a button at once, or a retry after a lost answer — inserts each row once (`on conflict do
-- nothing`). `cursor_key` is the source's own row id, with the date when the source may reuse an id
-- (Joomla's auto-increment restarts after a TRUNCATE).
--
-- No index on `audit` (see 023-site-write-lease.sql: migrations run in one transaction before the
-- server listens). These two tables are new, so indexing them is free.
create table if not exists site_cms_change (
  id             bigserial primary key,
  site_key       text not null,
  -- Which log: `joomla-action-log` · `emdash-audit-log` · `wordpress-tracy-log`.
  source         text not null,
  -- `{name, id}` of the CMS user, or null when the CMS recorded none (EmDash deletes and uploads).
  cms_actor      jsonb,
  resource_type  text,
  resource_id    text,
  resource_title text,
  op             text not null,
  occurred_at    timestamptz not null,
  cursor_key     text not null,
  pulled_at      timestamptz not null default now(),
  unique (site_key, source, cursor_key)
);

create index if not exists site_cms_change_site_at on site_cms_change (site_key, occurred_at desc, id desc);

-- Where each site's pull stands, per source: the cursor to read after, whether the CMS is keeping
-- its log at all (`enabled` — a Joomla admin can switch User Actions Log off; an EmDash site built
-- before the theme carried the audit plugin has none), and what the last attempt said.
create table if not exists site_cms_log_cursor (
  site_key       text not null,
  source         text not null,
  cursor         text not null default '',
  -- Null until a pull has answered: "not known yet" is not "off".
  enabled        boolean,
  -- Why `enabled` is false: `log-disabled` · `hook-not-installed`.
  reason         text,
  last_pulled_at timestamptz,
  last_error     text,
  last_error_at  timestamptz,
  -- When someone last READ this site's CMS rows (`GET …/cms-log`): one of the three signals the
  -- five-minute timer uses to decide a site is being looked at (`sites/cms-log.js`).
  last_read_at   timestamptz,
  primary key (site_key, source)
);
