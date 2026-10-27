/** The denominator: regeneration is identical, extraction gaps surface as unresolved, nothing is silently dropped. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'

import { ALL_TAGS, extractAll, patchRows } from '../catalogue.mjs'
import { ORACLES, planItem } from '../rules.mjs'
import { OUT, build, driftOf } from '../generate.mjs'
import { manifestsFromDocuments } from '../index.mjs'
import { REPO } from '../runtime.mjs'
import {
  MAX_LAYER_FILE_BYTES,
  readBoundedJsonSync,
  readBoundedSync,
  readTextSync
} from '../../../lib/bounded-reader.mjs'
import { parseNa } from '../../../lib/denominator.mjs'
import { docRel } from '../../../lib/doc-source.mjs'

const readText = (file) => readBoundedSync(file, { maxBytes: MAX_LAYER_FILE_BYTES }).toString('utf8')

const base = fs.mkdtempSync(path.join(process.env.QA_HARNESS_ARTIFACT_ROOT ?? os.tmpdir(), 'gen-'))
after(() => fs.rmSync(base, { recursive: true, force: true }))

const LIVE_NONE = { liveTools: null, liveError: 'selftest: not extracted' }

test('the real tree extracts every dimension the task names', async () => {
  const r = await extractAll(LIVE_NONE)
  const kinds = new Set(r.items.map((i) => i.kind))
  for (const kind of [
    'tool-surface',
    'fs-fence',
    'workdir-guard',
    'write-path',
    'mode-matrix',
    'native-row',
    'approval',
    'dispatcher'
  ])
    assert.ok(kinds.has(kind), kind)
  // each agent tool × surface: 11 tools × 8 surfaces
  assert.equal(r.items.filter((i) => i.kind === 'tool-surface').length, 11 * 8)
  // each of the four write paths × 3 CMS
  assert.equal(r.items.filter((i) => i.kind === 'write-path').length, 12)
  // every FS_TOOL_ARGS path argument, and every WORKDIR_ARG entry
  const { FS_TOOL_ARGS, WORKDIR_ARG } = await import(
    path.join(REPO, 'packages/tools/tracy-subprocess-docker/src/route.mjs')
  )
  assert.equal(
    r.items.filter((i) => i.kind === 'fs-fence').length,
    Object.values(FS_TOOL_ARGS).reduce((n, e) => n + e.paths.length, 0)
  )
  assert.equal(r.items.filter((i) => i.kind === 'workdir-guard').length, Object.keys(WORKDIR_ARG).length)
  // every matrix row, tools and skills
  const matrix = JSON.parse(readTextSync(path.join(REPO, 'config/mode-matrix.json')))
  assert.equal(
    r.items.filter((i) => i.kind === 'mode-matrix').length,
    matrix.tools.length + matrix.skills.length
  )
  // the live registry was not extracted here, and that is said, not hidden
  assert.ok(r.unresolved.some((u) => /live tool registry/.test(u.source)))
})

test('an unreadable or malformed source is reported, and an empty catalogue is refused', async () => {
  const repo = path.join(base, 'repo')
  fs.mkdirSync(path.join(repo, 'apps/tracy-web/src/api-reference/sources'), { recursive: true })
  const none = await extractAll(LIVE_NONE, { repo })
  assert.ok(none.unresolved.some((u) => u.source.endsWith('agent-tools.json') && /unreadable/.test(u.reason)))
  assert.equal(none.items.filter((i) => i.kind === 'tool-surface').length, 0, 'no invented items')
  fs.writeFileSync(path.join(repo, 'apps/tracy-web/src/api-reference/sources/agent-tools.json'), '{broken')
  const bad = await extractAll(LIVE_NONE, { repo })
  assert.ok(bad.unresolved.some((u) => /malformed JSON/.test(u.reason)))
  fs.writeFileSync(
    path.join(repo, 'apps/tracy-web/src/api-reference/sources/agent-tools.json'),
    JSON.stringify({ surfaces: [], tools: [], otherTools: [] })
  )
  const empty = await extractAll(LIVE_NONE, { repo })
  assert.ok(empty.unresolved.some((u) => /refusing to emit an empty denominator/.test(u.reason)))
  fs.mkdirSync(path.join(repo, 'config'), { recursive: true })
  fs.writeFileSync(
    path.join(repo, 'config/mode-matrix.json'),
    JSON.stringify({ tools: 'not a list', skills: [] })
  )
  const shape = await extractAll(LIVE_NONE, { repo })
  assert.ok(shape.unresolved.some((u) => /unsupported shape/.test(u.reason)))
})

test('every item has every required tag classified: covered, N/A with reason and source, or open', async () => {
  const r = await extractAll({
    liveTools: [
      { name: 'read', schema: { required: ['file_path'], properties: { file_path: {} } } },
      {
        name: 'write',
        schema: { required: ['file_path', 'content'], properties: { sandbox_permissions: {} } }
      }
    ],
    liveError: null
  })
  for (const item of r.items) {
    const plan = planItem(item, {})
    for (const tag of ALL_TAGS) {
      const cell = plan[tag]
      assert.ok(['case', 'na', 'open'].includes(cell.status), `${item.id}/${tag}`)
      if (cell.status === 'na') {
        assert.ok(cell.reason && cell.reason.length > 10, `${item.id}/${tag}: N/A needs a reason`)
        assert.ok(cell.source && cell.source.length > 5, `${item.id}/${tag}: N/A needs a source`)
        assert.doesNotMatch(
          cell.reason,
          /no time|not enough time|environment|unknown/i,
          'missing time/environment is never an N/A reason'
        )
      }
      if (cell.status === 'case')
        assert.ok(
          cell.specs.length > 0 &&
            cell.specs.every((s) => s.assertion.startsWith('harness.') && s.oracle.ref in ORACLES),
          `${item.id}/${tag}`
        )
      if (cell.status === 'open') assert.ok(cell.reason, `${item.id}/${tag}: open needs its reason`)
    }
  }
})

test('the rebuilt documents match manifest.json and cover the checklist', async () => {
  const { files, denominator, coverageDoc: coverage, manifest } = await build()
  const committed = readBoundedJsonSync(OUT.manifest, { maxBytes: MAX_LAYER_FILE_BYTES })
  assert.deepEqual(driftOf(files, committed, readText(OUT.oracles), readText(OUT.denominator)), [])
  assert.deepEqual(manifest, committed)
  assert.equal(denominator.command, 'node tests/qa/layers/harness/generate.mjs')
  assert.equal(denominator.items.length, coverage.items.length)
  for (const item of denominator.items) {
    // Required and N-A together are the whole checklist, and no tag is in both.
    assert.deepEqual([...item.requiredTags, ...Object.keys(item.na)].sort(), [...ALL_TAGS].sort(), item.id)
    const cov = coverage.items.find((c) => c.item === item.id)
    assert.deepEqual(Object.keys(cov.cells).sort(), [...ALL_TAGS].sort(), item.id)
    for (const tag of Object.keys(item.na)) {
      assert.match(cov.cells[tag], /^na:/)
      assert.ok(parseNa(denominator.naReasons[item.na[tag]].split('{id}').join(item.id)), `${item.id}/${tag}`)
    }
  }
  assert.equal(coverage.incomplete, denominator.details.incomplete)
  // The committed denominator is the document the manifest pins, byte for byte.
  assert.equal(readText(OUT.denominator), files.get('denominator.json'))
  assert.doesNotMatch(JSON.stringify(coverage.note), /100\s*%/)
  // the cases that credit a cell all exist as manifests
  const ids = new Set(manifestsFromDocuments(files).map((m) => m.id))
  for (const item of coverage.items) {
    for (const cell of Object.values(item.cells)) {
      if (cell.startsWith('covered:'))
        for (const id of cell.slice(8).split(','))
          assert.ok(ids.has(id), `${item.item}: ${id} has no manifest`)
      else assert.ok(coverage.reasons[cell.split(':')[1]], `${item.item}: ${cell} has no reason`)
    }
  }
})

test('the committed footprint stays small: the manifest, the oracles and the shared-contract denominator', () => {
  const dir = path.join(REPO, 'tests/qa/layers/harness')
  for (const name of ['coverage.json', 'cases'])
    assert.equal(fs.existsSync(path.join(dir, name)), false, `${name} is expanded at run time, not committed`)
  assert.ok(fs.statSync(OUT.manifest).size < 20_000)
  // Committed since the inventory build and `pnpm qa coverage` read one denominator per layer.
  assert.ok(fs.statSync(OUT.denominator).isFile())
})

test('patchRows reads top-level and inserted rows and notes dynamic flags', () => {
  const rows = patchRows(
    [
      '- id: subprocess',
      '  disabled: true',
      '- insert:',
      '    - id: tracy-sandbox-docker',
      "      name: '@tracy/dsh-sandbox-docker'",
      '- id: x',
      '  disabled: !!js process.platform === "win32"'
    ].join('\n')
  )
  assert.deepEqual(
    rows.map((r) => [r.id, r.disabled, r.dynamic, r.inserted]),
    [
      ['subprocess', true, false, false],
      ['tracy-sandbox-docker', false, false, true],
      ['x', false, true, false]
    ]
  )
})

test('every oracle quote is found in its source (an oracle that is not there is not an oracle)', () => {
  for (const [id, o] of Object.entries(ORACLES)) {
    if (o.external) continue
    assert.ok(
      readTextSync(path.join(REPO, docRel(REPO, o.source))).includes(o.quote),
      `${id}: quote missing from ${o.source}`
    )
  }
})

test('drift is detected: a changed byte, a missing document, an extra document, a bad oracles file', () => {
  const files = new Map([
    ['a.json', '{"x":1}\n'],
    ['oracles.json', '{}\n']
  ])
  const pin = (m) => ({
    files: Object.fromEntries(
      [...m].map(([n, t]) => [
        n,
        { count: 1, bytes: t.length, sha256: createHash('sha256').update(t).digest('hex') }
      ])
    )
  })
  const committed = pin(files)
  assert.deepEqual(driftOf(files, committed, '{}\n'), [])
  assert.equal(
    driftOf(new Map([...files, ['a.json', '{"x":2}\n']]), committed, '{}\n').length,
    1,
    'a changed byte'
  )
  const lacking = new Map(files)
  lacking.delete('a.json')
  assert.match(driftOf(lacking, committed, '{}\n')[0], /a\.json \(no longer generated\)/)
  assert.match(
    driftOf(new Map([...files, ['b.json', '[]\n']]), committed, '{}\n')[0],
    /b\.json \(not in manifest/
  )
  assert.match(driftOf(files, committed, 'tampered')[0], /oracles\.json \(bytes differ\)/)
  assert.match(driftOf(files, null, '{}\n')[0], /manifest\.json is missing/)
  // The committed denominator is compared byte for byte too.
  const withDen = new Map([...files, ['denominator.json', '{"items":[]}\n']])
  assert.deepEqual(driftOf(withDen, pin(withDen), '{}\n', '{"items":[]}\n'), [])
  assert.match(driftOf(withDen, pin(withDen), '{}\n', 'stale')[0], /denominator\.json \(bytes differ\)/)
  assert.match(driftOf(withDen, pin(withDen), '{}\n', null)[0], /denominator\.json \(bytes differ\)/)
})

test('seam credit: every write path is credited by its own case; the end-to-end effect stays open with an owner', async () => {
  const { items } = await extractAll(LIVE_NONE)
  const paths = items.filter((i) => i.kind === 'write-path')
  assert.equal(paths.length, 12, 'four write paths × three CMS')
  const happy = new Set()
  for (const item of paths) {
    const plan = planItem(item)
    const ids = plan.happy.specs.map((s) => s.id)
    assert.equal(ids.length, 1, item.id)
    assert.match(
      ids[0],
      new RegExp(`write-path-${item.meta.path}-${item.meta.cms}-`),
      'the case is the path it credits'
    )
    happy.add(ids[0])
    assert.equal(plan['audit-seam'].status, 'case', `${item.id}: the seam is measured`)
    assert.equal(plan['audit-effect'].status, 'open', `${item.id}: nothing reads the effect back`)
    assert.match(plan['audit-effect'].reason, /^PENDING: .*owner:/)
  }
  assert.equal(happy.size, 12, 'no case is shared between write paths')
})
