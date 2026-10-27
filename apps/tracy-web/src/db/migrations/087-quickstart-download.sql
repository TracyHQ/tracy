-- Every quickstart zip a signed-in person asked `GET /api/quickstarts/:template/:cms/quickstart.zip`
-- for (10/10/2026): requests the door admitted, not completed transfers. The door writes the row
-- and counts the account's last hour in ONE statement before it opens the stream, so this table is
-- the rate limit as much as it is the log (`QUICKSTART_DOWNLOADS_PER_ACCOUNT_PER_HOUR`). Later, it
-- is also what "Download: N" on joomlart.com can be counted from.
create table quickstart_download (
  id uuid primary key,
  -- Kept when the account goes: a count of downloads outlives the person who made them.
  account_id uuid references account(id) on delete set null,
  -- The release tag, `quickstart/ja-kinetic/j6` — the id of what was downloaded.
  tag text not null,
  at timestamptz not null default now()
);
create index quickstart_download_account_at on quickstart_download (account_id, at desc);
