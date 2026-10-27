-- WHAT A STOPPED CHAT TURN WROTE, FOR THE NEXT TURN OF THE SAME CONVERSATION (review Q2, council 20/10/2026).
--
-- When the customer presses Stop, dsh replaces the answer of the site call still running with
-- "Error: tool call aborted". The host lets a send already on the wire finish (`turn-stop.mjs`), so
-- the write may well have landed, but the model of the next turn reads only "aborted" and believes
-- nothing changed. The host kept what it knew in process memory, so a restart lost it.
--
-- One row per write of a site call the Stop cut (`tracy-site-tools` `stopped-writes.mjs`): recorded
-- when the Stop lands (writes already answered, and `sent` for one still on the wire), then once more
-- with its outcome when its answer comes. The next turn's first step takes the rows of the earlier
-- turns of its conversation (`POST /api/sites/:key/turn/stopped/take`) and tells the agent, once,
-- what landed and what may have. Names only: action, target (kind/id/slot/page), outcome — never a
-- value, a body or a credential.
--
--   outcome  'sent'      sent, no answer yet (stays unknown if none ever comes: a restart, a timeout)
--            'ok'        the site said it wrote
--            'refused'   the site refused cleanly: nothing written
--            'unknown'   an answer that does not say whether it wrote
--            'not-sent'  the Stop kept it from being sent after all
--   via      'apply' (the Apply door) · 'emdash' (the EmDash site's own MCP or write script)
--   noticed_at  when the next turn was told: a row is told once.
create table if not exists site_stopped_write (
  turn_id     text not null,
  write_id    text not null,
  site_key    text not null,
  -- The turn id's root session and number, so a later turn of the same conversation finds it.
  session_id  text not null,
  turn        integer not null,
  actor       text,
  action      text not null,
  target      jsonb,
  via         text not null,
  outcome     text not null,
  recorded_at timestamptz not null default now(),
  noticed_at  timestamptz,
  primary key (turn_id, write_id)
);

create index if not exists site_stopped_write_untold
  on site_stopped_write (site_key, session_id) where noticed_at is null;
