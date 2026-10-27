// The denominator and manifests are generated from code and must stay in step with it.
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { parseNa } from '../../../lib/denominator.mjs'
import { CASES_DIR, LAYER_DIR, REPO_ROOT, SRC_REL, loadProduct, readJson } from '../common.mjs'
import { ALL_TAGS, COMMON_TAGS, MAIL_TAGS, currentFiles, diff, generate, render } from '../generate.mjs'
import { areaOf, loadCases, parseRef } from '../index.mjs'
import { SUITES, REQUIRED_SUITES, suiteFile } from '../legacy.mjs'
import { REGISTRY } from '../machine.mjs'
import { oracle } from '../machine-support.mjs'
import { MUTANTS } from '../red.mjs'
import { readTextSync } from '../../../lib/bounded-reader.mjs'

const denominator = readJson(path.join(LAYER_DIR, 'denominator.json'))

test('generated denominator and manifests are byte-identical to a fresh generation', async () => {
  assert.deepEqual(diff(await render(await generate()), currentFiles()), [])
})

test('the denominator holds every renderer variant: LETTER_KINDS x WEB_LANGUAGES', async () => {
  const { LETTER_KINDS } = await loadProduct(REPO_ROOT, 'mail/letters/index.js')
  const { WEB_LANGUAGES } = await loadProduct(REPO_ROOT, 'lib/i18n/index.js')
  const ids = new Set(denominator.items.filter((i) => i.kind === 'notification-letter').map((i) => i.id))
  assert.equal(LETTER_KINDS.length, 22)
  assert.equal(WEB_LANGUAGES.length, 8)
  assert.equal(ids.size, 176)
  for (const k of LETTER_KINDS)
    for (const l of WEB_LANGUAGES) assert.ok(ids.has(`letter:${k}:${l}`), `${k} ${l}`)
  assert.equal(denominator.details.counts.rendererVariants, 176)
})

test('the direct letters, groups, tokens, transports and site-mail items are all listed', async () => {
  const kinds = new Set(denominator.items.map((i) => i.kind))
  for (const k of ['direct-letter', 'flow', 'token', 'preference-group', 'transport', 'site-mail'])
    assert.ok(kinds.has(k), k)
  const direct = denominator.items.filter((i) => i.kind === 'direct-letter')
  assert.equal(direct.length, 7 * 8)
  assert.ok(
    direct.some((i) => i.id === 'direct:team.invited:en'),
    'team.invited is mailed directly and has its own items'
  )
  const { NOTIFICATION_GROUPS } = await loadProduct(REPO_ROOT, 'notifications/preferences.js')
  for (const g of NOTIFICATION_GROUPS)
    assert.ok(
      denominator.items.some((i) => i.id === `preference-group:${g.id}`),
      g.id
    )
  const { MODES } = await loadProduct(REPO_ROOT, 'mail/site-mail/policy.js')
  for (const m of MODES)
    assert.ok(
      denominator.items.some((i) => i.id === `site-mail:mode:${m}`),
      m
    )
})

test('every item requires the 7 common and 10 mail tags; each is covered, N-A with reason and source, or open', () => {
  assert.equal(COMMON_TAGS.length, 7)
  assert.equal(MAIL_TAGS.length, 10)
  for (const item of denominator.items) {
    assert.deepEqual([...item.requiredTags, ...Object.keys(item.na)].sort(), [...ALL_TAGS].sort(), item.id)
    for (const tag of ALL_TAGS) {
      const n = item.na[tag] === undefined ? null : parseNa(denominator.naReasons[item.na[tag]])
      const covered = item.meta.planned.covered.includes(tag)
      const open = item.meta.planned.open.includes(tag)
      assert.equal(
        [Boolean(n), covered, open].filter(Boolean).length,
        1,
        `${item.id}/${tag} must be exactly one of N-A, covered, open`
      )
      if (n) assert.ok(n.reason && n.reference, `${item.id}/${tag}: N-A needs reason and source`)
    }
    for (const tag of Object.keys(item.na))
      assert.ok(!item.requiredTags.includes(tag), `${item.id}: ${tag} is both required and N-A`)
  }
})

test('unresolved sources are listed honestly and nothing prints 100%', () => {
  assert.ok(denominator.unresolved.length >= 3)
  assert.ok(denominator.unresolved.some((u) => /MODES/.test(u.reason)))
  assert.ok(denominator.details.counts.open > 0, 'open obligations exist and are reported')
})

test('every manifest resolves: items exist, assertions are registered or adapters, oracle is complete', () => {
  const cases = loadCases()
  const itemIds = new Set(denominator.items.map((i) => i.id))
  for (const c of cases) {
    for (const id of c.itemIds) assert.ok(itemIds.has(id), `${c.id}: unknown item ${id}`)
    for (const ref of c.assertionIds) {
      const { id } = parseRef(ref)
      if (id.startsWith('suite:')) assert.ok(SUITES.includes(id.slice(6)), `${c.id}: unknown suite`)
      else if (/^(manual|env):/.test(id)) assert.ok(true)
      else assert.ok(REGISTRY.has(id), `${c.id}: unregistered assertion ${id}`)
    }
    assert.notEqual(areaOf(c), 'other', c.id)
    assert.deepEqual(c.targets, ['local'])
    assert.equal(c.redProof, null, 'RED proofs are produced by a run, never typed into a manifest')
  }
  assert.equal(readdirSync(CASES_DIR).length, cases.length)
})

test('every registered assertion is used by a case and every recorded mutation targets a real assertion', () => {
  const used = new Set(loadCases().flatMap((c) => c.assertionIds.map((r) => parseRef(r).id)))
  for (const id of REGISTRY.keys()) assert.ok(used.has(id), `assertion ${id} backs no case`)
  for (const m of MUTANTS)
    for (const id of Object.keys(m.targets)) assert.ok(REGISTRY.has(id), `${m.id} targets unknown ${id}`)
})

test('all eleven required suites and the extra adapters exist and are wired as cases', () => {
  for (const name of REQUIRED_SUITES) assert.ok(existsSync(path.join(REPO_ROOT, suiteFile(name))), name)
  for (const name of SUITES) {
    assert.ok(existsSync(path.join(REPO_ROOT, suiteFile(name))), name)
    assert.ok(
      loadCases().some((c) => c.assertionIds.includes(`suite:${name}`)),
      `${name} has no case`
    )
  }
  assert.equal(REQUIRED_SUITES.length, 11)
})

test('oracle sources are pinned by hash and still match; expectations are not copied from product output', () => {
  for (const [key, s] of Object.entries(oracle.sources)) assert.match(s.sha256, /^[0-9a-f]{64}$/, key)
  assert.ok(
    !denominator.unresolved.some((u) => /changed since the oracle was pinned/.test(u.reason)),
    'an oracle source drifted'
  )
  for (const file of ['machine.mjs', 'machine-support.mjs']) {
    const text = readTextSync(path.join(LAYER_DIR, file))
    assert.doesNotMatch(
      text,
      /lib\/i18n\/(strings|locales)/,
      `${file} must not take copy from the dictionaries it checks`
    )
    assert.doesNotMatch(text, new RegExp(`${SRC_REL.replaceAll('/', '\\/')}\\/lib\\/i18n\\/locales`), file)
  }
})

test('README has a Known limitations section whose file:line references exist', () => {
  const text = readTextSync(path.join(LAYER_DIR, 'README.md'))
  const section = text.split(/^## Known limitations$/m)[1]
  assert.ok(section, 'README needs a "## Known limitations" section')
  const refs = [...text.matchAll(/`([\w-]+\.mjs):(\d+)`( \(`([^`]+)`\))?/g)]
  assert.ok(refs.length >= 10)
  for (const [, file, line, , symbol] of refs) {
    assert.ok(symbol, `${file}:${line} must name the symbol it points at`)
    const lines = readTextSync(path.join(LAYER_DIR, file)).split('\n')
    assert.ok(Number(line) >= 1 && Number(line) <= lines.length, `${file}:${line} is outside the file`)
    assert.ok(
      lines[Number(line) - 1].includes(symbol),
      `${file}:${line} does not point at ${symbol}: ${lines[Number(line) - 1].trim()}`
    )
  }
})
