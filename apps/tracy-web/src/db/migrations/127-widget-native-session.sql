-- Indexed lookup only; imported history and identity binding remain encrypted.
alter table widget_conversation add column native_session_id text;
create unique index widget_conversation_native_session on widget_conversation(native_session_id)
  where native_session_id is not null;
