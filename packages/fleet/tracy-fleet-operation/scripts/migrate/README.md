# Moving a fleet host from seven Workers to `tracy-web`

Four scripts run **once per host**, in exactly the order below. They live in the repo rather than
staying on the machine, because prod1 was the first host to go through this path and will not be the
last — and because a migration that cannot be re-read is a migration that cannot be re-checked.

Run end to end on **prod1 on 11/09/2026**: 15 customer sites, 43 access grants.

| Order | Script | What it does | Reverse |
|---|---|---|---|
| 1 | `migrate-sites-to-book.sh` | Reads label/port/platform **from the machine itself** and builds the `site` rows in tracy-web's Postgres; connects tracy-web to each site's network | `delete from site where origin='migrated'` + `docker network disconnect` |
| 2 | `patch-host-header.sh` | Adds the `RequestHeader set Host` block to the old site's Apache conf (item B7) | the `.bak-b7` file next to it |
| 3 | `migrate-seats-to-book.py` | Moves the seat ledger from `seat-registry`'s Supabase to Postgres | `delete from seat` |
| 4 | `compare-old-and-new-door.sh` | For **each** site: what the Worker serves today versus what tracy-web will serve — comparing both status and `<title>` | read only |

🔒 **Run 4 BEFORE touching Cloudflare.** It is the only thing that can answer "does this migration change
what the customer sees", and it answers while you can still go back. On prod1 it caught exactly one
difference — a site forcing a canonical host answered 301 — and that difference is step 2, not an
explanation.

⚠ **Three items are NOT right by themselves, and each has bitten once**, written up in full in
[`tasks/deploy-len-production-main-v2.md`](../../../../../tasks/deploy-len-production-main-v2.md) §F.
