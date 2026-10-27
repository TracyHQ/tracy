-- The history half of `workspace_role_policy` (002-book.sql), added when Task 8's fix round 2 built
-- `workspaceRolePolicy`/`writeWorkspaceRolePolicy` — an oversight in the original migration, not a
-- declared cut (unlike `workspace_mcp`/`workspace_credentials`, which spec §8 names explicitly as
-- not carried; this table is not on that list).
--
-- Same shape as `site_role_policy_history` right above it in 002-book.sql: `workspace_role_policy`
-- itself stays a single CURRENT row per workspace (its primary key is `workspace_id`, so it cannot
-- also be the append-only log), and this table is the log every write also appends to — the exact
-- split `seats/store.js`'s `writeRolePolicy` already keeps between `site_role_policy` and
-- `site_role_policy_history`.
create table workspace_role_policy_history (
  id bigserial primary key, workspace_id uuid not null, policy jsonb not null, updated_by uuid, updated_at timestamptz not null default now()
);
create index workspace_role_policy_history_workspace on workspace_role_policy_history (workspace_id, updated_at desc);
