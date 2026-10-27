-- Status reports on a comment dedupe by the pair (`call_id`, `call_status`), not by `call_id` alone
-- (`tasks/todo-comment-thread.md`, side work raised by stage 5). One chat tool call reports
-- `working` and then `done` under ONE callId; keyed by `call_id` alone the door dropped the second
-- report, so the Browser tab sent `'<callId>:<status>'` as a workaround. `call_status` is the status
-- that came with the last report applied (`PATCH` with `callId`), null when it carried no status.
--
-- Rows written before this column hold the tab's suffixed callIds with a null `call_status`; a new
-- report never matches them, so it applies — the same as it would have before.
alter table site_comment add column call_status text;
