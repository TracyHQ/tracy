-- THE LATEST CHAT TURN THAT WROTE UNDER A SITE'S WRITE LEASE (review Q3, 20/10/2026).
--
-- The turn-end release (`POST /api/sites/:key/lease/release`) freed the lease by session alone, so a
-- slow release of turn N arriving after turn N+1 of the same conversation had renewed it freed N+1's
-- hold mid-request. The lease now keeps the `x-tracy-turn` of its latest writer, split into the
-- root session and the turn number (`<root>:<n>`): `n` orders turns only within one root session,
-- so the two are compared together (`takeWriteLease` / `releaseWriteLease`, sites/store.js).
-- Both null: no turn named (an older dsh, a seat key, the build), and release behaves as before.
-- Expand-only: an older image never reads these columns.
alter table site_write_lease
  add column if not exists holder_turn_root text,
  add column if not exists holder_turn integer;
