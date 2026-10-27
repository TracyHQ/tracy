-- Files a customer attaches to a Help question in the creation workspace's chat (26/10/2026). They
-- share the table of 065's staff pictures: `source` says whose file it is, `name` is the file name the
-- customer picked, and `turn_id` is the question that carried it (null while it waits in the chat box;
-- one left loose for a day is purged with its bytes).
alter table assistant_attachment add column if not exists source text not null default 'staff';
alter table assistant_attachment drop constraint if exists assistant_attachment_source_check;
alter table assistant_attachment add constraint assistant_attachment_source_check
  check (source in ('staff', 'customer'));
alter table assistant_attachment add column if not exists name text;
alter table assistant_attachment add column if not exists turn_id bigint references assistant_turn(id) on delete set null;
create index if not exists assistant_attachment_turn on assistant_attachment (turn_id) where turn_id is not null;
create index if not exists assistant_attachment_loose on assistant_attachment (created_at)
  where source = 'customer' and turn_id is null;
