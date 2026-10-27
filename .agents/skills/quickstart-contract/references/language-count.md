# Section 1 — multi-language test: counting command

Read after `SKILL.md`, as soon as `"$WORK/inventory-first.json"` exists (the inventory of the first site — full
path: section 5, `packing.md` step 2; direct-capture path: section 6 step 4, before `tch local`). How to read the result: `SKILL.md`
section 1 — the `language` column of `modules` (`client_id=0`), `content`, `categories`, `menu` (`client_id=0`) has
**more than one** value other than `*` → several languages → stop, tell the requester.

```bash
node -e '
const inv = require(process.argv[1])
const count = (table, keep) => {
  const out = {}
  for (const row of inv[table]) if (!keep || keep(row)) out[row.language] = (out[row.language] || 0) + 1
  return out
}
console.log(JSON.stringify({
  modules: count("modules", (r) => r.client_id === "0"),
  content: count("content"),
  categories: count("categories"),
  menu: count("menu", (r) => r.client_id === "0")
}))
' "$WORK/inventory-first.json"
```
