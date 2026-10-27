// The real readers of contract files, one entry per reader the bounded-reader selftest drives. `limit`
// is the reader's own ceiling, so the test can build a file one byte over it. `call(file)` reads `file`
// through the reader; a refusal is an exception, an accepted file returns. Modules load on demand, so
// the parent test process imports none of them. `content` is a file valid for THAT caller's own contract
// (default GOOD), and `expected` is what the caller must return for it: Buffers are compared as text, the
// rest as JSON. A positive control that only says "no reader error" is not a control.
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const QA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const load = (rel) => import(path.join(QA, rel))
const MiB = 1024 * 1024
const sharedLimit = 1024
export const GOOD = '{"a":1}\n'
const A = { a: 1 }
const MANIFEST = {
  id: 'QA-INFRA-x',
  itemIds: ['i'],
  requirement: 'r',
  oracle: { source: 's', ref: 'r', invariant: 'i' },
  edgeTags: [],
  targets: ['local'],
  effects: [],
  prerequisites: [],
  assertionIds: [],
  redProof: null,
  legacyIds: []
}
const HARNESS_MANIFEST = {
  id: 'QA-HARNESS-x-happy',
  itemIds: ['x'],
  requirement: 'r',
  oracle: { source: 's', ref: 'r', invariant: 'i' },
  edgeTags: ['happy'],
  targets: ['local'],
  effects: { reads: [], writes: [], mail: false, model: false, containers: false },
  prerequisites: [],
  assertionIds: ['a.b'],
  redProof: null,
  legacyIds: []
}
const COVERAGE = {
  incomplete: false,
  revision: 'r1',
  items: [{ item: 'i', kind: 'k', cells: { c: 'covered:A' } }]
}

export const CALLERS = {
  'shared sync': {
    expected: GOOD,
    limit: sharedLimit,
    call: async (file) =>
      (await load('lib/bounded-reader.mjs')).readBoundedSync(file, { maxBytes: sharedLimit })
  },
  'shared async': {
    expected: GOOD,
    limit: sharedLimit,
    call: async (file) =>
      (await load('lib/bounded-reader.mjs')).readBoundedAsync(file, { maxBytes: sharedLimit })
  },
  'lib readContract': {
    expected: A,
    limit: MiB,
    call: async (file) => (await load('lib/denominator.mjs')).readContract(file)
  },
  'lib readRegularFile (fsafe)': {
    expected: GOOD,
    limit: 32 * MiB,
    call: async (file) => (await load('lib/fsafe.mjs')).readRegularFile(file)
  },
  'api readJson': {
    expected: A,
    limit: 32 * MiB,
    call: async (file) => (await load('layers/api/io.mjs')).readJson(file)
  },
  'flows readJson': {
    expected: A,
    limit: 32 * MiB,
    call: async (file) => (await load('layers/flows/util.mjs')).readJson(file)
  },
  'infra readRegular': {
    expected: GOOD,
    limit: 32 * MiB,
    call: async (file) => (await load('layers/infra/lib/harness.mjs')).readRegular(file)
  },
  'infra readManifests': {
    content: JSON.stringify([MANIFEST]),
    expected: ['QA-INFRA-x'],
    limit: 32 * MiB,
    call: async (file) =>
      (await load('layers/infra/index.mjs')).readManifests(path.dirname(file)).map((m) => m.id)
  },
  'cms readJsonFile': {
    expected: A,
    limit: 32 * MiB,
    call: async (file) => (await load('layers/cms/lib/kit.mjs')).readJsonFile(file)
  },
  'ui readJson': {
    expected: A,
    limit: 8 * MiB,
    call: async (file) => (await load('layers/ui/artifacts.mjs')).readJson(file, { root: path.dirname(file) })
  },
  'mail readRegularBytes': {
    expected: GOOD,
    limit: 32 * MiB,
    call: async (file) => (await load('layers/mail/common.mjs')).readRegularBytes(file)
  },
  'static readRegular': {
    expected: GOOD,
    limit: 32 * MiB,
    call: async (file) => (await load('layers/static/lib/common.mjs')).readRegular(file)
  },
  'inventory readSource': {
    expected: GOOD,
    limit: 64 * MiB,
    call: async (file) =>
      (await load('inventory/extractors/common.mjs')).readSource(path.dirname(file), path.basename(file)).text
  },
  'inventory loadMap': {
    expected: A,
    limit: 32 * MiB,
    call: async (file) => (await load('inventory/affected.mjs')).loadMap(file)
  },
  'harness coverageRun': {
    content: JSON.stringify(COVERAGE),
    expected: {
      incomplete: false,
      revision: 'r1',
      cells: { covered: 1, na: 0, open: 0, allPass: 1, anyFail: 0, anyEnv: 0, notRun: 0 },
      items: [{ item: 'i', kind: 'k', pass: 1, fail: 0, env: 0, pending: 0, notRun: 0, na: 0, open: 0 }]
    },
    limit: 32 * MiB,
    call: async (file) =>
      (await load('layers/harness/report.mjs')).coverageRun([{ id: 'A', verdict: 'PASS' }], file)
  },
  'flows scanArtifacts': {
    // A file the scan reads and finds a leak in: the result exists only if the content was really read.
    content: 'cookie: tracy_sess=abcdefghijkl1234\n',
    expected: [{ file: 'hostile.json', kinds: ['session-cookie'] }],
    limit: 64 * MiB,
    call: async (file) => {
      const hits = (await load('layers/flows/index.mjs')).scanArtifacts(path.dirname(file))
      const bad = hits.filter((h) => h.kinds.some((k) => k.startsWith('unscannable')))
      if (bad.length) throw new Error(bad.map((h) => h.kinds.join(',')).join('; '))
      return hits
    }
  },
  'cms checkSecrets': {
    expected: '1 file(s) scanned, no secret-like content',
    limit: 32 * MiB,
    call: async (file) => {
      const dir = path.dirname(file)
      const ctx = { dataRoot: path.dirname(dir), params: { dir: path.basename(dir) } }
      const result = await (await load('layers/cms/specs/release-data.mjs')).checkSecrets(ctx)
      if (!result.ok) throw new Error(result.detail)
      return result.detail
    }
  },
  'ui readIfExists': {
    expected: GOOD,
    limit: 8 * MiB,
    call: async (file) => {
      const text = await (await load('layers/ui/artifacts.mjs')).readIfExists(file, {
        root: path.dirname(file)
      })
      if (text === null) throw new Error('treated as absent')
      return text
    }
  },
  'harness loadManifests': {
    content: JSON.stringify([HARNESS_MANIFEST]),
    expected: ['hostile:QA-HARNESS-x-happy:r'],
    limit: 32 * MiB,
    call: async (file) =>
      (await load('layers/harness/index.mjs'))
        .loadManifests(path.dirname(file))
        .map((m) => `${m.family}:${m.id}:${m.requirement}`)
  }
}
