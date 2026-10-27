-- A Good or Bad on Tracy's answer to a site's chat turn (#1403 item 13): kept beside the turn so it can be
-- measured with it, where it lived only in the conversation's log. The note a person may write with it is
-- not kept here — only the judgement and the categories it was filed under. A rating taken back clears it.
alter table site_turn add column if not exists rating text check (rating in ('positive', 'negative'));
alter table site_turn add column if not exists rating_categories jsonb;
alter table site_turn add column if not exists rated_at timestamptz;
