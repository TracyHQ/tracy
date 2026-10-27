-- A read mark is WHAT THE PERSON SAW, not when the server heard about it (comment read marks,
-- `tasks/todo-comment-unread-dot.md` §5, 04/10/2026).
--
-- Until now `POST /comments/:id/read` stamped `read_at = now()`. A reply someone else wrote between
-- the moment the tab read its list and the moment that POST arrived was older than the mark, so it
-- read as seen although nobody had it on screen. The tab now sends the thread as it drew it: `seen_n`,
-- the largest comment number (`site_comment.n`, the site's own sequence, handed out under the counter
-- row's lock so it grows in commit order) of the other people's messages in that thread — the thread
-- comment or a reply at any depth. A thread is unread for this person when someone else's live message
-- in it has a number above `seen_n`; their own words never count.
--
-- `seen_n` null = "Mark as unread" (what `read_at` null said). No row: never opened. The door never
-- lowers a mark (two tabs drawing different moments of one thread: the later one wins) and never
-- raises it past the thread's largest number at that moment, so a mark cannot swallow a reply not
-- written yet.
--
-- Rows already there are carried over: the largest number of the thread written up to their `read_at`
-- is what they had seen by the old rule. Then `read_at` goes — nothing reads it any more, and two
-- clocks for one mark is how the old race happened.
-- Safe to run again: a database that already took this change under its first name (059, renamed to
-- 061 when develop took 059 for another migration) has `seen_n` and no `read_at`, and passes through.
alter table site_comment_read add column if not exists seen_n integer;

do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = current_schema() and table_name = 'site_comment_read'
                and column_name = 'read_at') then
    with recursive thread (mark_id, id) as (
      select r.comment_id, r.comment_id from site_comment_read r where r.read_at is not null
      union
      select t.mark_id, c.id from site_comment c join thread t on c.reply_to = t.id
    )
    update site_comment_read m
       set seen_n = coalesce(
         (select max(c.n) from thread t join site_comment c on c.id = t.id
           where t.mark_id = m.comment_id and c.created_at <= m.read_at),
         0)
     where m.read_at is not null;
    alter table site_comment_read drop column read_at;
  end if;
end
$$;
