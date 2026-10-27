-- A WIDGET VISITOR'S SIGN-IN, SO A RESTART DOES NOT END IT (review Q4, 20/10/2026).
--
-- The embedded widget runs in a cross-site iframe, where the SameSite=Lax `tracy_sess` cookie is
-- never sent back; the sign-in lived only in tracy-web's memory and every restart signed every widget
-- visitor out. One row per visitor, keyed by the same digest as `widget_conversation` (the proof is
-- the widget's own random visitor cookie), holding no cookie: the account, a digest of the email
-- signed in, the sign-in's `jti` (so sign-out's revocation book ends it) and its expiry. Restoring
-- mints the same token again (`widget/store.js` `readSignIn`). It goes with the visitor's row and
-- with the account.
create table if not exists widget_sign_in (
  visitor_digest text primary key references widget_conversation(visitor_digest) on delete cascade,
  account_id uuid not null references account(id) on delete cascade,
  email_digest text not null,
  session_jti text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists widget_sign_in_expiry on widget_sign_in(expires_at);
