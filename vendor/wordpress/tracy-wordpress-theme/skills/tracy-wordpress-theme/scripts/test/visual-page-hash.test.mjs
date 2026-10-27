import { cleanAudit } from './lib/finish-audit.mjs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { spawn, spawnSync, execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pageHash, themeFilesFor } from '../visual/page-hash.mjs'
import { loadPatternsMap, patternEntries, patternSlugsOf, patternSnapshot, readPatternFile, readRegularFile, registeredPatterns } from '../visual/pattern-registry.mjs'
import { buildContract, validateContract } from '../visual/contract.mjs'
import { testDir } from './lib/test-root.mjs'
import { reportOf, claimsOf, row } from './lib/intrinsic-fixtures.mjs'
import { indexFor, notesOf, visualOf } from './lib/visual-evidence-fixtures.mjs'
import { identityOf } from '../lib/canonical.mjs'

function theme() {
  const dir = testDir('theme')
  for (const d of ['templates', 'parts', 'patterns', 'assets/css', 'inc']) mkdirSync(path.join(dir, d), { recursive: true })
  writeFileSync(path.join(dir, 'templates/page.html'), 'page')
  writeFileSync(path.join(dir, 'templates/single.html'), 'single')
  writeFileSync(path.join(dir, 'parts/header.html'), 'header')
  writeFileSync(path.join(dir, 'patterns/section-hero.php'), '<?php\n/**\n * Slug: tracy/section-hero\n */\nhero')
  writeFileSync(path.join(dir, 'patterns/section-team.php'), '<?php\n/**\n * Slug: tracy/section-team\n */\nteam')
  writeFileSync(path.join(dir, 'assets/css/site.css'), 'css')
  writeFileSync(path.join(dir, 'theme.json'), '{}')
  return dir
}
const contract = { variants: [{ id: '1440-light' }], layouts: [{ id: 'page', template: 'templates/page.html' }], design: { rules: [] } }
const page = { id: 'en-about', layout: 'page', path: '/about', status: 200, identity: {}, states: ['default'], variants: ['1440-light'] }

test('page hash: the page\'s own template, parts, its patterns, css and theme.json count; another template or an unused pattern do not', () => {
  const dir = theme()
  const files = themeFilesFor({ themeDir: dir, layout: contract.layouts[0], patternSlugs: ['section-hero'] }).map((f) => path.relative(dir, f))
  assert.deepEqual(files, ['assets/css/site.css', 'parts/header.html', 'patterns/section-hero.php', 'templates/page.html', 'theme.json'])
  const a = pageHash({ contract, page, themeDir: dir, targetHtml: '<p>x</p>', patternSlugs: ['section-hero'] })
  writeFileSync(path.join(dir, 'templates/single.html'), 'single changed')
  writeFileSync(path.join(dir, 'patterns/section-team.php'), '<?php\n/**\n * Slug: tracy/section-team\n */\nteam changed')
  const b = pageHash({ contract, page, themeDir: dir, targetHtml: '<p>x</p>', patternSlugs: ['section-hero'] })
  assert.equal(a.hash, b.hash, 'unrelated files do not move the hash')
  writeFileSync(path.join(dir, 'assets/css/site.css'), 'css changed')
  const c = pageHash({ contract, page, themeDir: dir, targetHtml: '<p>x</p>', patternSlugs: ['section-hero'] })
  assert.notEqual(a.hash, c.hash, 'a css byte moves it')
  assert.equal(c.parts.themeFiles, 5)
})

test('page hash: served HTML, the rendered source, the contract slice and the tool version each move the hash', () => {
  const spec = testDir('spec')
  mkdirSync(path.join(spec, 'reference/rendered'), { recursive: true })
  writeFileSync(path.join(spec, 'reference/rendered/about.html'), 'src')
  const p = { ...page, sourceRendered: 'reference/rendered/about.html' }
  const a = pageHash({ contract, page: p, specDir: spec, targetHtml: 'A' })
  assert.notEqual(a.hash, pageHash({ contract, page: p, specDir: spec, targetHtml: 'B' }).hash)
  writeFileSync(path.join(spec, 'reference/rendered/about.html'), 'src2')
  assert.notEqual(a.hash, pageHash({ contract, page: p, specDir: spec, targetHtml: 'A' }).hash)
  const c2 = { ...contract, design: { rules: [{ id: 'x' }] } }
  assert.notEqual(a.hash, pageHash({ contract: c2, page: p, specDir: spec, targetHtml: 'A' }).hash)
  assert.notEqual(a.hash, pageHash({ contract, page: { ...p, referenceKind: 'none', sourceRendered: null }, specDir: spec, targetHtml: 'A' }).hash, 'changing source applicability invalidates reusable axes')
  assert.ok(a.parts.source && a.parts.target && a.parts.contract)
})

test('page hash: html inputs retain the pre-applicability hash', () => {
  const fixedContract = { variants: [{ id: '1440-light' }], layouts: [{ id: 'page', template: 'templates/page.html' }], design: { rules: [] } }
  const fixedPage = { id: 'en-about', layout: 'page', path: '/about', status: 200, identity: {}, states: ['default'], variants: ['1440-light'], referenceKind: 'html', sourceRoute: '/about' }
  const actual = pageHash({ contract: fixedContract, page: fixedPage, targetHtml: '<p>fixed</p>' }).hash
  assert.equal(actual, 'sha256:4e0226abcb87d885a9e0309e5776e8284e2f96a215d99276b595b1416c8e18a2')
})

// JA Vega M4b (26/09): themeFilesFor skipped a template that is not there, so the hash of six
// layouts held no template at all, and pages page-service.html serves hashed page.html. A changed
// template whose served HTML did not move yet (not deployed) could be reused as unchanged.
test('page hash: the template the page is served by counts; a template that is not there is refused, not skipped', async () => {
  const dir = theme()
  writeFileSync(path.join(dir, 'templates/page-service.html'), 'service')
  const svc = { ...page, id: 'en-cloud', layout: 'page--page-service', template: 'templates/page-service.html' }
  const c = { ...contract, layouts: [...contract.layouts, { id: 'page--page-service', view: 'page', template: 'templates/page-service.html' }] }
  const a = pageHash({ contract: c, page: svc, themeDir: dir, targetHtml: 'same' })
  writeFileSync(path.join(dir, 'templates/page.html'), 'page changed')
  assert.equal(pageHash({ contract: c, page: svc, themeDir: dir, targetHtml: 'same' }).hash, a.hash, 'page.html does not serve it')
  writeFileSync(path.join(dir, 'templates/page-service.html'), 'service changed')
  assert.notEqual(pageHash({ contract: c, page: svc, themeDir: dir, targetHtml: 'same' }).hash, a.hash, 'its own template moves it with the served HTML unchanged')
  assert.throws(() => themeFilesFor({ themeDir: dir, layout: { id: 'page-login', template: 'templates/page-login.html' } }), /templates\/page-login\.html.*not in the theme/)
  assert.throws(() => pageHash({ contract: { ...contract, layouts: [{ id: 'page', template: 'templates/gone.html' }] }, page, themeDir: dir, targetHtml: 'x' }), /gone\.html/)
  // the template a page is served by is part of the contract slice: a remapped page is not the same page
  const moved = { ...page, template: 'templates/page-service.html' }
  assert.notEqual(pageHash({ contract, page: moved, targetHtml: 'x' }).hash, pageHash({ contract, page: { ...page, template: 'templates/page.html' }, targetHtml: 'x' }).hash)
  // and evidence measured before the pairing and the template mapping changed is not reused
  const { TOOL_VERSION } = await import('../visual/page-hash.mjs')
  assert.notEqual(TOOL_VERSION, 'visual-qa/4')
  // nor evidence shot before a dark stage had its dark source and settle() stopped re-selecting pictures (#19)
  assert.notEqual(TOOL_VERSION, 'visual-qa/5')
  // nor evidence measured before the dark scans were compared with the source and hidden words left the text (#27)
  assert.notEqual(TOOL_VERSION, 'visual-qa/6')
})

test('page hash: a pattern is the file that REGISTERS the slug — a renamed file moves the hash, an unregistered or doubly registered one is an error', () => {
  const dir = theme()
  const reg = (name, slug, body = 'x') => writeFileSync(path.join(dir, 'patterns', name), `<?php\n/**\n * Slug: ${slug}\n */\n${body}`)
  reg('acm-hero.php', 'tracy/section-cta', 'v1')
  const at = (slug) => pageHash({ contract, page, themeDir: dir, targetHtml: '<p>x</p>', patternSlugs: [slug] })
  const a = at('tracy/section-cta')
  assert.ok(themeFilesFor({ themeDir: dir, layout: contract.layouts[0], patternSlugs: ['tracy/section-cta'] }).some((f) => f.endsWith('patterns/acm-hero.php')))
  reg('acm-hero.php', 'tracy/section-cta', 'v2')
  assert.notEqual(at('tracy/section-cta').hash, a.hash, 'editing the registered file moves the hash')
  assert.notEqual(at('section-cta').hash, undefined, 'a bare slug finds it by last segment')
  assert.throws(() => at('tracy/section-gone'), /not registered by any file/)
  assert.throws(() => at('tracy/acm-hero'), /not registered by any file/, 'a file name is not a registration')
  reg('other.php', 'tracy/section-cta')
  assert.throws(() => at('tracy/section-cta'), /registered by acm-hero\.php, other\.php/)
})

test('pattern slugs of a page: every section type must name a pattern — an undeclared one is unmapped, never dropped', () => {
  const map = { types: { hero: { pattern: 'tracy/section-hero' }, team: { pattern: 'tracy/section-team' }, bare: {} } }
  assert.deepEqual(patternSlugsOf(['hero', 'hero', 'team'], map), { slugs: ['tracy/section-hero', 'tracy/section-team'], unmapped: [] })
  assert.deepEqual(patternSlugsOf(['hero', 'gone', 'bare'], map).unmapped, ['gone', 'bare'])
  assert.deepEqual(patternSlugsOf(['hero'], null).unmapped, ['hero'])
})

test('contract: a section type a page uses that the patterns map does not declare blocks the contract', () => {
  const pageMap = { source: { kind: 'joomla' }, theme: { hook: { selector: 'html', attribute: 'data-theme', lightValue: 'light', darkValue: 'dark' } }, pages: [{ file: 'index.html', view: 'front-page', title: 'Home', path: '/', sections: [{ modules: ['hero', 'ghost'] }] }] }
  const reviewConfig = { containers: { none: 'fixture' }, hook: { type: 'attribute', name: 'data-theme' }, templates: { '/': 'front-page' } }
  const map = { types: { hero: { pattern: 'tracy/section-hero', fields: { heading: { path: 'hero.heading' } } } } }
  const php = '<!-- wp:heading {"className":"wtb-hero__heading","metadata":{"name":"hero.heading"}} -->'
  let c
  try {
    c = buildContract({ pageMap, reference: { kind: 'url', pages: [{ page: 'index.html', url: 'http://gone.test/home' }] }, reviewConfig, themeTemplates: new Set(['front-page']), patternsMap: map, patternFiles: { hero: php }, specHash: 'sha256:abc', id: 'x' })
  } catch (e) {
    assert.fail(`the fixture page-map is not accepted by buildContract: ${e.message}`)
  }
  assert.ok(c.unresolvedPatterns?.some((u) => u.startsWith('ghost')), JSON.stringify(c.unresolvedPatterns))
  assert.ok(validateContract(c).some((e) => /ghost/.test(e)))
})

test('pattern registry: a linked patterns/ is refused, a linked or FIFO file is not a pattern, a large file is read only for its header', () => {
  const dir = theme()
  const real = path.join(dir, 'elsewhere')
  mkdirSync(real)
  writeFileSync(path.join(real, 'x.php'), '<?php\n/**\n * Slug: tracy/x\n */')
  symlinkSync(path.join(real, 'x.php'), path.join(dir, 'patterns/link.php'))
  execFileSync('mkfifo', [path.join(dir, 'patterns/fifo.php')])
  writeFileSync(path.join(dir, 'patterns/big.php'), `<?php\n/**\n * Slug: tracy/big\n */\n${'x'.repeat(3_000_000)}`)
  const reg = registeredPatterns(dir)
  assert.deepEqual([...reg.keys()].sort(), ['tracy/big', 'tracy/section-hero', 'tracy/section-team'], 'link and FIFO are skipped without blocking')
  const other = testDir('theme-linked')
  symlinkSync(path.join(dir, 'patterns'), path.join(other, 'patterns'))
  assert.throws(() => registeredPatterns(other), /is a link/)
})

test('pattern snapshot: the slug and the bytes come from one read; too large to read whole is not content', () => {
  const dir = theme()
  writeFileSync(path.join(dir, 'patterns/huge.php'), `<?php\n/**\n * Slug: tracy/huge\n */\n${'x'.repeat(5_000_000)}`)
  const snap = patternSnapshot(dir)
  const hero = patternEntries(snap, 'tracy/section-hero')
  assert.equal(hero.length, 1)
  assert.equal(hero[0].bytes.toString(), readFileSync(path.join(dir, 'patterns', hero[0].name), 'utf8'))
  assert.equal(patternEntries(snap, 'huge')[0].bytes, null, 'registers from its header; no content to measure or hash')
  assert.deepEqual(patternEntries(snap, 'tracy/none'), [])
})

test('fast gate verdict hashes a page with the pattern set visual-qa hashes with (--patterns-map)', async () => {
  const dir = theme()
  const spec = testDir('fg')
  writeFileSync(path.join(dir, 'patterns/acm-hero.php'), '<?php\n/**\n * Slug: tracy/section-cta\n */\nv1')
  const map = path.join(spec, 'patterns.map.json')
  writeFileSync(map, JSON.stringify({ types: { cta: { pattern: 'tracy/section-cta' } } }))
  const pg = { ...page, sections: ['cta'] }
  const c = { ...contract, pages: [pg] }
  const cfile = path.join(spec, 'visual.contract.json')
  writeFileSync(cfile, JSON.stringify(c))
  const server = createServer((_, res) => res.end('<p>x</p>'))
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  try {
    const site = `http://127.0.0.1:${server.address().port}`
    const run = path.join(spec, 'run')
    mkdirSync(path.join(run, 'notes'), { recursive: true })
    // a complete run folder: with these the only thing that can fail the verdict is a stale page hash
    const hash = pageHash({ contract: c, page: pg, themeDir: dir, targetHtml: '<p>x</p>', patternSlugs: ['tracy/section-cta'] }).hash
    writeFileSync(path.join(run, 'notes/machine.json'), '[]')
    writeFileSync(path.join(run, 'NOTES-s1.json'), JSON.stringify(notesOf('s1')))
    const evidenceReport = reportOf({ routes: ['/about/'], rowsAt: { '/about/@320': [row('shared-source-defect')] } })
    writeFileSync(path.join(run, 'intrinsic.json'), JSON.stringify(evidenceReport))
    const goodClaims = claimsOf(evidenceReport)
    let intr = goodClaims.intrinsic
    // the route inventory the verdict checks the probe against: the page-map of --spec, not the probe's own list
    for (const f of ['sections.json', 'content.json']) writeFileSync(path.join(spec, f), '{}')
    writeFileSync(path.join(spec, 'page-map.json'), JSON.stringify({ pages: [{ path: '/about/' }] }))
    const contractHash = identityOf({ contractPath: cfile, contract: c, specDir: spec }).contractHash
    const rec = (m) => {
      const v = visualOf({ cases: [{ page: pg.id, variants: ['v1'] }], contractHash, intrinsic: intr === undefined ? false : intr, summaryIntrinsic: goodClaims.summary })
      v.inputs = { patternsMap: m }
      v.pages[0].hash = hash
      writeFileSync(path.join(run, 'visual.json'), JSON.stringify(v))
      writeFileSync(path.join(run, 'index.json'), JSON.stringify(indexFor(v, run)))
    }
    const mapRec = { file: map, sha256: createHash('sha256').update(readFileSync(map)).digest('hex') }
    rec(mapRec)
    // the verdict also needs the finish audit of its dossier (the contract's directory): a clean current receipt over this run's interaction record
    cleanAudit({ dossier: spec, site, routes: ['/about/'], runs: [run], pages: ['/'] })
    const gate = fileURLToPath(new URL('../visual/fast-gate.mjs', import.meta.url))
    // async: the fixture server lives in this process
    // the route inventory the verdict checks the probe against: the page-map of --spec, not the probe's own list
    const verdict = (...extra) =>
      new Promise((resolve) => {
        const child = spawn(process.execPath, [gate, 'verdict', run, '--contract', cfile, '--site', site, '--theme', dir, '--spec', spec, ...extra], { stdio: 'ignore' })
        child.on('close', (status) => {
          let json = null
          try {
            json = JSON.parse(readFileSync(path.join(run, 'FAST-GATE.json'), 'utf8'))
          } catch {}
          resolve({ status, json })
        })
      })
    const stale = async (...a) => {
      rmSync(path.join(run, 'FAST-GATE.json'), { force: true })
      const r = await verdict(...a)
      return r.json?.stale ?? 'no verdict'
    }
    const passes = async (...a) => {
      rmSync(path.join(run, 'FAST-GATE.json'), { force: true })
      const r = await verdict(...a)
      assert.equal(r.json?.status, 'pass', JSON.stringify(r.json))
      assert.equal(r.status, 0)
    }
    await passes()
    // a run that recorded itself stale (--allow-stale) is no pass through the CLI either, whatever its hashes say
    const recorded = JSON.parse(readFileSync(path.join(run, 'visual.json'), 'utf8'))
    for (const mark of [(v) => (v.identity.stale = ['specHash: x']), (v) => (v.summary.stale = ['specHash: x'])]) {
      const v = JSON.parse(JSON.stringify(recorded))
      mark(v)
      writeFileSync(path.join(run, 'visual.json'), JSON.stringify(v))
      rmSync(path.join(run, 'FAST-GATE.json'), { force: true })
      const r = await verdict()
      assert.equal(r.json?.status, 'fail')
      assert.match(r.json.reasons.join(' '), /stale: the run recorded (identity|summary)\.stale/)
    }
    writeFileSync(path.join(run, 'visual.json'), JSON.stringify(recorded))
    // a page-map with a route the probe did not measure, or no --spec at all, is not a pass
    writeFileSync(path.join(spec, 'page-map.json'), JSON.stringify({ pages: [{ path: '/about/' }, { path: '/contact/' }] }))
    rmSync(path.join(run, 'FAST-GATE.json'), { force: true })
    assert.match(JSON.stringify((await verdict()).json.reasons), /not measured: \/contact\//)
    writeFileSync(path.join(spec, 'page-map.json'), JSON.stringify({ pages: [{ path: '/about/' }] }))
    cleanAudit({ dossier: spec, site, routes: ['/about/'], runs: [run], pages: ['/'] })
    assert.deepEqual(await stale(), [], 'no flag: the map recorded with the run gives the hash the run recorded')
    await passes('--patterns-map', map)
    // the edited pattern is the one the recorded map selects: the page is stale
    writeFileSync(path.join(dir, 'patterns/acm-hero.php'), '<?php\n/**\n * Slug: tracy/section-cta\n */\nv2')
    assert.deepEqual(await stale(), [pg.id], 'an edit of a registered pattern makes the run stale without the flag')
    rmSync(path.join(run, 'FAST-GATE.json'), { force: true })
    const failed = await verdict()
    assert.equal(failed.json.status, 'fail')
    assert.equal(failed.status, 1)
    writeFileSync(path.join(dir, 'patterns/acm-hero.php'), '<?php\n/**\n * Slug: tracy/section-cta\n */\nv1')
    // the intrinsic mobile probe (#65) is part of the gate: missing, failed or a site-only defect is never a pass; a shared one is listed
    for (const [bad, why] of [[undefined, 'no probe'], [{ status: 'not-run', reason: 'needs --source-site' }, 'not run'], [{ ...goodClaims.intrinsic, siteOnly: 2 }, 'site-only defect'], [{ ...goodClaims.intrinsic, errors: 1 }, 'unreadable route'], [{ ...goodClaims.intrinsic, file: 'other.json' }, 'another file']]) {
      intr = bad
      rec(mapRec)
      rmSync(path.join(run, 'FAST-GATE.json'), { force: true })
      const r = await verdict()
      assert.equal(r.json?.status, 'fail', why)
      assert.match(JSON.stringify(r.json.reasons), /intrinsic mobile/, why)
      assert.equal(r.status, 1)
    }
    // a status of `run` with no intrinsic.json is a claim without evidence
    const evidence = readFileSync(path.join(run, 'intrinsic.json'))
    rmSync(path.join(run, 'intrinsic.json'))
    intr = goodClaims.intrinsic
    rec(mapRec)
    rmSync(path.join(run, 'FAST-GATE.json'), { force: true })
    const noFile = await verdict()
    assert.equal(noFile.json?.status, 'fail')
    assert.match(JSON.stringify(noFile.json.reasons), /intrinsic\.json not readable/)
    writeFileSync(path.join(run, 'intrinsic.json'), evidence)
    await passes()
    // a run recorded with no map cannot vouch for a page that has sections: never a pass
    rec(false)
    rmSync(path.join(run, 'FAST-GATE.json'), { force: true })
    const unhashable = await verdict()
    assert.notEqual(unhashable.json?.status, 'pass', 'sections and no recorded map: the patterns are not in the hash')
    assert.notEqual(unhashable.status, 0)
    rec(mapRec)
    const other = path.join(spec, 'other.json')
    writeFileSync(other, JSON.stringify({ types: { cta: { pattern: 'tracy/section-cta' } }, note: 'x' }))
    assert.equal(await stale('--patterns-map', other), 'no verdict', 'another map than the recorded one is refused')
    assert.equal(await stale('--patterns-map'), 'no verdict', 'a valueless --patterns-map is refused, not treated as absent')
    execFileSync('mkfifo', [path.join(spec, 'fifo.json')])
    symlinkSync(map, path.join(spec, 'link.json'))
    assert.equal(await stale('--patterns-map', path.join(spec, 'fifo.json')), 'no verdict', 'a FIFO is refused without blocking')
    assert.equal(await stale('--patterns-map', path.join(spec, 'link.json')), 'no verdict', 'a link is refused')
    writeFileSync(map, JSON.stringify({ types: { cta: { pattern: 'tracy/section-cta' } }, changed: 1 }))
    assert.equal(await stale(), 'no verdict', 'a map changed since the run recorded it is refused')
    writeFileSync(map, JSON.stringify({ types: { cta: { pattern: 'tracy/section-cta' } } }))
    rec(false)
    assert.equal(await stale('--patterns-map', map), 'no verdict', 'a run that recorded no map does not verify against one')
  } finally {
    server.close()
  }
})

test('pattern files and the patterns map are read through a verified descriptor: link, FIFO, directory, oversize and malformed are refused', () => {
  const dir = theme()
  execFileSync('mkfifo', [path.join(dir, 'patterns/fifo.php')])
  symlinkSync(path.join(dir, 'patterns/section-hero.php'), path.join(dir, 'patterns/link.php'))
  assert.match(readPatternFile(dir, 'section-hero.php').toString(), /hero/)
  assert.throws(() => readPatternFile(dir, 'fifo.php'), /not a regular file/)
  assert.throws(() => readPatternFile(dir, 'link.php'), /is a link/)
  assert.throws(() => readPatternFile(dir, 'missing.php'), /no such file/)
  writeFileSync(path.join(dir, 'big.bin'), 'x'.repeat(100))
  assert.throws(() => readRegularFile(path.join(dir, 'big.bin'), 'x', 50), /larger than/)
  assert.equal(loadPatternsMap(undefined, false), null)
  assert.throws(() => loadPatternsMap(undefined, true), /needs a file/)
  assert.throws(() => loadPatternsMap('--json', true), /needs a file/)
  assert.throws(() => loadPatternsMap(dir, true), /not a regular file/)
  writeFileSync(path.join(dir, 'm.json'), '{"a":1}')
  assert.throws(() => loadPatternsMap(path.join(dir, 'm.json'), true), /not a patterns map/)
  writeFileSync(path.join(dir, 'm.json'), '{')
  assert.throws(() => loadPatternsMap(path.join(dir, 'm.json'), true), /not readable JSON/)
})

test('CLIs validate the whole argument list first: a repeated or unknown option and a valueless one are usage errors (exit 2)', () => {
  const gate = fileURLToPath(new URL('../visual/fast-gate.mjs', import.meta.url))
  const qa = fileURLToPath(new URL('../visual/visual-qa.mjs', import.meta.url))
  const dir = testDir('cli')
  const good = path.join(dir, 'good.json')
  const bad = path.join(dir, 'bad.json')
  writeFileSync(good, '{"types":{}}')
  writeFileSync(bad, '{"types":{}}')
  const exit = (file, args) => {
    const r = spawnSync(process.execPath, [file, ...args], { encoding: 'utf8', timeout: 60000 })
    return { code: r.status, err: r.stderr }
  }
  const gateBase = ['verdict', path.join(dir, 'run'), '--contract', path.join(dir, 'c.json'), '--site', 'http://127.0.0.1:1']
  const qaBase = ['--contract', path.join(dir, 'c.json'), '--site', 'http://127.0.0.1:1', '--out', path.join(dir, 'out')]
  for (const [file, base] of [[gate, gateBase], [qa, qaBase]]) {
    for (const extra of [
      ['--patterns-map', good, '--patterns-map', bad],
      ['--patterns-map'],
      ['--patterns-map', '--site', 'http://x'],
      ['--no-such-option', 'x'],
      ['--site', 'http://127.0.0.2:1']
    ]) {
      const r = exit(file, [...base, ...extra])
      assert.equal(r.code, 2, `${path.basename(file)} ${extra.join(' ')}: ${r.err}`)
      assert.match(r.err, /more than once|needs a value|unknown option/)
    }
  }
  assert.equal(exit(gate, [...gateBase, 'stray']).code, 2, 'a second positional is refused')
  assert.equal(exit(qa, [...qaBase, 'stray']).code, 2)
  assert.equal(exit(gate, ['nonsense']).code, 2)
})

test('page hash: a contract built from module ids hands the registry section types — the pattern slugs resolve, nothing is unmapped', () => {
  const sections = {
    slotBlock: 'tracy-base/slot',
    acm: [{ id: '111', type: 'hero', style: 'style-1', title: 'Hero', position: 'top', scope: 'page', published: true, ordering: 1, showtitle: false, pages: [], spacing: { top: null, bottom: null }, moduleClass: '', itemGroup: {}, fields: {}, items: [] }],
    custom: [],
    other: []
  }
  const map = { types: { 'hero:style-1': { pattern: 'tracy/section-hero', fields: {} } } }
  const c = buildContract({
    pageMap: { locales: ['en'], defaultLocale: 'en', pages: [{ file: 'About.html', view: 'page', title: 'About', path: '/about', locale: 'en', sections: [{ modules: ['111'] }] }] },
    reference: { pages: [] },
    reviewConfig: { containers: { none: 'fixture' }, templates: { '/about': 'page' } },
    themeTemplates: new Set(['page']),
    patternsMap: map,
    specHash: 'sha256:x',
    sections
  })
  assert.deepEqual(c.pages[0].sections, ['hero:style-1'])
  assert.deepEqual(patternSlugsOf(c.pages[0].sections, map), { slugs: ['tracy/section-hero'], unmapped: [] })
  assert.deepEqual(patternSlugsOf(['111'], map).unmapped, ['111'], 'the id itself is not a type')
})
