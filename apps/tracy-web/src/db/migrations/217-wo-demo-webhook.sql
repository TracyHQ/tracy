-- Webhooks of `/v1/demos` (`opportunities-build/demo-webhooks.js`): an account registers one https address and Tracy
-- POSTs it a signed event when one of its demos is accepted, completes, fails or is opened through its share link.
--
-- wo_demo_webhook        one registered address of one account; at most one live (`revoked_at` null). `secret_box`
--                        is the signing secret sealed with `lib/secret-box.js` (it signs, so it cannot be a hash); it
--                        is shown once, when registered. `since`: events are made for demos accepted from then on; a
--                        replaced address keeps the `since` of the one it replaced.
-- wo_demo_webhook_event  the outbox. One row per event, made by the sweep from committed rows only (never inside a
--                        build's transaction), with `dedupe_key` (`<demo>:<type>`, `<demo>:opened:<open>`) so a demo
--                        has each event once. `body` is the exact JSON sent, frozen when the event is made, so every
--                        attempt sends the same bytes and the same `id`. The sweep claims due rows, POSTs them to the
--                        account's live address and settles them: `delivered_at`, or `attempts` + a later `next_at`,
--                        or `gave_up_at` after 8 attempts or when the account has no live address any more.
-- Expand-only: an older image never reads them.
create table if not exists wo_demo_webhook (
  id uuid primary key,
  account_id uuid not null references account (id) on delete cascade,
  url text not null check (length(url) <= 2048),
  secret_box text not null,
  since timestamptz not null,
  grant_id uuid,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index if not exists wo_demo_webhook_live on wo_demo_webhook (account_id) where revoked_at is null;

create table if not exists wo_demo_webhook_event (
  id uuid primary key,
  account_id uuid not null references account (id) on delete cascade,
  demo_id uuid not null references wo_public_demo (id) on delete cascade,
  type text not null check (type in ('demo.accepted', 'demo.completed', 'demo.failed', 'demo.opened')),
  dedupe_key text not null unique,
  body text not null,
  created_at timestamptz not null default now(),
  next_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  delivered_at timestamptz,
  gave_up_at timestamptz,
  last_status integer,
  last_error text check (last_error is null or length(last_error) <= 200)
);
create index if not exists wo_demo_webhook_event_due on wo_demo_webhook_event (next_at)
  where delivered_at is null and gave_up_at is null;
create index if not exists wo_demo_webhook_event_account on wo_demo_webhook_event (account_id, created_at desc);
