-- A send queue covers the groups an operator gave a number to, each stopping after its own number of
-- emails actually sent (skipped customers do not count). Replaces the single group/limit of 109.
create table invitations_real_queue_group (
  campaign_id uuid not null references invitations_real_queue(campaign_id) on delete cascade,
  group_key text not null check (group_key in ('group_1','group_2','group_3','group_4','group_5')),
  send_limit integer not null check (send_limit between 1 and 10000),
  primary key (campaign_id, group_key)
);
-- A queue started under 109 keeps going: its group (or every group it holds) with its limit, or the
-- largest allowed when it had none.
insert into invitations_real_queue_group (campaign_id, group_key, send_limit)
select distinct q.campaign_id, r.group_key, coalesce(q.send_limit, 10000)
from invitations_real_queue q
join invitations_real_queue_item i on i.campaign_id = q.campaign_id
join invitations_real_recipient r on r.id = i.recipient_id
where q.group_key is null or q.group_key = r.group_key;
alter table invitations_real_queue drop column group_key, drop column send_limit;
