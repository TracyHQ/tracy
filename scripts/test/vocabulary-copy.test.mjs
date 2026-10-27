/**
 * Issue #807: copy that drifted from its source, and the "Agent preset" ban that the plural slipped.
 *
 *   - the count of design inspirations a visitor and an operator read is the catalogue's own count;
 *   - both vocabulary gates (`check-vocabulary.ts`, `check-language.ts`) reject "Agent preset" and
 *     "Agent presets" in any case, and nothing longer that merely contains those letters;
 *   - the harness rail and the design bench say "Provider presets".
 *
 * The gates are the real scripts, run on a throwaway tree: each is copied next to a fixture and run
 * the way `check-all.ts` runs it (`node --import tsx`), so the test follows the gate's own matcher
 * and repeats none of it. The tree lives under `$TRACY_TEST_ARTIFACT_DIR` when set, the OS temp dir
 * otherwise, and is removed afterwards.
 *
 *   node --test scripts/test/vocabulary-copy.test.mjs
 */
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  copyFileSync,
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
import { dirname, join, resolve } from 'node:path'
import { after, before, describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCRATCH_PARENT = process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir()

/**
 * The text of an input this test depends on. Anything but a readable, non-empty regular file is a
 * failure that names the file: a count is never inferred from an input that is not there.
 * @param {string} file absolute path
 */
function readInput(file) {
  let stat
  try {
    stat = lstatSync(file)
  } catch (error) {
    throw new Error(`input missing: ${file} (${error.code})`)
  }
  if (!stat.isFile()) throw new Error(`input is not a regular file: ${file}`)
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch (error) {
    throw new Error(`input unreadable: ${file} (${error.code})`)
  }
  if (text.trim() === '') throw new Error(`input is empty: ${file}`)
  return text
}

/** @param {string} file absolute path of a JSON input */
function readJsonInput(file) {
  const text = readInput(file)
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error(`input is not JSON: ${file} (${error.message})`)
  }
}

/**
 * How many design inspirations the catalogue holds: the length of its own list, which must also be
 * the count it declares.
 * @param {string} file absolute path of a `catalog.json`
 */
function catalogueCount(file) {
  const catalogue = readJsonInput(file)
  if (!Array.isArray(catalogue?.systems) || catalogue.systems.length === 0) {
    throw new Error(`catalogue has no systems list: ${file}`)
  }
  if (catalogue.count !== catalogue.systems.length) {
    throw new Error(
      `catalogue declares count ${catalogue.count} but lists ${catalogue.systems.length} systems: ${file}`
    )
  }
  return catalogue.systems.length
}

/**
 * The one count a sentence states.
 * @param {string} text the sentence
 * @param {string} where what to name when it states none, or several
 */
function countIn(text, where) {
  const numbers = String(text).match(/\b\d{2,}\b/g) ?? []
  if (numbers.length !== 1)
    throw new Error(`${where}: expected one count, found ${numbers.length} in "${text}"`)
  return Number(numbers[0])
}

const rel = (...parts) => join(ROOT, ...parts)

// ── F-S5-003: the count a person reads is the catalogue's ────────────────────────────────────────

describe('the count of design inspirations', () => {
  const total = () => catalogueCount(rel('vendor/tracy/od-design-system/catalog.json'))

  test("the public page's description states the catalogue's count, in the product's words", () => {
    const html = readInput(rel('packages/web/tracy-design-page/index.html'))
    const meta = html.match(/<meta name="description" content="([^"]*)"/)
    assert.ok(meta, 'index.html carries no <meta name="description">')
    assert.equal(countIn(meta[1], 'meta description'), total())
    assert.match(meta[1], /design templates/)
    assert.doesNotMatch(meta[1], /design systems?/i)
  })

  test("both operator hints state the catalogue's count, in the product's words", () => {
    const switches = readJsonInput(rel('packages/core/tracy-core/src/ui-switches/catalogue.json'))
    const all = Object.values(switches).filter(Array.isArray).flat()
    for (const id of ['launch-inspirations', 'tab-inspirations']) {
      const entry = all.find((row) => row?.id === id)
      assert.ok(entry, `ui-switches catalogue has no "${id}"`)
      assert.equal(countIn(entry.hint, `${id} hint`), total())
      assert.match(entry.hint, /design templates/)
      assert.doesNotMatch(entry.hint, /design systems?/i)
    }
  })

  test('the two package descriptions that state a count state the same one', () => {
    for (const file of [
      'packages/web/tracy-design-page/package.json',
      'packages/design/tracy-design-inspiration/package.json'
    ]) {
      // These sentences also cite an ADR by number, so the count is read by what it counts.
      const stated = String(readJsonInput(rel(file)).description).match(
        /\bthe (\d+) (?:design )?(?:inspirations|systems)\b/i
      )
      assert.ok(stated, `${file}: the description states no count of inspirations`)
      assert.equal(Number(stated[1]), total(), file)
    }
  })

  test('the public API reference states the same count, in the same words', () => {
    const dir = rel('apps/tracy-web/src/api-reference/routes')
    const files = readdirSync(dir).filter((name) => name.endsWith('.js'))
    assert.ok(files.includes('misc.js'), `no misc.js under ${dir}`)
    const counted = /\b(\d+) design (systems?|inspirations?|templates?)\b/gi
    let stated = 0
    for (const name of files) {
      for (const [phrase, count, noun] of readInput(join(dir, name)).matchAll(counted)) {
        assert.equal(noun.toLowerCase(), 'templates', `${name}: "${phrase}"`)
        assert.equal(Number(count), total(), `${name}: "${phrase}"`)
        stated++
      }
    }
    // The door that serves the public page is the one that states it; none stated is a moved sentence.
    assert.ok(stated > 0, 'no route description states the count of design inspirations')
  })

  test('the strings table keeps no count of its own', () => {
    const source = readInput(rel('packages/design/tracy-design-inspiration/src/client/strings.ts'))
    assert.deepEqual(source.match(/\b\d{3}\b/g) ?? [], [])
  })
})

// ── F-S1-014: the API reference names the join request as the pages do ───────────────────────────

describe('"Request to join" in the public API reference', () => {
  test('no route summary or description still says "Ask to join" or "Ask for access"', () => {
    const dir = rel('apps/tracy-web/src/api-reference/routes')
    const files = readdirSync(dir).filter((name) => name.endsWith('.js'))
    let named = 0
    for (const name of files) {
      const text = readInput(join(dir, name))
      assert.deepEqual(text.match(/\bask (?:to join|for access)\b/gi) ?? [], [], name)
      named += (text.match(/\bRequest to join\b/g) ?? []).length
    }
    // Both join-request doors and the join page carry the canonical wording.
    assert.ok(named >= 3, `expected the join doors to say "Request to join", found ${named}`)
  })
})

// ── F-S8-001 / F-S2-014: "Agent preset(s)" ───────────────────────────────────────────────────────

const FIXTURE_FILE = 'packages/ui/fixture/src/client/strings.ts'

/**
 * The banned phrase, put together here so that this file never spells it in code: it sits under
 * `scripts/`, which the vocabulary gate reads.
 */
const BANNED = ['Agent', 'preset'].join(' ')
const BANNED_PLURAL = `${BANNED}s`

/** One line of the fixture each: [key, text, whether a gate must reject it]. */
const FIXTURE_ROWS = [
  ['singular', BANNED, true],
  ['plural', BANNED_PLURAL, true],
  ['upper', BANNED_PLURAL.toUpperCase(), true],
  [
    'mixed',
    [...BANNED].map((letter, index) => (index % 2 ? letter.toUpperCase() : letter.toLowerCase())).join(''),
    true
  ],
  ['sentence', `Open ${BANNED_PLURAL} to change one.`, true],
  ['prefixed', `Re${BANNED_PLURAL.toLowerCase()}`, false],
  ['suffixed', `${BANNED}ting`, false],
  ['longer', `${BANNED_PLURAL}X`, false],
  ['identifier', 'agentPresetStore', false],
  ['canonical', 'Provider presets', false]
]

const fixtureSource = (rows) =>
  `export const en = {\n${rows.map(([key, text]) => `  ${key}: '${text}',`).join('\n')}\n}\n`

/** The 1-based line of each fixture row, by key. */
const lineOf = (rows, key) => rows.findIndex((row) => row[0] === key) + 2

describe(`the vocabulary gates and "${BANNED}"`, () => {
  let tree = ''

  before(() => {
    tree = mkdtempSync(join(SCRATCH_PARENT, 'vocabulary-copy-gates-'))
    mkdirSync(join(tree, 'scripts', 'lib'), { recursive: true })
    mkdirSync(join(tree, 'scripts', 'opensource'), { recursive: true })
    for (const script of [
      'check-vocabulary.ts',
      'check-language.ts',
      'lib/coined-words.mjs',
      'lib/comment-language.ts',
      // `check-language.ts` imports the list of Tracy-owned vendor trees.
      'lib/owned-vendor-trees.ts',
      // `check-language.ts` reads the export's exclude rules to skip ledger rows for left-out files.
      'opensource/export.mjs'
    ]) {
      readInput(rel('scripts', script))
      copyFileSync(rel('scripts', script), join(tree, 'scripts', script))
    }
    // The gates import `typescript` and are run through `tsx`: both resolve from the repository's
    // own install. A link, never a copy.
    symlinkSync(rel('node_modules'), join(tree, 'node_modules'))
    // `check-vocabulary.ts` also checks package names against §9 of this document; the tree has no
    // package, so the list is empty.
    mkdirSync(join(tree, 'docs', 'references'), { recursive: true })
    writeFileSync(
      join(tree, 'docs', 'references', 'vocabulary.md'),
      '# Vocabulary\n\n## 9. Packages\n\n```text\n```\n'
    )
    mkdirSync(dirname(join(tree, FIXTURE_FILE)), { recursive: true })
    // `check-language.ts` refuses a tree where it finds fewer `AGENTS.md` under `packages/cms` than
    // its own floor (a walk that found nothing must not pass). The floor is the gate's to keep, so
    // the tree simply carries plenty; a floor raised past this fails the "clean" case out loud.
    for (let index = 0; index < 32; index++) {
      const dir = join(tree, 'packages', 'cms', `site-${index}`)
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'AGENTS.md'), '# Site\n\nA placeholder for the gate to read.\n')
    }
    // `check-vocabulary.ts` lists files through git.
    execFileSync('git', ['init', '--quiet'], { cwd: tree })
  })

  after(() => {
    if (tree) rmSync(tree, { recursive: true, force: true })
  })

  /**
   * Run one gate on the tree with the given fixture rows.
   * @returns {{clean: boolean, lines: number[], output: string}} the fixture lines the gate rejected
   */
  function runGate(script, rows) {
    writeFileSync(join(tree, FIXTURE_FILE), fixtureSource(rows))
    const run = spawnSync(process.execPath, ['--import', 'tsx', join(tree, 'scripts', script)], {
      cwd: tree,
      encoding: 'utf8',
      timeout: 60_000
    })
    const output = `${run.stdout ?? ''}${run.stderr ?? ''}`
    assert.ifError(run.error)
    const lines = [...output.matchAll(/packages\/ui\/fixture\/src\/client\/strings\.ts:(\d+)/g)].map((m) =>
      Number(m[1])
    )
    // A gate that died, or whose report no longer names file:line, has given no verdict: say so
    // rather than read "no lines" as "clean".
    if (run.status === 0) {
      assert.deepEqual(lines, [], `${script} passed but named fixture lines:\n${output}`)
      return { clean: true, lines, output }
    }
    assert.equal(run.status, 1, `${script} did not run to a verdict (exit ${run.status}):\n${output}`)
    assert.ok(
      lines.length > 0,
      `${script} failed without naming a fixture line; its report changed shape:\n${output}`
    )
    return { clean: false, lines: [...new Set(lines)].sort((a, b) => a - b), output }
  }

  for (const script of ['check-vocabulary.ts', 'check-language.ts']) {
    test(`${script}: a tree with only allowed words is clean`, () => {
      const allowed = FIXTURE_ROWS.filter((row) => !row[2])
      const result = runGate(script, allowed)
      assert.equal(result.clean, true, result.output)
    })

    test(`${script}: singular and plural are rejected in any case; longer words are not`, () => {
      const result = runGate(script, FIXTURE_ROWS)
      assert.equal(result.clean, false)
      const expected = FIXTURE_ROWS.filter((row) => row[2]).map((row) => lineOf(FIXTURE_ROWS, row[0]))
      assert.deepEqual(result.lines, expected, result.output)
      assert.match(result.output, /Provider presets/)
    })

    for (const [key, text] of FIXTURE_ROWS.filter((row) => row[2])) {
      test(`${script}: "${text}" alone turns the gate red`, () => {
        const rows = [
          ['canonical', 'Provider presets', false],
          [key, text, true]
        ]
        const result = runGate(script, rows)
        assert.equal(result.clean, false)
        assert.deepEqual(result.lines, [lineOf(rows, key)], result.output)
      })
    }
  }
})

describe(`"Provider presets" on the surfaces that said "${BANNED_PLURAL}"`, () => {
  const bannedLabel = new RegExp(`(?:label: '|title=")${BANNED}s?`, 'i')

  test('the harness rail, which is also its top-bar title', () => {
    const source = readInput(rel('packages/web/tracy-harness/src/App.tsx'))
    const english = readInput(rel('packages/web/tracy-harness/src/i18n/ns/shell.ts'))
    assert.match(source, /id: 'presets', label: 'shell\.nav\.presets'/)
    assert.match(english, /'shell\.nav\.presets': 'Provider presets'/)
    assert.doesNotMatch(source, bannedLabel)
    assert.doesNotMatch(english, new RegExp(BANNED, 'i'))
  })

  test("the design bench's settings nav and section heading", () => {
    const source = readInput(rel('packages/dev/tracy-design/src/pages/shell/settings-sections.tsx'))
    assert.match(source, /id: 'presets', label: 'Provider presets'/)
    assert.match(source, /<Head title="Provider presets"/)
    assert.doesNotMatch(source, bannedLabel)
  })
})
