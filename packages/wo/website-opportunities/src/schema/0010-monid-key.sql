-- The Monid key (optional Google reviews, `src/google-maps-monid.js`), sealed like the other WO provider keys.
-- Expand-only: an older image ignores it.
alter table wo_ops_setting add column if not exists monid_key_cipher text;
