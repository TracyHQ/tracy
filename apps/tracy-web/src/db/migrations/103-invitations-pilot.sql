-- Pilot sends to customers, and the unsubscribe that every sent message now carries.
alter table invitations_real_send drop constraint invitations_real_send_kind_check;
alter table invitations_real_send add constraint invitations_real_send_kind_check check (kind in ('test', 'invitation'));
-- sha256 of the random unsubscribe token in the message; the token itself is never stored.
alter table invitations_real_send add column unsubscribe_token_hash text unique;
-- A customer is invited at most once per campaign: a second row only after a definite failure.
create unique index invitations_real_send_one_invitation on invitations_real_send (campaign_id, recipient_id)
  where kind = 'invitation' and state <> 'failed';
-- Addresses that asked to stop, per campaign (never written back to aMember or Sendy). `identity`
-- is an HMAC of the normalised address under the campaign index key, so the table holds no address.
create table invitations_real_suppression (
  campaign_id uuid not null references invitations_real_campaign(id) on delete cascade,
  identity text not null,
  reason text not null check (reason in ('unsubscribe', 'one_click')),
  send_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  primary key (campaign_id, identity)
);
