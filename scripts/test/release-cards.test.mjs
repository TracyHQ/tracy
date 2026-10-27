/**
 * Every release card in the repo is a card Tracy's Design inspiration accepts.
 *
 *   node --test scripts/test/release-cards.test.mjs
 *
 * A release of a template carries `tasks/<task>/release/tracy_design_inspiration.json`: the card the operator publishes
 * with it. The server reads that card back with `validateDesignInspiration` and refuses a category that is not one of
 * Design inspiration's own, so a card whose file says "Blog & Magazine" while the published one says something else
 * (JA Essence 1.0.0; JA Impact 1.0.0 carried "Non-profit & Charity") is a file nobody can trust. The cards are found by
 * walking `tasks/*`, never from a list: a new release is judged the day it is added.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { DESIGN_CATEGORIES } from '../../apps/tracy-web/src/lib/design-inspiration.js'
import { validateDesignInspiration } from '../../apps/tracy-web/src/lib/tracy-setting.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const CARD = 'tracy_design_inspiration.json'
// Release dossiers live in `tasks/`, which the public export leaves out.
const NO_TASKS = existsSync(path.join(ROOT, 'tasks')) ? false : 'tasks/ is internal and not in this tree'

/** The problems of every release card under `<root>/tasks`, each named by its file; `cards` says how many were read. */
export function checkCards(root) {
  const problems = []
  let cards = 0
  const tasks = path.join(root, 'tasks')
  for (const entry of readdirSync(tasks, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const release = path.join(tasks, entry.name, 'release')
    let kind
    try {
      kind = lstatSync(release)
    } catch {
      continue
    }
    if (!kind.isDirectory()) {
      problems.push(`tasks/${entry.name}/release is not a directory`)
      continue
    }
    const file = path.join(release, CARD)
    const name = `tasks/${entry.name}/release/${CARD}`
    let stat
    try {
      stat = lstatSync(file)
    } catch {
      problems.push(`${name}: a release without its card`)
      continue
    }
    // lstat, not stat: a link or a pipe is not a card, and reading a pipe would block the run.
    if (!stat.isFile()) {
      problems.push(`${name}: not a regular file`)
      continue
    }
    cards++
    let doc
    try {
      const text = readFileSync(file, 'utf8')
      if (text.trim() === '') {
        problems.push(`${name}: empty`)
        continue
      }
      doc = JSON.parse(text)
    } catch (e) {
      problems.push(`${name}: unreadable JSON (${e.message})`)
      continue
    }
    for (const p of validateDesignInspiration(doc)) problems.push(`${name}: ${p}`)
    if (!DESIGN_CATEGORIES.includes(doc?.category))
      problems.push(
        `${name}: category ${JSON.stringify(doc?.category)} is not one of Design inspiration's categories`
      )
  }
  return { problems, cards }
}

test('every release card in the repo validates and names a category of Design inspiration', {
  skip: NO_TASKS
}, () => {
  const { problems, cards } = checkCards(ROOT)
  assert.deepEqual(problems, [])
  assert.ok(cards >= 5, `only ${cards} release cards found: the walk is not seeing the releases`)
})

test('the cards whose published values were corrected say what is published', { skip: NO_TASKS }, () => {
  const read = (task) => JSON.parse(readFileSync(path.join(ROOT, 'tasks', task, 'release', CARD), 'utf8'))
  assert.equal(read('ja-essence-wp7').category, 'Editorial / Personal / Publication')
  const impact = read('ja-impact-wp7')
  assert.equal(impact.category, 'Professional & Corporate')
  assert.equal(
    impact.blurb,
    'A charity and non-profit site with pages for donations, events, blog and user accounts, demoing a helpline and donor-retention organisation.'
  )
})

const goodCard = () => ({
  schemaVersion: 'tracy-design-inspiration/v1',
  template: 'ja-fixture',
  provider: 'JoomlArt',
  category: 'Professional & Corporate',
  blurb: 'A fixture.',
  image: 'fixture-home-1440.png',
  layouts: [{ key: 'home', label: 'Home', path: '/', shots: { desktop: 'fixture-home-1440.png' } }]
})

/** A scratch repo with one release per entry of `releases` (`name → file content | function(file, root) | null for no card`). */
function scratch(releases) {
  const root = mkdtempSync(path.join(tmpdir(), 'release-cards-'))
  for (const [task, make] of Object.entries(releases)) {
    const dir = path.join(root, 'tasks', task, 'release')
    mkdirSync(dir, { recursive: true })
    if (typeof make === 'function') make(path.join(dir, CARD), root)
    else if (make !== null) writeFileSync(path.join(dir, CARD), make)
  }
  return root
}

test('a bad card is reported by its file, never skipped', () => {
  const fifo = (file) => execFileSync('mkfifo', [file])
  const root = scratch({
    good: JSON.stringify(goodCard()),
    'wrong-category': JSON.stringify({ ...goodCard(), category: 'Blog & Magazine' }),
    'no-category': JSON.stringify({ ...goodCard(), category: undefined }),
    empty: '',
    broken: '{',
    'not-an-object': '[]',
    missing: null,
    link: (file, scratchRoot) => symlinkSync(path.join(scratchRoot, 'tasks/good/release', CARD), file),
    pipe: fifo
  })
  try {
    const { problems, cards } = checkCards(root)
    const text = problems.join('\n')
    assert.equal(
      cards,
      6,
      'the six that are regular files: good, wrong-category, no-category, empty, broken, not-an-object'
    )
    assert.doesNotMatch(text, /tasks\/good\//)
    for (const task of [
      'wrong-category',
      'no-category',
      'empty',
      'broken',
      'not-an-object',
      'missing',
      'link',
      'pipe'
    ])
      assert.match(text, new RegExp(`tasks/${task}/release`), `${task} is not reported`)
    assert.match(text, /wrong-category.*not one of Design inspiration's categories/)
    assert.match(text, /missing.*without its card/)
    assert.match(text, /link.*not a regular file/)
    assert.match(text, /pipe.*not a regular file/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('an empty tree is not a pass: no release means no cards read', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'release-cards-'))
  try {
    mkdirSync(path.join(root, 'tasks'))
    assert.deepEqual(checkCards(root), { problems: [], cards: 0 })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
