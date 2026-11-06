-- Progress of a site planner turn while its answer streams in (ADR 0041, #301).
--
-- A streamed call (the deepseek-native wire) reports every 15 s or so what has arrived so far: characters of
-- content, of reasoning and of tool arguments, the time of the last byte, and when the report was made. The bench
-- CLI's `status` reads it to tell a planner still writing from a connection that hung. Written only while the turn is
-- dispatched (the append-only trigger allows that update, since what was sent is unchanged); null on unstreamed
-- turns and on turns saved before streaming existed. The answered row keeps the last report as it was.
alter table site_planner_turn add column if not exists progress jsonb;
