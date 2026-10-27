-- One row per attempt to hand a message to the Invitations mailbox (ceo@ via the Gmail API).
-- The row is written BEFORE the provider call and is the only evidence of what was meant to be
-- sent: a crash after it leaves `sending`, which recovery turns into `send_unknown`, never into a
-- new send. Recipient, subject and content live in `payload`, sealed with the campaign key, so the
-- row outlives nothing the campaign itself does not (retention purges it with the campaign).
create table invitations_real_send (
  id uuid primary key,
  campaign_id uuid not null references invitations_real_campaign(id) on delete cascade,
  recipient_id uuid not null,
  mailbox_id text not null default 'gmail' check (mailbox_id = 'gmail'),
  mailbox_generation bigint not null,
  kind text not null check (kind in ('test')),
  actor_id uuid not null,
  request_key text not null,
  request_digest text not null,
  rfc_message_id text not null unique,
  draft_revision integer not null,
  state text not null check (state in ('sending', 'sent', 'failed', 'send_unknown')),
  error_code text,
  gmail_message_id text,
  gmail_thread_id text,
  payload jsonb not null,
  reconcile_attempts integer not null default 0,
  next_reconcile_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (mailbox_id, request_key),
  foreign key (campaign_id, recipient_id) references invitations_real_recipient(campaign_id, id) on delete cascade
);
create index invitations_real_send_recipient on invitations_real_send (campaign_id, recipient_id, created_at desc);
create index invitations_real_send_window on invitations_real_send (mailbox_id, kind, created_at);
create index invitations_real_send_reconcile on invitations_real_send (next_reconcile_at) where state = 'send_unknown';
