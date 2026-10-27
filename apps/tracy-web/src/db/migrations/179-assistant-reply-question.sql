-- A retry may finish after another question. Keep its answer attached to the original question.
alter table assistant_turn add column if not exists reply_to_turn_id bigint references assistant_turn(id) on delete cascade;
create index if not exists assistant_turn_reply on assistant_turn (reply_to_turn_id) where reply_to_turn_id is not null;
-- The client retains this key even when a response is lost before its meta frame arrives.
alter table assistant_turn add column if not exists request_id uuid;
create unique index if not exists assistant_turn_request on assistant_turn (conversation_id, request_id) where request_id is not null;
