// #69 (S-16): one design contract measured on the SOURCE, audited against the PORT — target map, the
// contract CLI's argument forms, tokens-less variants, pattern lookup by registered slug.
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { auditDesign, designHash, duplicateJsonKey, designRequest, parseCli, validateDesign, validateTarget } from '../design-contract.mjs'
import { resolvePatternFiles } from '../visual/contract.mjs'
import { testDir } from './lib/test-root.mjs'

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'design-contract.mjs')
const SRC = 'https://source.test'
const PORT = 'https://port.test'

function design() {
  const variants = ['desktop', 'mobile'].flatMap((size) =>
    ['light', 'dark'].map((mode) => ({ id: `${size}-${mode}`, mode, width: size === 'desktop' ? 1440 : 390, height: 900 }))
  )
  const rule = (id, category, selector, props) => ({ id, category, selector, styles: Object.fromEntries(variants.map((v) => [v.id, props])) })
  const rules = [
    rule('heading', 'typography', '.page-header h1', { fontSize: '40px' }),
    rule('colors', 'color', 'body', { color: '#ffffff' }),
    rule('spacing', 'layout', '.t3-mainbody', { paddingLeft: '16px' }),
    rule('button', 'component', '.btn', { borderRadius: '12px' })
  ]
  return {
    schemaVersion: 1,
    id: 'nova',
    revision: 1,
    source: { reference: SRC, inspiration: 'nova', version: '1', capturedAt: '2026-01-01T00:00:00Z' },
    theme: { selector: 'html', attribute: 'data-theme', lightValue: 'light', darkValue: 'dark' },
    variants,
    tokens: Object.fromEntries(variants.map((v) => [v.id, { '--space': '16px' }])),
    rules,
    coverage: [{ selector: '.page-header h1', properties: ['fontSize'] }],
    pages: ['home', 'about'].map((id) => ({ id, url: `${SRC}/${id}`, expectedUrl: `${SRC}/${id}`, identity: '.t3-mainbody', rules: rules.map((r) => r.id), requiredRules: ['heading'] })),
    pilotPages: ['home'],
    exceptions: [],
    pending: []
  }
}
const mapFor = (c, extra = {}) => ({ schemaVersion: 1, contractHash: designHash(c), origin: PORT, rules: { heading: 'main h1' }, ...extra })
function observe(c, target = null, patch = () => {}) {
  return c.pages.flatMap((p) =>
    c.variants.map((v) => {
      const req = designRequest(c, p.id, v.id, target)
      const o = {
        contractId: c.id,
        contractHash: designHash(c),
        ...(req.targetMapHash ? { targetMapHash: req.targetMapHash } : {}),
        page: p.id,
        variant: v.id,
        capturedAt: '2026-02-01T00:00:00Z',
        url: req.expectedUrl,
        width: v.width,
        height: v.height,
        mode: v.mode,
        fontsReady: true,
        identityMatches: 1,
        scrollWidth: v.width,
        tokens: c.tokens[v.id],
        rules: req.rules.map((r) => ({ id: r.id, elements: [{ path: r.selector, styles: { ...c.rules.find((x) => x.id === r.id).styles[v.id] } }] })),
        coverageCount: 1,
        unclassified: []
      }
      patch(o, p, v)
      return o
    })
  )
}

test('a source contract audits the port: URL origin, identity and rule selectors are mapped, expectations are not', () => {
  const c = design()
  const t = validateTarget(c, mapFor(c, { pages: { about: { identity: 'main' } }, coverage: { '.page-header h1': 'main h1' } }))
  const home = designRequest(c, 'home', 'desktop-light', t)
  assert.equal(home.url, `${PORT}/home`)
  assert.equal(home.expectedUrl, `${PORT}/home`)
  assert.equal(home.identity, '.t3-mainbody')
  assert.equal(designRequest(c, 'about', 'desktop-light', t).identity, 'main')
  assert.equal(home.rules.find((r) => r.id === 'heading').selector, 'main h1')
  assert.equal(home.rules.find((r) => r.id === 'colors').selector, 'body')
  assert.equal(home.coverage[0].selector, 'main h1')
  assert.deepEqual(home.rules.find((r) => r.id === 'heading').properties, ['fontSize'])
  // the source request is untouched, and the contract's expected values are the source's
  assert.equal(designRequest(c, 'home', 'desktop-light').url, `${SRC}/home`)
  const ok = auditDesign(c, observe(c, t), { target: t })
  assert.equal(ok.ok, true)
  assert.equal(ok.targetMapHash.length > 0, true)
  // a measured 40px heading is still a finding on the port: expectations were not rewritten
  const bad = auditDesign(c, observe(c, t, (o) => o.rules[0].elements[0].styles.fontSize = '18px'), { target: t })
  assert.equal(bad.ok, false)
  assert.equal(bad.findings.filter((f) => f.property === 'fontSize' && f.expected === '40px').length, 8)
})

test('the audit refuses a wrong URL, a source-URL observation, a missing/other target map, and zero required matches', () => {
  const c = design()
  const t = validateTarget(c, mapFor(c))
  assert.throws(() => auditDesign(c, observe(c, t, (o) => (o.url = `${SRC}/${o.page}`)), { target: t }), /Unexpected final URL/)
  // an observation captured against the source contract, audited with the map (and the reverse)
  assert.throws(() => auditDesign(c, observe(c), { target: t }), /Unexpected final URL/)
  assert.throws(() => auditDesign(c, observe(c, t), {}), /Unexpected final URL/)
  const other = validateTarget(c, mapFor(c, { rules: { heading: 'article h1' } }))
  assert.throws(() => auditDesign(c, observe(c, t), { target: other }), /targetMapHash|different target map/)
  const stray = observe(c, t).map((o) => ({ ...o, targetMapHash: 'sha256:stale' }))
  assert.throws(() => auditDesign(c, stray, { target: t }), /target map/)
  const zero = auditDesign(c, observe(c, t, (o) => (o.rules[0].elements = [])), { target: t })
  assert.equal(zero.ok, false)
  assert.ok(zero.findings.some((f) => f.issue === 'zero-matches'))
  const pilotOnly = auditDesign(c, observe(c, t).filter((o) => o.page === 'home'), { target: t })
  assert.equal(pilotOnly.ok, false)
  assert.equal(pilotOnly.missing.length, 4)
})

test('a target map is validated: stale hash, unknown keys and ids, bad origin, empty entries, conflicting theme', () => {
  const c = design()
  const bad = (m, re) => assert.throws(() => validateTarget(c, m), re)
  bad({ ...mapFor(c), contractHash: 'sha256:old' }, /stale/)
  bad({ ...mapFor(c), extra: 1 }, /unknown field extra/)
  bad({ ...mapFor(c), schemaVersion: 2 }, /schemaVersion/)
  bad(mapFor(c, { origin: 'ftp://port.test' }), /origin/)
  bad(mapFor(c, { origin: `${PORT}/sub` }), /bare/)
  bad(mapFor(c, { origin: 'nope' }), /not a URL/)
  bad(mapFor(c, { pages: { nope: { identity: 'main' } } }), /unknown page/)
  bad(mapFor(c, { pages: { home: {} } }), /maps nothing/)
  bad(mapFor(c, { pages: { home: { url: '/relative' } } }), /absolute/)
  bad(mapFor(c, { pages: { home: { extra: 'x' } } }), /unknown field/)
  bad(mapFor(c, { rules: { nope: 'main' } }), /unknown rule/)
  bad(mapFor(c, { rules: { heading: '' } }), /selector/)
  bad(mapFor(c, { coverage: { '.other': 'main' } }), /unknown coverage/)
  bad(mapFor(c, { tokens: { '--nope': '--x' } }), /unknown token/)
  bad(mapFor(c, { tokens: { '--space': 'x' } }), /custom property/)
  bad(mapFor(c, { tokens: [] }), /custom property|unknown token|must be an object/)
  bad(mapFor(c, { tokenRoot: '' }), /tokenRoot/)
  const r = designRequest(c, 'home', 'desktop-light', validateTarget(c, mapFor(c, { tokens: { '--space': '--wp--space' }, tokenRoot: 'main' })))
  assert.deepEqual(r.tokens, ['--space'])
  assert.deepEqual(r.tokenNames, { '--space': '--wp--space' })
  assert.equal(r.tokenRoot, 'main')
  bad(mapFor(c, { theme: { darkValue: 'light' } }), /distinct/)
  bad(mapFor(c, { theme: {} }), /map strings/)
  bad(null, /must be an object/)
  // the hook is remapped as a whole
  const t = validateTarget(c, mapFor(c, { theme: { selector: 'body', attribute: 'data-bs-theme' } }))
  assert.deepEqual(designRequest(c, 'home', 'desktop-dark', t).theme, { selector: 'body', attribute: 'data-bs-theme', lightValue: 'light', darkValue: 'dark' })
})

test('a variant may declare no root tokens (LESS/T3 light mode); a missing or non-object token map is still refused', () => {
  const c = design()
  c.tokens['desktop-light'] = {}
  c.tokens['mobile-light'] = {}
  validateDesign(c)
  assert.deepEqual(designRequest(c, 'home', 'desktop-light').tokens, [])
  assert.equal(auditDesign(c, observe(c)).ok, true)
  const missing = design()
  delete missing.tokens['desktop-light']
  assert.throws(() => validateDesign(missing), /Token variants/)
  const bad = design()
  bad.tokens['desktop-light'] = []
  assert.throws(() => validateDesign(bad), /must be an object/)
  const notCss = design()
  notCss.tokens['desktop-light'] = { space: '16px' }
  assert.throws(() => validateDesign(notCss), /custom property/)
})

test('parseCli: flags carry one value, unknown/repeated/valueless flags are refused', () => {
  assert.deepEqual(parseCli(['pilot', '--run-root', 'R', 'obs.json']), { command: 'pilot', positional: ['obs.json'], flags: { '--run-root': 'R' }, scope: null })
  assert.equal(parseCli(['audit', 'c.json', 'o.json', '--scope=a,b']).scope, '--scope=a,b')
  assert.throws(() => parseCli(['pilot', '--run-root']), /needs a value/)
  assert.throws(() => parseCli(['pilot', '--run-root', '--contract', 'x']), /needs a value/)
  assert.throws(() => parseCli(['pilot', '--bogus', 'x']), /Unknown flag/)
  assert.throws(() => parseCli(['pilot', '--contract', 'a', '--contract', 'b']), /Repeated flag/)
  assert.throws(() => parseCli(['audit', '--scope=a', '--scope=b']), /Repeated flag --scope/)
})

function run(args, cwd) {
  const r = spawnSync(process.execPath, [CLI, '--json', ...args], { cwd, encoding: 'utf8', timeout: 30000 })
  return { code: r.status, out: r.stdout, err: r.stderr, json: (() => { try { return JSON.parse(r.stdout) } catch { return null } })() }
}

test('CLI: pilot/audit/request/validate work with --run-root, --contract and the legacy positional form; the observations file is never the contract', () => {
  const dir = testDir('issue69-cli')
  const c = design()
  const root = path.join(dir, 'run')
  mkdirSync(root)
  writeFileSync(path.join(root, 'design-contract.json'), JSON.stringify(c))
  const t = validateTarget(c, mapFor(c))
  writeFileSync(path.join(dir, 'target.json'), JSON.stringify(t))
  writeFileSync(path.join(dir, 'obs-source.json'), JSON.stringify(observe(c)))
  writeFileSync(path.join(dir, 'obs-pilot.json'), JSON.stringify(observe(c).filter((o) => o.page === 'home')))
  writeFileSync(path.join(dir, 'obs-port.json'), JSON.stringify(observe(c, t)))
  const contractFile = path.join(root, 'design-contract.json')

  // the reproduced defect: with --run-root, obs.json was taken for the contract
  const nonexistentRoot = run(['pilot', '--run-root', path.join(dir, 'nope'), path.join(dir, 'obs-source.json')], dir)
  assert.equal(nonexistentRoot.code, 1)
  assert.match(nonexistentRoot.err, /design-contract\.json is missing|no such/)
  assert.doesNotMatch(nonexistentRoot.err, /obs-source/)

  assert.equal(run(['pilot', '--run-root', root, path.join(dir, 'obs-pilot.json')], dir).json.scope, 'pilot')
  assert.equal(run(['validate', '--run-root', root], dir).json.ok, true)
  assert.equal(run(['validate', contractFile], dir).json.ok, true)
  assert.equal(run(['request', '--contract', contractFile, 'home', 'desktop-light'], dir).json.url, `${SRC}/home`)
  assert.equal(run(['request', contractFile, 'home', 'desktop-light'], dir).json.url, `${SRC}/home`)
  assert.equal(run(['request', '--run-root', root, 'home', 'desktop-light', '--target-map', path.join(dir, 'target.json')], dir).json.url, `${PORT}/home`)
  assert.equal(run(['audit', contractFile, path.join(dir, 'obs-source.json')], dir).json.ok, true)
  assert.equal(run(['audit', '--contract', contractFile, path.join(dir, 'obs-source.json'), '--scope=home,about'], dir).json.scope, 'partial')
  assert.equal(run(['audit', '--run-root', root, path.join(dir, 'obs-port.json'), '--target-map', path.join(dir, 'target.json')], dir).json.ok, true)
  // the port observations against the source contract, and the reverse, are refused
  assert.equal(run(['audit', '--run-root', root, path.join(dir, 'obs-port.json')], dir).code, 1)
  assert.equal(run(['audit', '--run-root', root, path.join(dir, 'obs-source.json'), '--target-map', path.join(dir, 'target.json')], dir).code, 1)
  // default output of a failing audit: one summary line, the complete result in the file it names, exit 1 as before
  const raw = spawnSync(process.execPath, [CLI, 'audit', '--run-root', root, path.join(dir, 'obs-pilot.json')], { cwd: dir, encoding: 'utf8', env: { ...process.env, TMPDIR: dir } })
  assert.equal(raw.status, 1)
  const line = raw.stdout.trim().match(/^design-contract audit: (ok=false .*) -> (\/.+\.json)$/)
  assert.ok(line, raw.stdout)
  assert.equal(raw.stdout.trim().split('\n').length, 1)
  assert.equal(JSON.parse(readFileSync(line[2], 'utf8')).ok, false)
  assert.equal(run(['audit', '--run-root', root, path.join(dir, 'obs-pilot.json'), '--out', contractFile], dir).code, 1, 'the contract is never the output')
  assert.equal(JSON.parse(readFileSync(contractFile, 'utf8')).id, c.id)
  // a second positional with a flag-given contract is an extra argument, not a contract
  const extra = run(['pilot', '--run-root', root, path.join(dir, 'obs-pilot.json'), 'extra.json'], dir)
  assert.equal(extra.code, 1)
  assert.match(extra.err, /Usage/)
  // refused before measurement
  for (const bad of [['pilot', '--run-root'], ['pilot', '--wat', 'x', 'o.json'], ['validate', '--run-root', root, '--run-root', root], ['audit', '--run-root', root, 'a.json', 'b.json']])
    assert.equal(run(bad, dir).code, 1, bad.join(' '))
  // target maps: missing file, directory, empty, malformed, stale
  const tm = (name, body) => (writeFileSync(path.join(dir, name), body), path.join(dir, name))
  for (const [name, body, re] of [['empty.json', '', /non-empty regular file/], ['junk.json', '{', /not valid JSON/], ['stale.json', JSON.stringify({ ...t, contractHash: 'sha256:x' }), /stale/]]) {
    const r = run(['audit', '--run-root', root, path.join(dir, 'obs-port.json'), '--target-map', tm(name, body)], dir)
    assert.equal(r.code, 1)
    assert.match(r.err, re)
  }
  // a key written twice is ambiguous (JSON.parse would keep the last): refused, at the top, in pages and in rules
  const text = JSON.stringify(mapFor(c, { pages: { home: { identity: 'main' } } }))
  const dupTop = `${text.slice(0, -1)},"origin":"${PORT}"}`
  const dupPage = text.replace('"home":{"identity":"main"}', '"home":{"identity":"main"},"home":{"identity":"body"}')
  const dupRule = text.replace('"heading":"main h1"', '"heading":"main h1","heading":"h1"')
  assert.ok(dupPage !== text && dupRule !== text)
  for (const [name, body] of [['dup-top.json', dupTop], ['dup-page.json', dupPage], ['dup-rule.json', dupRule]]) {
    const r = run(['audit', '--run-root', root, path.join(dir, 'obs-port.json'), '--target-map', tm(name, body)], dir)
    assert.equal(r.code, 1, name)
    assert.match(r.err, /written twice/, name)
  }
  assert.equal(duplicateJsonKey('{"a":{"b":1},"c":{"b":2},"d":[{"a":1},{"a":2}]}'), null, 'the same key in different objects is fine')
  assert.equal(duplicateJsonKey('{"a":"{\\"x\\":1,\\"x\\":2}","b":[1,{"k":1,"k":2}]}'), 'k', 'braces and quotes inside a string are not structure')
  assert.equal(duplicateJsonKey('{"a":1,"a":2}'), 'a')
  assert.equal(duplicateJsonKey('{\n  "pages": {\n    "p": 1,\n    "p": 2\n  }\n}\n'), 'p', 'a formatted file is scanned to its end')
  assert.equal(duplicateJsonKey('{ "rules" : [ { "r" : 1 , "r" : 2 } ] }'), 'r', 'spaces around every token')
  assert.equal(duplicateJsonKey('{\n  "a": 1,\n  "b": {\n    "a": 2\n  }\n}\n'), null)
  assert.match(run(['audit', '--run-root', root, path.join(dir, 'obs-port.json'), '--target-map', dir], dir).err, /regular file/)
  assert.match(run(['audit', '--run-root', root, path.join(dir, 'obs-port.json'), '--target-map', path.join(dir, 'gone.json')], dir).err, /no such file/)
  // links, oversized files and non-URLs are refused; two contract selectors that disagree are refused
  symlinkSync(path.join(dir, 'target.json'), path.join(dir, 'link-target.json'))
  assert.match(run(['audit', '--run-root', root, path.join(dir, 'obs-port.json'), '--target-map', path.join(dir, 'link-target.json')], dir).err, /no link/)
  symlinkSync(path.join(dir, 'obs-port.json'), path.join(dir, 'link-obs.json'))
  assert.match(run(['audit', '--run-root', root, path.join(dir, 'link-obs.json'), '--target-map', path.join(dir, 'target.json')], dir).err, /no link/)
  writeFileSync(path.join(dir, 'big.json'), ' '.repeat(4 * 1024 * 1024 + 1))
  assert.match(run(['audit', '--run-root', root, path.join(dir, 'big.json')], dir).err, /at most 4 MB/)
  assert.match(run(['audit', '--run-root', root, path.join(dir, 'obs-port.json'), '--target-map', path.join(dir, 'dir-as-file')], dir).err, /no such file/)
  // a FIFO is refused without blocking (the file is opened once, no-follow, non-blocking, and judged by its descriptor)
  execFileSync('mkfifo', [path.join(dir, 'fifo.json')])
  assert.match(run(['audit', '--run-root', root, path.join(dir, 'fifo.json')], dir).err, /regular file/)
  const other = path.join(dir, 'other-contract.json')
  writeFileSync(other, JSON.stringify(c))
  const both = run(['validate', '--run-root', root, '--contract', other], dir)
  assert.equal(both.code, 1)
  assert.match(both.err, /name two contracts/)
  assert.equal(run(['validate', '--run-root', root, '--contract', contractFile], dir).json.ok, true, 'the same contract twice is not a conflict')
  const badUrl = JSON.parse(JSON.stringify(t))
  for (const url of ['ftp://port.test/home', 'https://user:pw@port.test/home', 'http://', 'http:///port.test/home', 'http://?x', 'http://#x', 'http:/x y', 'http:port.test/home', 'http:/port.test/home', 'https:\\\\port.test/home', ' http://port.test/home']) {
    const r = run(['request', '--run-root', root, 'home', 'desktop-light', '--target-map', tm('u.json', JSON.stringify({ ...badUrl, pages: { home: { url } } }))], dir)
    assert.equal(r.code, 1, url)
  }
})

test('pattern lookup follows the slug a pattern file REGISTERS, not its file name (acm-*.php)', () => {
  const dir = testDir('issue69-patterns')
  const theme = path.join(dir, 'theme')
  mkdirSync(path.join(theme, 'patterns'), { recursive: true })
  const put = (n, slug, body = '') => writeFileSync(path.join(theme, 'patterns', n), `<?php\n/**\n * Title: ${n}\n * Slug: ${slug}\n */\n?>\n${body}`)
  put('acm-hero.php', 'tracy/section-hero', 'HERO')
  put('acm-faq.php', 'tracy/section-faq', 'FAQ')
  writeFileSync(path.join(theme, 'patterns', 'section-plain.php'), '<?php // no header\nPLAIN')
  const map = (types) => ({ types: Object.fromEntries(Object.entries(types).map(([k, v]) => [k, { pattern: v }])) })
  const r = resolvePatternFiles(theme, map({ hero: 'tracy/section-hero', faq: 'section-faq', plain: 'section-plain', gone: 'tracy/section-gone' }))
  assert.match(r.files.hero, /HERO/)
  assert.match(r.files.faq, /FAQ/)
  assert.equal(r.files.plain, undefined, 'a file without a Slug header registers nothing, whatever its name')
  assert.deepEqual(r.missing, ['plain (section-plain)', 'gone (tracy/section-gone)'])
  assert.deepEqual(r.ambiguous, [])
  // the file name is not a registration: acm-hero.php does not answer to `acm-hero`
  assert.deepEqual(resolvePatternFiles(theme, map({ x: 'acm-hero' })).files, {})
  // two files registering one slug are ambiguous, never guessed
  put('dup-hero.php', 'tracy/section-hero', 'OTHER')
  const amb = resolvePatternFiles(theme, map({ hero: 'tracy/section-hero' }))
  assert.equal(amb.ambiguous.length, 1)
  assert.match(amb.ambiguous[0], /acm-hero\.php, dup-hero\.php/)
  assert.deepEqual(amb.files, {})
  // a slug without a namespace matches by last segment; two namespaces with one last segment are ambiguous
  put('other-faq.php', 'other/section-faq')
  assert.equal(resolvePatternFiles(theme, map({ faq: 'section-faq' })).ambiguous.length, 1)
  assert.equal(resolvePatternFiles(theme, map({ faq: 'tracy/section-faq' })).ambiguous.length, 0)
  // a theme without patterns/ reports every type missing
  assert.equal(resolvePatternFiles(path.join(dir, 'none'), map({ hero: 'tracy/section-hero' })).missing.length, 1)
})
