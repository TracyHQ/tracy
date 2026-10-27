-- What Tracy said about a comment when its turn ended with a write: the words after ✓ / ✗ in the
-- agent's `- n ✓ updated: …` line (`tasks/todo-comment-thread.md`, stand E2E stage 5 F9). The chat
-- input reports them with a `done`/`failed` status and the Browser tab PATCHes them here, so a
-- later reply's thread line for Tracy can say what it did (`tracy: ✓ updated: …`) instead of a bare
-- `tracy: ✓ updated`. `question` keeps what Tracy asked (status `asked`); this is its counterpart
-- for a finished write. Null on every row written before it and on comments never answered.
alter table site_comment add column answer text;
