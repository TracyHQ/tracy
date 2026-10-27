/**
 * Strings in the Worker page stories must be strings that REALLY exist in the Worker code.
 *
 * WHY — TWO CASES IN ONE BRANCH, both on 2026-09-04.
 *
 * `WorkerAuthPages.stories.tsx` declares in its first line that it **imports the page-generating function
 * itself**, so "what shows on screen is byte-for-byte what the customer gets". That holds for the HTML, and
 * only for the HTML. Some error screens need a sentence to display, and that sentence was **retyped** into
 * the story as a parameter — a copy, and copies drift:
 *
 *   1. A story carried `'That site is not on Tracy yet.'` — no worker ever returned that sentence. It was
 *      invented while writing the story.
 *   2. The `Request Error` story kept the `ALREADY_INVITED` sentence after the code stopped returning it to
 *      that screen. The string was still in the repo, but only in the story.
 *
 * Both times a reviewer spotted it, no gate did. And this is exactly the kind of mistake the human eye is
 * worst at: the sentence reads fine, in the right voice, fitting the scene — the product just does not say
 * it. A drawing used for REVIEW that draws what production cannot build is worse than no drawing.
 *
 * THE CHECK: every string assigned directly to `error:` in a story must appear VERBATIM in
 * `apps/tracy-web/src/`. Narrow on purpose — `error:` is the only place in this story group taking typed
 * text; the other parameters (`email`, `siteHost`, `label`) are scene DATA, not Tracy's prose, so they may
 * be made-up strings.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const STORIES = join(ROOT, 'packages/dev/tracy-design/src/pages/auth')
// `workers/` was the other half of this gate until 16/09/2026, when that tree was deleted: every
// page it drew is `apps/tracy-web`'s now, and the stories that quoted a Worker's words went with it.
const TRACY_WEB = join(ROOT, 'apps/tracy-web/src')

function filesUnder(dir: string, keep: (name: string) => boolean): string[] {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : filesUnder(full, keep)
    return keep(entry.name) ? [full] : []
  })
}

/** The product's code, joined into one for a verbatim search — which module holds the string does not matter. */
const workerSource = [...filesUnder(TRACY_WEB, (n) => n.endsWith('.js') || n.endsWith('.mjs'))]
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n')

/**
 * `error:` followed by a single-quoted string. Prettier may push the value to the next line, so whitespace
 * in between is allowed. A value that is NOT a direct string (a variable, template, concatenation) does not
 * match and is skipped on purpose: this gate can only answer questions about hand-typed text.
 */
const ERROR_STRING = /\berror:\s*'((?:[^'\\]|\\.)*)'/g

let checked = 0
const missing: string[] = []

for (const file of filesUnder(STORIES, (n) => n.endsWith('.stories.tsx'))) {
  const source = readFileSync(file, 'utf8')
  for (const [, raw] of source.matchAll(ERROR_STRING)) {
    checked += 1
    const text = raw.replace(/\\'/g, "'")
    if (!workerSource.includes(text)) missing.push(`${relative(ROOT, file)}\n    ${text}`)
  }
}

if (missing.length > 0) {
  console.error(
    `Story string gate: ${missing.length} sentence(s) not in the Worker code.\n\n` +
      missing.map((m) => `  ${m}`).join('\n\n') +
      '\n\nThe story draws a sentence the product does not say. Fix the story to match the code, or fix the code if the sentence is right.'
  )
  process.exit(1)
}

console.log(`Story string gate: ${checked} sentences, each one real in the Worker code.`)
