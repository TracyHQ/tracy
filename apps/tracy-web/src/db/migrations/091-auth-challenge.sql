-- A sign-in code bound to ONE desktop round (11/10/2026, `tasks/todo-desktop-onboard-v2.md`,
-- council decision (a)).
--
-- WHY A TABLE OF ITS OWN. `otp_code` is keyed by address only: a code mailed for a plain web
-- sign-in proves the inbox, and nothing about which app on which computer the person meant to let
-- in. On the desktop round's page one press both verifies the code and approves the round, so the
-- code must name the round it was asked for. A web sign-in code, or the code of another round,
-- finds no row here and approves nothing.
--
--   round_nonce_hash   the round (`auth_link.nonce_hash`); the row dies with the round
--   email              the address the code was mailed to (the round's `email_hint`)
--   purpose            what pressing the button does; only `desktop` today
--   code_hash          the code, hashed with the round and the address
--   expires_at         the code's own life, never longer than the round's
--   attempts           wrong tries so far; past the cap the challenge is dead
--   consumed_at        set when the challenge approved its round, or when a newer code replaced it;
--                      a consumed challenge never answers again
--
-- 🔒 AT MOST ONE LIVE CHALLENGE PER ROUND. "Send a new code" consumes the old one in the same
-- transaction that writes the new one, and the partial unique index makes a second live row
-- impossible rather than merely unlikely.
create table if not exists auth_challenge (
  id bigserial primary key,
  round_nonce_hash text not null references auth_link (nonce_hash) on delete cascade,
  email text not null,
  purpose text not null check (purpose in ('desktop')),
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists auth_challenge_live_per_round
  on auth_challenge (round_nonce_hash) where consumed_at is null;
