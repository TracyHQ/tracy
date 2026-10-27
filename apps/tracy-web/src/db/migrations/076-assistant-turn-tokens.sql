-- WHAT AN ANSWER COST, IN THE PROVIDER'S OWN TOKENS (07/10/2026).
--
-- `assistant_turn` kept the model's name and nothing about size, so an operator could not say what the
-- assistant costs a month, or which account is the expensive one. The provider reports `usage` on the
-- last event of a stream when asked (`stream_options.include_usage`); those two numbers are kept on the
-- answer's row.
--
--   input_tokens / output_tokens   what the provider reported; NULL when it reported nothing (a vendor
--                                  that ignores the option, a stream cut before the last event). NULL is
--                                  UNKNOWN, never zero: a sum over the column counts only what was measured.
--
-- 🔒 Two nullable columns on an existing table: no scan, no backfill, old rows read as unknown.
alter table assistant_turn add column if not exists input_tokens integer;
alter table assistant_turn add column if not exists output_tokens integer;
