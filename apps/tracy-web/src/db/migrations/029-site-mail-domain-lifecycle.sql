-- Mode `tracy-domain` (`028-site-mail.sql`): the life of a customer domain on Tracy's Resend account.
--
-- That account is SHARED by every customer site and its plan holds a handful of domains, two of which
-- are Tracy's own sending domains. A domain created on Save and never deleted fills it (measured
-- 24/09 on the dev machine: one person trying two domains, every later create refused). So Tracy now
-- deletes what it created when it is replaced, left, removed or abandoned — and ONLY what it created.
--
-- 🔒 `domain_owned` IS THE ONLY LICENCE TO DELETE. True only when Tracy's own POST /domains made the
-- domain for this site. A domain that already sat on the account (reused by name) is false and is
-- never deleted by Tracy, whoever holds it afterwards.
alter table site_mail add column domain_owned boolean not null default false;
-- When the domain now in the row was asked for: "waiting since", and what the release clock counts
-- from (`SITE_MAIL_DOMAIN_PENDING_DAYS`).
alter table site_mail add column domain_requested_at timestamptz;
-- When the release clock deleted it (the row then reads `domain_status = 'expired'`, keeps `domain`
-- so the screen can say which one went, and sends from the Tracy address again).
alter table site_mail add column domain_released_at timestamptz;

-- The rows that predate this file and hold a Resend id: waiting since their last save, not since
-- the epoch — otherwise the first sweep would release every one of them at once. They stay
-- `domain_owned = false`: nothing proves Tracy made them, so nothing may delete them.
update site_mail set domain_requested_at = updated_at where domain is not null;

-- One domain belongs to at most one site. A released row keeps its `domain` text for the screen and
-- does not hold the name.
create unique index site_mail_domain_holder on site_mail (domain)
  where domain is not null and domain_status is distinct from 'expired';
