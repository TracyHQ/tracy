/**
 * Every refusal the Apply door can answer on the `tracy_site` path names a way out.
 *
 * WHY THIS IS A GATE AND NOT A REVIEW. A refusal the model cannot act on is not a dead stop — it is
 * a detour. Measured 16/09/2026 on "Change Cassiopeia to DavidVipPro", a two-call job: the first
 * call answered `NOT_SIGNED_IN`, `refusalNext` had no case for that code, and the model spent
 * fifteen further steps going around a door that was merely shut — reading the Joomla CLI, being
 * refused `configuration.php` twice by the site guards, then writing a PHP script that bootstrapped
 * the CMS's own database API and wrote `#__template_styles` directly. It did the customer's job.
 * It also left the change somewhere no receipt records, having walked past two guards to get there.
 *
 * Nine of the thirteen codes that door answers were in that same state, so this is not one missing
 * case; it is a class, and a class needs a machine. Human review cannot hold it either: a new code
 * is added in `apps/tracy-web` by somebody who has no reason to open a dsh plugin, and the two
 * files sit in different halves of the repository.
 *
 * WHAT IT CHECKS. The codes are read out of the door itself — the `POST /api/sites/:key/apply`
 * handler plus the two helpers it calls before anything else — and each one must have a `case` in
 * `refusalNext`. It reads no list anybody maintains by hand: a fourteenth code enrols itself.
 *
 * WHAT IT DOES NOT CHECK: whether the sentence is any good. A `case` returning a useless sentence
 * passes here and is caught by the only thing that can catch it, somebody reading it.
 */
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const DOOR = join(ROOT, 'apps/tracy-web/src/sites/route.js')
const TRANSLATOR = join(ROOT, 'packages/tools/tracy-site-tools/src/host/site.mjs')

/**
 * One region of the door: where it starts, and one string that must be inside it.
 *
 * The anchor is the point. Regions are bounded by indentation, which holds because the file is
 * formatted — but "holds because" is not "cannot break", so each region states something that is
 * unmistakably part of it. A region that stops containing its anchor has moved, and this gate then
 * fails loudly asking to be re-pointed, rather than quietly checking an empty string.
 */
const REGIONS: ReadonlyArray<{ readonly what: string; readonly opens: string; readonly anchor: string }> = [
  // Since 28/09/2026 the door is a FUNCTION (`applyDoor`, the seam the `/v1` layer calls) and the
  // HTTP handler is a thin `applyOverHttp` around it; the codes moved with the code.
  // Since 29/09/2026 `applyDoor` is a thin wrapper that keeps the design record in step after
  // `theme.style` (ADR 0023) and answers nothing of its own; the door's codes live in `applyDoorOnce`.
  { what: 'applyDoorOnce', opens: 'async function applyDoorOnce(', anchor: 'APPLY_RULES.get(action)' },
  { what: 'applyOverHttp', opens: 'async function applyOverHttp(', anchor: 'requireGrant(c, held.siteKey' },
  { what: 'the apply handler', opens: "app.post('/api/sites/:key/apply'", anchor: 'applyOverHttp' },
  // Called first by that handler, and the one that answers `NOT_SIGNED_IN`: the whole reason this
  // gate exists is that its codes never looked like the apply door's own.
  { what: 'requireGrant', opens: 'async function requireGrant(', anchor: 'verifyActor' },
  // The api host's half of `requireGrant`: a Bearer seat key (`KEY_INVALID`, `KEY_REVOKED`…).
  { what: 'requireKeyGrant', opens: 'async function requireKeyGrant(', anchor: 'verifyKey' },
  { what: 'conversationSite', opens: 'async function conversationSite(', anchor: 'x-tracy-workspace-label' }
]

/** The lines of one region: from the line that opens it to the first line that closes its column. */
function region(source: string, opens: string, what: string): string {
  const lines = source.split('\n')
  const start = lines.findIndex((line) => line.includes(opens))
  if (start === -1) fail(`${what} is gone from ${rel(DOOR)}: nothing there opens with \`${opens}\`.`)
  const indent = lines[start].length - lines[start].trimStart().length
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i]
    if (line.trim() === '') continue
    const at = line.length - line.trimStart().length
    if (at <= indent && /^[})\]]/.test(line.trim())) return lines.slice(start, i + 1).join('\n')
  }
  fail(`${what} in ${rel(DOOR)} never closes at its own column; this gate cannot bound it.`)
}

/** Every `code: 'X'` in a chunk of source. */
function codesIn(source: string): string[] {
  return [...source.matchAll(/code:\s*'([A-Z_]+)'/g)].map((m) => m[1])
}

function rel(path: string): string {
  return path.slice(ROOT.length + 1)
}

function fail(message: string): never {
  process.stderr.write(`check-refusal-next: ${message}\n`)
  process.exit(1)
}

const doorSource = readFileSync(DOOR, 'utf8')
const answered = new Set<string>()
for (const { what, opens, anchor } of REGIONS) {
  const body = region(doorSource, opens, what)
  if (!body.includes(anchor)) {
    fail(
      `${what} in ${rel(DOOR)} no longer contains \`${anchor}\`, so this gate is reading the wrong lines.\n` +
        `  Re-point REGIONS in this script at whatever that door is now, then run it again.`
    )
  }
  for (const code of codesIn(body)) answered.add(code)
}

// A door that suddenly answers almost nothing means the regions collapsed, not that the door got
// simpler. Nine is the count on 16/09/2026 minus a little room, not a target.
if (answered.size < 9) {
  fail(
    `only ${answered.size} refusal code(s) found in ${rel(DOOR)} — the regions above have collapsed.\n` +
      `  Check REGIONS in this script before trusting this number.`
  )
}

const translator = readFileSync(TRANSLATOR, 'utf8')
const switchBody = region(translator, 'export function refusalNext(', 'refusalNext')
const translated = new Set([...switchBody.matchAll(/case\s*'([A-Z_]+)'\s*:/g)].map((m) => m[1]))

const missing = [...answered].filter((code) => !translated.has(code)).sort()
if (missing.length > 0) {
  process.stderr.write(
    `check-refusal-next: ${missing.length} refusal code(s) the Apply door answers leave the model nowhere to go:\n` +
      missing.map((code) => `    ${code}\n`).join('') +
      `\n  Each needs a \`case\` in refusalNext (${rel(TRANSLATOR)}) saying what to do INSTEAD.\n` +
      `  Not "this failed" — the next step. A code with no next step is a detour: the model works\n` +
      `  around the door, and the change lands somewhere no receipt records (16/09, Cassiopeia).\n`
  )
  process.exit(1)
}

process.stdout.write(
  `check-refusal-next: ${answered.size} refusal code(s) of the Apply door, each with a next step.\n`
)
