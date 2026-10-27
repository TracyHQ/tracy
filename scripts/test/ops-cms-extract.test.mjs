/**
 * The extractor, against trees written out by hand.
 *
 * WHY FIXTURES AND NOT THE REPOSITORY. The cases worth proving are the ones a real checkout will
 * not conveniently have: a capability catalogue that is absent because the ref predates it, a
 * content map truncated mid-write, a stage array somebody reformatted across three lines. Each of
 * those has a different correct answer, and the difference between them is the entire product.
 *
 * The companion gate `infra-contracts` (scripts/check-infra-contracts.ts) does the opposite job — it runs the REAL modules in
 * this repo and asserts the parsers agree with them. Neither test is sufficient alone: fixtures
 * prove the branches, parity proves the parsers describe reality.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  extractBases,
  extractCapabilities,
  extractContracts,
  extractDesigns,
  extractPresets,
  extractQuestions,
  extractStages,
  extractTools,
  parseStages
} from '../ops-cms/extract.mjs'
import { STATUS, validate } from '../ops-cms/schema.mjs'
import { objectTree } from '../ops-cms/tree.mjs'

const QUICKSTARTS = 'packages/fleet/tracy-fleet-operation/scripts/provision/quickstarts.json'
const CAPS = 'packages/site/tracy-site-build-joomla/src/host/capabilities.json'
const J_STAGES = 'packages/site/tracy-site-build-joomla/src/host/stages.mjs'
const W_STAGES = 'packages/site/tracy-site-build-wordpress/src/host/stages.mjs'
const CONTRACTS = 'packages/cms/tracy-joomla-quickstart/contracts'
const MATRIX = 'config/mode-matrix.json'

// ── absence is not one thing ─────────────────────────────────────────────────────────────────

test('a missing quickstart catalogue is unsupported, not an empty list', async () => {
  const s = await extractBases(objectTree({}))
  assert.equal(s.status, STATUS.UNSUPPORTED)
  assert.match(s.reason, /quickstarts\.json/)
  assert.equal(s.data, null, 'no data — an empty array would read as "there are no bases"')
})

test('a truncated catalogue is an error naming the file, never silence', async () => {
  const s = await extractBases(objectTree({ [QUICKSTARTS]: '{ "tracy-apple/j6": { "version": ' }))
  assert.equal(s.status, STATUS.ERROR)
  assert.match(s.reason, /did not parse as JSON/)
  assert.match(s.reason, /quickstarts\.json/)
})

test('a capability catalogue absent on every CMS makes the section unsupported', async () => {
  const s = await extractCapabilities(objectTree({}))
  assert.equal(s.status, STATUS.UNSUPPORTED)
  for (const cms of ['joomla', 'wordpress', 'emdash']) {
    assert.equal(s.data.byCms[cms].status, STATUS.UNSUPPORTED)
    assert.ok(s.data.byCms[cms].reason, `${cms} must say why`)
  }
})

// ── what a good read looks like ──────────────────────────────────────────────────────────────

test('a base keeps its hashes and the download HOST, never the URL', async () => {
  const tree = objectTree({
    [QUICKSTARTS]: JSON.stringify({
      'tracy-apple/j6': {
        version: '1.1.0',
        contract: 'tracy-apple/j6/1.1.0',
        webroot: {
          file: 'w.tar.gz',
          bytes: 10,
          sha256: 'a'.repeat(64),
          url: 'https://example.test/x/y?sig=SECRET'
        },
        cowork: { file: 'pkg.zip', version: '0.14.0', bytes: 2, sha256: 'b'.repeat(64) }
      }
    })
  })
  const s = await extractBases(tree)
  assert.equal(s.status, STATUS.OK)
  const [base] = s.data.bases
  assert.equal(base.version, '1.1.0')
  assert.equal(base.artifacts[0].sha256, 'a'.repeat(64))
  assert.equal(base.artifacts[0].host, 'example.test')
  const json = JSON.stringify(s)
  assert.equal(json.includes('SECRET'), false, 'a signed download URL must never reach the browser')
  assert.equal(json.includes('/x/y'), false, 'nor its path')
})

test('a provider that is pending keeps the sentence explaining why', async () => {
  const tree = objectTree({
    [CAPS]: JSON.stringify({
      schemaVersion: 'tracy-capabilities/v1',
      providers: {
        'tracy-airbnb-j6': { state: 'pending', reason: 'needs a versioned contract', version: '1.0.0' }
      },
      capabilities: { 'design.apply.airbnb': { provider: 'tracy-airbnb-j6' } }
    })
  })
  const s = await extractCapabilities(tree)
  const p = s.data.byCms.joomla.providers[0]
  assert.equal(p.state, 'pending')
  assert.equal(p.reason, 'needs a versioned contract')
})

// ── the stage parser, and the shapes it must refuse ──────────────────────────────────────────

test('the stage parser reads a one-line frozen array', () => {
  assert.deepEqual(parseStages("export const STAGES = Object.freeze(['check', 'template', 'shot'])"), [
    'check',
    'template',
    'shot'
  ])
})

test('the stage parser reads the array across several lines', () => {
  assert.deepEqual(
    parseStages(`export const STAGES = Object.freeze([\n  'check',\n  'theme',\n  'shot'\n])`),
    ['check', 'theme', 'shot']
  )
})

test('a stage array written some other way is an error, not a guess', async () => {
  const tree = objectTree({ [J_STAGES]: 'export const STAGES = buildStages()' })
  const s = await extractStages(tree)
  assert.equal(s.data.byCms.joomla.status, STATUS.ERROR)
  assert.match(s.data.byCms.joomla.reason, /not being guessed/)
  assert.equal(s.data.byCms.joomla.stages, null)
})

test('a CMS with no stages module is unsupported, and says none rather than empty', async () => {
  const tree = objectTree({ [W_STAGES]: "export const STAGES = Object.freeze(['check'])" })
  const s = await extractStages(tree)
  assert.equal(s.data.wordpress ?? s.data.byCms.wordpress.status, STATUS.OK)
  assert.equal(s.data.byCms.emdash.status, STATUS.UNSUPPORTED)
  assert.match(s.data.byCms.emdash.reason, /Not an empty pipeline: none/)
})

// ── contracts are found by walking, not by knowing the names ─────────────────────────────────

test('a second contract profile is found without the reader knowing its name', async () => {
  const manifest = (release) =>
    JSON.stringify({
      id: `${release}/1.0.0`,
      platform: 'joomla',
      mode: 'content-only',
      quickstart: { release }
    })
  const map = JSON.stringify({ entities: [{ kind: 'article' }, { kind: 'article' }, { kind: 'module' }] })
  const tree = objectTree({
    [`${CONTRACTS}/tracy-apple/j6/1.1.0/manifest.json`]: manifest('tracy-apple/j6'),
    [`${CONTRACTS}/tracy-apple/j6/1.1.0/content-map.json`]: map,
    [`${CONTRACTS}/tracy-airbnb/j6/1.0.0/manifest.json`]: manifest('tracy-airbnb/j6'),
    [`${CONTRACTS}/tracy-airbnb/j6/1.0.0/content-map.json`]: map
  })
  const s = await extractContracts(tree)
  assert.equal(s.status, STATUS.OK)
  assert.deepEqual(s.data.profiles.map((p) => p.id).sort(), ['tracy-airbnb/j6/1.0.0', 'tracy-apple/j6/1.1.0'])
  assert.equal(s.data.profiles[0].entityTotal, 3)
  assert.deepEqual(s.data.profiles[0].entityCounts, { article: 2, module: 1 })
})

test('entity counts are counted, and an unreadable map says coverage is unknown', async () => {
  const tree = objectTree({
    [`${CONTRACTS}/p/1.0.0/manifest.json`]: '{"mode":"content-only"}',
    [`${CONTRACTS}/p/1.0.0/content-map.json`]: '{"entities": [{"kind":"article"'
  })
  const s = await extractContracts(tree)
  assert.equal(s.data.profiles[0].entityTotal, null)
  assert.match(s.data.profiles[0].coverage, /did not parse as JSON/)
})

test('no contracts directory at all is unsupported', async () => {
  const s = await extractContracts(objectTree({}))
  assert.equal(s.status, STATUS.UNSUPPORTED)
  assert.match(s.reason, /no quickstart content\/display contract is published here/)
})

// ── the matrix rename trap ───────────────────────────────────────────────────────────────────

test('the matrix rows are read under their real names, and an absence is an error', async () => {
  const ok = await extractPresets(
    objectTree({
      [MATRIX]: JSON.stringify({
        roles: [{ id: 'designer', label: 'Designer' }],
        platforms: [{ id: 'joomla', label: 'Joomla' }],
        tools: [{ id: 'tool-bash', group: 'shell', roles: { designer: true }, platforms: {} }],
        skills: [{ id: 'brandkit', roles: {}, platforms: {} }]
      })
    })
  )
  assert.equal(ok.status, STATUS.OK)
  assert.equal(ok.data.toolRows.length, 1)
  assert.equal(ok.data.skillRows.length, 1)

  const bad = await extractPresets(objectTree({ [MATRIX]: JSON.stringify({ roles: [], platforms: [] }) }))
  assert.equal(bad.status, STATUS.ERROR, 'no rows at all must be an error, never a matrix with no tools')
  assert.match(bad.reason, /tool\/skill row arrays/)
})

test('an internal note on a matrix row never reaches the API', async () => {
  const s = await extractPresets(
    objectTree({
      [MATRIX]: JSON.stringify({
        tools: [{ id: 'persona', roles: {}, platforms: {}, note: 'ghi chú nội bộ không cho ra ngoài' }],
        skills: []
      })
    })
  )
  assert.equal(JSON.stringify(s).includes('ghi chú nội bộ'), false)
})

test('presets are read from the generated rows of presets.patch.yml, or the folders of an older ref', async () => {
  const MATRIX_OK = JSON.stringify({ tools: [], skills: [] })
  const ROWS = 'packages/bundle/tracy-cowork/presets.patch.yml'
  const rows = [
    '# Generated by scripts/gen-presets.ts',
    '- insert:',
    '    - id: preset-designer-joomla',
    "      name: '@deepseek-ai/dsh-agent-preset'",
    '      config:',
    '        id: designer-joomla',
    '        plugins:',
    '          - id: tool-bash',
    "            name: '@deepseek-ai/dsh-tool-bash'",
    '    - id: preset-writer-joomla',
    "      name: '@deepseek-ai/dsh-agent-preset'",
    '      config:',
    '        id: writer-joomla',
    '        plugins: []',
    ''
  ].join('\n')
  const now = await extractPresets(objectTree({ [MATRIX]: MATRIX_OK, [ROWS]: rows }))
  assert.equal(now.status, STATUS.OK)
  assert.deepEqual(
    now.data.presets.map((p) => [p.id, p.path]),
    [
      ['designer-joomla', `${ROWS}#preset-designer-joomla`],
      ['writer-joomla', `${ROWS}#preset-writer-joomla`]
    ]
  )
  assert.equal(now.data.presetsRoot, ROWS)
  assert.match(now.data.presets[0].cordisExcerpt.lines.join('\n'), /dsh-tool-bash/)
  assert.doesNotMatch(
    now.data.presets[0].cordisExcerpt.lines.join('\n'),
    /writer-joomla/,
    'a row stops at the next'
  )
  assert.ok(
    now.sources.some((s) => s.path === ROWS),
    'the rows file is a source of the section'
  )

  const DIR = 'packages/bundle/tracy-cowork/presets'
  const old = await extractPresets(
    objectTree({
      [MATRIX]: MATRIX_OK,
      [`${DIR}/designer-joomla/agent.cordis.yml`]: "- id: tool-bash\n  name: '@deepseek-ai/dsh-tool-bash'\n",
      [`${DIR}/designer-joomla/preset.yml`]: 'name: Designer\n'
    })
  )
  assert.deepEqual(
    old.data.presets.map((p) => [p.id, p.path]),
    [['designer-joomla', `${DIR}/designer-joomla/agent.cordis.yml`]]
  )
  assert.equal(old.data.presetsRoot, DIR)
})

// ── questions ────────────────────────────────────────────────────────────────────────────────

test('questions are read as data: every CMS default, and each quickstart says whether it brings its own', async () => {
  const set = (owner, ids) =>
    JSON.stringify({
      schemaVersion: 'tracy-questions/v1',
      owner,
      languages: ['en', 'vi'],
      questions: ids.map((id) => ({
        id,
        kind: 'text',
        label: { en: `${id} (en)`, vi: `${id} (vi)` },
        feeds: ['agent']
      }))
    })
  const tree = objectTree({
    'packages/site/tracy-site-build-wordpress/questions.json': set('wordpress', ['name', 'about']),
    'packages/site/tracy-site-build-joomla/questions.json': set('joomla', ['name']),
    'packages/site/tracy-site-build-emdash/questions.json': '{ truncated',
    [QUICKSTARTS]: JSON.stringify({
      'tracy-apple/j6': { version: '1.2.0' },
      'tracy-business/emdash': {
        platform: 'emdash',
        version: '1.0.0',
        questions: JSON.parse(set('tracy-business/emdash', ['name', 'sector']))
      }
    })
  })
  const s = await extractQuestions(tree)
  assert.equal(s.status, STATUS.OK)
  assert.equal(s.data.byCms.wordpress.count, 2)
  assert.equal(s.data.byCms.wordpress.questions[0].label, 'name (en)', 'the screen reads English')
  assert.deepEqual(s.data.byCms.wordpress.languages, ['en', 'vi'])
  assert.equal(s.data.byCms.emdash.status, STATUS.ERROR, 'a truncated file is an error, never an empty set')
  assert.match(s.data.byCms.emdash.reason, /did not parse as JSON/)
  const byId = Object.fromEntries(s.data.byQuickstart.map((q) => [q.id, q]))
  assert.equal(byId['tracy-apple/j6'].own, false)
  assert.equal(byId['tracy-apple/j6'].fallsBackTo, 'joomla')
  assert.equal(byId['tracy-business/emdash'].own, true)
  assert.deepEqual(
    byId['tracy-business/emdash'].questions.map((q) => q.id),
    ['name', 'sector']
  )
  assert.ok(s.data.feeds.agent, 'the feeds vocabulary travels with the reading')
})

test('a CMS whose plugin ships no questions.json is missing, not silently standard', async () => {
  const s = await extractQuestions(objectTree({}))
  assert.equal(s.status, STATUS.OK)
  for (const cms of ['joomla', 'wordpress', 'emdash']) {
    assert.equal(s.data.byCms[cms].status, STATUS.MISSING)
    assert.match(s.data.byCms[cms].reason, /questions\.json/)
  }
  assert.deepEqual(s.data.byQuickstart, [], 'no catalogue, no quickstart rows — not a guess either way')
})

// ── tools ────────────────────────────────────────────────────────────────────────────────────

test('the fence table separates path arguments from content arguments', async () => {
  const tree = objectTree({
    'packages/tools/tracy-subprocess-docker/src/route.mjs': `
export const FS_TOOL_ARGS = Object.freeze({
  read: { paths: ['file_path'], content: [] },
  grep: { paths: ['path'], content: ['pattern', 'include'] }
})`
  })
  const s = await extractTools(tree)
  assert.equal(s.status, STATUS.OK)
  const grep = s.data.fence.tools.find((t) => t.name === 'grep')
  assert.deepEqual(grep.paths, ['path'])
  assert.deepEqual(grep.content, ['pattern', 'include'])
})

test('a fence table that cannot be read is an error, not an empty fence', async () => {
  const tree = objectTree({
    'packages/tools/tracy-subprocess-docker/src/route.mjs': 'export const FS_TOOL_ARGS = build()'
  })
  const s = await extractTools(tree)
  assert.equal(s.status, STATUS.ERROR)
  assert.match(s.reason, /not being guessed/)
})

// ── the envelope ─────────────────────────────────────────────────────────────────────────────

test('validate refuses a snapshot missing a section, a sha, or a reason', () => {
  assert.deepEqual(validate(null), ['snapshot is not an object'])

  const problems = validate({
    schemaVersion: 'tracy-ops-cms/v1',
    source: { env: 'dev', ref: 'develop', sha: 'short', generatedAt: 'now' },
    sections: { bases: { status: 'missing', reason: null, sources: [] } },
    observations: []
  })
  assert.ok(problems.some((p) => /not a full 40-character commit id/.test(p)))
  assert.ok(problems.some((p) => /bases is missing with no reason/.test(p)))
  assert.ok(problems.some((p) => /section contracts is missing/.test(p)))
})

test('validate rejects a snapshot built by a newer generator', () => {
  const problems = validate({ schemaVersion: 'tracy-ops-cms/v2', sections: {}, observations: [] })
  assert.ok(problems.some((p) => /this reader speaks tracy-ops-cms\/v1/.test(p)))
})

test('designs are counted, never quoted', async () => {
  const tree = objectTree({
    'packages/cms/tracy-joomla-template/src/tpl_tracy/inspirations.json': JSON.stringify({
      systems: { apple: { name: 'Apple' }, airbnb: { name: 'Airbnb' } }
    })
  })
  const s = await extractDesigns(tree)
  assert.equal(s.data.byCms.joomla.count, 2)
  assert.equal(s.data.byCms.emdash.status, STATUS.UNSUPPORTED)
  assert.equal(
    s.data.byCms.wordpress.status,
    STATUS.MISSING,
    'WordPress HAS a theme package, so absence is missing'
  )
})

test('a CMS with no theme package lists the templates its quickstarts declare', async () => {
  const tree = objectTree({
    [QUICKSTARTS]: JSON.stringify({
      'tracy-apple/j6': { version: '1.2.0' },
      'tracy-business/emdash': {
        platform: 'emdash',
        version: '1.0.0',
        template: { id: 'tracy-business', label: 'Tracy Business' }
      }
    })
  })
  const s = await extractDesigns(tree)
  const emdash = s.data.byCms.emdash
  assert.equal(emdash.status, STATUS.OK)
  assert.equal(emdash.kind, 'template')
  assert.equal(emdash.count, 1)
  assert.deepEqual(
    emdash.systems.map((t) => [t.id, t.name, t.quickstart]),
    [['tracy-business', 'Tracy Business', 'tracy-business/emdash']]
  )
  assert.match(emdash.reason, /TEMPLATE/, 'the screen must say these are not design systems')
  assert.equal(
    s.data.byCms.joomla.status,
    STATUS.MISSING,
    'a Joomla quickstart declaring no template leaves the theme catalogue missing, not filled in'
  )
})

test('a base declares which CMS it restores, and both shapes of pair are listed', async () => {
  const tree = objectTree({
    [QUICKSTARTS]: JSON.stringify({
      'tracy-apple/j6': { version: '1.2.0', webroot: { file: 'w.tar.gz', bytes: 1, sha256: 'a' } },
      'tracy-business/emdash': {
        platform: 'emdash',
        version: '1.0.0',
        template: { id: 'tracy-business', label: 'Tracy Business' },
        source: {
          file: 's.zip',
          bytes: 2,
          sha256: 'b',
          url: 'https://github.test/x/s.zip'
        },
        state: { file: 'st.tar.gz', bytes: 3, sha256: 'c' }
      }
    })
  })
  const s = await extractBases(tree)
  const [joomla, emdash] = s.data.bases
  assert.equal(joomla.platform, 'joomla', 'an entry with no platform is the Joomla one it predates')
  assert.equal(emdash.platform, 'emdash')
  assert.equal(emdash.template.label, 'Tracy Business')
  assert.deepEqual(
    emdash.artifacts.map((a) => a.kind),
    ['source', 'state']
  )
  assert.equal(emdash.artifacts[0].host, 'github.test', 'the host is kept, the path is not')
})

test('a refusal sentence is read from its own function, never from a comment', async () => {
  const tree = objectTree({
    'packages/tools/tracy-subprocess-docker/src/route.mjs':
      "export const FS_TOOL_ARGS = Object.freeze({ read: { paths: ['file_path'], content: [] } })",
    'packages/tools/tracy-subprocess-docker/src/content-contract.mjs': `
/**
 * A comment that talks about the session's site and happens to run long enough to look like prose
 * somebody might quote, which is exactly the trap.
 */
const FILE_TOOLS = new Set(['read', 'write'])
const DOOR_TOOLS = new Set(['tracy_site'])
export function contentContractToolReason(name) {
  return FILE_TOOLS.has(name) || DOOR_TOOLS.has(name)
    ? null
    : 'This quickstart allows content-contract tools only; shell is disabled.'
}
export function contentContractPathReason(resolved, siteRoot) {
  const drafts = resolve(siteRoot, 'docs', 'agents')
  return resolved === drafts ? null : 'Only draft files in docs/agents are accessible; use tracy_site.'
}`
  })
  const s = await extractTools(tree)
  assert.equal(
    s.data.contentContract.toolRefusal,
    'This quickstart allows content-contract tools only; shell is disabled.'
  )
  assert.equal(
    s.data.contentContract.pathRefusal,
    'Only draft files in docs/agents are accessible; use tracy_site.'
  )
  assert.deepEqual(s.data.contentContract.fileTools, ['read', 'write'])
  assert.equal(
    JSON.stringify(s).includes('exactly the trap'),
    false,
    'comment prose must never be quoted as a refusal'
  )
})

test('a content-contract module whose shape moved yields null, not prose', async () => {
  const tree = objectTree({
    'packages/tools/tracy-subprocess-docker/src/route.mjs':
      "export const FS_TOOL_ARGS = Object.freeze({ read: { paths: ['file_path'], content: [] } })",
    'packages/tools/tracy-subprocess-docker/src/content-contract.mjs':
      "export const reasons = { tool: 'moved somewhere else entirely and reworded' }"
  })
  const s = await extractTools(tree)
  assert.equal(s.data.contentContract.toolRefusal, null)
  assert.equal(s.data.contentContract.pathRefusal, null)
})
