// node perf/close-brief.mjs <run> <answers.json> : after `qa-notes.mjs merge` of every stage, writes <run>/notes/fix-answers.md (one row per open or reopened
// todo, from the coordinator's answers: { "<id>": { "status": "done" | "skipped", "reason": "what was measured or changed" } }) and one close brief per
// lens, <run>/briefs/close-<lens>.md, listing the notes that lens raised with the answer. A todo with no answer is listed on stdout and left alone.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
const [, , run, answersFile] = process.argv
const answers = JSON.parse(readFileSync(answersFile, 'utf8'))
const todos = new Map()
for (const s of ['light-desktop', 'light-responsive', 'dark-desktop', 'dark-responsive']) {
  const n = JSON.parse(readFileSync(`${run}/NOTES-${s}.json`, 'utf8'))
  for (const t of n.todos) if (!['closed'].includes(t.status)) todos.set(t.id, t)
}
const missing = [...todos.keys()].filter((id) => !answers[id])
if (missing.length) console.log('no answer for', missing.join(' '))
let fix = '# fix — coordinator answers\n| Id | Status | Fix |\n|---|---|---|\n'
for (const [id] of todos) {
  const a = answers[id]
  if (!a) continue
  fix += `| ${id} | ${a.status}: ${a.reason.replace(/\\/g, '\\\\').replace(/\|/g, '\\|')} | ${a.status === 'done' ? (a.fix ?? 'see the answer') : 'none'} |\n`
}
mkdirSync(`${run}/notes`, { recursive: true })
writeFileSync(`${run}/notes/fix-answers.md`, fix)
mkdirSync(`${run}/briefs`, { recursive: true })
const lenses = new Set([...todos.values()].flatMap((t) => t.lenses))
for (const l of lenses) {
  let o = `# Close brief — lens ${l} — run ${run}\n\nYou are the ${l} lens. For each note below read the coordinator's answer, then open the site tile(s) and the source tile(s) of that page and width yourself (tiles are under ${run}/shots/<page>--<width>-<theme>/<n>.png for the site and ...--source/<n>.png for the source; open only what you need, at most 60 tiles in all) and decide: \`closed\` only when the answer is true on your own look (the source really draws it the same way, or the change is visible), otherwise \`reopened\` with what you saw. Do not accept an answer you could not check: say "not checked" and reopen.\n\nWrite ${run}/notes/${l}-close.md exactly in this shape (header rows included):\n\n| Id | Status | Reason |\n|---|---|---|\n| N-xxxxxx | closed | one sentence of what you saw |\n\n## Notes\n`
  for (const t of todos.values())
    if (t.lenses.includes(l))
      o += `\n### ${t.id} — ${t.page} — ${t.axis}\nNote: ${t.what}\nAnswer: ${answers[t.id] ? `${answers[t.id].status}: ${answers[t.id].reason}` : '(none)'}\n`
  writeFileSync(`${run}/briefs/close-${l}.md`, o)
  console.log(l, [...todos.values()].filter((t) => t.lenses.includes(l)).length)
}
