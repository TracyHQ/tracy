# Transition: account to wo_principal

An existing Tracy database reaches the open schema's principal model through two migrations in Tracy's own chain,
applied on deploy like any other:

- `apps/tracy-web/src/db/migrations/171-wo-principal.sql`
- `apps/tracy-web/src/db/migrations/172-wo-principal-validate.sql`

They are the only step between Tracy's migration history and the package baseline (`../0001-baseline.sql`). The SQL
lives in the host's chain, not in this package, because it reads and adds triggers to Tracy's `account` table.

## What they do

- Create `wo_principal` and give every Tracy account one principal with the same uuid
  (`kind = 'tracy_account'`, `external_ref = account.id::text`). No WO row changes value.
- Re-point seven foreign keys from `account(id)` to `wo_principal(id)`, keeping their names and ON DELETE actions:
  `wo_preference`, `wo_opportunity`, `wo_job`, `wo_media`, `wo_bulk_request` (cascade),
  `wo_place_job.started_by_account_id`, `wo_cost_ledger.payer_account_id` (set null).
- Add two triggers on `account` (Tracy's side of the mapping): a new account gets its principal; a deleted account
  removes its principal, which cascades to its WO rows as the old foreign keys did.

After 172, `verifyWoSchema()` reports no difference and `adoptWoSchema()` can write the adoption marker. Tracy's chain
also carries later package files with the same SQL (`173-wo-place-snapshot-guard.sql` = `0004-place-snapshot-guard.sql`,
`176-wo-site-check-read-tier.sql` = `0009-site-check-read-tier.sql`),
so Tracy verifies and adopts with `{ carried: ['0004-place-snapshot-guard.sql', '0009-site-check-read-tier.sql'] }`; the package's migrator then applies
only the files Tracy does not carry.

## Why two files, in this shape

Measured on 24/10/2026 on copies at 1x, 10x, 100x and 1000x the dev row counts (dev: `account` 209 rows,
`wo_cost_ledger` 314, the other six tables 0–33), with four writers running (ledger insert, job update, account
insert, account read). The first hand-applied form (one transaction: backfill, triggers, seven validated FKs):

- deadlocked a ledger insert on every run: it took `account` before the child tables while a live transaction
  held `wo_cost_ledger` and then checked its payer account. Every reader and writer of the eight tables stalled for
  `deadlock_timeout` (1 s) before Postgres killed one side;
- dropping a FK takes ACCESS EXCLUSIVE on both tables, so reads of `account` stall too, not only writes;
- accounts created during the backfill got no principal (1 787 of them in the 1000x run).

171 backfills before taking any lock, then locks the seven child tables and `account` in one statement (children
first), adds the triggers, adds the accounts created meanwhile, and re-points the FKs NOT VALID (no scan under the
lock). 172 drops principals whose account was deleted during the backfill and validates the FKs under SHARE UPDATE
EXCLUSIVE, which blocks neither reads nor writes. Longest stall of any writer: 9–12 ms at 1x and 10x, 15–23 ms at
100x, 105–180 ms at 1000x; no deadlock. The backfill itself (about 5 s for 209 000 accounts) blocks nothing.

Left open: a transaction that writes `account` first and a WO table second (an account deletion cascading) can still
meet 171's lock in the other order; Postgres then aborts one side after 1 s. Account deletions are rare.

## Rollback

The block between `-- ROLLBACK BEGIN` and `-- ROLLBACK END` in `171-wo-principal.sql`, with the leading `-- ` removed,
run in one transaction. It re-points the foreign keys to `account`, drops the triggers, their functions and
`wo_principal`, and deletes both `schema_migration` rows. WO rows are not touched, so the foreign keys to `account`
validate again. Roll back before adoption; after `adoptWoSchema()` also delete the `0001-baseline.sql` row of
`wo_schema_migration`.
