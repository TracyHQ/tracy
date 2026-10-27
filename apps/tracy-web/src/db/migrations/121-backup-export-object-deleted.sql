-- When the store last answered that an export's object is gone (17/10/2026, `sites/backup-export.js`).
-- A `failed` export may still hold an object: the host can upload and then fail, or upload a size
-- other than the one it reported (`UPLOAD_NOT_FOUND`). The row is failed at once; its object is
-- deleted then, and the hourly sweep retries every failed row this column still leaves null, so a
-- store error at the moment of failing does not leave the object in the store for good.
--
--   object_deleted_at       null while the object may exist; set once the store answered DELETE with
--                           success or 404, by whichever caller got there first (the failure, the
--                           sweep, a site delete). Only the caller that sets it writes the `deleted`
--                           audit line. Set for `expired` rows by the same sweep.
--   object_delete_tried_at  the last DELETE the store refused. The sweep takes ready-past-their-day
--                           and failed rows never tried first, then the longest-untried, so keys the
--                           store keeps refusing cannot starve newer ones out of its batch.
alter table backup_export add column object_deleted_at timestamptz;
alter table backup_export add column object_delete_tried_at timestamptz;
-- Rows already expired had their object deleted before they became `expired`.
update backup_export set object_deleted_at = coalesce(expires_at, now()) where state = 'expired';
create index backup_export_failed_object on backup_export (object_delete_tried_at nulls first, created_at)
  where state = 'failed' and object_deleted_at is null;
