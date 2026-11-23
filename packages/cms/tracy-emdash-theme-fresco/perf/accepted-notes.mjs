// node perf/accepted-notes.mjs <run> [--contract qa.contract.json] : after `qa-notes.mjs merge` of every stage, closes every open or reopened todo whose text matches
// a `lens-note` exception of the contract (a decision cited by id): one row per todo is appended to <run>/notes/<lens>-close.md, "closed | accepted by
// exception: <decision>". The closing is the coordinator's under the lead's rule (2026-11-22: match the source; a Joomla-only control becomes a reasoned exception), so each row says so. Prints what it closed and what is left.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
const args = process.argv.slice(2)
const run = args[0]
const contractFile = args.includes('--contract') ? args[args.indexOf('--contract') + 1] : 'qa.contract.json'
const rules = (JSON.parse(readFileSync(contractFile, 'utf8')).design?.exceptions ?? []).filter(
  (x) => x.kind === 'lens-note'
)
const todos = new Map()
for (const s of ['light-desktop', 'light-responsive', 'dark-desktop', 'dark-responsive']) {
  const n = JSON.parse(readFileSync(`${run}/NOTES-${s}.json`, 'utf8'))
  for (const t of n.todos) if (t.status !== 'closed') todos.set(t.id, t)
}
mkdirSync(`${run}/notes`, { recursive: true })
const left = []
let closed = 0
for (const t of todos.values()) {
  const text = `${t.what} ${t.fix ?? ''}`.toLowerCase()
  // a rule with `ids` closes exactly the notes the coordinator read and named; a rule without them matches by regex (and optional page scope)
  const hit = rules.find((r) =>
    r.ids
      ? r.ids.includes(t.id)
      : (!r.pages || new RegExp(r.pages).test(t.page)) && new RegExp(r.match, 'i').test(text)
  )
  if (!hit) {
    left.push(
      `${t.id} ${t.lenses[0]} ${t.page.slice(0, 22)} ${t.axis.slice(0, 10)} | ${t.what.slice(0, 140).replace(/\n/g, ' ')}`
    )
    continue
  }
  for (const lens of t.lenses) {
    const f = `${run}/notes/${lens}-close.md`
    if (!existsSync(f)) writeFileSync(f, '| Id | Status | Reason |\n|---|---|---|\n')
    appendFileSync(
      f,
      `| ${t.id} | closed | accepted by exception (${hit.decision}), closed by the coordinator under the lead's match-the-source rule: ${hit.reason.replace(/\|/g, '/')} |\n`
    )
  }
  closed++
}
console.log(`closed ${closed} by exception, ${left.length} left`)
console.log(left.join('\n'))
