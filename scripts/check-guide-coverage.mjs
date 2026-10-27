/**
 * Gate: every feature a customer can use has a guide article (21/10/2026).
 *
 * WHY. A customer who could not connect their own domain asked the agent in the chat, and neither the
 * agent nor `/help` knew the feature existed: it had shipped after `/help` was written (06–09/10) and
 * nothing connected "a switch was added" to "the assistants were told". The guide
 * (`apps/tracy-web/src/guide/articles`) is what both read, and `ui-switches/catalogue.json` is the one
 * list of customer-visible pieces (CLAUDE.md §8), so the two are tied here:
 *
 *   1. every switch of the catalogue (not locked) is claimed by an article (`switch: <id>`), or listed in
 *      `scripts/guide-exempt.json` WITH A REASON;
 *   2. every article names a switch that exists, or says `none:<reason>`;
 *   3. every article's `tab` is a tab some catalogue switch (or the launcher) opens, and its `checked:`
 *      stamp is a date + commit;
 *   4. an exemption names a switch that exists and is not also claimed (a stale row is a lie).
 *
 * WHAT IT DOES NOT CHECK: whether the article is TRUE — only a person comparing it with the screen can,
 * which is what `checked:` records. A new switch that should not be explained to customers goes into the
 * exempt file with its reason; a feature a customer DOES use gets an article, never a row there.
 */
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { loadArticles } from '../apps/tracy-web/src/lib/guide.js'

const ROOT = resolve(import.meta.dirname, '..')

/** @typedef {{ id: string, locked?: string, tabs?: string[] }} Switch */

/** Tabs a customer opens by link that no switch names (the site's own tabs, the Publish tab). */
const TABS_WITHOUT_SWITCH = new Set([
  'tracy:site-publish',
  'tracy:site-settings',
  'tracy:my-sites',
  'tracy:add-site',
  'tracy:changes',
  'tracy:team',
  'tracy:design-system'
])

/**
 * @param {readonly Switch[]} switches
 * @param {ReturnType<typeof loadArticles>} articles
 * @param {Record<string, string>} exempt
 * @returns {string[]}
 */
export function checkGuide(switches, articles, exempt) {
  /** @type {string[]} */
  const problems = []
  const ids = new Set(switches.map((s) => s.id))
  const claimed = new Map()
  for (const a of articles) {
    if (a.switchId !== '') {
      if (!ids.has(a.switchId))
        problems.push(`article "${a.id}" names switch "${a.switchId}", which is not in the catalogue`)
      claimed.set(a.switchId, a.id)
    } else if (!a.noSwitchReason || a.noSwitchReason.trim() === '')
      problems.push(`article "${a.id}" has no switch and gives no reason (use "none:<why>")`)
    if (!/^\d{4}-\d{2}-\d{2} @ [0-9a-f]{7,}$/.test(a.checked))
      problems.push(`article "${a.id}": "checked" must be "YYYY-MM-DD @ <commit>", got "${a.checked}"`)
  }
  const tabs = new Set([...switches.flatMap((s) => s.tabs ?? []), ...TABS_WITHOUT_SWITCH])
  for (const a of articles)
    if (a.tab !== '' && !tabs.has(a.tab))
      problems.push(`article "${a.id}": tab "${a.tab}" is not a tab Tracy opens`)
  for (const s of switches) {
    if (s.locked !== undefined) continue
    const reason = exempt[s.id]
    if (claimed.has(s.id) && reason !== undefined)
      problems.push(
        `switch "${s.id}" has article "${claimed.get(s.id)}" AND an exemption: drop the exemption`
      )
    else if (!claimed.has(s.id) && (reason === undefined || reason.trim() === ''))
      problems.push(
        `switch "${s.id}" has no guide article and no exemption: write apps/tracy-web/src/guide/articles/<id>.md with "switch: ${s.id}", or — only if a customer does not use it as a feature — add it to scripts/guide-exempt.json with the reason`
      )
  }
  for (const id of Object.keys(exempt))
    if (!ids.has(id))
      problems.push(`scripts/guide-exempt.json names "${id}", which is not in the catalogue any more`)
  return problems
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  const catalogue = JSON.parse(
    readFileSync(join(ROOT, 'packages/core/tracy-core/src/ui-switches/catalogue.json'), 'utf8')
  )
  const { exempt } = JSON.parse(readFileSync(join(ROOT, 'scripts/guide-exempt.json'), 'utf8'))
  const problems = checkGuide(catalogue.switches, loadArticles(), exempt)
  if (problems.length > 0) {
    process.stderr.write(`check-guide-coverage: ${problems.length} problem(s)\n`)
    for (const p of problems) process.stderr.write(`  - ${p}\n`)
    process.exit(1)
  }
  process.stdout.write(
    'check-guide-coverage: every customer-visible switch has a guide article or a reasoned exemption\n'
  )
}
