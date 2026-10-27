-- Mail sent BY a customer's site (`POST /_site-mail`, `mail/site-mail/`): each site's policy, and
-- the log every limit is counted from.
--
-- No seed rows, same as `badge_setting`: a site with no `site_mail` row is in mode `tracy` with the
-- deployment's default limits (`SITE_MAIL_SITE_HOURLY` / `SITE_MAIL_SITE_DAILY`), and the first
-- save from /ops or from the site's own admin inserts the row.
create table site_mail (
  site_key text primary key references site(site_key) on delete cascade,
  mode text not null default 'tracy'
    check (mode in ('tracy', 'tracy-domain', 'own-smtp', 'own-cms', 'off')),
  -- Null = the deployment default. Zero is a real value: this site may not send through Tracy.
  hourly_limit integer check (hourly_limit is null or hourly_limit >= 0),
  daily_limit integer check (daily_limit is null or daily_limit >= 0),
  -- Mode `tracy-domain`: the customer's own sending domain, as Resend knows it.
  domain text,
  resend_domain_id text,
  -- Resend's own word for it (`not_started`, `pending`, `verified`, `failed`, ...), copied as read.
  domain_status text,
  -- The DNS records Resend asks the customer to add, as last read: `[{type, name, value, status}]`.
  -- Kept here so drawing the screen never waits on a third party.
  domain_records jsonb,
  -- Mode `own-smtp`: `{host, port, user, password}`, the password sealed by `lib/secret-box.js`.
  -- 🔒 No door ever answers the password, sealed or not — only `hasPassword`.
  smtp jsonb,
  updated_by text,
  updated_at timestamptz not null default now()
);

-- One row per message the relay was asked to send (a token that did not verify writes nothing: no
-- site is known, and an unauthenticated caller must not be able to fill this table).
--
-- `sending` is written, under a lock, BEFORE the upstream call and counted by the limits like a
-- sent message — that is what stops two concurrent sends from both reading "9 of 10" and both
-- going out. It becomes `sent` / `logged` / `failed` when the call returns.
--
-- No foreign key to `site`: the log outlives the site it describes, because the bill does.
create table site_mail_log (
  id bigserial primary key,
  site_key text not null,
  at timestamptz not null default now(),
  mode text,
  status text not null check (status in ('sending', 'sent', 'logged', 'failed', 'refused')),
  code text,
  recipients integer not null default 0,
  -- Who it was addressed to (To, Cc and Bcc, envelope order) and its subject, decoded and cut to
  -- 200 characters — what an operator needs to answer "did the order mail to X go out". Empty
  -- when the message was refused before it was read (draft, off, too large, malformed).
  to_addresses text[] not null default '{}',
  subject text,
  -- The site's own `From`, as it wrote it: what Tracy puts in `Reply-To` when it rewrites `From`,
  -- and what the site admin's screen shows as "replies go to".
  original_from text,
  message_id text,
  upstream_error text,
  bytes integer not null default 0
);
-- "How many did this site send in the last hour / today" and "this site's recent log".
create index site_mail_log_site_at on site_mail_log (site_key, at desc);
-- "How many did every site send today" — only the rows the limits count.
create index site_mail_log_counted_at on site_mail_log (at)
  where status in ('sending', 'sent', 'logged');
