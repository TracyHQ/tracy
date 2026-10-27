-- What a sign-in round is FOR, fixed when it opens (07/10/2026, the desktop app's sign-in).
--
-- WHY. The Mac app (`packages/desktop/tracy-desktop`) cannot receive a Google/GitHub sign-in in
-- its own window: the provider finishes in the system browser, and that browser's cookie never
-- reaches the app. It reuses this table's round instead — the person approves in the browser, and
-- the app trades the approved round for a session of its own at `POST /auth/link/:nonce/session`.
--
-- 🔒 ONE ROUND, ONE DOOR. A lane round answers only the lane's `/exchange` (an address, nothing
-- more); a desktop round answers only `/session` (a session cookie). Without this column a round
-- opened by a lane could be redeemed for a session, and a desktop round handed to a lane — so the
-- purpose is written once, at insert, and every consuming statement names it.
--
-- Every row that exists today was opened by a lane, so the default is that.
alter table auth_link add column if not exists purpose text not null default 'lane';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'auth_link_purpose_check' and conrelid='auth_link'::regclass) then
    alter table auth_link add constraint auth_link_purpose_check check (purpose in ('lane', 'desktop'));
  end if;
end $$;

-- `status` gains 'denied': the person pressed Deny on the approve page. It is a terminal state like
-- 'consumed' — nothing approves or redeems a denied round. The column never had a check, so this
-- adds one listing every state the code writes, to keep a typo from becoming a fifth.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'auth_link_status_check' and conrelid='auth_link'::regclass) then
    alter table auth_link add constraint auth_link_status_check
      check (status in ('pending', 'approved', 'consumed', 'denied'));
  end if;
end $$;
