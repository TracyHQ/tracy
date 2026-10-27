// Each extractor on a small fixture: right items, right provenance (hashes of what was read), and a
// negative control proving that an omission or a parser fault is reported, never silently complete.
import assert from 'node:assert/strict'
import { after, describe, test } from 'node:test'
import { execFileSync } from 'node:child_process'
import { readdirSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_ROOT, runExtractor } from '../extractors/common.mjs'
import { def as agentTools } from '../extractors/agent-tools.mjs'
import { def as apiDoors } from '../extractors/api-doors.mjs'
import { def as composeServices } from '../extractors/compose-services.mjs'
import { def as e2eJourneys } from '../extractors/e2e-journeys.mjs'
import { def as fence } from '../extractors/fence.mjs'
import { def as gates } from '../extractors/gates.mjs'
import { def as hostRoutes } from '../extractors/host-routes.mjs'
import { def as languages } from '../extractors/languages.mjs'
import { def as legacyFindings } from '../extractors/legacy-findings.mjs'
import { def as legacyPlan } from '../extractors/legacy-plan.mjs'
import { def as mailKinds } from '../extractors/mail-kinds.mjs'
import { MAX_SQL_BYTES, def as migrations, tablesOf } from '../extractors/migrations.mjs'
import { def as modeMatrix } from '../extractors/mode-matrix.mjs'
import { def as packages } from '../extractors/packages.mjs'
import { def as pluginStrings } from '../extractors/plugin-strings.mjs'
import { def as regression } from '../extractors/regression.mjs'
import { def as scripts } from '../extractors/scripts.mjs'
import { def as stories } from '../extractors/stories.mjs'
import { def as uiSwitches } from '../extractors/ui-switches.mjs'
import { def as webStrings } from '../extractors/web-strings.mjs'
import { cleanup, json, makeRoot, sha } from './helpers.mjs'

after(cleanup)

const ids = (rec) => rec.items.map((i) => i.id).sort()
const LANG_FILE = `export const INTERFACE_LANGUAGES = Object.freeze([{ id: 'en', label: 'English', shown: true }, { id: 'vi', label: 'Viet', shown: true }].map((l) => Object.freeze(l)))\n`
const LANG_PATH = 'packages/core/tracy-core/src/interface-languages/index.mjs'

const APP = `import { Hono } from 'hono'
import { thingRoutes } from './thing/route.js'
import { register } from './helper.js'
export function buildApp() {
  const app = new Hono()
  app.get('/a', (c) => c.text('a'))
  app.route('/', thingRoutes({}))
  app.route('/p', thingRoutes({}))
  register(app)
  return app
}
`
const THING = `import { Hono } from 'hono'
export function thingRoutes() {
  const app = new Hono()
  app.post('/b/:id', (c) => c.text('b'))
  app.on(['GET', 'PUT'], '/c', (c) => c.text('c'))
  app.get('/zzz', (c) => c.text('z'))
  return app
}
`
const SNAP = json({
  recorded: 'fx',
  public: {
    paths: { '/a': { get: {} }, '/b/{id}': { post: {}, parameters: [] }, '/empty': { parameters: [] } }
  },
  internal: { paths: { '/c': { get: {}, put: {} } } }
})

/** name, def, files, expected ids, extra assertions, and one negative control ({ files, status }). */
const MIG = 'apps/tracy-web/src/db/migrations'

const CASES = [
  {
    name: 'gates',
    def: gates,
    files: {
      'scripts/check-all.ts': `const GATES: readonly Gate[] = [\n  { name: 'lint', script: 'check-lint.ts' },\n  { name: 'docs', script: 'x.ts', args: ['--check'] }\n]\n`
    },
    expect: ['gate:docs', 'gate:lint'],
    negative: {
      files: {
        'scripts/check-all.ts': `const GATES = [{ name: 'lint', script: 'a.ts' }, { name: nameOf(), script: 'b.ts' }]\n`
      },
      check: (r) => assert.ok(r.unresolved.some((u) => u.kind === 'gate-not-static'))
    },
    fault: { files: { 'scripts/check-all.ts': 'const OTHER = []\n' }, reason: /GATES constant not found/ }
  },
  {
    name: 'languages',
    def: languages,
    files: { [LANG_PATH]: LANG_FILE },
    expect: ['language:en', 'language:vi'],
    negative: {
      files: {
        [LANG_PATH]: `import { more } from './x.js'\nexport const INTERFACE_LANGUAGES = [{ id: 'en', label: 'E', shown: true }, ...more]\n`
      },
      check: (r) => assert.ok(r.unresolved.some((u) => /spread/.test(u.detail)))
    },
    fault: { files: { [LANG_PATH]: 'export const X = 1\n' }, reason: /INTERFACE_LANGUAGES not found/ }
  },
  {
    name: 'ui-switches',
    def: uiSwitches,
    files: {
      'packages/core/tracy-core/src/ui-switches/catalogue.json': json({
        areas: [{ id: 'a', groups: ['g'] }],
        groups: [{ id: 'g' }],
        switches: [
          { id: 's1', group: 'g', defaultOn: true },
          { id: 's2', group: 'zz', defaultOn: false }
        ]
      })
    },
    expect: ['ui-switch:s1', 'ui-switch:s2'],
    negative: {
      files: {
        'packages/core/tracy-core/src/ui-switches/catalogue.json': json({
          areas: [],
          groups: [],
          switches: [{ id: 's1', group: 'nope' }]
        })
      },
      check: (r) => assert.ok(r.unresolved.some((u) => u.kind === 'switch-group-unknown'))
    },
    fault: {
      files: { 'packages/core/tracy-core/src/ui-switches/catalogue.json': json({ groups: [] }) },
      reason: /not an array/
    }
  },
  {
    name: 'web-strings',
    def: webStrings,
    files: {
      'apps/tracy-web/src/lib/i18n/strings.js': `export const en = Object.freeze({ 'a.b': 'x', 'c.d': 'y' })\n`,
      [LANG_PATH]: LANG_FILE,
      'apps/tracy-web/src/lib/i18n/locales/vi.json': json({ 'a.b': 'z' })
    },
    expect: ['web-string:a.b@en', 'web-string:a.b@vi', 'web-string:c.d@en', 'web-string:c.d@vi'],
    extra: (r) => {
      assert.equal(r.items.find((i) => i.id === 'web-string:c.d@vi').present, false)
      assert.equal(r.items.find((i) => i.id === 'web-string:a.b@vi').present, true)
    },
    negative: {
      files: {
        'apps/tracy-web/src/lib/i18n/strings.js': `export const en = Object.freeze({ 'a.b': 'x' })\n`,
        [LANG_PATH]: LANG_FILE
      },
      check: (r) => assert.ok(r.unresolved.some((u) => u.kind === 'locale-file-unreadable')),
      status: 'incomplete'
    },
    fault: {
      files: { 'apps/tracy-web/src/lib/i18n/strings.js': 'export const other = 1\n', [LANG_PATH]: LANG_FILE },
      reason: /en not found/
    }
  },
  {
    name: 'plugin-strings',
    def: pluginStrings,
    files: {
      'packages/ui/a/src/client/strings.ts': `export const NS = 'a-ns'\nexport const en = { 'k.1': 'one', 'k.2': 'two' } as const\n`,
      'packages/site/b/src/client/strings.ts': `import { base } from './base'\nexport const NS = 'b-ns'\nexport const en = { ...base, 'k.3': 'three' } as const\n`
    },
    expect: [
      'plugin-strings:packages/site/b/src/client/strings.ts',
      'plugin-strings:packages/ui/a/src/client/strings.ts'
    ],
    extra: (r) => {
      assert.equal(r.items.find((i) => /ui\/a/.test(i.id)).keys, 2)
      assert.ok(
        r.unresolved.some((u) => /spread/.test(u.detail)),
        'imported spread must be reported'
      )
    },
    negative: {
      files: { 'packages/ui/a/src/client/strings.ts': 'export const other = 1\n' },
      check: (r) => assert.ok(r.unresolved.some((u) => u.kind === 'strings-file-not-static'))
    },
    fault: { files: { 'README.md': 'x' }, reason: /ENOENT|no such file/i }
  },
  {
    name: 'stories',
    def: stories,
    files: {
      'packages/dev/tracy-design/src/a.stories.tsx': `export default { title: 'A' }\nexport const One = {}\nexport const Two = {}\n`
    },
    expect: [
      'story-export:packages/dev/tracy-design/src/a.stories.tsx#One',
      'story-export:packages/dev/tracy-design/src/a.stories.tsx#Two',
      'story-file:packages/dev/tracy-design/src/a.stories.tsx'
    ],
    extra: (r) => assert.equal(r.items.find((i) => i.kind === 'story-file').exports, 2),
    negative: {
      files: {
        'packages/dev/tracy-design/src/a.stories.tsx': `export const { a, b } = obj\nexport const Ok = {}\n`
      },
      check: (r) => assert.ok(r.unresolved.some((u) => u.kind === 'story-export-destructured')),
      status: 'incomplete'
    },
    fault: { files: { 'packages/dev/tracy-design/src/readme.md': 'x' }, reason: /zero items/, zero: true }
  },
  {
    name: 'agent-tools',
    def: agentTools,
    files: {
      'apps/tracy-web/src/api-reference/sources/agent-tools.json': json({
        tools: [{ name: 't1', plugin: 'p' }],
        otherTools: [{ name: 'o1' }],
        surfaces: [{ id: 's1', platform: 'wordpress' }]
      })
    },
    expect: ['agent-surface:s1', 'agent-tool:o1', 'agent-tool:t1'],
    negative: {
      files: {
        'apps/tracy-web/src/api-reference/sources/agent-tools.json': json({
          tools: [],
          otherTools: [],
          surfaces: []
        })
      },
      check: () => {},
      status: 'incomplete'
    },
    fault: {
      files: { 'apps/tracy-web/src/api-reference/sources/agent-tools.json': '{ not json' },
      reason: /invalid JSON/
    }
  },
  {
    name: 'mode-matrix',
    def: modeMatrix,
    files: {
      'config/mode-matrix.json': json({
        roles: [{ id: 'r1' }, { id: 'r2' }],
        platforms: [{ id: 'p1' }],
        tools: [
          { id: 'row1', tools: ['bash', 'read'] },
          { id: 'row2', tools: ['bash'] }
        ],
        skills: [{ id: 'sk1' }]
      })
    },
    expect: [
      'mode-preset:r1+p1',
      'mode-preset:r2+p1',
      'mode-skill:sk1',
      'mode-tool-row:row1',
      'mode-tool-row:row2'
    ],
    extra: (r) => assert.equal(r.notes.distinctToolNames, 2),
    negative: {
      files: { 'config/mode-matrix.json': json({ roles: [], platforms: [], tools: [], skills: [] }) },
      check: () => {},
      status: 'incomplete'
    },
    fault: { files: { 'config/mode-matrix.json': json({ roles: [] }) }, reason: /not an array/ }
  },
  {
    name: 'fence',
    def: fence,
    files: {
      'packages/tools/tracy-subprocess-docker/src/route.mjs': `export const FS_TOOL_ARGS = Object.freeze({\n  read: { paths: ['file_path'], content: [] },\n  write: { paths: ['file_path'], content: ['content'] }\n})\nexport const WORKDIR_ARG = Object.freeze({ bash: 'workdir' })\n`
    },
    expect: ['fence-fs:read', 'fence-fs:write', 'fence-workdir:bash'],
    negative: {
      files: {
        'packages/tools/tracy-subprocess-docker/src/route.mjs': `const shared = buildTable()\nexport const FS_TOOL_ARGS = Object.freeze({ read: { paths: ['p'] }, ...shared })\nexport const WORKDIR_ARG = Object.freeze({})\n`
      },
      check: (r) => assert.ok(r.unresolved.some((u) => /spread/.test(u.detail)))
    },
    fault: {
      files: { 'packages/tools/tracy-subprocess-docker/src/route.mjs': 'export const X = 1\n' },
      reason: /FS_TOOL_ARGS not found/
    }
  },
  {
    name: 'compose-services',
    def: composeServices,
    files: {
      'deploy/compose.yml': 'services:\n  db:\n    image: x\n  seed-init:\n    image: y\n    restart: "no"\n',
      'deploy/compose.macos.yml':
        'services:\n  db:\n    ports: !override ["1:1"]\n  dns-host:\n    image: z\n    environment: !reset null\n',
      'deploy/compose.server.yml': 'services:\n  db:\n    image: x\n',
      'deploy/compose.emdash-business.local.yml': 'services:\n  db:\n    image: x\n'
    },
    expect: ['compose-service:db', 'compose-service:dns-host', 'compose-service:seed-init'],
    extra: (r) => {
      assert.equal(r.items.find((i) => i.service === 'seed-init').lifecycle, 'one-shot-init')
      assert.equal(r.items.find((i) => i.service === 'db').lifecycle, 'permanent')
      assert.equal(r.items.find((i) => i.service === 'dns-host').addedBy, 'deploy/compose.macos.yml')
      assert.deepEqual(r.items.find((i) => i.service === 'db').overriddenIn, [
        'deploy/compose.macos.yml',
        'deploy/compose.server.yml',
        'deploy/compose.emdash-business.local.yml'
      ])
    },
    negative: {
      files: { 'deploy/compose.yml': 'services:\n  db:\n    image: x\n' },
      check: (r) => assert.ok(r.unresolved.some((u) => u.kind === 'override-file-unreadable')),
      status: 'incomplete'
    },
    fault: { files: { 'deploy/compose.yml': 'services: [unclosed\n' }, reason: /invalid YAML/ }
  },
  {
    name: 'scripts',
    def: scripts,
    files: {
      'package.json': json({ scripts: { qa: 'node x', build: 'tsc' } }),
      'scripts/one.mjs': '//\n',
      'scripts/lib/two.mjs': '//\n',
      'scripts/test/three.test.mjs': '//\n',
      'scripts/notes.md': 'ignored',
      'packages/fleet/tracy-fleet-operation/scripts/hooks/run.sh': '#!/bin/sh\n'
    },
    expect: [
      'fleet-script:packages/fleet/tracy-fleet-operation/scripts/hooks/run.sh',
      'npm-script:build',
      'npm-script:qa',
      'script-file:scripts/lib/two.mjs',
      'script-file:scripts/one.mjs',
      'script-file:scripts/test/three.test.mjs'
    ],
    extra: (r) => {
      assert.equal(r.items.find((i) => i.file === 'scripts/one.mjs').depth, 'top')
      assert.equal(r.items.find((i) => i.file === 'scripts/lib/two.mjs').role, 'library')
      assert.equal(r.items.find((i) => i.file === 'scripts/test/three.test.mjs').role, 'test')
    },
    negative: { files: { 'package.json': json({ name: 'x' }) }, check: () => {}, throws: /no scripts/ },
    fault: { files: { 'package.json': json({ scripts: {} }) }, reason: /ENOENT|no such file/i }
  },
  {
    name: 'mail-kinds',
    def: mailKinds,
    files: {
      'apps/tracy-web/src/mail/letters/team.js': `export const TEAM_LETTERS = Object.freeze({\n  'team.invited': () => 1,\n  'team.left': () => 2\n})\n`,
      'apps/tracy-web/src/mail/letters/comments.js': `export const COMMENT_LETTERS = Object.freeze({ 'comment.added': () => 3 })\n`,
      'apps/tracy-web/src/mail/letters/index.js': `const LETTERS = Object.freeze({ ...TEAM_LETTERS, ...COMMENT_LETTERS })\n`,
      'apps/tracy-web/src/mail/emails.js': '//\n',
      'apps/tracy-web/src/mail/templates/footer.html': '<p>x</p>'
    },
    expect: [
      'mail-html:apps/tracy-web/src/mail/templates/footer.html',
      'mail-kind:comment.added',
      'mail-kind:team.invited',
      'mail-kind:team.left',
      'mail-renderer:apps/tracy-web/src/mail/emails.js'
    ],
    negative: {
      files: {
        'apps/tracy-web/src/mail/letters/team.js': `const K = 'x'\nexport const TEAM_LETTERS = Object.freeze({ [K]: () => 1 })\n`,
        'apps/tracy-web/src/mail/letters/comments.js': `export const COMMENT_LETTERS = Object.freeze({ 'a': () => 3 })\n`,
        'apps/tracy-web/src/mail/letters/index.js': `const L = { ...TEAM_LETTERS, ...EXTRA_LETTERS }\n`,
        'apps/tracy-web/src/mail/templates/f.html': 'x'
      },
      check: (r) => {
        assert.ok(r.unresolved.some((u) => u.kind === 'letter-key-not-static'))
        assert.ok(r.unresolved.some((u) => u.kind === 'letters-index-spreads-unknown-table'))
      },
      status: 'incomplete'
    },
    fault: {
      files: {
        'apps/tracy-web/src/mail/letters/team.js': 'export const NOPE = 1\n',
        'apps/tracy-web/src/mail/letters/comments.js': 'export const NOPE = 1\n',
        'apps/tracy-web/src/mail/letters/index.js': '//\n'
      },
      reason: /letters table|zero items/,
      zero: true
    }
  },
  {
    name: 'migrations',
    def: migrations,
    files: {
      [`${MIG}/001-identity.sql`]: 'create table account (id text primary key);\n',
      [`${MIG}/002-book.sql`]:
        '-- create table commented_out (x int)\ncreate table if not exists "book" (id int);\nalter table account add column name text;\n',
      [`${MIG}/002-b.sql`]: 'alter table if exists only book add column title text;\n'
    },
    expect: ['migration:001-identity.sql', 'migration:002-b.sql', 'migration:002-book.sql'],
    extra: (r) => {
      const book = r.items.find((i) => i.id === 'migration:002-book.sql')
      assert.deepEqual(book.creates, ['book'], 'a commented-out statement is not read')
      assert.deepEqual(book.alters, ['account'])
      assert.equal(book.sharesNumber, true)
      assert.equal(r.items.find((i) => i.number === '001').sharesNumber, false)
      assert.deepEqual(r.notes.sharedNumbers, { '002': ['002-b.sql', '002-book.sql'] })
      assert.equal(r.notes.highestNumber, '002')
    },
    negative: {
      files: {
        [`${MIG}/001-identity.sql`]: 'create table a (id int);\n',
        [`${MIG}/notes.sql`]: 'select 1;\n'
      },
      check: (r) => assert.ok(r.unresolved.some((u) => u.kind === 'migration-name-unrecognised'))
    },
    fault: { files: { [`${MIG}/README.md`]: 'no migration here\n' }, reason: /zero items/, zero: true }
  },
  {
    name: 'regression',
    def: regression,
    files: {
      'tests/regression/cases/REG-001-a.json': json({
        id: 'REG-001',
        kind: 'fix',
        area: 'sites/x',
        run: 'x',
        needs: ['stand'],
        flaky_model: false
      }),
      'tests/regression/cases/REG-002-b.json': json({
        id: 'REG-002',
        kind: 'feat',
        area: 'chat',
        needs: [],
        flaky_model: true
      })
    },
    expect: ['regression:REG-001', 'regression:REG-002'],
    extra: (r) => {
      assert.equal(r.items[0].hasRun, true)
      assert.equal(r.items[1].hasRun, false)
      assert.equal(r.items[1].flakyModel, true)
    },
    negative: {
      files: { 'tests/regression/cases/REG-001-a.json': json({ kind: 'fix' }) },
      check: (r) => assert.ok(r.unresolved.some((u) => u.kind === 'case-without-id')),
      status: 'incomplete'
    },
    fault: { files: { 'tests/regression/cases/REG-009.json': '{ broken' }, reason: /invalid JSON/ }
  },
  {
    name: 'e2e-journeys',
    def: e2eJourneys,
    files: {
      'tests/e2e-dev/run.mjs': `const JOURNEYS = [\n  { id: 'J0', perCms: false },\n  { id: 'J2c', perCms: true, notCovered: 'import has no source' }\n]\n`,
      'tests/e2e-dev/journeys/J0.test.mjs': '//\n',
      'tests/e2e-dev/journeys/J9.test.mjs': '//\n'
    },
    expect: ['journey:J0', 'journey:J2c'],
    extra: (r, rec) => {
      assert.equal(r.items.find((i) => i.journey === 'J2c').hasFile, false)
      assert.match(r.items.find((i) => i.journey === 'J2c').notCovered, /no source/)
      assert.ok(rec.unresolved.some((u) => u.kind === 'journey-file-unregistered' && u.detail === 'J9'))
    },
    negative: {
      files: {
        'tests/e2e-dev/run.mjs': `const JOURNEYS = [{ id: 'J0' }, build()]\n`,
        'tests/e2e-dev/journeys/J0.test.mjs': '//\n'
      },
      check: (r) => assert.ok(r.unresolved.length > 0)
    },
    fault: { files: { 'tests/e2e-dev/run.mjs': 'const other = []\n' }, reason: /JOURNEYS not found/ }
  },
  {
    name: 'host-routes',
    def: hostRoutes,
    files: {
      'apps/tracy-host/src/app.js': `import { Hono } from 'hono'\nexport function buildApp() {\n  const app = new Hono()\n  app.get('/health', health())\n  app.use('/_host/*', mw)\n  app.post('/_host/provision', provision())\n  app.get('/_host/jobs/:id', job())\n  return app\n}\n`
    },
    expect: ['host-route:GET /_host/jobs/{id}', 'host-route:GET /health', 'host-route:POST /_host/provision'],
    negative: {
      files: {
        'apps/tracy-host/src/app.js': `import { Hono } from 'hono'\nconst app = new Hono()\napp.get('/ok', h)\napp.post(PATHS.x, h)\n`
      },
      check: (r) => assert.ok(r.unresolved.some((u) => u.kind === 'route-path-not-static')),
      status: 'incomplete'
    },
    fault: {
      files: { 'apps/tracy-host/src/app.js': 'export const x = 1\n' },
      reason: /zero items/,
      zero: true
    }
  },
  {
    name: 'api-doors',
    def: apiDoors,
    files: {
      'apps/tracy-web/api-reference.snapshot.json': SNAP,
      'apps/tracy-web/src/app.js': APP,
      'apps/tracy-web/src/thing/route.js': THING,
      'apps/tracy-web/src/helper.js': `export function register(r) {\n  r.get('/h', (c) => c.text('h'))\n}\n`
    },
    expect: [
      'api-door:internal:GET /c',
      'api-door:internal:PUT /c',
      'api-door:public:GET /a',
      'api-door:public:POST /b/{id}'
    ],
    extra: (r, rec) => {
      assert.ok(
        r.items.every((i) => i.inCode),
        'every snapshot door has a code route'
      )
      const missing = rec.unresolved
        .filter((u) => u.kind === 'route-missing-from-snapshot')
        .map((u) => u.detail)
        .sort()
      assert.deepEqual(missing, [
        'GET /h',
        'GET /p/c',
        'GET /p/zzz',
        'GET /zzz',
        'POST /p/b/{id}',
        'PUT /p/c'
      ])
      assert.ok(
        rec.unresolved.some((u) => u.kind === 'snapshot-path-without-method' && /\/empty/.test(u.detail))
      )
      assert.equal(rec.notes.public.pathsDeclared, 3)
      assert.equal(rec.notes.public.pathsWithMethods, 2)
    },
    negative: {
      files: {
        'apps/tracy-web/api-reference.snapshot.json': SNAP,
        'apps/tracy-web/src/app.js': `import { Hono } from 'hono'\nimport { thingRoutes } from './thing/route.js'\nconst app = new Hono()\nconst prefix = pick()\napp.route(prefix, thingRoutes())\napp.get('/a', h)\n`,
        'apps/tracy-web/src/thing/route.js': THING,
        'apps/tracy-web/src/other/route.js': 'export const x = 1\n'
      },
      check: (r) => {
        assert.ok(r.unresolved.some((u) => u.kind === 'mount-prefix-not-static'))
        assert.ok(r.unresolved.some((u) => u.kind === 'route-file-not-reached-from-app'))
        assert.ok(r.unresolved.some((u) => u.kind === 'snapshot-door-without-code-route'))
      },
      status: 'incomplete'
    },
    fault: {
      files: {
        'apps/tracy-web/api-reference.snapshot.json': json({ public: {}, internal: {} }),
        'apps/tracy-web/src/app.js': 'export const x = 1\n'
      },
      reason: /paths missing/
    }
  },
  {
    name: 'packages',
    def: packages,
    files: {
      'packages/ui/foo/package.json': json({ name: '@tracy/dsh-foo', version: '1.0.0' }),
      'packages/ui/foo/cordis.patch.yml':
        "- insert:\n    - id: foo\n      name: '@tracy/dsh-foo'\n- id: webserver\n  disabled: true\n",
      'packages/bundle/tracy-native/package.json': json({
        name: '@tracy/dsh-native-bundle',
        dsh: { bundle: {} },
        dependencies: { '@tracy/dsh-foo': 'workspace:^' }
      }),
      'packages/bundle/tracy-cowork/package.json': json({
        name: '@tracy/dsh-cowork-bundle',
        dsh: { bundle: {} },
        dependencies: {}
      }),
      'packages/fleet/tracy-fleet-operation/dsh/profile/package.json': json({
        name: 'dsh-profile-native',
        dsh: { profile: { bundles: ['@tracy/dsh-native-bundle'] } }
      }),
      'packages/fleet/tracy-fleet-operation/dsh/profile/cordis.patch.yml':
        '- id: webserver\n  config:\n    port: 1\n'
    },
    expect: [
      'dsh-plugin:packages/fleet/tracy-fleet-operation/dsh/profile',
      'dsh-plugin:packages/ui/foo',
      'package:packages/bundle/tracy-cowork',
      'package:packages/bundle/tracy-native',
      'package:packages/fleet/tracy-fleet-operation/dsh/profile',
      'package:packages/ui/foo'
    ],
    extra: (r, rec) => {
      const foo = r.items.find((i) => i.id === 'package:packages/ui/foo')
      assert.deepEqual(foo.declaredInBundles, ['@tracy/dsh-native-bundle'])
      assert.equal(foo.hasCordis, true)
      assert.deepEqual(r.items.find((i) => i.id === 'dsh-plugin:packages/ui/foo').disabledIds, ['webserver'])
      assert.deepEqual(r.items.find((i) => i.id === 'package:packages/bundle/tracy-native').namedByProfiles, [
        'dsh-profile-native'
      ])
      assert.ok(
        rec.unresolved.some((u) => u.kind === 'runtime-graph-not-collected'),
        'runtime graph must be reported as not collected'
      )
    },
    negative: {
      files: {
        'packages/ui/foo/package.json': json({ name: 'x' }),
        'packages/ui/foo/cordis.patch.yml': 'not: a list\n'
      },
      check: () => {},
      throws: /not a list/
    },
    fault: {
      files: { 'packages/ui/foo/package.json': json({ name: 'x' }) },
      reason: /bundle-manifest-missing|bundle manifest|unresolved structure/
    }
  },
  {
    name: 'legacy-plan',
    def: legacyPlan,
    files: {
      'tests/qa/inventory/legacy/audit-plan.json': json({
        source: { repo: 'r', revision: 'abc' },
        items: [
          { id: 'QA-SSR-001', group: 'SSR', level: 'main', parent: null, title: 't', section: 's' },
          { id: 'QA-REF-001-01', group: 'REF', level: 'sub', parent: 'QA-REF-001', title: 'u', section: 's' }
        ]
      })
    },
    expect: ['audit-item:QA-REF-001-01', 'audit-item:QA-SSR-001'],
    extra: (r, rec) => assert.deepEqual([rec.notes.main, rec.notes.sub], [1, 1]),
    negative: {
      files: { 'tests/qa/inventory/legacy/audit-plan.json': json({ items: [] }) },
      check: () => {},
      status: 'incomplete'
    },
    fault: { files: { 'tests/qa/inventory/legacy/audit-plan.json': json({ nope: 1 }) }, reason: /no items/ }
  },
  {
    name: 'legacy-findings',
    def: legacyFindings,
    files: {
      'tests/qa/inventory/legacy/audit-findings.json': json({
        source: { repo: 'r' },
        findings: [
          {
            id: 'F-S1-001',
            shard: 'S1',
            severity: 'P1',
            items: ['QA-SSR-006'],
            title: 't',
            evidence: ['a.js:1'],
            repro: null,
            fixRefs: [],
            ledger: 'ledger-S1.md',
            line: 3
          }
        ]
      })
    },
    expect: ['audit-finding:F-S1-001'],
    extra: (r) => assert.equal(r.items[0].repro, null),
    negative: {
      files: { 'tests/qa/inventory/legacy/audit-findings.json': json({ findings: [] }) },
      check: () => {},
      status: 'incomplete'
    },
    fault: {
      files: { 'tests/qa/inventory/legacy/audit-findings.json': json({ nope: 1 }) },
      reason: /no findings/
    }
  }
]

describe('every extractor reads its fixture with provenance', () => {
  for (const c of CASES) {
    test(`${c.name}: items and provenance`, () => {
      const root = makeRoot(c.files)
      const rec = runExtractor(c.def, root)
      assert.equal(rec.status, c.expectIncomplete ? 'incomplete' : rec.status)
      assert.deepEqual(ids({ items: rec.items }), c.expect)
      for (const key of ['sourcePath', 'sourceHash', 'revision', 'extractionKind', 'items', 'unresolved'])
        assert.ok(key in rec, `record has ${key}`)
      assert.match(rec.sourceHash, /^[0-9a-f]{64}$/)
      assert.ok(rec.inputs.length > 0)
      for (const input of rec.inputs) {
        const full = Object.entries(c.files).find(([p]) => p === input.path)
        assert.ok(full, `input ${input.path} is a fixture file`)
        assert.equal(input.hash, sha(full[1]), `hash of ${input.path} matches the bytes read`)
      }
      assert.equal(rec.revision, null, 'a directory outside git has no revision, and says so')
      c.extra?.(rec, rec)
    })

    test(`${c.name}: negative control (omission or parser fault is visible)`, () => {
      const n = c.negative
      const root = makeRoot(n.files)
      if (n.throws) {
        assert.throws(() => c.def.extract(root), n.throws)
        const rec = runExtractor(c.def, root)
        assert.equal(rec.status, 'incomplete')
        assert.match(rec.incompleteReason, /extractor failed/)
        return
      }
      const rec = runExtractor(c.def, root)
      n.check(rec)
      if (n.status) assert.equal(rec.status, n.status)
      // Whatever the fault, the record must say it: unresolved entries or an incomplete status.
      assert.ok(
        rec.status === 'incomplete' || rec.unresolved.length > 0,
        'a faulty source is never complete and silent'
      )
    })

    test(`${c.name}: a broken source throws or yields zero items -> incomplete, never silently empty`, () => {
      const f = c.fault
      const root = makeRoot(f.files)
      const rec = runExtractor(c.def, root)
      assert.equal(rec.status, 'incomplete')
      assert.match(rec.incompleteReason, /extractor failed|zero items|unresolved structure/)
      if (f.reason && !f.zero)
        assert.match(rec.incompleteReason + rec.unresolved.map((u) => u.kind).join(' '), f.reason)
    })
  }

  test('a missing source file marks the extractor incomplete', () => {
    const root = makeRoot({ 'README.md': 'x' })
    for (const c of CASES) {
      const rec = runExtractor(c.def, root)
      assert.equal(rec.status, 'incomplete', `${c.name} on an empty root`)
      assert.deepEqual(rec.items, [])
    }
  })

  test('the case table covers all 20 extractors', () => {
    assert.equal(new Set(CASES.map((c) => c.name)).size, 20)
  })

  test('a duplicate id inside a source is reported and the source is incomplete', () => {
    const root = makeRoot({
      'tests/regression/cases/A.json': json({ id: 'REG-001', kind: 'fix', area: 'a' }),
      'tests/regression/cases/B.json': json({ id: 'REG-001', kind: 'fix', area: 'b' })
    })
    const rec = runExtractor(regression, root)
    assert.equal(rec.status, 'incomplete')
    assert.ok(rec.unresolved.some((u) => u.kind === 'duplicate-id' && u.detail === 'regression:REG-001'))
    assert.equal(rec.items.length, 1, 'the duplicate is not counted twice')
  })
})

describe('migrations: what the migrator would not apply, or would choke on, is named', () => {
  const good = { [`${MIG}/001-a.sql`]: 'create table a (id int);\n' }
  test('a .sql in a subfolder is not an item: migrate() lists the folder itself only', () => {
    const rec = runExtractor(
      migrations,
      makeRoot({ ...good, [`${MIG}/old/000-x.sql`]: 'create table x (id int);\n' })
    )
    assert.deepEqual(ids(rec), ['migration:001-a.sql'])
    assert.ok(
      rec.unresolved.some((u) => u.kind === 'migration-in-subfolder' && /old\/000-x\.sql/.test(u.detail))
    )
    assert.equal(rec.status, 'complete', 'a file the migrator never applies hides no item')
  })
  test('a symlinked .sql is applied by the migrator and not read here: the source is incomplete', () => {
    const root = makeRoot({ ...good, 'elsewhere/002-b.sql': 'create table b (id int);\n' })
    symlinkSync(join(root, 'elsewhere/002-b.sql'), join(root, MIG, '002-b.sql'))
    const rec = runExtractor(migrations, root)
    assert.deepEqual(ids(rec), ['migration:001-a.sql'], 'nothing is read through the link')
    assert.ok(rec.unresolved.some((u) => u.kind === 'symlink-skipped' && u.blocksComplete))
    assert.equal(rec.status, 'incomplete')
  })
  test('a FIFO named like a migration is reported without being opened', () => {
    const root = makeRoot(good)
    execFileSync('mkfifo', [join(root, MIG, '002-pipe.sql')])
    const rec = runExtractor(migrations, root)
    assert.deepEqual(ids(rec), ['migration:001-a.sql'])
    assert.ok(rec.unresolved.some((u) => u.kind === 'migration-not-a-regular-file'))
    assert.equal(rec.status, 'incomplete')
  })
  test('a symlinked migrations folder is refused, not followed', () => {
    const root = makeRoot({
      'real/001-a.sql': 'create table a (id int);\n',
      'apps/tracy-web/src/db/keep': ''
    })
    symlinkSync(join(root, 'real'), join(root, MIG))
    const rec = runExtractor(migrations, root)
    assert.equal(rec.status, 'incomplete')
    assert.match(rec.incompleteReason, /extractor failed/)
    assert.deepEqual(rec.items, [])
  })
  test('an oversized file keeps its item and hash, loses its table names, and says so', () => {
    const big = `create table big (id int);\n${'-- pad\n'.repeat(Math.ceil(MAX_SQL_BYTES / 7) + 1)}`
    const rec = runExtractor(migrations, makeRoot({ ...good, [`${MIG}/002-big.sql`]: big }))
    const item = rec.items.find((i) => i.id === 'migration:002-big.sql')
    assert.equal(item.tablesRead, false)
    assert.deepEqual(item.creates, [])
    assert.ok(rec.unresolved.some((u) => u.kind === 'migration-too-large'))
    assert.ok(rec.inputs.some((i) => i.path.endsWith('002-big.sql') && i.hash === sha(big)))
  })
  test('an empty file and an unreadable (directory) entry never pass silently', () => {
    const rec = runExtractor(migrations, makeRoot({ ...good, [`${MIG}/002-empty.sql`]: '  \n' }))
    assert.ok(rec.unresolved.some((u) => u.kind === 'migration-empty'))
    const dirRoot = makeRoot({ ...good, [`${MIG}/003-dir.sql/inner.txt`]: 'x' })
    assert.deepEqual(ids(runExtractor(migrations, dirRoot)), ['migration:001-a.sql'])
  })
  test('tablesOf reads quoted, schema-qualified and guarded names, once each, and skips comments', () => {
    assert.deepEqual(
      tablesOf(
        'CREATE TABLE IF NOT EXISTS "public.site" (x int); create table site_name (y int);\n/* create table ghost (z int) */\nALTER TABLE ONLY site ADD x int; alter table site add y int;'
      ),
      { creates: ['public.site', 'site_name'], alters: ['site'] }
    )
  })
  test('the real tree: every file the migrator applies is an item, in name order', () => {
    const rec = runExtractor(migrations)
    const onDisk = readdirSync(join(DEFAULT_ROOT, MIG))
      .filter((f) => f.endsWith('.sql'))
      .sort()
    assert.deepEqual(
      rec.items.map((i) => i.id),
      onDisk.map((f) => `migration:${f}`)
    )
    assert.equal(rec.status, 'complete')
  })
})

describe('route scanning edge cases', () => {
  const run = (files) => runExtractor(hostRoutes, makeRoot({ 'apps/tracy-host/src/app.js': files }))
  test('template and const paths resolve; computed ones stay unresolved', () => {
    const rec = run(
      `import { Hono } from 'hono'\nconst MOUNT = '/x'\nconst app = new Hono()\napp.get(\`\${MOUNT}/y\`, h)\napp.get(MOUNT + '/z', h)\napp.get(compute(), h)\nexport default app\n`
    )
    assert.deepEqual(ids(rec), ['host-route:GET /x/y', 'host-route:GET /x/z'])
    assert.equal(rec.unresolved.filter((u) => u.kind === 'route-path-not-static').length, 1)
  })
  test('`.on` with method and path arrays expands every pair', () => {
    const rec = run(
      `import { Hono } from 'hono'\nconst app = new Hono()\napp.on(['GET', 'POST'], ['/a', '/b'], h)\nexport default app\n`
    )
    assert.deepEqual(ids(rec), [
      'host-route:GET /a',
      'host-route:GET /b',
      'host-route:POST /a',
      'host-route:POST /b'
    ])
  })
  test('a sub-app mounted with a prefix inside one factory gets that prefix', () => {
    const rec = run(
      `import { Hono } from 'hono'\nexport function make() {\n  const app = new Hono()\n  const sub = new Hono()\n  sub.get('/leaf', h)\n  app.route('/mid', sub)\n  return app\n}\nconst root = new Hono()\nroot.route('/top', make())\nexport default root\n`
    )
    assert.deepEqual(ids(rec), ['host-route:GET /top/mid/leaf'])
  })
  test('a helper that receives the app from a package or cannot be found is unresolved, not skipped', () => {
    const rec = run(
      `import { Hono } from 'hono'\nimport { mount } from 'some-package'\nconst app = new Hono()\napp.get('/a', h)\nmount(app)\nexport default app\n`
    )
    assert.deepEqual(ids(rec), ['host-route:GET /a'])
    assert.ok(rec.unresolved.some((u) => u.kind === 'helper-registration'))
    assert.equal(rec.status, 'incomplete')
  })
  test('a mount cycle stops at a bounded depth instead of looping', () => {
    const rec = runExtractor(
      hostRoutes,
      makeRoot({
        'apps/tracy-host/src/app.js': `import { Hono } from 'hono'\nimport { again } from './app.js'\nexport function again() {\n  const app = new Hono()\n  app.route('/r', again())\n  app.get('/x', h)\n  return app\n}\nconst root = new Hono()\nroot.route('/', again())\nexport default root\n`
      })
    )
    assert.ok(rec.unresolved.some((u) => u.kind === 'mount-depth-exceeded'))
  })
})
