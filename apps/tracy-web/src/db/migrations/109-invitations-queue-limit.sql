-- A send queue may cover one group only and stop after a chosen number of emails actually sent
-- (skipped customers do not count), so an operator can ramp up day by day.
alter table invitations_real_queue
  add column group_key text check (group_key is null or group_key ~ '^group_[1-9]$'),
  add column send_limit integer check (send_limit is null or send_limit between 1 and 10000);
