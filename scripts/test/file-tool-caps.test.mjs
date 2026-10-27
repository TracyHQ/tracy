// The caps on what dsh's file tools hand back to the model, in every preset of both bundles.
//
// WHY (harness profile, 09/10/2026, candidate 8). A tool result is re-sent on every later step of the
// conversation; tool results carried that way were 27–29% of all prompt tokens. dsh-base's one cap for
// every tool (`spill-policy` 12,500 tokens) sits above Tracy's own site-answer budgets and so cannot come
// down; dsh's per-tool knobs can. Measured over 1,980 bench sessions: `grep` showed up to 250 matches of
// up to 2,000 bytes each (p95 of matches shown: 105). The values below, and why `read` keeps dsh's own
// caps: `scripts/gen-presets.ts` (rowLines, `tool-fs-search`).
//
// This test holds four things: every preset that mounts the tool sets the cap; the cap is a field dsh's
// tool still reads (a field renamed upstream would be dropped by schemastery in silence); `read` keeps
// dsh's 2,000-character line (a 1,000 cap was tried and reverted: `read` cannot page inside a line, and
// a whole-file `write` rebuilt from a cut line would corrupt the file); and Tracy does not lower
// dsh-base's `spill-policy` (that would cut Tracy's own site answers).

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { parsePatch } from '../check-image-profile.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const DSH = 'vendor/tracy/deepseek-harness/packages'
const PRESET_FILES = [
  'packages/bundle/tracy-cowork/presets.patch.yml',
  'packages/bundle/tracy-native/presets.patch.yml'
]

/** Each cap: the preset row, its value, dsh's default and the source that declares the field. */
const CAPS = [
  {
    row: 'tool-fs-search',
    key: 'grepMaxMatches',
    value: 100,
    dshDefault: 250,
    source: `${DSH}/fs/tool-fs-search/src/index.ts`
  },
  {
    row: 'tool-fs-search',
    key: 'grepMaxLineBytes',
    value: 1000,
    dshDefault: 2000,
    source: `${DSH}/fs/tool-fs-search/src/index.ts`
  }
]

/**
 * Every preset's plugin rows by id, by preset id.
 * @param {string} file
 * @returns {Map<string, Map<string, any>>}
 */
function presetRows(file) {
  const { rows, problems } = parsePatch(readFileSync(join(ROOT, file), 'utf8'), file)
  assert.deepEqual(problems, [])
  /** @type {Map<string, Map<string, any>>} */
  const out = new Map()
  for (const row of rows) {
    const insert = /** @type {any} */ (row).insert
    if (!Array.isArray(insert)) continue
    for (const entry of insert) {
      if (entry?.name !== '@deepseek-ai/dsh-agent-preset') continue
      out.set(entry.config.id, new Map((entry.config.plugins ?? []).map((/** @type {any} */ p) => [p.id, p])))
    }
  }
  return out
}

test('every preset of both bundles that mounts a file tool sets its cap', () => {
  for (const file of PRESET_FILES) {
    const presets = presetRows(file)
    assert.equal(presets.size, 12, file)
    let mounted = 0
    for (const [preset, rows] of presets)
      for (const cap of CAPS) {
        const row = rows.get(cap.row)
        if (row === undefined) continue
        mounted += 1
        assert.equal(row.config?.[cap.key], cap.value, `${file}: ${preset} ${cap.row}.${cap.key}`)
      }
    assert.ok(mounted >= 12, `${file}: the file tools are mounted somewhere (${mounted})`)
  }
})

// 🔒 Every key Tracy may set on `read`: none of its caps. A `readMaxLineLength` (1,000 in the first cut
// of #1026), `readMaxBytes` or `readLimit` row is refused here; dsh's own defaults apply.
const READ_CAP_KEYS = ['readMaxLineLength', 'readMaxBytes', 'readLimit']
test("read keeps dsh's own caps in every preset: a long template line stays readable whole", () => {
  for (const file of PRESET_FILES) {
    let mounted = 0
    for (const [preset, rows] of presetRows(file)) {
      const fsRow = rows.get('tool-fs')
      if (fsRow === undefined) continue
      mounted += 1
      for (const key of READ_CAP_KEYS)
        assert.equal(fsRow.config?.[key], undefined, `${file}: ${preset} tool-fs.${key} is dsh's`)
    }
    assert.ok(mounted >= 12, `${file}: read is mounted in every preset (${mounted})`)
  }
  const index = readFileSync(join(ROOT, `${DSH}/fs/tool-fs/src/index.ts`), 'utf8')
  for (const key of READ_CAP_KEYS)
    assert.match(index, new RegExp(`\\b${key}\\?: number`), `dsh still names ${key}`)
})

test('grep still keeps its glob setting next to the new caps', () => {
  for (const file of PRESET_FILES)
    for (const [preset, rows] of presetRows(file)) {
      const search = rows.get('tool-fs-search')
      if (search !== undefined)
        assert.equal(search.config?.sampleOverCapGlobResults, false, `${file}: ${preset}`)
    }
})

test("each cap is a field dsh's tool reads, lower than dsh's own default", () => {
  for (const cap of CAPS) {
    const source = readFileSync(join(ROOT, cap.source), 'utf8')
    assert.match(source, new RegExp(`\\b${cap.key}\\?: number`), `${cap.source} declares ${cap.key}`)
    assert.match(
      source,
      new RegExp(`\\b${cap.key}: z\\.number\\(\\)\\.default\\(`),
      `${cap.source} defaults ${cap.key}`
    )
    assert.ok(Number.isSafeInteger(cap.value) && cap.value > 0 && cap.value < cap.dshDefault, cap.key)
  }
  const defaults = readFileSync(join(ROOT, `${DSH}/fs/tool-fs-search/src/grep.ts`), 'utf8')
  assert.match(defaults, /export const GREP_MAX_MATCHES = 250\b/)
  assert.match(defaults, /export const GREP_MAX_LINE_BYTES = 2000\b/)
  const read = readFileSync(join(ROOT, `${DSH}/fs/tool-fs/src/read-render.ts`), 'utf8')
  assert.match(read, /export const READ_MAX_LINE_LENGTH = 2000\b/)
})

test("Tracy leaves dsh-base's spill-policy cap alone: Tracy's site answers are budgeted under it", () => {
  const base = readFileSync(join(ROOT, `${DSH}/bundle/base/cordis.patch.yml`), 'utf8')
  assert.match(
    base,
    /id: spill-policy\n\s+name: '@deepseek-ai\/dsh-spill-policy'\n\s+config:\n\s+maxInlineTokens: 12500\b/
  )
  for (const file of [
    ...PRESET_FILES,
    'packages/bundle/tracy-native/cordis.patch.yml',
    'packages/bundle/tracy-cowork/cordis.patch.yml',
    'packages/fleet/tracy-fleet-operation/dsh/profile/cordis.patch.yml'
  ])
    assert.doesNotMatch(readFileSync(join(ROOT, file), 'utf8'), /maxInlineTokens|id: spill-policy/, file)
})
