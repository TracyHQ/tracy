/**
 * Freeze the story labels into a file, and fail CI when they move.
 *
 * WHY A FILE AT ALL, when `story-kind.mjs` already derives the label from the import graph and
 * cannot be typed wrong. Because "cannot be typed wrong" is not the same as "nobody needs to
 * look". Two things happen in this repo and both are invisible without a checked-in snapshot:
 *
 *   - A new story arrives and lands in a category nobody chose for it.
 *   - A screen gets ported from a drawing into real code, so its label flips from
 *     `not-in-product` to `real-screen`. That is the moment the design review of that screen
 *     starts reaching customers, and it deserves to be seen in a diff rather than discovered.
 *
 * So the generator writes `packages/dev/tracy-design/story-kinds.json` and `--check` re-derives
 * and compares. Same shape as `gen-presets.ts`: drift fails the gate instead of shipping.
 *
 * The file is also the plain-text answer to "which screens are real", readable without starting
 * Storybook — useful in review, and useful to an agent that has no browser.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'

// Storybook's `main.ts` loads the very same module, so the rule has exactly one home.
import { classify, findStories } from '../packages/dev/tracy-design/.storybook/story-kind.mjs'

const ROOT = resolve(import.meta.dirname, '..')
const OUT = resolve(ROOT, 'packages/dev/tracy-design/story-kinds.json')

const ROOTS = [resolve(ROOT, 'packages/dev/tracy-design/src'), resolve(ROOT, 'packages/ui/tracy-ui/src')]

type Table = Record<string, string>

function derive(): Table {
  const table: Table = {}
  for (const root of ROOTS) {
    for (const file of findStories(root) as string[]) {
      table[relative(ROOT, file)] = (classify(file) as { kind: string }).kind
    }
  }
  // Sorted so a diff shows what actually moved, not how the filesystem happened to enumerate.
  return Object.fromEntries(Object.entries(table).sort(([a], [b]) => a.localeCompare(b)))
}

function render(table: Table): string {
  return `${JSON.stringify(table, null, 2)}\n`
}

const table = derive()
const check = process.argv.includes('--check')

if (!check) {
  writeFileSync(OUT, render(table))
  const counts = Object.values(table).reduce<Record<string, number>>((acc, kind) => {
    acc[kind] = (acc[kind] ?? 0) + 1
    return acc
  }, {})
  const summary = Object.entries(counts)
    .sort()
    .map(([k, n]) => `${k} ${n}`)
    .join(' | ')
  process.stdout.write(`gen-story-kinds: wrote ${Object.keys(table).length} stories -- ${summary}\n`)
  process.exit(0)
}

let previous: Table
try {
  previous = JSON.parse(readFileSync(OUT, 'utf8'))
} catch {
  process.stderr.write(
    'gen-story-kinds: story-kinds.json is missing or unreadable.\n' +
      '  fix: pnpm exec tsx scripts/gen-story-kinds.ts\n'
  )
  process.exit(1)
}

const keys = [...new Set([...Object.keys(previous), ...Object.keys(table)])].sort()
const drift = keys.filter((k) => previous[k] !== table[k])

if (drift.length === 0) {
  process.stdout.write(`gen-story-kinds: ${keys.length} stories, labels match.\n`)
  process.exit(0)
}

process.stderr.write('gen-story-kinds: story labels moved.\n\n')
for (const key of drift) {
  const was = previous[key] ?? '(new story)'
  const now = table[key] ?? '(story deleted)'
  process.stderr.write(`  ${key}\n    was: ${was}\n    now: ${now}\n`)
  if (was === 'not-in-product' && now === 'real-screen') {
    process.stderr.write('    this screen just became real: design edits here now reach customers\n')
  }
  if (was === 'real-screen' && now === 'not-in-product') {
    process.stderr.write('    this screen stopped reaching customers -- check that it was intended\n')
  }
  process.stderr.write('\n')
}
process.stderr.write(
  'A label is derived from the import graph, never declared, so a move here is a real change in\n' +
    'what the story shows. Review the list above, then record it:\n' +
    '  pnpm exec tsx scripts/gen-story-kinds.ts\n'
)
process.exit(1)
