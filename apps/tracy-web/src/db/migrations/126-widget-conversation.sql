-- Encrypted, visitor-bound context; never session cookies or sign-in secrets.
create table widget_conversation (
  visitor_digest text primary key,
  owner_account_id uuid references account(id) on delete cascade,
  payload_cipher text not null,
  schema_version integer not null default 1 check (schema_version = 1),
  revision bigint not null check (revision > 0),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
create index widget_conversation_expiry on widget_conversation(expires_at);
