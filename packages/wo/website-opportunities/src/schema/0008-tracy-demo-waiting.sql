-- `waiting-for-you` (Tracy's /v1/demos): the demo's site exists and the operator's AI builds it in Tracy's chat, which
-- the demo's editUrl opens. A demo in it is active: a second press answers it.
alter table wo_tracy_demo drop constraint wo_tracy_demo_status_check;
alter table wo_tracy_demo add constraint wo_tracy_demo_status_check check (status in
    ('submitting', 'queued', 'waiting-for-you', 'building', 'needs-review', 'ready', 'failed', 'cancelled', 'refused'));
drop index wo_tracy_demo_one_active;
create unique index wo_tracy_demo_one_active on wo_tracy_demo (opportunity_id)
    where status in ('submitting', 'queued', 'waiting-for-you', 'building', 'needs-review')
       or (status = 'ready' and deleted_at is null);
