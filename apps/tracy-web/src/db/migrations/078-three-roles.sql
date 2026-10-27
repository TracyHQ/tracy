-- THREE ROLES ON A CUSTOMER'S SEAT: viewer · editor · owner (ADR 0028, 08/10/2026).
--
-- Until now a seat held one of `owner · admin · developer · editor`, and what each could do was a
-- matrix a site or workspace could override. Now each role holds a fixed set (`seats/roles.js`):
--   viewer  nothing to change with; reads, comments, asks the agent read-only
--   editor  changes the whole site, publish and restore included; invites viewers and editors
--   owner   also manages people, the custom domain and the site's lifecycle
-- `admin` and `developer` are retired and become `editor` (ADR 0028 §8). The old `editor` held
-- only `content`; holding `code` and `site` now is the decision, not a side effect of this file.
--
-- WHAT IS NOT TOUCHED. Tracy's own staff sit in `seat_workspace` too, in the one workspace whose
-- `kind = 'tracy_admin'`, and their ranks (`owner · admin · developer`, plus `editor` as a
-- read-only staff seat — `ops/admit.js` lets any rank read, only owner/admin write) are a
-- different ladder that this decision leaves as it is. `staff` keeps its
-- own check. `site_role_policy` / `workspace_role_policy` stay as tables but nothing reads them.

-- ── seat: a customer site's book ─────────────────────────────────────────────────────────────────
-- The constraint goes first, so the conversion below is not checked against the old list. No
-- converted row is an owner, so `seat_keep_one_owner` (002) has nothing to say about it.
alter table seat drop constraint if exists seat_role_check;
update seat set role = 'editor' where role in ('admin', 'developer');
alter table seat add constraint seat_role_check check (role in ('owner', 'editor', 'viewer'));

-- ── seat_workspace: one table, two ladders ───────────────────────────────────────────────────────
-- A check constraint sees only its own row, and which ladder applies depends on the WORKSPACE's
-- kind — a column of another table. So the work is split in two:
--   1. the constraint keeps every row on SOME known role (the union of both ladders), so a typo
--      can never land whatever path wrote it;
--   2. a trigger, run whenever a row's role or workspace is written, reads the workspace's kind and
--      refuses a role from the other ladder: staff ranks only in `tracy_admin`, customer roles only
--      everywhere else. (`editor` is on both ladders: a read-only staff seat in `tracy_admin`.)
-- The trigger does not re-check rows nobody writes, which is why the conversion below runs first.
-- A workspace never changes kind after it is made (`POST /workspaces` never takes `kind` from a
-- request); if one ever did, its existing rows would keep the ladder they were written on.
alter table seat_workspace drop constraint if exists seat_workspace_role_check;
update seat_workspace sw set role = 'editor'
  from workspace w
  where w.id = sw.workspace_id and w.kind <> 'tracy_admin' and sw.role in ('admin', 'developer');
alter table seat_workspace add constraint seat_workspace_role_check
  check (role in ('owner', 'editor', 'viewer', 'admin', 'developer'));

create or replace function seat_workspace_role_ladder() returns trigger language plpgsql as $$
declare
  ws_kind text;
begin
  select kind into ws_kind from workspace where id = new.workspace_id;
  if ws_kind = 'tracy_admin' then
    if new.role not in ('owner', 'admin', 'developer', 'editor') then
      raise exception 'role % is not a Tracy staff rank', new.role using errcode = '23514';
    end if;
  elsif new.role not in ('owner', 'editor', 'viewer') then
    raise exception 'role % is not a workspace role', new.role using errcode = '23514';
  end if;
  return new;
end $$;
create trigger seat_workspace_role_ladder before insert or update of role, workspace_id on seat_workspace
  for each row execute function seat_workspace_role_ladder();

-- ── seat_sync: grants still waiting to reach a host ──────────────────────────────────────────────
-- A queued `mint` carries the grant as it was written, role and toolsets included. One queued before
-- this file would tell a host `admin` (a role it is about to stop knowing) with the old matrix'
-- toolsets; it is rewritten to what the same seat is minted with from now on.
update seat_sync
  set payload = payload || '{"role": "editor", "toolsets": ["content", "code", "site"]}'::jsonb
  where kind = 'mint' and done_at is null and payload->>'role' in ('admin', 'developer');
