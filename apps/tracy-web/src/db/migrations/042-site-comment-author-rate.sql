-- The comment write rate limit (`sites/comments.js`, `MAX_WRITES_PER_MINUTE`, TH-1 30/09/2026)
-- counts one person's comments and replies of the last minute across every site on each create.
-- It replaced the stage-5 cap of 12 open comments "waiting unsent" per author, which counted
-- replies and locked a long thread for everybody in it.
create index site_comment_author_created on site_comment (author_account_id, created_at);
