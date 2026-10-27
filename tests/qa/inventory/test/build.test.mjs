// build.mjs end to end: reproducibility in a scratch copy, --check drift, usage errors, denominator
// merge and validation, incomplete sources, atomic output.
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { dirname, join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  ASSET_KINDS,
  EXTRACTORS,
  KIND_TABLE,
  LAYERS,
  buildInventory,
  buildStable,
  denominatorFiles,
  loadDenominators,
  prepare,
  realOps,
  writePair,
  writeAtomic,
  loadEdgeTags,
  main,
  formatReport
} from '../build.mjs'
import { DEFAULT_ROOT, formatJson } from '../extractors/common.mjs'
import { cleanup, json, makeRoot, put, sha, scratchBase } from './helpers.mjs'
import { readBytesSync, readTextSync } from '../../lib/bounded-reader.mjs'

after(cleanup)

const BUILD = join(dirname(fileURLToPath(import.meta.url)), '../build.mjs')
const cli = (args) =>
  spawnSync(process.execPath, [BUILD, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
/** In-process: same code path as the CLI (`main`), without paying a node start-up per build. */
function run(args) {
  let stdout = ''
  let stderr = ''
  const status = main(args, { out: (t) => (stdout += t), err: (t) => (stderr += t) })
  return { status, stdout, stderr }
}
const nullRevisions = (text) => JSON.stringify(JSON.parse(text, (k, v) => (k === 'revision' ? null : v)))

/** Scratch checkouts: `bare` holds exactly the files the real build read; `generated` also holds the output. */
let real
let bare
let generated
function makeBare() {
  const root = mkdtempSync(join(scratchBase(), 'template-'))
  const paths = new Set(['tests/qa/inventory/edge-tags.json'])
  for (const rec of Object.values(real.recs)) for (const i of rec.inputs) paths.add(i.path)
  for (const rel of paths) {
    mkdirSync(dirname(join(root, rel)), { recursive: true })
    copyFileSync(join(DEFAULT_ROOT, rel), join(root, rel))
  }
  return root
}
function copyOf(template) {
  const root = mkdtempSync(join(scratchBase(), 'repo-'))
  cpSync(template, root, { recursive: true })
  return root
}
const bareRepo = () => copyOf(bare)
const generatedRepo = () => copyOf(generated)

before(() => {
  real = buildInventory(DEFAULT_ROOT)
  bare = makeBare()
  generated = copyOf(bare)
  assert.equal(run(['--root', generated]).status, 0)
})

describe('the committed inventory', () => {
  test('--check passes on the committed files', () => {
    const r = cli(['--check'])
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /up to date/)
  })
  test('a fresh build equals the committed one apart from revisions, and its errors list is empty', () => {
    assert.deepEqual(real.errors, [])
    const committed = readTextSync(join(DEFAULT_ROOT, 'tests/qa/inventory/inventory.json'))
    assert.equal(nullRevisions(`${JSON.stringify(real.inventory, null, 2)}\n`), nullRevisions(committed))
  })
  test('the report prints per-layer counts with provenance and never a completeness percentage', () => {
    const text = formatReport(real.inventory)
    for (const layer of LAYERS) assert.match(text, new RegExp(`^  ${layer}\\s+items=`, 'm'))
    assert.match(text, /hash=[0-9a-f]{12}/)
    assert.match(text, /rev=/)
    assert.match(text, /Completeness: INCOMPLETE/)
    assert.doesNotMatch(text, /\d\s*%/)
    assert.match(text, /DIFFERS audit findings: planned 155, measured 158/)
  })
  test('reconciliation: every plan §1 figure agrees except the explained findings count', () => {
    const off = real.inventory.reconciliation.filter((f) => !f.agrees)
    // Plan §1 was measured on origin/develop fa4dc66a5 (05/10/2026). Every figure below moved when develop
    // 3bc601ecd was merged on 07/10/2026 (publish flow, own domain, waitlist, review undo, Customize your
    // site): the inventory shows that drift instead of hiding it. The two e2e-dev journey figures joined
    // with develop 6aefcf5d3 the same day (journey J14, a seat key on the public API). A figure joining or
    // leaving this list is a change to look at, then to record here.
    assert.deepEqual(
      off.map((f) => f.label),
      [
        'public API method-paths',
        'public API paths (declared)',
        'internal API method-paths',
        'internal API paths (declared)',
        'host routes',
        'UI switches',
        'web string keys',
        'web string key x language cells',
        'story files',
        'story `export const` (lexical)',
        'regression cases',
        'regression cases with a `run`',
        'e2e-dev journey ids',
        'e2e-dev journey files',
        'scripts/ recursive files',
        'root npm commands',
        'fleet script files',
        'audit findings'
      ]
    )
    assert.match(off.at(-1).note, /158/)
  })
  test('every item has a known layer, tag set and unowned/claims state', () => {
    const { layers, edgeTags } = real.inventory
    assert.deepEqual(Object.keys(layers), [...LAYERS])
    for (const [name, layer] of Object.entries(layers)) {
      assert.equal(layer.count, layer.items.length)
      for (const it of layer.items) {
        assert.ok(edgeTags.tagSets[it.tagSet], `${it.id} tag set ${it.tagSet}`)
        assert.equal(KIND_TABLE[it.kind].layer, name)
        assert.ok(Boolean(it.unowned) !== Boolean(it.claims), `${it.id}: exactly one of unowned/claims`)
      }
      assert.equal(layer.unowned, layer.items.filter((i) => i.unowned).length)
    }
  })
  test('incomplete or unresolved sources are surfaced in completeness, never hidden', () => {
    const c = real.inventory.completeness
    assert.notEqual(
      c.status,
      'complete',
      'api-doors has unresolved structure; the inventory must not claim completeness'
    )
    for (const s of real.inventory.sources.filter((x) => x.status !== 'complete'))
      assert.ok(c.incompleteSources.includes(s.name))
    assert.ok(real.inventory.unresolved.some((u) => u.kind === 'runtime-graph-not-collected'))
  })
  test('asset kinds never become product items', () => {
    for (const kind of ASSET_KINDS) assert.equal(KIND_TABLE[kind], undefined)
    const regressions = Object.values(real.inventory.layers).reduce(
      (n, l) => n + (l.legacyAssets.byKind.regression ?? 0),
      0
    )
    assert.equal(
      regressions,
      real.recs.regression.items.length,
      'every regression case has exactly one proposed owner layer'
    )
  })
})

describe('edge tags (plan §3, verbatim)', () => {
  const tags = JSON.parse(readTextSync(join(DEFAULT_ROOT, 'tests/qa/inventory/edge-tags.json')))
  test('the lists have the planned sizes and contents', () => {
    assert.deepEqual(tags.common, [
      'happy',
      'empty',
      'invalid',
      'boundary',
      'dependency-failure',
      'repeat',
      'cleanup'
    ])
    const sizes = Object.fromEntries(Object.entries(tags.kinds).map(([k, v]) => [k, v.length]))
    assert.deepEqual(sizes, {
      'api-host': 14,
      'unit-component': 8,
      'ui-ux': 13,
      flow: 10,
      'harness-tool': 13,
      'infra-script': 10,
      'cms-release': 10,
      mail: 10
    })
    assert.deepEqual(tags.kinds['api-host'].slice(0, 3), ['anonymous', 'expired-auth', 'wrong-role'])
    assert.ok(
      tags.kinds['harness-tool'].includes('symlink') &&
        tags.kinds['cms-release'].includes('archive-path') &&
        tags.kinds.mail.includes('token-replay')
    )
    for (const list of Object.values(tags.kinds))
      assert.equal(new Set(list).size, list.length, 'no duplicate tag in a group')
  })
  test('every group a kind refers to exists, and loadEdgeTags unions the common tags in', () => {
    const edge = loadEdgeTags(DEFAULT_ROOT)
    for (const row of Object.values(KIND_TABLE)) for (const g of row.groups) assert.ok(edge.tagSets[g], g)
    assert.ok(edge.tagSets['api-host'].includes('happy') && edge.tagSets['api-host'].includes('anonymous'))
    assert.equal(edge.tagSets.common.length, 7)
  })
})

describe('usage errors exit 2 and write nothing', () => {
  const scratch = () => join(makeRoot({}), 'out.json')
  test('unknown argument, missing value, --check with --out', () => {
    const out = scratch()
    for (const args of [
      ['--bogus'],
      ['--out'],
      ['--root'],
      ['--out', '--check'],
      ['--check', '--out', out],
      ['positional']
    ]) {
      const r = cli(args)
      assert.equal(r.status, 2, args.join(' '))
      assert.match(r.stderr, /usage/)
    }
    assert.equal(existsSync(out), false)
  })
})

describe('scratch repository', () => {
  test('default generation writes both files, then --check passes; the result matches the committed inventory', () => {
    // The committed inventory merges the layers' denominators, so this checkout carries them too.
    const root = bareRepo()
    for (const { rel } of denominatorFiles(DEFAULT_ROOT))
      put(root, rel, readTextSync(join(DEFAULT_ROOT, rel)))
    const r = run(['--root', root])
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /Completeness: INCOMPLETE/)
    assert.equal(run(['--root', root, '--check']).status, 0)
    for (const f of ['inventory.json', 'legacy-map.json']) {
      const mine = readTextSync(join(root, 'tests/qa/inventory', f))
      const theirs = readTextSync(join(DEFAULT_ROOT, 'tests/qa/inventory', f))
      assert.equal(
        nullRevisions(mine),
        nullRevisions(theirs),
        `${f} regenerates identically in another checkout`
      )
    }
    assert.deepEqual(
      readdirSync(join(root, 'tests/qa/inventory')).filter((n) => n.endsWith('.tmp')),
      [],
      'no temp file left'
    )
  })

  test('--out writes elsewhere and leaves the committed files alone; --check never writes', () => {
    const root = bareRepo()
    const out = join(makeRoot({}), 'fresh.json')
    const r = run(['--root', root, '--out', out])
    assert.equal(r.status, 0, r.stderr)
    assert.ok(existsSync(out) && existsSync(`${out}.legacy-map.json`))
    assert.equal(existsSync(join(root, 'tests/qa/inventory/inventory.json')), false)
    // --check with nothing committed: exit 1 and still nothing written.
    const c = run(['--root', root, '--check'])
    assert.equal(c.status, 1)
    assert.match(c.stderr, /missing/)
    assert.equal(existsSync(join(root, 'tests/qa/inventory/inventory.json')), false)
  })

  test('drift: a changed source, a changed output, a changed tag list and a missing file all fail --check without repairing it', () => {
    const root = generatedRepo()
    const invPath = join(root, 'tests/qa/inventory/inventory.json')
    const mapPath = join(root, 'tests/qa/inventory/legacy-map.json')
    const before = sha(readTextSync(invPath))
    const check = () => run(['--root', root, '--check'])
    assert.equal(check().status, 0)

    // 1. a source drifts (a UI switch disappears)
    const cat = join(root, 'packages/core/tracy-core/src/ui-switches/catalogue.json')
    const original = readTextSync(cat)
    const doc = JSON.parse(original)
    doc.switches.pop()
    writeFileSync(cat, json(doc))
    const r = check()
    assert.equal(r.status, 1)
    assert.match(r.stderr, /inventory drift/)
    writeFileSync(cat, original)

    // 2. the committed output is hand-edited (a count changes)
    const text = readTextSync(invPath)
    const edited = JSON.parse(text)
    edited.layers.static.count -= 1
    writeFileSync(invPath, formatJson(edited))
    assert.equal(check().status, 1)
    writeFileSync(invPath, text)
    assert.equal(check().status, 0, 'restoring the committed text restores the pass')

    // 3. a tag list changes
    const tagsPath = join(root, 'tests/qa/inventory/edge-tags.json')
    const tagsOriginal = readTextSync(tagsPath)
    const tags = JSON.parse(tagsOriginal)
    tags.common.push('extra-tag')
    writeFileSync(tagsPath, json(tags))
    assert.equal(check().status, 1)
    writeFileSync(tagsPath, tagsOriginal)

    // 4. the legacy map is missing, then not JSON
    rmSync(mapPath)
    const missing = check()
    assert.equal(missing.status, 1)
    assert.match(missing.stderr, /missing/)
    writeFileSync(mapPath, '{ nope')
    assert.equal(check().status, 1)

    assert.equal(sha(readTextSync(invPath)), before, '--check never modified the inventory')
  })

  test('a changed revision alone is not drift (rebase/squash), a changed hash is', () => {
    const root = generatedRepo()
    const p = join(root, 'tests/qa/inventory/inventory.json')
    const doc = JSON.parse(readTextSync(p))
    for (const s of doc.sources) if (!s.name.startsWith('legacy-')) s.revision = '0'.repeat(40)
    writeFileSync(p, formatJson(doc))
    assert.equal(run(['--root', root, '--check']).status, 0)
    doc.sources[0].sourceHash = 'f'.repeat(64)
    writeFileSync(p, formatJson(doc))
    assert.equal(run(['--root', root, '--check']).status, 1)
  })

  test('a changed provenance revision of a copied source or of a layer denominator is drift', () => {
    const root = generatedRepo()
    const p = join(root, 'tests/qa/inventory/inventory.json')
    const pristine = readTextSync(p)
    const doc = JSON.parse(pristine)
    const copied = doc.sources.find((s) => s.name === 'legacy-findings')
    copied.revision = '0'.repeat(40)
    writeFileSync(p, formatJson(doc))
    assert.equal(run(['--root', root, '--check']).status, 1, 'copied-source revision')
    writeFileSync(p, pristine)
    const note = JSON.parse(pristine)
    note.sources.find((s) => s.name === 'legacy-plan').notes.originalSource.revision = 'x'
    writeFileSync(p, formatJson(note))
    assert.equal(run(['--root', root, '--check']).status, 1, 'original revision inside notes')
    writeFileSync(p, pristine)
    const withDen = JSON.parse(pristine)
    withDen.denominators = { api: { source: 's', revision: 'a', hash: 'h', items: 0, claimed: 0 } }
    writeFileSync(p, formatJson(withDen))
    assert.equal(run(['--root', root, '--check']).status, 1, 'denominator revision')
  })

  test('the pair of artifacts is replaced together: a failing second write restores the first', () => {
    const root = generatedRepo()
    const inv = join(root, 'tests/qa/inventory/inventory.json')
    const map = join(root, 'tests/qa/inventory/legacy-map.json')
    const before = readTextSync(inv)
    writeFileSync(inv, before.replace('"generator"', '"generator": "stale", "oldgenerator"'))
    const stale = readTextSync(inv)
    rmSync(map)
    mkdirSync(map) // a directory where the second artifact goes: its rename fails
    const r = run(['--root', root])
    assert.equal(r.status, 1)
    assert.match(r.stderr, /cannot write output/)
    assert.equal(readTextSync(inv), stale, 'the first artifact is back to what it was')
    assert.deepEqual(
      readdirSync(join(root, 'tests/qa/inventory')).filter((f) => f.endsWith('.tmp')),
      []
    )
  })

  test('an id emitted by two extractors fails the build instead of landing on the later item', () => {
    const [name, def] = EXTRACTORS.find(([n]) => n === 'migrations')
    const twin = [`${name}-twin`, def]
    const out = buildInventory(bareRepo(), { extractors: [...EXTRACTORS, twin] })
    const hits = out.errors.filter((e) =>
      /is emitted by two extractors \(migrations and migrations-twin\)/.test(e)
    )
    assert.ok(hits.length > 0, out.errors.slice(0, 3).join('\n'))
    assert.ok(hits.some((e) => e.includes('"migration:001-identity.sql"')))
    // The first item keeps its place: nothing is overwritten, nothing is listed twice.
    const ids = out.inventory.layers.infra.items.filter((i) => i.kind === 'migration').map((i) => i.id)
    assert.equal(new Set(ids).size, ids.length)
    assert.ok(out.inventory.layers.infra.items.every((i) => i.source !== 'migrations-twin'))
    // The committed extractor list holds no such pair.
    assert.deepEqual(buildInventory(bareRepo()).errors, [])
  })

  test('a denominator or edge-tags change while building is retried, then fails after three attempts', () => {
    const root = bareRepo()
    const den = join(root, 'tests/qa/layers/api/denominator.json')
    const tags = join(root, 'tests/qa/inventory/edge-tags.json')
    // A file appears after the first build reads the tree: the retry sees it and the result includes it.
    let calls = 0
    const appears = (r) => {
      const out = buildInventory(r)
      if (++calls === 1) put(root, 'tests/qa/layers/api/denominator.json', json(denominatorDoc('api', [])))
      return out
    }
    const settled = buildStable(root, appears)
    assert.ok(settled.inventory.denominators.api, 'the late denominator is in the settled build')
    assert.ok(calls >= 3)
    // A denominator that keeps changing never settles.
    let flips = 0
    const churn = (r) => {
      const out = buildInventory(r)
      put(
        root,
        'tests/qa/layers/api/denominator.json',
        json(denominatorDoc('api', [], { source: `s${++flips}` }))
      )
      return out
    }
    assert.throws(() => buildStable(root, churn), /kept changing/)
    rmSync(den)
    // The same for the tag lists.
    const original = readTextSync(tags)
    let edits = 0
    const editTags = (r) => {
      const out = buildInventory(r)
      const doc = JSON.parse(original)
      doc.common = [...doc.common, `churn-${++edits}`]
      writeFileSync(tags, JSON.stringify(doc))
      return out
    }
    assert.throws(() => buildStable(root, editTags), /kept changing/)
    writeFileSync(tags, original)
  })

  test('a missing source marks that source incomplete, the build still reports, and the committed file no longer matches', () => {
    const root = generatedRepo()
    rmSync(join(root, 'scripts/check-all.ts'))
    const r = run(['--root', root, '--out', join(makeRoot({}), 'x.json')])
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /gates\s+incomplete\s+items=\s+0/)
    assert.match(r.stdout, /incomplete sources: .*gates/)
    assert.equal(run(['--root', root, '--check']).status, 1)
  })

  test('an output path that cannot be written fails with exit 1 and no temp file', () => {
    const root = bareRepo()
    const blocker = join(makeRoot({ 'file.txt': 'x' }), 'file.txt')
    const r = run(['--root', root, '--out', join(blocker, 'sub/out.json')])
    assert.equal(r.status, 1)
    assert.match(r.stderr, /cannot write output/)
  })
})

// A layer denominator in the shared shape (contracts/denominator.schema.json). A test writes an item's
// N-A as text; the file stores each text once in `naReasons` and the key in the item.
function denominatorDoc(layer, items = [], extra = {}) {
  const naReasons = {}
  const listed = items.map((it, n) => ({
    requiredTags: [],
    ...it,
    na: Object.fromEntries(
      Object.entries(it.na ?? {}).map(([tag, text], i) => {
        naReasons[`r${n}-${i}`] = text
        return [tag, `r${n}-${i}`]
      })
    )
  }))
  return {
    schema: 'tracy-qa-denominator/v1',
    layer,
    source: 's',
    revision: null,
    command: 'c',
    naReasons,
    items: listed,
    unresolved: [],
    ...extra
  }
}

describe('layer denominators', () => {
  const edge = loadEdgeTags(DEFAULT_ROOT)
  const apiDoor = (n) => real.inventory.layers.api.items[n]
  const withDenominator = (layer, doc, name = layer) => {
    const root = bareRepo()
    put(root, `tests/qa/layers/${name}/denominator.json`, typeof doc === 'string' ? doc : json(doc))
    return root
  }

  test("claimed items stop being unowned and carry the layer's tags and N-A reasons", () => {
    const a = apiDoor(0)
    const b = apiDoor(1)
    const root = withDenominator(
      'api',
      denominatorDoc(
        'api',
        [
          {
            id: a.id,
            kind: 'api-door',
            requiredTags: ['happy', 'anonymous'],
            na: { pagination: 'no list in this door; source: apps/tracy-web/api-reference.snapshot.json' }
          },
          { id: b.id.slice(b.id.indexOf(':') + 1), kind: 'api-door', requiredTags: ['happy'] },
          { id: 'api-door:public:GET /not/in/the/inventory', kind: 'api-door', requiredTags: ['happy'] }
        ],
        {
          source: 'node tests/qa/layers/api/gen.mjs',
          revision: 'abc123',
          unresolved: [
            {
              kind: 'dynamic-door',
              id: 'GET /x',
              source: 'route.js',
              reason: 'x',
              detail: { rows: ['a', 'b'], n: { k: 1 } }
            },
            { id: 'GET /y', reason: 'y', detail: {} },
            { source: 'z.js', reason: 'z' }
          ]
        }
      )
    )
    // A second layer claims the same door: both claims are kept.
    put(
      root,
      'tests/qa/layers/flows/denominator.json',
      json(denominatorDoc('flows', [{ id: a.id, kind: 'api-door', requiredTags: ['happy'] }]))
    )
    const out = join(makeRoot({}), 'x.json')
    assert.equal(run(['--root', root, '--out', out]).status, 0)
    const got = JSON.parse(readTextSync(out))
    const items = Object.fromEntries(got.layers.api.items.map((i) => [i.id, i]))
    assert.equal(items[a.id].unowned, undefined)
    assert.deepEqual(items[a.id].claims, [
      {
        layer: 'api',
        requiredTags: ['anonymous', 'happy'],
        na: { pagination: 'no list in this door; source: apps/tracy-web/api-reference.snapshot.json' }
      },
      { layer: 'flows', requiredTags: ['happy'], na: {}, crossLayer: true }
    ])
    assert.equal(items[b.id].claims.length, 1, 'a claim by key (without the kind prefix) resolves too')
    assert.equal(got.layers.api.unowned, real.inventory.layers.api.count - 2)
    assert.deepEqual(got.denominators.api, {
      source: 'node tests/qa/layers/api/gen.mjs',
      revision: 'abc123',
      hash: got.denominators.api.hash,
      items: 3,
      claimed: 2,
      notInInventory: 1,
      unresolved: 3
    })
    assert.ok(
      got.unresolved.some(
        (u) =>
          u.source === 'layer:api' &&
          u.kind === 'dynamic-door' &&
          u.id === 'GET /x' &&
          u.origin === 'route.js' &&
          u.reason === 'x'
      ),
      "the layer's unresolved list is carried whole, not dropped"
    )
    const kept = got.unresolved.filter((u) => u.source === 'layer:api')
    assert.deepEqual(kept.find((u) => u.id === 'GET /x').detail, { rows: ['a', 'b'], n: { k: 1 } })
    assert.deepEqual(kept.find((u) => u.id === 'GET /y').detail, {})
    assert.equal(
      Object.hasOwn(
        kept.find((u) => u.origin === 'z.js'),
        'detail'
      ),
      false
    )
  })

  test('malformed denominators are rejected with a reason (validation, no build needed)', () => {
    const NA = 'not a list; source: ADR 0014'
    const doc = (extra, top = {}) =>
      denominatorDoc('api', [{ id: 'x', kind: 'api-door', requiredTags: ['happy'], ...extra }], top)
    // The file as written, with one top-level or item field changed after tabling.
    const raw = (change) => {
      const d = doc({ na: { pagination: NA } })
      change(d, d.items[0])
      return d
    }
    const without = (key) => raw((d) => delete d[key])
    const cases = [
      ['unknown tag', doc({ requiredTags: ['happy', 'made-up'] }), /unknown tag/],
      ['N-A with an empty reason', doc({ na: { pagination: '' } }), /shorter than 1/],
      ['N-A with a non-string reason', doc({ na: { pagination: 3 } }), /expected string/],
      [
        'N-A with a reason but no source',
        doc({ na: { pagination: 'because' } }),
        /N-A for pagination is not/
      ],
      [
        'N-A whose second part is not a source',
        doc({ na: { pagination: 'because of this; nonsense' } }),
        /N-A for pagination is not/
      ],
      [
        'N-A with a one-word reason',
        doc({ na: { pagination: 'because; ADR 0014' } }),
        /N-A for pagination is not/
      ],
      [
        'N-A in the old bracket form',
        doc({ na: { pagination: 'no list in this door (apps/tracy-web/api-reference.snapshot.json)' } }),
        /N-A for pagination is not/
      ],
      [
        'N-A naming a reason the table does not hold',
        raw((d, item) => {
          item.na.pagination = 'ghost'
        }),
        /names reason "ghost" that naReasons does not list/
      ],
      [
        'a reason no item cites',
        raw((d) => {
          d.naReasons.dead = NA
        }),
        /naReasons\.dead is cited by no item/
      ],
      ['N-A written as text in the item', raw((d, item) => (item.na.pagination = NA)), /does not list/],
      ['a claim of an unknown kind', doc({ kind: 'made-up-kind' }), /unknown kind "made-up-kind"/],
      ['N-A with an unknown tag', doc({ na: { 'made-up': NA } }), /unknown tag/],
      [
        'tag both required and N-A',
        doc({ requiredTags: ['happy'], na: { happy: NA } }),
        /both required and N-A/
      ],
      ['requiredTags not an array', doc({ requiredTags: 'happy' }), /requiredTags: expected array/],
      ['item without an id', raw((d, item) => delete item.id), /missing required "id"/],
      ['item without a kind', raw((d, item) => delete item.kind), /missing required "kind"/],
      ['no schema marker', without('schema'), /missing required "schema"/],
      ['another schema version', doc({}, { schema: 'tracy-qa-denominator/v0' }), /schema: must equal/],
      ['no source string', without('source'), /missing required "source"/],
      ['an empty source', doc({}, { source: '' }), /source: shorter than 1/],
      ['no command', without('command'), /missing required "command"/],
      ['no naReasons table', without('naReasons'), /missing required "naReasons"/],
      ['items not an array', doc({}, { items: {} }), /items: expected array/],
      ['a revision of the wrong type', doc({}, { revision: 7 }), /revision/],
      ['a missing revision', without('revision'), /missing required "revision"/],
      ['an empty revision', doc({}, { revision: '' }), /revision/],
      ['an unknown top-level field', doc({}, { surprise: 1 }), /surprise/],
      ['an unknown item field', doc({ surprise: 1 }), /surprise/],
      ['requiredTags missing', raw((d, item) => delete item.requiredTags), /missing required "requiredTags"/],
      ['na missing', raw((d, item) => delete item.na), /missing required "na"/],
      ['na of the wrong type', raw((d, item) => (item.na = ['x'])), /na: expected object/],
      ['na as a string', raw((d, item) => (item.na = NA)), /na: expected object/],
      [
        'na as an object per tag',
        raw((d, item) => (item.na.pagination = { reason: 'a b', source: 'ADR 1' })),
        /expected string/
      ],
      ['a required tag listed twice', doc({ requiredTags: ['happy', 'happy'] }), /requiredTags/],
      ['unresolved of the wrong type', doc({}, { unresolved: 'x' }), /unresolved: expected array/],
      [
        'an unresolved entry that is a bare string',
        doc({}, { unresolved: ['x'] }),
        /unresolved\/0: expected object/
      ],
      [
        'an unresolved entry without a reason',
        doc({}, { unresolved: [{ id: 'x' }] }),
        /missing required "reason"/
      ],
      [
        'an unresolved entry naming neither an id nor a source',
        doc({}, { unresolved: [{ reason: 'unknown' }] }),
        /unresolved\/0/
      ],
      ['a layer field that is not its directory', doc({}, { layer: 'ui' }), /does not match its directory/],
      ['a layer name outside the ten', doc({}, { layer: 'bogus' }), /layer: must be one of/],
      ['a tag from another kind', doc({ requiredTags: ['loading'] }), /do not apply to kind "api-door"/],
      [
        'a meta field the kind does not have',
        doc({ meta: { surprise: 1 } }),
        /meta\.surprise is not a field of kind/
      ],
      [
        'a details field the layer does not have',
        doc({}, { details: { surprise: 1 } }),
        /details\.surprise is not a field of layer api/
      ],
      [
        'two manual checks with one id',
        doc({}, { manual: [{ id: 'm' }, { id: 'm' }] }),
        /duplicate manual id m/
      ],
      ['sourcePaths of the wrong type', doc({}, { sourcePaths: 'apps' }), /sourcePaths: expected array/],
      ['the document is an array', [], /expected object/],
      ['invalid JSON', '{ nope', /invalid JSON/]
    ]
    for (const [label, body, message] of cases) {
      const root = makeRoot({
        'tests/qa/layers/api/denominator.json': typeof body === 'string' ? body : json(body)
      })
      const errors = []
      const got = loadDenominators(root, edge, errors)
      assert.match(errors.join('\n'), message, label)
      assert.ok(
        got.every((d) => d.items.every((i) => i.id !== 'x') || errors.length === 0),
        `${label}: the bad item is not merged`
      )
    }
  })

  test('duplicate ids, an unknown layer directory and a valid empty tree', () => {
    const dup = makeRoot({
      'tests/qa/layers/api/denominator.json': json(
        denominatorDoc('api', [
          { id: 'x', kind: 'api-door', requiredTags: [] },
          { id: 'x', kind: 'api-door', requiredTags: [] }
        ])
      )
    })
    let errors = []
    loadDenominators(dup, edge, errors)
    assert.match(errors.join(), /duplicate item id x/)
    const bogus = makeRoot({
      'tests/qa/layers/bogus/denominator.json': json(denominatorDoc('bogus', []))
    })
    errors = []
    loadDenominators(bogus, edge, errors)
    assert.match(errors.join(), /unknown layer directory "bogus"/)
    errors = []
    assert.deepEqual(loadDenominators(makeRoot({}), edge, errors), [])
    assert.deepEqual(errors, [])
  })

  test('a denominator that is a symlink, a FIFO, a directory or an empty file is an error, never a hang or an outside read', () => {
    const rel = 'tests/qa/layers/api/denominator.json'
    const good = json(denominatorDoc('api', [{ id: 'x', kind: 'api-door', requiredTags: ['happy'] }]))
    const attempt = (prepare) => {
      const root = makeRoot({ 'tests/qa/layers/api/keep': '' })
      prepare(root, join(root, rel))
      const errors = []
      const got = loadDenominators(root, edge, errors)
      assert.deepEqual(got, [], 'nothing is merged from an unsafe file')
      return errors.join('\n')
    }
    assert.match(
      attempt((root, file) => {
        put(root, 'elsewhere/denominator.json', good)
        symlinkSync(join(root, 'elsewhere/denominator.json'), file)
      }),
      /symlink refused/
    )
    assert.match(
      attempt((root, file) => execFileSync('mkfifo', [file])),
      /not a regular file/
    )
    assert.match(
      attempt((root, file) => mkdirSync(file)),
      /not a regular file/
    )
    assert.match(
      attempt((root, file) => writeFileSync(file, '')),
      /invalid JSON/
    )
    // A symlinked layer directory is refused on the way to the file.
    const linked = makeRoot({ 'real/denominator.json': good, 'tests/qa/layers/keep': '' })
    symlinkSync(join(linked, 'real'), join(linked, 'tests/qa/layers/api'))
    const errors = []
    assert.deepEqual(loadDenominators(linked, edge, errors), [])
    assert.match(errors.join('\n'), /symlink/)
    // Positive control: the same document as a regular file is read.
    const ok = makeRoot({ [rel]: good })
    const none = []
    assert.equal(loadDenominators(ok, edge, none).length, 1)
    assert.deepEqual(none, [])
  })

  test('a contradiction and an unknown kind fail the build (exit 1, nothing written); a kind-qualified key resolves', () => {
    // `packages/ui/tracy-sidebar` is both a `package` and a `dsh-plugin` key.
    const twin = real.inventory.layers.harness.items.find((i) => i.kind === 'dsh-plugin')
    const key = twin.id.slice(twin.id.indexOf(':') + 1)
    const root = bareRepo()
    put(
      root,
      'tests/qa/layers/api/denominator.json',
      json(denominatorDoc('api', [{ id: apiDoor(0).id, kind: 'gate', requiredTags: ['happy'] }]))
    )
    put(
      root,
      'tests/qa/layers/harness/denominator.json',
      json(denominatorDoc('harness', [{ id: key, kind: 'made-up-kind', requiredTags: ['happy'] }]))
    )
    const out = join(makeRoot({}), 'x.json')
    const r = run(['--root', root, '--out', out])
    assert.equal(r.status, 1)
    assert.match(r.stderr, /has kind gate but the inventory says api-door/)
    assert.match(r.stderr, /unknown kind "made-up-kind"/)
    assert.equal(existsSync(out), false)

    rmSync(join(root, 'tests/qa/layers/api'), { recursive: true })
    put(
      root,
      'tests/qa/layers/harness/denominator.json',
      json(denominatorDoc('harness', [{ id: key, kind: 'dsh-plugin', requiredTags: ['happy'] }]))
    )
    const ok = run(['--root', root, '--out', out])
    assert.equal(ok.status, 0, ok.stderr)
    assert.equal(JSON.parse(readTextSync(out)).denominators.harness.claimed, 1)
  })

  test('layers must agree about an item: required vs N-A across layers, and one layer claiming twice, fail the build', () => {
    const a = apiDoor(0)
    const root = bareRepo()
    put(
      root,
      'tests/qa/layers/api/denominator.json',
      json(denominatorDoc('api', [{ id: a.id, kind: 'api-door', requiredTags: ['happy', 'pagination'] }]))
    )
    put(
      root,
      'tests/qa/layers/flows/denominator.json',
      json(
        denominatorDoc('flows', [
          {
            id: a.id,
            kind: 'api-door',
            requiredTags: ['happy'],
            na: { pagination: 'a single-step flow; source: apps/tracy-web/api-reference.snapshot.json' }
          }
        ])
      )
    )
    const out = join(makeRoot({}), 'x.json')
    const r = run(['--root', root, '--out', out])
    assert.equal(r.status, 1)
    assert.match(r.stderr, /required by one layer and N-A for another/)
    assert.equal(existsSync(out), false, 'nothing is published')
    // The same layer naming one item twice (by id and by key) is a double claim.
    const twice = bareRepo()
    put(
      twice,
      'tests/qa/layers/api/denominator.json',
      json(
        denominatorDoc('api', [
          { id: a.id, kind: 'api-door', requiredTags: ['happy'] },
          { id: a.id.slice(a.id.indexOf(':') + 1), kind: 'api-door', requiredTags: ['happy'] }
        ])
      )
    )
    const t = run(['--root', twice, '--out', out])
    assert.equal(t.status, 1)
    assert.match(t.stderr, /claimed twice by layer api/)
    // Consistent claims by two layers are fine; the claim carries the reason text, not the table key.
    const fine = bareRepo()
    put(
      fine,
      'tests/qa/layers/api/denominator.json',
      json(denominatorDoc('api', [{ id: a.id, kind: 'api-door', requiredTags: ['happy'] }]))
    )
    put(
      fine,
      'tests/qa/layers/flows/denominator.json',
      json(
        denominatorDoc('flows', [
          {
            id: a.id,
            kind: 'api-door',
            requiredTags: ['happy'],
            na: { pagination: 'a single-step flow; source: ADR 0014' }
          }
        ])
      )
    )
    const ok = run(['--root', fine, '--out', out])
    assert.equal(ok.status, 0, ok.stderr)
    const claims = JSON.parse(readTextSync(out)).layers.api.items.find((i) => i.id === a.id).claims
    assert.equal(claims[1].na.pagination, 'a single-step flow; source: ADR 0014')
  })
})

const tree = (root, rel = '') =>
  readdirSync(join(root, rel), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? tree(root, join(rel, e.name)) : [join(rel, e.name)]
  )

describe('one flag parser: bad argv exits 2 before anything is read or written', () => {
  const table = [
    ['empty --root', ['--root', '']],
    ['whitespace --root', ['--root', '   ']],
    ['empty --out', ['--out', '']],
    ['whitespace --out', ['--out', '   ']],
    ['--check twice', ['--check', '--check']],
    ['--root twice', ['--root', 'a', '--root', 'b']],
    ['--out twice', ['--out', 'a', '--out', 'b']],
    ['--check with --out', ['--check', '--out', 'a']],
    ['a flag as the value', ['--out', '--check']],
    ['an unknown flag', ['--bogus']],
    ['a value with no flag', ['somewhere']]
  ]
  for (const [label, argv] of table)
    test(label, () => {
      const root = generatedRepo()
      const before = tree(root)
      const r = run(argv)
      assert.equal(r.status, 2, r.stderr)
      assert.match(r.stderr, /usage:/)
      assert.deepEqual(tree(root), before)
    })
})

describe('output and check paths are guarded before any side effect', () => {
  const outside = () => realpathSync(makeRoot({}))
  test('--out below a symlinked parent with missing children creates nothing outside', () => {
    const root = bareRepo()
    const away = outside()
    const base = realpathSync(makeRoot({}))
    symlinkSync(away, join(base, 'link'))
    const r = run(['--root', root, '--out', join(base, 'link', 'new', 'deeper', 'inventory.json')])
    assert.equal(r.status, 1)
    assert.match(r.stderr, /symlink in path/)
    assert.deepEqual(readdirSync(away), [], 'nothing was created through the link')
  })
  test('--out onto a symlink, a FIFO and a directory is refused and leaves them alone', () => {
    const root = bareRepo()
    const base = realpathSync(makeRoot({}))
    const target = join(base, 'target.json')
    writeFileSync(target, 'precious')
    symlinkSync(target, join(base, 'link.json'))
    execFileSync('mkfifo', [join(base, 'pipe.json')])
    mkdirSync(join(base, 'dir.json'))
    for (const name of ['link.json', 'pipe.json', 'dir.json']) {
      const r = run(['--root', root, '--out', join(base, name)])
      assert.equal(r.status, 1, name)
    }
    assert.equal(readTextSync(target), 'precious')
  })
  test('--check reads the committed files the guarded way: a FIFO or a symlink is drift, never a hang or an outside read', () => {
    const root = generatedRepo()
    const inv = join(root, 'tests/qa/inventory/inventory.json')
    const away = outside()
    writeFileSync(join(away, 'copy.json'), readBytesSync(inv))
    rmSync(inv)
    execFileSync('mkfifo', [inv])
    const fifo = run(['--root', root, '--check'])
    assert.equal(fifo.status, 1)
    assert.match(fifo.stderr, /unreadable|not a regular file/)
    rmSync(inv)
    symlinkSync(join(away, 'copy.json'), inv)
    const link = run(['--root', root, '--check'])
    assert.equal(link.status, 1)
    assert.match(link.stderr, /symlink/)
  })
})

describe('writePair: validate, stage, replace, roll back', () => {
  const pairIn = () => {
    const dir = realpathSync(makeRoot({}))
    const a = join(dir, 'a.json')
    const b = join(dir, 'b.json')
    writeFileSync(a, 'old-a')
    writeFileSync(b, 'old-b')
    return { dir, a, b }
  }
  const leftovers = (dir) => readdirSync(dir).filter((f) => /\.(tmp|recover)$/.test(f))
  const failing = (match) => ({
    ...realOps,
    rename: (from, to) => {
      if (match(from, to)) throw new Error('injected rename failure')
      return renameSync(from, to)
    }
  })

  test('a failure at the second rename restores the first artifact and leaves no temp or recovery file', () => {
    const { dir, a, b } = pairIn()
    assert.throws(
      () =>
        writePair(
          [
            [a, 'new-a'],
            [b, 'new-b']
          ],
          failing((from, to) => to === b)
        ),
      /injected rename failure/
    )
    assert.equal(readTextSync(a), 'old-a')
    assert.equal(readTextSync(b), 'old-b')
    assert.deepEqual(leftovers(dir), [])
  })
  test('a failure while staging the second file changes nothing', () => {
    const { dir, a, b } = pairIn()
    let opens = 0
    const ops = {
      ...realOps,
      fsync: (fd) => {
        if (++opens === 3) throw new Error('injected fsync failure')
        return realOps.fsync(fd)
      }
    }
    assert.throws(
      () =>
        writePair(
          [
            [a, 'new-a'],
            [b, 'new-b']
          ],
          ops
        ),
      /injected fsync failure/
    )
    assert.equal(readTextSync(a), 'old-a')
    assert.equal(readTextSync(b), 'old-b')
    assert.deepEqual(leftovers(dir), [])
  })
  test('plugin-strings facts keep keysKnown when the key count cannot be resolved', () => {
    const root = bareRepo()
    put(
      root,
      'packages/ui/zz-partial/src/client/strings.ts',
      `import { base } from './base'\nexport const NS = 'zz'\nexport const en = { k: 'v', ...base }\n`
    )
    const out = join(makeRoot({}), 'x.json')
    assert.equal(run(['--root', root, '--out', out]).status, 0)
    const items = Object.values(JSON.parse(readTextSync(out)).layers).flatMap((l) => l.items)
    const item = items.find((i) => i.id === 'plugin-strings:packages/ui/zz-partial/src/client/strings.ts')
    assert.ok(item, 'the partial namespace stays an item')
    assert.equal(item.facts.keysKnown, 1)
    assert.equal(item.facts.keys, null)
  })
  test('a failing close removes the staged temp file (writeAtomic)', () => {
    const { dir, a } = pairIn()
    const ops = {
      ...realOps,
      close: (fd) => {
        realOps.close(fd)
        throw new Error('injected close failure')
      }
    }
    assert.throws(() => writeAtomic(a, 'new-a', ops), /injected close failure/)
    assert.equal(readTextSync(a), 'old-a')
    assert.deepEqual(leftovers(dir), [])
  })
  test('a failing close while staging a pair changes nothing and leaves no temp file', () => {
    const { dir, a, b } = pairIn()
    let closes = 0
    const ops = {
      ...realOps,
      close: (fd) => {
        realOps.close(fd)
        if (++closes === 2) throw new Error('injected close failure')
      }
    }
    assert.throws(
      () =>
        writePair(
          [
            [a, 'new-a'],
            [b, 'new-b']
          ],
          ops
        ),
      /injected close failure/
    )
    assert.equal(readTextSync(a), 'old-a')
    assert.equal(readTextSync(b), 'old-b')
    assert.deepEqual(leftovers(dir), [])
  })
  test('a failed open stops before any rename', () => {
    const { dir, a, b } = pairIn()
    const ops = {
      ...realOps,
      open: (path, ...rest) => {
        if (String(path).startsWith(b)) throw new Error('injected open failure')
        return realOps.open(path, ...rest)
      }
    }
    assert.throws(
      () =>
        writePair(
          [
            [a, 'new-a'],
            [b, 'new-b']
          ],
          ops
        ),
      /injected open failure/
    )
    assert.equal(readTextSync(a), 'old-a')
    assert.deepEqual(leftovers(dir), [])
  })
  test('short writes are continued until every byte is on disk; a write that makes no progress fails', () => {
    const { dir, a, b } = pairIn()
    const text = 'x'.repeat(1000)
    const trickle = { ...realOps, write: (fd, buf, at, len) => realOps.write(fd, buf, at, Math.min(len, 7)) }
    writePair(
      [
        [a, text],
        [b, 'two']
      ],
      trickle
    )
    assert.equal(readTextSync(a), text)
    const stuck = { ...realOps, write: () => 0 }
    assert.throws(
      () =>
        writePair(
          [
            [a, 'zzz'],
            [b, 'yyy']
          ],
          stuck
        ),
      /short write/
    )
    assert.equal(readTextSync(a), text, 'the earlier bytes survive')
    assert.deepEqual(leftovers(dir), [])
  })
  test('a failed rollback is reported and the old content is kept on disk for recovery', () => {
    const { dir, a, b } = pairIn()
    const ops = failing((from, to) => to === b || (to === a && from.endsWith('.recover')))
    assert.throws(
      () =>
        writePair(
          [
            [a, 'new-a'],
            [b, 'new-b']
          ],
          ops
        ),
      (error) => /ROLLBACK FAILED/.test(error.message) && /kept in .*\.recover/.test(error.message)
    )
    const kept = leftovers(dir).filter((f) => f.endsWith('.recover'))
    assert.equal(kept.length, 1, 'the recovery copy of the replaced file is still there')
    assert.equal(readTextSync(join(dir, kept[0])), 'old-a')
  })
  test('targets are validated before anything is staged: a symlinked parent, a directory, a FIFO', () => {
    const { dir, a } = pairIn()
    const away = realpathSync(makeRoot({}))
    symlinkSync(away, join(dir, 'link'))
    assert.throws(
      () =>
        writePair([
          [a, 'n'],
          [join(dir, 'link', 'x', 'b.json'), 'n']
        ]),
      /symlink in path/
    )
    assert.equal(readTextSync(a), 'old-a')
    assert.deepEqual(readdirSync(away), [])
    mkdirSync(join(dir, 'd.json'))
    assert.throws(() =>
      writePair([
        [a, 'n'],
        [join(dir, 'd.json'), 'n']
      ])
    )
    execFileSync('mkfifo', [join(dir, 'p.json')])
    assert.throws(() =>
      writePair([
        [a, 'n'],
        [join(dir, 'p.json'), 'n']
      ])
    )
    assert.equal(readTextSync(a), 'old-a')
    assert.deepEqual(leftovers(dir), [])
  })
})

describe('snapshot: the whole manifest is verified again right before publishing', () => {
  const tagsOf = (root) => join(root, 'tests/qa/inventory/edge-tags.json')
  const once = (fn) => {
    let done = false
    return () => {
      if (!done) fn()
      done = true
    }
  }
  test('edge-tags changed after the snapshot: retried, and the result carries the new hash', () => {
    const root = bareRepo()
    const tags = JSON.parse(readTextSync(tagsOf(root)))
    const before = loadEdgeTags(root).hash
    const { result } = prepare(root, {
      afterSnapshot: once(() => writeFileSync(tagsOf(root), formatJson({ ...tags, note: 'edited' })))
    })
    assert.notEqual(result.inventory.edgeTags.hash, before)
    assert.equal(result.inventory.edgeTags.hash, loadEdgeTags(root).hash)
  })
  test('a denominator that appears after the snapshot is retried and then included', () => {
    const root = bareRepo()
    const { result } = prepare(root, {
      afterSnapshot: once(() =>
        put(root, 'tests/qa/layers/api/denominator.json', json(denominatorDoc('api', [])))
      )
    })
    assert.ok(result.inventory.denominators.api)
  })
  test('a listed source file that appears after the snapshot is retried and then included', () => {
    const root = bareRepo()
    const { result } = prepare(root, {
      afterSnapshot: once(() =>
        put(root, 'tests/regression/cases/ZZ-new.json', json({ id: 'REG-ZZ-NEW', kind: 'fix', area: 'a' }))
      )
    })
    assert.ok(result.recs.regression.items.some((i) => i.id === 'regression:REG-ZZ-NEW'))
  })
  test('a source that keeps changing is an error and nothing is published', () => {
    const root = bareRepo()
    const tags = JSON.parse(readTextSync(tagsOf(root)))
    let n = 0
    const out = join(realpathSync(makeRoot({})), 'inv.json')
    let stderr = ''
    const status = main(
      ['--root', root, '--out', out],
      { out: () => {}, err: (t) => (stderr += t) },
      { afterSnapshot: () => writeFileSync(tagsOf(root), formatJson({ ...tags, note: `edit ${++n}` })) }
    )
    assert.equal(status, 1)
    assert.match(stderr, /between the snapshot and publishing/)
    assert.equal(existsSync(out), false)
  })
})
