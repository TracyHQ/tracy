-- WHAT THE CUSTOMER SAID IN THE "TELL TRACY ABOUT YOUR SITE" POPUP, AND HOW FAR TRACY GOT WRITING IT
-- INTO THE NEW SITE (Add site → Apply).
--
-- One row per site born with a brief. "I will do it later" writes no row at all, which is the whole
-- of that road's difference from Apply: nothing here can slow a site that was made without one.
--
--   brief       what was typed, cleaned: {about, goal, style} (`lib/site-brief.js`). Customer text, so
--               it is bounded by the door before it gets here and never read back as an instruction.
--   normalized  what Tracy read OUT of it: {name, sector, tone, languages, ...}. Written once, by the
--               step that runs while the site is still being installed.
--   state       queued → preparing (the text and the pictures are being made while the CMS installs)
--               → ready (made, waiting for the site to be up) → applying (being written into it)
--               → applied | failed. `failed` is SOFT: the site is still handed over, wearing the
--               template's own words, and `error` says what did not happen (CLAUDE.md §0.3).
--   stage       the one line the wizard's console shows while it waits, in the customer's terms.
--   timings     milliseconds per phase, for the report that compares Apply with "later":
--               {prepareMs, applyMs, ...}. Written by the process that did the work, never guessed.
create table if not exists site_brief (
  site_key    text primary key,
  account_id  uuid,
  platform    text not null,
  quickstart  text,
  brief       jsonb not null,
  normalized  jsonb,
  state       text not null default 'queued',
  stage       text,
  error       text,
  timings     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
