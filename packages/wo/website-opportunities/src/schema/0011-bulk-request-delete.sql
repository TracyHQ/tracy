-- A bulk Delete on My opportunities (`POST /api/website-opportunities/jobs/bulk` with action "delete") is
-- recorded like a bulk Resume or Cancel, so the same requestId answers the stored result.
-- Expand-only: an older image never sends "delete".
alter table wo_bulk_request drop constraint if exists wo_bulk_request_action_check;
alter table wo_bulk_request add constraint wo_bulk_request_action_check
  check (action in ('resume', 'cancel', 'delete'));
