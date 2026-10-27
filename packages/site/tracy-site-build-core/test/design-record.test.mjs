/**
 * `docs/agents/design.json` — the design system a site WEARS, written by the build's `check` stage
 * and read by the agent's context and the adherence check (ADR 0023).
 *
 *   node --test packages/site/tracy-site-build-core/test/design-record.test.mjs
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import {
  DESIGN_FILE,
  designRecord,
  effectiveDesignOf,
  pullDesign,
  readDesign,
  recordingDesign,
  refreshDesign,
  tokensOf,
  writeDesign
} from '../src/host/design-record.mjs'

const CSS = `/* Apple — tokens */
:root {
  --bg: #ffffff;
  --fg: #1d1d1f;
  --accent: #0071e3; /* the blue */
  --font-body: "SF Pro Text", system-ui, sans-serif;
  --space-4: 16px;
}
.x { --bg: #000; }
`

const ids = new Set(['apple', 'airbnb', 'ja-kinetic'])
const job = (over = {}) => ({
  job: 'j1',
  inspiration: 'apple',
  platform: 'wordpress',
  targetSiteKey: 'demo.tracy.test',
  ...over
})

test('tokensOf keeps the first declaration of each custom property and drops comments', () => {
  assert.deepEqual(tokensOf(CSS), {
    '--bg': '#ffffff',
    '--fg': '#1d1d1f',
    '--accent': '#0071e3',
    '--font-body': '"SF Pro Text", system-ui, sans-serif',
    '--space-4': '16px'
  })
})

test('effectiveDesignOf: a brand, a registry plan, a catalogue inspiration, a template with and without a profile design, none', () => {
  assert.deepEqual(effectiveDesignOf(job({ inspiration: 'brand:acme.com' }), ids), {
    id: 'brand:acme.com',
    source: 'brand'
  })
  // The registry road builds the design the plan says — the fallback's, when it fell back.
  assert.deepEqual(
    effectiveDesignOf(
      job({
        inspiration: 'stripe',
        designPlan: {
          requestedDesign: 'stripe',
          effectiveDesign: 'apple',
          design: { id: 'apple', source: 'catalog' }
        }
      }),
      ids
    ),
    { id: 'apple', source: 'catalog' }
  )
  assert.deepEqual(effectiveDesignOf(job(), ids), { id: 'apple', source: 'catalog' })
  // A template press: the profile sealing the release names what it wears, or nothing.
  assert.deepEqual(
    effectiveDesignOf(
      job({
        inspiration: 'tracy-apple',
        designPlan: { workflow: 'template', design: { id: 'apple', source: 'catalog' } }
      }),
      ids
    ),
    { id: 'apple', source: 'catalog' }
  )
  assert.deepEqual(
    effectiveDesignOf(
      job({ inspiration: 'ja-kinetic', designPlan: { workflow: 'template', design: null } }),
      ids
    ),
    { id: null, source: 'template' }
  )
  assert.deepEqual(
    effectiveDesignOf(job({ inspiration: 'tracy-business', designPlan: { workflow: 'template' } }), ids),
    {
      id: null,
      source: 'template'
    }
  )
  assert.deepEqual(effectiveDesignOf(job({ inspiration: 'nowhere' }), ids), { id: null, source: 'none' })
})

test('designRecord reads the tokens from the first directory that has the system, and says where from', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'design-record-'))
  const systems = path.join(dir, 'systems')
  mkdirSync(path.join(systems, 'apple'), { recursive: true })
  writeFileSync(path.join(systems, 'apple', 'tokens.css'), CSS)
  const record = designRecord({
    job: job(),
    ids,
    root: path.join(dir, 'site'),
    tokensDirs: [path.join(dir, 'missing'), systems],
    names: new Map([['apple', 'Apple']]),
    wroteBy: 'build:j1'
  })
  assert.equal(record.schemaVersion, 'tracy-site-design/v1')
  assert.deepEqual(
    {
      id: record.id,
      source: record.source,
      name: record.name,
      bound: record.bound,
      platform: record.platform
    },
    { id: 'apple', source: 'catalog', name: 'Apple', bound: true, platform: 'wordpress' }
  )
  assert.equal(record.tokens['--accent'], '#0071e3')
  assert.equal(record.tokensFrom, path.join(systems, 'apple', 'tokens.css'))
  assert.equal(record.wroteBy, 'build:j1')
  assert.match(record.writtenAt, /^\d{4}-\d{2}-\d{2}T/)
})

test('a brand reads its tokens from Brand/<host>/ in the site folder; a system with no tokens on disk is bound with tokens null', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'design-record-'))
  mkdirSync(path.join(root, 'Brand', 'acme.com'), { recursive: true })
  writeFileSync(path.join(root, 'Brand', 'acme.com', 'tokens.css'), CSS)
  const brand = designRecord({
    job: job({ inspiration: 'brand:acme.com' }),
    ids,
    root,
    tokensDirs: [],
    names: new Map()
  })
  assert.equal(brand.source, 'brand')
  assert.equal(brand.tokens['--bg'], '#ffffff')
  const bare = designRecord({
    job: job(),
    ids,
    root,
    tokensDirs: [path.join(root, 'nope')],
    names: new Map()
  })
  assert.equal(bare.bound, true)
  assert.equal(bare.tokens, null)
  assert.equal(bare.tokensFrom, null)
  assert.equal(bare.name, 'apple', 'no catalogue name known: the id stands in')
  const none = designRecord({
    job: job({ inspiration: 'nowhere' }),
    ids,
    root,
    tokensDirs: [],
    names: new Map()
  })
  assert.deepEqual(
    { id: none.id, source: none.source, bound: none.bound, tokens: none.tokens },
    { id: null, source: 'none', bound: false, tokens: null }
  )
})

test('writeDesign / readDesign round-trip at docs/agents/design.json; readDesign is null when absent or unreadable', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'design-record-'))
  assert.equal(readDesign(root), null)
  const record = designRecord({ job: job(), ids, root, tokensDirs: [], names: new Map() })
  writeDesign(root, record)
  assert.equal(DESIGN_FILE, path.join('docs', 'agents', 'design.json'))
  assert.deepEqual(readDesign(root), JSON.parse(readFileSync(path.join(root, DESIGN_FILE), 'utf8')))
  writeFileSync(path.join(root, DESIGN_FILE), '{not json')
  assert.equal(readDesign(root), null)
})

test('recordingDesign writes the record only when the wrapped check is done, and never changes its answer', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'design-record-'))
  const deps = { root, ids, seeder: null, names: new Map() }
  const failed = recordingDesign(deps, async () => ({ status: 'failed', detail: 'no' }))
  assert.deepEqual(await failed(job()), { status: 'failed', detail: 'no' })
  assert.equal(readDesign(root), null)
  const done = recordingDesign(deps, async () => ({ status: 'done', detail: 'ok' }))
  assert.deepEqual(await done(job()), { status: 'done', detail: 'ok' })
  assert.equal(readDesign(root)?.id, 'apple')
  assert.equal(readDesign(root)?.wroteBy, 'build:j1')
})

test('refreshDesign rewrites the record for the system the site now wears, keeping the allow list', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'design-record-'))
  const systems = path.join(dir, 'systems')
  for (const id of ['apple', 'airbnb']) {
    mkdirSync(path.join(systems, id), { recursive: true })
    writeFileSync(
      path.join(systems, id, 'tokens.css'),
      CSS.replace('#0071e3', id === 'airbnb' ? '#ff5a5f' : '#0071e3')
    )
  }
  const root = path.join(dir, 'site')
  writeDesign(root, {
    ...designRecord({ job: job(), ids, root, tokensDirs: [systems], names: new Map() }),
    allow: [{ prop: 'color', value: 'rgb(1, 2, 3)' }]
  })
  const after = refreshDesign(root, {
    id: 'airbnb',
    tokensDirs: [systems],
    names: new Map([['airbnb', 'Airbnb']]),
    wroteBy: 'theme.style'
  })
  assert.equal(after.id, 'airbnb')
  assert.equal(after.name, 'Airbnb')
  assert.equal(after.tokens['--accent'], '#ff5a5f')
  assert.deepEqual(after.allow, [{ prop: 'color', value: 'rgb(1, 2, 3)' }])
  assert.equal(readDesign(root)?.id, 'airbnb')
  // Refreshing a folder that never had a record still leaves one: the site wears this now.
  const fresh = path.join(dir, 'fresh')
  assert.equal(
    refreshDesign(fresh, { id: 'apple', tokensDirs: [systems], names: new Map(), wroteBy: 'theme.style' }).id,
    'apple'
  )
})

test('refreshDesign keeps a quickstart’s own values when theme.style re-applies its style; another style replaces it', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'design-record-'))
  const systems = path.join(dir, 'systems')
  mkdirSync(path.join(systems, 'apple'), { recursive: true })
  writeFileSync(path.join(systems, 'apple', 'tokens.css'), CSS)
  const root = path.join(dir, 'site')
  const quickstart = {
    schemaVersion: 'tracy-site-design/v1',
    id: 'tracy-business',
    source: 'quickstart',
    name: 'Tracy Business',
    bound: true,
    platform: 'wordpress',
    tokens: { '--accent': '#14483A' },
    tokensFrom: 'contracts/tracy-business/wp7/1.2.0.design.json',
    manifestDesign: { id: 'tracy-business', source: 'quickstart' }
  }
  writeDesign(root, quickstart)
  const same = refreshDesign(root, {
    id: 'tracy-business',
    tokensDirs: [systems],
    names: new Map(),
    wroteBy: 'theme.style'
  })
  assert.equal(same.source, 'quickstart')
  assert.deepEqual(same.tokens, { '--accent': '#14483A' }, 'no catalogue tokens.css holds these values')
  assert.equal(same.tokensFrom, quickstart.tokensFrom)
  assert.equal(same.wroteBy, 'theme.style')
  assert.equal(readDesign(root)?.source, 'quickstart')
  const other = refreshDesign(root, {
    id: 'apple',
    tokensDirs: [systems],
    names: new Map(),
    wroteBy: 'theme.style'
  })
  assert.equal(other.source, 'catalog')
  assert.equal(other.id, 'apple')
})

test('a quickstart look is recorded from the plan itself: its name, its tokens and the file they were resolved from', () => {
  const planned = {
    id: 'tracy-business',
    source: 'quickstart',
    name: 'Tracy Business',
    tokensFrom:
      'packages/cms/tracy-joomla-quickstart/template-patches/tracy_business/css/styles/tracy-business.css',
    tokens: { '--bg': '#F5F3EE', '--accent': '#14483A' }
  }
  const j = job({ inspiration: 'tracy-business', platform: 'joomla', designPlan: { design: planned } })
  assert.deepEqual(effectiveDesignOf(j, ids), { id: 'tracy-business', source: 'quickstart' })
  const record = designRecord({
    job: j,
    ids,
    root: mkdtempSync(path.join(tmpdir(), 'design-record-')),
    tokensDirs: [],
    names: new Map()
  })
  assert.deepEqual(
    {
      id: record.id,
      source: record.source,
      name: record.name,
      bound: record.bound,
      platform: record.platform
    },
    { id: 'tracy-business', source: 'quickstart', name: 'Tracy Business', bound: true, platform: 'joomla' }
  )
  assert.deepEqual(record.tokens, planned.tokens)
  assert.equal(record.tokensFrom, planned.tokensFrom)
  assert.deepEqual(record.manifestDesign, { id: 'tracy-business', source: 'quickstart' })
})

// ADR 0023, "Addendum 29/09": tracy-web owns the record; the build sends it there, and the site
// folder's file is a copy the agent's lane refreshes from tracy-web.
test('recordingDesign also sends the record to tracy-web through putDesign — best effort, answer unchanged', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'design-record-'))
  const systems = path.join(dir, 'systems')
  mkdirSync(path.join(systems, 'apple'), { recursive: true })
  writeFileSync(path.join(systems, 'apple', 'tokens.css'), CSS)
  const root = path.join(dir, 'site')
  /** @type {any[]} */
  const sent = []
  const deps = {
    root,
    ids,
    seeder: { command: path.join(dir, 'seed-wordpress'), args: [] },
    names: new Map([['apple', 'Apple']]),
    putDesign: async (siteKey, record) => {
      sent.push({ siteKey, record })
    }
  }
  // The seeder's data dir is `<dir>/data`; point it at the fixture systems.
  mkdirSync(path.join(dir, 'data'), { recursive: true })
  const { symlinkSync } = await import('node:fs')
  symlinkSync(systems, path.join(dir, 'data', 'systems'))
  const done = recordingDesign(deps, async () => ({ status: 'done', detail: 'ok' }))
  assert.deepEqual(await done(job()), { status: 'done', detail: 'ok' })
  assert.equal(sent.length, 1)
  assert.equal(sent[0].siteKey, 'demo.tracy.test')
  assert.deepEqual(Object.keys(sent[0].record).sort(), [
    'id',
    'manifestDesign',
    'name',
    'platform',
    'source',
    'tokens',
    'tokensFrom'
  ])
  assert.equal(sent[0].record.tokens['--accent'], '#0071e3')
  // tracy-web down: the build is not failed, the local copy is still written.
  const root2 = path.join(dir, 'site2')
  const failing = recordingDesign(
    {
      ...deps,
      root: root2,
      putDesign: async () => {
        throw new Error('down')
      }
    },
    async () => ({ status: 'done' })
  )
  assert.equal((await failing(job())).status, 'done')
  assert.equal(readDesign(root2)?.id, 'apple')
  // A job naming no site sends nothing.
  sent.length = 0
  await recordingDesign(deps, async () => ({ status: 'done' }))(job({ targetSiteKey: undefined }))
  assert.equal(sent.length, 0)
})

test('pullDesign rewrites the local copy from tracy-web’s record, keeps it when tracy-web has none or does not answer', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'design-record-'))
  writeDesign(root, {
    ...designRecord({ job: job(), ids, root, tokensDirs: [], names: new Map() }),
    allow: [{ prop: 'color', value: 'rgb(1, 2, 3)' }]
  })
  // No answer: keep.
  assert.equal(await pullDesign(root, async () => null), 'kept')
  // An answer with no record (a site built before tracy-web kept one): keep the local truth.
  assert.equal(await pullDesign(root, async () => ({ design: null })), 'kept')
  assert.equal(readDesign(root)?.id, 'apple')
  // A record: the copy follows it, keeping what only the folder knows (the allow list).
  const got = await pullDesign(root, async () => ({
    design: {
      id: 'airbnb',
      name: 'Airbnb',
      source: 'catalog',
      platform: 'wordpress',
      tokens: { '--accent': '#ff385c' },
      tokensFrom: 'tracy-web:design-tokens.json',
      updatedAt: '2026-09-29T10:00:00.000Z'
    }
  }))
  assert.equal(got, 'pulled')
  const now = readDesign(root)
  assert.deepEqual(
    {
      id: now?.id,
      bound: now?.bound,
      accent: now?.tokens?.['--accent'],
      wroteBy: now?.wroteBy,
      writtenAt: now?.writtenAt
    },
    {
      id: 'airbnb',
      bound: true,
      accent: '#ff385c',
      wroteBy: 'tracy-web',
      writtenAt: '2026-09-29T10:00:00.000Z'
    }
  )
  assert.deepEqual(now?.allow, [{ prop: 'color', value: 'rgb(1, 2, 3)' }])
  // A record saying none: the copy says none too.
  await pullDesign(root, async () => ({
    design: {
      id: null,
      name: null,
      source: 'template',
      platform: 'joomla',
      tokens: null,
      tokensFrom: null,
      updatedAt: '2026-09-29T11:00:00.000Z'
    }
  }))
  assert.deepEqual({ id: readDesign(root)?.id, bound: readDesign(root)?.bound }, { id: null, bound: false })
})

// ADR 0023, "Addendum 29/09 (afternoon)": a quickstart's tokens reach tracy-web exactly as the plan
// carried them — tracy-web keeps them as the original, it has no other copy.
test('recordingDesign sends a quickstart look to tracy-web with the plan’s tokens, untouched', async () => {
  const tokens = { '--bg': '#F5F3EE', '--accent': '#14483A', '--font-body': '"Archivo", sans-serif' }
  /** @type {any[]} */
  const sent = []
  const done = recordingDesign(
    {
      root: mkdtempSync(path.join(tmpdir(), 'design-record-')),
      ids,
      putDesign: async (siteKey, record) => {
        sent.push({ siteKey, record })
      }
    },
    async () => ({ status: 'done' })
  )
  await done(
    job({
      inspiration: 'tracy-business',
      platform: 'joomla',
      designPlan: {
        design: {
          id: 'tracy-business',
          source: 'quickstart',
          name: 'Tracy Business',
          tokens,
          tokensFrom: 'packages/cms/tracy-joomla-quickstart/contracts/tracy-business/j6/1.2.0.design.json'
        }
      }
    })
  )
  assert.equal(sent.length, 1)
  assert.deepEqual(
    { id: sent[0].record.id, source: sent[0].record.source, name: sent[0].record.name },
    { id: 'tracy-business', source: 'quickstart', name: 'Tracy Business' }
  )
  assert.deepEqual(sent[0].record.tokens, tokens)
  assert.match(sent[0].record.tokensFrom, /1\.2\.0\.design\.json$/)
})

// Measured 29/09 on dev: the lane answered 409 NO_ACTOR, `designVia` returned the status nobody
// read, and the build was green with tracy-web holding no record. A refusal now leaves a trace:
// one log line, and a fact on the check stage (job.json), the answer otherwise unchanged.
test('a record tracy-web did not take leaves a log line and a fact; one it took leaves neither', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'design-record-'))
  /** @type {string[]} */
  const said = []
  const refused = recordingDesign(
    {
      root,
      ids,
      putDesign: async () => ({ status: 409, code: 'NO_ACTOR' }),
      warn: (line) => said.push(line)
    },
    async () => ({ status: 'done', detail: 'ok' })
  )
  assert.deepEqual(await refused(job()), {
    status: 'done',
    detail: 'ok',
    facts: { designRecord: 'not sent: 409 NO_ACTOR' }
  })
  assert.deepEqual(said, ['[site-design] build record not sent: 409 NO_ACTOR demo.tracy.test'])

  said.length = 0
  const thrown = recordingDesign(
    {
      root,
      ids,
      putDesign: async () => {
        throw new Error('connect ECONNREFUSED')
      },
      warn: (line) => said.push(line)
    },
    async () => ({ status: 'done', facts: { pages: 3 } })
  )
  assert.deepEqual((await thrown(job())).facts, { pages: 3, designRecord: 'not sent: connect ECONNREFUSED' })
  assert.equal(said.length, 1)

  said.length = 0
  const taken = recordingDesign(
    { root, ids, putDesign: async () => ({ status: 200 }), warn: (line) => said.push(line) },
    async () => ({ status: 'done', detail: 'ok' })
  )
  assert.deepEqual(await taken(job()), { status: 'done', detail: 'ok' })
  assert.deepEqual(said, [])
})
