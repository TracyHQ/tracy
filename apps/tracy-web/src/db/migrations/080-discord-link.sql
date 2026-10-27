-- A DISCORD MEMBER PROVES AN ADDRESS, AND /ops LEARNS WHO IS WHO (08/10/2026).
--
-- Tracy's Discord bot asks a member for the address they sign into Tracy with, and Tracy mails that
-- address a six-digit code; the member types it back in Discord (`discord/route.js`). Until now the
-- server and Tracy had no shared name for a person: `/ops` could not tell which beta customer was
-- the one posting in #bug-reports.
--
--   discord_link_code   the code waiting for one Discord member, one row per member. Kept apart
--                       from `otp_code` on purpose: that table is keyed by ADDRESS and shared by
--                       `/login` and the lane door, so a Discord code written there would replace
--                       the sign-in code the same person may be waiting for in another tab
--   discord_link        which Discord member proved which address. One address, one member, both
--                       ways: proving an address again from another Discord account moves it
--
-- No foreign key to `account`: a JoomlArt member may prove an address before ever signing into
-- Tracy, and deleting an account must not erase who posted what on Discord (same rule as
-- `ops_signal`).
create table discord_link_code (
  discord_id text primary key,
  email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0
);

create table discord_link (
  email text primary key,
  discord_id text not null unique,
  linked_at timestamptz not null default now()
);
