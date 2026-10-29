-- When aMember first failed to answer for a running send queue's next email. While set and younger
-- than the retry window (`real-queue.js` AMEMBER_RETRY_MS), the queue waits and asks again on the next
-- pass instead of pausing; an answer clears it, and so does any pause, start or resume.
alter table invitations_real_queue add column amember_failing_since timestamptz;
