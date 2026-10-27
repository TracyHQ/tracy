-- Send queue of a real campaign: the approved emails an owner/admin chose to send, in order, one at a
-- time by the cron under the same checks as a press (aMember at send time, suppression, once per
-- customer, pilot budget, pacing). Items hold recipient ids and codes only, no address.
create table invitations_real_queue (
  campaign_id uuid primary key references invitations_real_campaign(id) on delete cascade,
  state text not null check (state in ('running', 'paused', 'done')),
  pause_reason text check (pause_reason is null or pause_reason ~ '^[A-Z][A-Z0-9_]{0,63}$'),
  actor_id uuid not null,
  started_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create table invitations_real_queue_item (
  campaign_id uuid not null references invitations_real_campaign(id) on delete cascade,
  recipient_id uuid not null,
  position integer not null,
  state text not null check (state in ('pending', 'sent', 'skipped')),
  reason text check (reason is null or reason ~ '^[A-Z][A-Z0-9_]{0,63}$'),
  send_id uuid,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (campaign_id, recipient_id)
);
create index invitations_real_queue_item_next on invitations_real_queue_item (campaign_id, state, position);
