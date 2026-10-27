-- Isolated synthetic sandbox state. No sender/provider credentials or production recipients.
create table invitations_sandbox_campaign (
 id uuid primary key, name text not null, revision integer not null default 0,
 data jsonb not null default '{"recipients":[],"audit":[]}', created_at timestamptz not null default now()
);
create table invitations_sandbox_preview (
 id uuid primary key, campaign_id uuid not null references invitations_sandbox_campaign(id) on delete cascade,
 actor text not null, revision integer not null, digest text not null, payload jsonb not null,
 expires_at timestamptz not null, committed_revision integer, committed_result jsonb
);
create table invitations_sandbox_attempt (
 id uuid primary key, campaign_id uuid not null references invitations_sandbox_campaign(id), recipient_id uuid not null,
 email text not null unique, snapshot jsonb not null, created_at timestamptz not null default now()
);
create table invitations_sandbox_identity (
 identity text primary key, attempt_id uuid not null references invitations_sandbox_attempt(id)
);
create table invitations_sandbox_suppression (
 identity text primary key, created_at timestamptz not null default now()
);

-- Persistent identity graph prevents aliases introduced in later imports bypassing history.
create table invitations_sandbox_alias (
 a text not null, b text not null, primary key(a,b)
);
create index invitations_sandbox_alias_b on invitations_sandbox_alias(b);
