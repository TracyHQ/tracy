# Adapting quickstart content without fixed IDs

**Content contract:** read `content-contract.md`. Authors and reviewers receive the same
`content-contract.json` path/hash and `content-plan.json`. Compile before content writes;
compare rendered fields and review whole-page meaning before recording content complete.


`setup-demo-content.mjs --emit plan` produces draft intent, not executable seed data. Fill actual
content and identify existing records first. `--emit sql` now refuses: fixed IDs and guessed Joomla
relationships cannot safely adapt a populated quickstart.

Export a read-only inventory using Joomla's database API, with arrays `categories`, `articles`,
`menus` (menu types), `menuItems`, `modules`. Include actual integer `id` plus identity fields:

| Entity | Identity fields |
|---|---|
| categories | extension, parent_id, alias, language |
| articles | catid, alias, language |
| menus | menutype |
| menuItems | menutype, parent_id, alias, language, client_id |
| modules | note, client_id |

For modules, use a stable unique note in this project's namespace (e.g. `t4:acme:home:hero`);
explicitly map an existing starter module before assigning its note. Do not match by a mutable
human title. Include current values of every field the desired records will modify. Export JSON
params as objects consistently on both sides and numeric IDs as numbers. Never export credentials.

The desired file contains the same arrays (unused arrays may be omitted), natural keys and ONLY
the fields intentionally changed. No IDs. Provide final content rather than placeholder comments.

```bash
node <skill>/scripts/reconcile-content.mjs desired.json inventory.json > content-plan.json
```

The result separates `create`, `update`, `keep`, includes actual IDs for matched records, and leaves
new IDs null for the database to allocate. Ambiguous identities fail instead of selecting an
arbitrary record. Unspecified fields are preserved; there are no delete operations.

Apply the reviewed operations through Joomla Table/model APIs in a transaction. Before each update,
recheck the natural key and `expected` fields; if another editor changed them, regenerate the plan.
Create categories first and capture their IDs; resolve article category references, then articles,
menus and modules. Reconcile each stage with a fresh inventory when new parent IDs become available.
Use Joomla APIs for nested sets, assets/ACL, workflow associations, featured content and menu paths;
resolve author, component, style and workflow IDs from this installation. Keep module-menu
assignments unless the desired change explicitly calls for replacing them. Roll back on failure.

This tool generates the reconciliation plan; it does not write to Joomla or provide a universal
DB executor. The agent uses the target's available Joomla API/CLI. If that write capability is
missing, retain the plan and report the missing capability rather than execute guessed SQL.
Re-export inventory after applying: a second reconciliation must be entirely `keep`, and both
frontend rendering and admin editability must be verified before Phase 7 is complete.
