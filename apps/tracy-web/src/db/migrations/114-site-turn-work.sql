-- What a site's chat turn took, and whether its change was seen (plan `tasks/todo-do-dung-that.md`, real-usage
-- measurement). Until now these lived only in the host dsh's session log and in one site-tools log line.
--
--   steps, calls, failed_calls  read off the turn's own events by the host dsh when the turn stops (`/moment`
--                               `work`): `step/start`s, `tool/call`s, and the calls whose answer said `ok: false`
--                               or was an error. Written by the newest close only, like the answer.
--   visual, visual_note         the visual check's verdict on the turn (`POST /turn/check` from site-tools):
--                               `shown`, `not_shown`, `broken`, `cannot_tell`, or `skipped` with the reason in
--                               `visual_note` (`no-write`, `off`, `no-image-model`…).
--
-- Null on a turn closed by an older dsh, or one no check looked at: unknown, never zero.
alter table site_turn add column if not exists steps integer;
alter table site_turn add column if not exists calls integer;
alter table site_turn add column if not exists failed_calls integer;
alter table site_turn add column if not exists visual text
  check (visual in ('shown', 'not_shown', 'broken', 'cannot_tell', 'skipped'));
alter table site_turn add column if not exists visual_note text;
