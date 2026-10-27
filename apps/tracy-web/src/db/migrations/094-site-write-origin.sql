-- Where a content write came from when no chat turn or session says so (sweep #4 and #2,
-- council 11/10/2026): written by the Apply door at write time, never inferred later.
--   origin      'setup'  Tracy setting the site up from the brief its person sent (Add site popup);
--                        `actor` is that person (the initiator), Tracy the executor.
--               'api'    a seat key's write through `/v1` on the api host; `actor` is the key's person.
--               null     anything else (a chat, a press of a button, an older row) — never guessed.
--   origin_ref  the setup run's id ('setup'), or the key id ('api').
-- Site changes reads them as the Types "Tracy setup" and "API" (`activity-source.js`).
alter table site_write add column if not exists origin text;
alter table site_write add column if not exists origin_ref text;
