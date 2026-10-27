-- Live aMember check-access results per real recipient, for "Check eligibility". Holds no address
-- and no plan detail: the recipient id, the answer (allow = an active plan, none = no active plan,
-- unknown = no usable answer), a reason code for unknown, and when it was asked. Sending still asks
-- aMember again at the moment of sending; this table only informs the operator.
create table invitations_real_member_check (
  campaign_id uuid not null references invitations_real_campaign(id) on delete cascade,
  recipient_id uuid not null,
  status text not null check (status in ('allow', 'none', 'unknown')),
  reason text check (reason is null or reason ~ '^[A-Z0-9_]{1,64}$'),
  checked_at timestamptz not null default clock_timestamp(),
  primary key (campaign_id, recipient_id)
);
