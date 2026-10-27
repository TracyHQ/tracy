-- Sign-ins ended by sign-out (J1.3, 11/10/2026; `lib/session-revocation.js`).
--
-- A session token is signed and self-contained, so clearing the cookie used to end nothing: a copy
-- kept working, and renewing itself, after sign-out. Every token now carries a `jti` (one per
-- sign-in, kept across renewals); sign-out writes it here and every read of the cookie refuses it.
--
-- `expires_at` = sign-out + the session TTL: by then no token of that sign-in can still be alive
-- (a refused token cannot be renewed), so the row is deleted on a later sign-out.
create table if not exists session_revocation (
  jti text primary key,
  revoked_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists session_revocation_expires_at on session_revocation (expires_at);
