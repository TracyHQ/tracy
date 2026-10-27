-- Provider-reported site-chat token snapshots. NULL means unmeasured, never zero.
alter table site_turn add column token_usage jsonb;
alter table site_turn add constraint site_turn_token_usage_object
  check (token_usage is null or (jsonb_typeof(token_usage) = 'object' and token_usage->>'version' = '1'));
