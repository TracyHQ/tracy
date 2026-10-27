-- What a staff member edits at /ops/widget: the words, colours and position of the two badges a
-- site can carry — the seat pill on a customer's copy (`/badge.js`) and the advertisement on a demo
-- (`/tracy-badge.js`, `/build-with-tracy-demo.js`). One row per badge, the whole document as jsonb:
-- both badges share one shape and the script embeds the document whole, so a column per field
-- would be twelve columns half-relevant per row. The shape is held by `lib/badge-setting.js`'s
-- validator on every write AND every read — a row this code no longer accepts is not served.
--
-- No seed row. A missing row reads as the defaults in code (revision 0), so a fresh deployment
-- looks exactly as it did before this table existed, and the first save inserts.
create table badge_setting (
  id text primary key check (id in ('seat', 'advert')),
  setting jsonb not null,
  revision integer not null default 1,
  updated_by text not null,
  updated_at timestamptz not null default now()
);
