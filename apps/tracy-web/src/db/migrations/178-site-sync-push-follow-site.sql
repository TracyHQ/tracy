-- A Sync from live or Sync to live row belongs to the copy it ran on (`site_sync`, `site_push`): when
-- the site row goes (a delete, a removed import), its rows go with it. Without that, a live site
-- imported again under the same address inherited the deleted copy's rows: a copy minutes old opened
-- Sync to live on "Sync to live undone — 29 changes", and Sync from live on the old copy's last sync
-- (dev, 26/10/2026: 20 push and 148 sync rows of a deleted WordPress copy).
--
-- First the rows that already outlived their copy: no site under their key, or one made after them.
delete from site_sync y
 where not exists (select 1 from site s where s.site_key = y.site_key and s.created_at <= y.created_at);
delete from site_push p
 where not exists (select 1 from site s where s.site_key = p.site_key and s.created_at <= p.created_at);

alter table site_sync drop constraint if exists site_sync_site_key_fkey;
alter table site_sync
  add constraint site_sync_site_key_fkey foreign key (site_key) references site(site_key) on delete cascade;
alter table site_push drop constraint if exists site_push_site_key_fkey;
alter table site_push
  add constraint site_push_site_key_fkey foreign key (site_key) references site(site_key) on delete cascade;
