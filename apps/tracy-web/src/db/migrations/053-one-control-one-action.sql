-- One control, one action (#792, 03/10/2026).
--
-- 🔒 THREE ADMINISTRATOR REMOVALS, ONE STORED STATE EACH. Revoke access, Cancel invitation and
-- Decline request all wrote `seat.revoked_at` and nothing else, so the book could not say which of
-- the three had happened. `removal_kind` says it, written in the same statement as `revoked_at`.
--
-- `revoked_at` STAYS THE FENCE: every authorisation read keeps filtering on it, unchanged. And
-- `declined_at` stays the invitee's own "no" — an administrator's press never writes it.
--
-- NOTHING IS BACKFILLED. A row revoked before this migration keeps `removal_kind` null: which
-- press closed it was never stored, and a guess here would be read as a record. A seat its holder
-- left, and a whole-site teardown, close with no kind as well — neither is one of the three.
alter table seat
  add column removal_kind text
    constraint seat_removal_kind_known
      check (removal_kind in ('revoke', 'cancel_invite', 'decline_request'));

-- A kind without a removal would be a live seat that reads as removed: a revived grant clears it
-- (`grantSite`, `requestSiteJoin` in `seats/store.js`).
alter table seat
  add constraint seat_removal_kind_needs_removal
    check (removal_kind is null or revoked_at is not null);

-- 🔒 GENERATE, RE-GENERATE AND RETRY ARE THREE PRESSES. A job recorded only its `mode`, so a retry
-- of a failed job was indistinguishable from a new press, and was sent with whatever the screen
-- held at that moment instead of what the failed job had been given.
--
--   action        'generate' | 'regenerate' | 'retry' — the press that made this job.
--   retry_of      the request id of the job a retry repeats; null for the other two.
--   max_questions the question budget the job ran with. It was part of the input hash but stored
--                 nowhere, so a faithful retry could not be told what it was.
--
--   press_hash    the fingerprint of the press as it was sent, in its normal form
--                 (`normalizePress` in `lib/question-generation.js`). A request id sent again is
--                 the same press only when this is equal. The other columns hold what the job RAN
--                 on (`base_revision` is the revision found, also when none was named), so they
--                 cannot say what was sent.
--
-- Rows from before this migration keep all four null: their action is not guessed, a job with no
-- stored budget is refused a retry rather than given the default, and an id with no stored
-- fingerprint is never taken for a press sent again.
alter table question_generation
  add column action text
    constraint question_generation_action_known
      check (action in ('generate', 'regenerate', 'retry')),
  add column retry_of text,
  add column max_questions integer,
  add column press_hash text;
