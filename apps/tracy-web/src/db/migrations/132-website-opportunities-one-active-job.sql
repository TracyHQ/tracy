-- apps/tracy-web/src/db/migrations/132-website-opportunities-one-active-job.sql
-- At most ONE queued or running research job per opportunity (tasks/todo-wo-my-opportunities-v2.md,
-- council 19/10). The research door checked this before inserting, but resume did not: resuming an old
-- cancelled job while a newer one ran made two executors research the same restaurant at once, each
-- writing its sources and media. `store.js resumeJob` now checks under a row lock; this index is the
-- guarantee behind both doors (a lost race answers 409 `JOB_ACTIVE`, never a second job).
--
-- Numbering: develop ends at 129 and PR #1440 adds 130–131. The migrator applies every file whose
-- name is not yet in `schema_migration`, in name order (`db/index.js`), so 132 landing before 130–131
-- exist is fine and they still run after it.
--
-- Existing data cannot break the index: the table is locked against writes first, then every active
-- research job but the newest of its opportunity is cancelled exactly as the cancel door does (the
-- lease token moves, so an executor still holding it can no longer write) and marked
-- `last_error.code = DUPLICATE_ACTIVE_JOB` so the row says why. The kept job is the one the list and
-- the detail page already show as current (newest `created_at`). No duplicate → nothing is touched.
lock table wo_job in share row exclusive mode;

with extra as (
  select id from (
    select id, row_number() over (partition by opportunity_id order by created_at desc, id desc) as n
    from wo_job where kind = 'research' and state in ('queued', 'running')
  ) ranked where n > 1
), stopped as (
  update wo_job j set state = 'cancelled', lease_token = j.lease_token + 1, lease_owner = null,
    lease_until = null, last_error = jsonb_build_object('code', 'DUPLICATE_ACTIVE_JOB'), updated_at = now()
  from extra where j.id = extra.id
  returning j.id
)
update wo_job_attempt a set ended_at = now(), outcome = 'cancelled'
from stopped where a.job_id = stopped.id and a.ended_at is null;

create unique index if not exists wo_job_one_active on wo_job (opportunity_id)
  where kind = 'research' and state in ('queued', 'running');
