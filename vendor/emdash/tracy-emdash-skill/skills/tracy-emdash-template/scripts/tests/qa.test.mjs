// F10: the acceptance gate must be able to FAIL, and must never say pass without evidence. A mock
// site renders exactly what the mini contract declares (theme hook, full-width menu with a
// centered inner grid, local media, favicon, hreflang) so the good shape passes the browser matrix
// and the routing audit; each defect from references/release-regressions.md is injected one at a
// time and must surface as a named finding. Receipts are validated by identity (contract hash,
// artifact hash, origin) and by evidence bytes, so stale or borrowed evidence is refused.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, existsSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { after, before, describe, it } from 'node:test'
import {
  assessObservations,
  assessReceipt,
  assessVisual,
  assessVisualReview,
  reusableRun
} from '../tools/qa.mjs'
import { hash } from '../tools/qa-contract.mjs'
import { pack } from '../tools/distribution.mjs'
import { miniContract, SOURCE } from './fixtures/mini/qa-contract.mjs'
const execFileP = promisify(execFile)
const HERE = new URL('.', import.meta.url).pathname
const QA = path.resolve(HERE, '../tools/qa.mjs')
const LOGO = readFileSync(path.join(SOURCE, 'logo.png'))

// ---- mock site: the EmDash output the contract describes, with optional defects ----
const PAGES = {
  '/': { locale: 'de', title: 'Willkommen', tagline: 'Handgefertigte Möbel.', menu: '/kontakt', alt: '/fr' },
  '/kontakt': { locale: 'de', title: 'Kontakt', form: true, alt: '/fr/contact' },
  '/fr': { locale: 'fr', title: 'Bienvenue', tagline: 'Meubles faits main.', menu: '/fr/contact', alt: '/' },
  '/fr/contact': { locale: 'fr', title: 'Contact', form: true, alt: '/kontakt' }
}
function html(origin, p, spec, defects, foreign) {
  const de = spec.locale === 'de' ? p : spec.alt,
    fr = spec.locale === 'fr' ? p : spec.alt
  const title = defects.wrongText && p === '/' ? 'Wilkommen' : spec.title
  const logo = defects.foreignMedia ? `${foreign}/_emdash/api/media/file/logo.png` : '/logo.png'
  return `<!doctype html><html lang="${spec.locale}"><head><meta charset="utf-8"><title>${title}</title>
<link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/style.css">
<link rel="canonical" href="${origin}${p}">
${defects.noHreflang ? '' : `<link rel="alternate" hreflang="de" href="${origin}${de}"><link rel="alternate" hreflang="fr" href="${origin}${fr}"><link rel="alternate" hreflang="x-default" href="${origin}${de}">`}
<script>try{var t=localStorage.getItem('mini-theme');if(t==='dark'${defects.stuckTheme ? '&&false' : ''})document.documentElement.setAttribute('data-theme','dark')}catch(e){}</script>
</head><body><header>${spec.tagline ? `<img src="${logo}" alt="Atelier Nord">` : ''}
<button id="menu-trigger" aria-expanded="false">Menü</button>
<div id="menu-panel" hidden><div class="inner"><a href="${spec.menu ?? '/'}">Kontakt</a></div></div></header>
<main><h1>${title}</h1>${spec.tagline ? `<p>${spec.tagline}</p>` : '<form><input name="email"></form>'}</main>
<footer><nav><ul><li><a href="/">Start</a></li><li><a href="/kontakt">Kontakt</a></li><li><a href="/fr">FR</a></li></ul></nav><p><span>©</span> <span>Atelier Nord</span> <span>2026</span></p><p><small>Impressum</small> · <small>Datenschutz</small></p></footer>
<script>
const btn=document.getElementById('menu-trigger'),panel=document.getElementById('menu-panel');
btn.addEventListener('click',()=>{panel.hidden=!panel.hidden;btn.setAttribute('aria-expanded',String(!panel.hidden))});
document.addEventListener('keydown',(e)=>{if(e.key==='Escape'${defects.noEscape ? '&&false' : ''}){panel.hidden=true;btn.focus()}});
document.addEventListener('click',(e)=>{if(!panel.contains(e.target)&&e.target!==btn)panel.hidden=true;btn.setAttribute('aria-expanded',String(!panel.hidden))});
</script></body></html>`
}
function serve(defects = {}, foreign = '') {
  return new Promise((res) => {
    const srv = http.createServer((req, r) => {
      const p = new URL(req.url, 'http://x').pathname
      const origin = `http://127.0.0.1:${srv.address().port}`
      const send = (code, type, body) => {
        r.writeHead(code, { 'content-type': type })
        r.end(body)
      }
      if (p === '/style.css')
        return send(
          200,
          'text/css',
          `body{font-family:${defects.fontFallback ? "'NoSuchFace'," : ''}serif;margin:0}html[data-theme=dark] body{background:#141821;color:#eee}html[data-theme=dark] #menu-panel{background:#262c3b}html[data-theme=dark] button{background:#333;color:#eee;border-color:#444}html[data-theme=dark] a{color:#eee}#menu-panel[hidden]{display:none}#menu-panel{position:absolute;left:0;width:${defects.narrowPanel ? '640px' : '100%'};background:#eee}.inner{max-width:640px;margin:0 auto}`
        )
      if (p === '/logo.png')
        return defects.brokenImage ? send(200, 'text/html', '<h1>Login</h1>') : send(200, 'image/png', LOGO)
      if (p === '/_emdash/api/media/file/logo.png') return send(200, 'image/png', LOGO)
      if (p === '/favicon.svg')
        return defects.noFavicon
          ? send(404, 'text/plain', 'no')
          : send(200, 'image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg"/>')
      if (PAGES[p]) return send(200, 'text/html; charset=utf-8', html(origin, p, PAGES[p], defects, foreign))
      send(
        404,
        'text/html; charset=utf-8',
        '<!doctype html><html lang="de"><head><title>404</title><meta name="robots" content="noindex"></head><body><h1>Nicht gefunden</h1></body></html>'
      )
    })
    srv.listen(0, '127.0.0.1', () =>
      res({ origin: `http://127.0.0.1:${srv.address().port}`, close: () => new Promise((r) => srv.close(r)) })
    )
  })
}
// ---- a template tree to run qa.mjs from (its cwd is the template) ----
function templateTree() {
  const root = mkdtempSync(path.join(tmpdir(), 'qa-tpl-'))
  for (const [f, body] of Object.entries({
    'package.json': '{"name":"mini"}',
    'pnpm-lock.yaml': 'lockfileVersion: 9',
    'public/favicon.svg': '<svg/>',
    'seed/seed.json': '{"entries":[]}',
    'src/pages/index.astro': '<h1/>'
  })) {
    mkdirSync(path.dirname(path.join(root, f)), { recursive: true })
    writeFileSync(path.join(root, f), body)
  }
  cpSync(path.join(HERE, 'fixtures/mini/template.config.json'), path.join(root, 'template.config.json'))
  return root
}
const small = () => {
  // one page, one variant, both states: enough to trip every browser defect quickly
  const c = miniContract()
  c.pages = [c.pages[0]]
  c.pages[0].variants = ['mobile-dark']
  c.locales = ['de']
  for (const f of c.source.files)
    if (f.disposition === 'converted' && f.path !== 'de/index.html')
      Object.assign(f, { disposition: 'excluded', reason: 'not in the smoke matrix' })
  return c
}
async function qa(root, contract, site, extra = [], env = {}) {
  const cfile = path.join(root, `contract-${Date.now()}-${Math.random().toString(36).slice(2)}.json`)
  writeFileSync(cfile, JSON.stringify(contract))
  const out = path.join(mkdtempSync(path.join(tmpdir(), 'qa-out-')), 'run')
  const args = [
    QA,
    '--contract',
    cfile,
    '--source',
    SOURCE,
    '--site',
    site,
    '--out',
    out,
    '--config',
    'template.config.json',
    ...extra
  ]
  let code = 0
  try {
    await execFileP(process.execPath, args, {
      cwd: root,
      env: { ...process.env, ...env },
      maxBuffer: 64 * 1024 * 1024
    })
  } catch (e) {
    code = e.code
    if (!existsSync(path.join(out, 'report.json'))) throw new Error(e.stderr || e.message)
  }
  const report = JSON.parse(readFileSync(path.join(out, 'report.json'), 'utf8'))
  const observations = existsSync(path.join(out, 'observations.json'))
    ? JSON.parse(readFileSync(path.join(out, 'observations.json'), 'utf8')).observations
    : []
  return { code, report, observations, out }
}
const findings = (r) => r.observations.flatMap((o) => o.findings)
const receipt = (
  dir,
  gate,
  identity,
  evidenceText = 'ok',
  extraFiles = gate === 'visual-review' ? ['VISUAL.md', 'visual.json'] : []
) => {
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, `${gate}.txt`), evidenceText)
  for (const f of extraFiles) writeFileSync(path.join(dir, f), evidenceText)
  const r = {
    gate,
    status: 'pass',
    ...identity,
    reviewer: 'test',
    method: 'scripted',
    runtime: process.version,
    capturedAt: new Date().toISOString(),
    cases: ['de-home/mobile-dark/default'],
    evidence: [
      { path: `${gate}.txt`, sha256: hash(evidenceText) },
      ...extraFiles.map((f) => ({ path: f, sha256: hash(evidenceText) }))
    ]
  }
  writeFileSync(path.join(dir, `${gate}.json`), JSON.stringify(r))
  return r
}

describe('F10 — acceptance gate', () => {
  it('assessReceipt: a visual-review receipt must carry VISUAL.md and visual.json from the visual pass', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'rcpt-'))
    const identity = {
      contractHash: 'sha256:' + 'a'.repeat(64),
      artifactHash: 'sha256:' + 'b'.repeat(64),
      origin: 'http://127.0.0.1:1'
    }
    const r = receipt(dir, 'visual-review', identity, 'ok', [])
    assert.match(assessReceipt('visual-review', r, identity, dir).errors.join(' '), /must include VISUAL\.md/)
  })
  it('assessVisual: only a full-scope report can pass the visual gate; a fast-gate or targeted report fails it however clean, an older unscoped report counts as full', () => {
    const contract = { visual: { stages: [{ id: 'light', variants: ['a'] }] } }
    const clean = (scope) => ({
      ...(scope ? { scope: { kind: scope } } : {}),
      summary: { pages: 2, axes: 2, findings: 0, unclassified: 0 },
      stages: [{ id: 'light', status: 'pass' }],
      pages: []
    })
    assert.equal(assessVisual(clean('full'), contract).status, 'pass')
    assert.equal(
      assessVisual(clean(null), contract).status,
      'pass',
      'reports written before scopes existed are full runs'
    )
    for (const scope of ['fast-gate', 'targeted-debug']) {
      const g = assessVisual(clean(scope), contract)
      assert.equal(g.status, 'fail', scope)
      assert.match(g.errors.join(' '), new RegExp(`scope ${scope}.*never passes`))
    }
  })
  it('assessVisualReview: five machine-checked conditions, no signature', () => {
    const contract = {
      visual: {
        stages: [
          { id: 'light', variants: ['a'] },
          { id: 'dark', variants: ['b'] }
        ]
      }
    }
    const identity = { contractHash: 'x', artifactHash: 'y', origin: 'http://127.0.0.1:1' }
    const run = (stage, at, over = {}) => {
      const dir = mkdtempSync(path.join(tmpdir(), `vr-${stage}-`))
      mkdirSync(path.join(dir, 'notes'))
      const files = {
        'index.json': JSON.stringify({ shots: [{ stage, file: '/x.png', consumers: ['layout'] }] }),
        'visual.json': JSON.stringify({
          site: identity.origin,
          at,
          stages: [{ id: stage, status: 'pass' }],
          ...(over.scope ? { scope: { kind: over.scope } } : {})
        }),
        [`NOTES-${stage}.json`]: JSON.stringify({
          counts: { open: 0, reopened: 0, lee: 0, leeFlagged: 0 },
          coverage: { missing: [] },
          lenses: ['layout'],
          todos: [],
          ...over.notes
        }),
        'notes/machine.json': JSON.stringify(over.machine ?? [])
      }
      const pinned = {}
      for (const [rel, text] of Object.entries(files)) {
        writeFileSync(path.join(dir, rel), text)
        pinned[rel] = hash(text)
      }
      return { run: dir, files: pinned }
    }
    const good = {
      visual: {
        stages: { light: run('light', '2026-09-14T10:00:00Z'), dark: run('dark', '2026-09-14T11:00:00Z') },
        agents: { qa: ['qa-1'], coding: ['fix-1'] }
      }
    }
    assert.deepEqual(assessVisualReview(good, contract, identity), [])
    // 1. a todo left open
    const open = {
      ...good,
      visual: {
        ...good.visual,
        stages: {
          ...good.visual.stages,
          dark: run('dark', '2026-09-14T11:00:00Z', {
            notes: { counts: { open: 1, reopened: 0, lee: 0, leeFlagged: 0 } }
          })
        }
      }
    }
    assert.match(assessVisualReview(open, contract, identity).join(' '), /1 todo\(s\) open/)
    // 2. a picture nobody opened
    const unopened = {
      ...good,
      visual: {
        ...good.visual,
        stages: {
          ...good.visual.stages,
          light: run('light', '2026-09-14T10:00:00Z', {
            notes: { coverage: { missing: [{ file: '/x.png', lens: 'layout' }] } }
          })
        }
      }
    }
    assert.match(assessVisualReview(unopened, contract, identity).join(' '), /not opened by a consumer/)
    // 3. the final run still has a machine finding
    const dirty = {
      ...good,
      visual: {
        ...good.visual,
        stages: {
          ...good.visual.stages,
          light: run('light', '2026-09-14T10:00:00Z', { machine: [{ id: 'M1' }] })
        }
      }
    }
    assert.match(assessVisualReview(dirty, contract, identity).join(' '), /machine finding/)
    // 4. the same agent reviewed and fixed
    const same = { ...good, visual: { ...good.visual, agents: { qa: ['a'], coding: ['a'] } } }
    assert.match(assessVisualReview(same, contract, identity).join(' '), /both reviewed and fixed/)
    // 5. a pinned file changed after the receipt
    const tampered = structuredClone(good)
    writeFileSync(path.join(tampered.visual.stages.light.run, 'notes', 'machine.json'), '[{"id":"M9"}]')
    assert.match(assessVisualReview(tampered, contract, identity).join(' '), /changed since the receipt/)
    // a fast-gate run named as a stage's final run: clean, but not the acceptance run
    const subset = {
      ...good,
      visual: {
        ...good.visual,
        stages: { ...good.visual.stages, light: run('light', '2026-09-14T10:00:00Z', { scope: 'fast-gate' }) }
      }
    }
    assert.match(assessVisualReview(subset, contract, identity).join(' '), /scope fast-gate, not full/)
    // order: dark before light is not "in order"
    const reversed = {
      ...good,
      visual: {
        ...good.visual,
        stages: { light: run('light', '2026-09-14T12:00:00Z'), dark: run('dark', '2026-09-14T11:00:00Z') }
      }
    }
    assert.match(assessVisualReview(reversed, contract, identity).join(' '), /not later than/)
  })
  it(
    'gate visual: pending without --visual; runs visual-qa with --visual and fails on a mock defect',
    async () => {
      const root = templateTree()
      const clean = await serve(),
        stuck = await serve({ stuckTheme: true })
      try {
        let r = await qa(root, small(), clean.origin)
        assert.equal(r.report.gates.visual.status, 'pending')
        r = await qa(root, small(), stuck.origin, ['--visual', '--visual-scans', 'hover'])
        assert.equal(r.report.gates.visual.status, 'fail', JSON.stringify(r.report.gates.visual))
        assert.ok(r.report.gates.visual.errors.some((e) => /theme-not-applied/.test(e)))
        r = await qa(root, small(), clean.origin, ['--visual', '--visual-scans', 'hover'])
        assert.equal(r.report.gates.visual.status, 'pass', JSON.stringify(r.report.gates.visual))
        assert.ok(existsSync(path.join(r.out, 'visual', 'VISUAL.md')))
      } finally {
        await clean.close()
        await stuck.close()
      }
    },
    { timeout: 240000 }
  )
  it('assessObservations: coverage must be exact and every case green', () => {
    const c = miniContract()
    const good = (id) => ({
      id,
      status: 'pass',
      screenshot: `${id}.png`,
      assertions: [{ issue: 'x', pass: true }],
      findings: []
    })
    const all = ['de-home', 'de-kontakt', 'fr-home', 'fr-contact'].flatMap((p) =>
      ['desktop-light', 'mobile-dark'].flatMap((v) =>
        (p.endsWith('home') ? ['default', 'menu-open'] : ['default']).map((s) => good(`${p}/${v}/${s}`))
      )
    )
    assert.equal(assessObservations(c, all).status, 'pass')
    assert.match(assessObservations(c, all.slice(1)).errors.join(), /incomplete or unexpected case coverage/)
    assert.match(assessObservations(c, [...all, all[0]]).errors.join(), /duplicate observations/)
    const one = all.map((o) => ({ ...o }))
    one[3].findings = ['image decodes: x']
    one[3].status = 'fail'
    assert.match(
      assessObservations(c, one).errors.join(),
      /case failed or empty: de-home\/mobile-dark\/menu-open/
    )
    // A passing case carries no screenshot (pictures are the visual gate's; browser shoots failures only).
    const noShot = all.map((o) => ({ ...o }))
    delete noShot[0].screenshot
    assert.deepEqual(assessObservations(c, noShot).errors, [])
  })
  it('reusableRun: a previous run is aggregated again only under the same contract, artifact and origin', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'qa-reuse-'))
    const identity = { contractHash: 'sha256:c', artifactHash: 'sha256:a', origin: 'http://127.0.0.1:1' }
    writeFileSync(
      path.join(dir, 'observations.json'),
      JSON.stringify({ identity, observations: [{ id: 'x' }] })
    )
    assert.equal(reusableRun(dir, identity).observations.length, 1)
    assert.throws(() => reusableRun(dir, { ...identity, artifactHash: 'sha256:b' }), /artifactHash differs/)
    assert.throws(
      () => reusableRun(mkdtempSync(path.join(tmpdir(), 'qa-empty-')), identity),
      /no observations.json/
    )
  })
  it('assessReceipt: identity, evidence bytes and time are all checked', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'qa-rcpt-'))
    const identity = { contractHash: 'sha256:c', artifactHash: 'sha256:a', origin: 'http://127.0.0.1:1' }
    const r = receipt(dir, 'build', identity)
    assert.equal(assessReceipt('build', r, identity, dir).status, 'pass')
    assert.match(
      assessReceipt('build', r, { ...identity, artifactHash: 'sha256:b' }, dir).errors.join(),
      /stale or wrong artifactHash/
    )
    assert.match(
      assessReceipt('security', r, identity, dir).errors.join(),
      /does not report this gate passing/
    )
    writeFileSync(path.join(dir, 'build.txt'), 'edited later')
    assert.match(assessReceipt('build', r, identity, dir).errors.join(), /changed evidence: build.txt/)
    assert.match(
      assessReceipt(
        'build',
        { ...r, evidence: [{ path: '../x', sha256: 'sha256:0' }] },
        identity,
        dir
      ).errors.join(),
      /unsafe evidence path/
    )
    assert.match(
      assessReceipt('build', { ...r, capturedAt: '2099-01-01T00:00:00Z' }, identity, dir).errors.join(),
      /invalid capture time/
    )
  })

  describe('against the mock site', () => {
    let good, foreign, root
    before(async () => {
      good = await serve()
      foreign = await serve()
      root = templateTree()
    })
    after(async () => {
      await good.close()
      await foreign.close()
    })

    it('good site, full contract: browser matrix and routing audit pass; without artifact and receipts the report is pending, exit 1', async () => {
      const r = await qa(root, miniContract(), good.origin, ['--browser'])
      assert.equal(r.report.gates.contracts.status, 'pass')
      assert.equal(r.report.gates.preflight.status, 'pass', JSON.stringify(r.report.gates.preflight))
      assert.equal(r.report.gates.browser.status, 'pass', JSON.stringify(findings(r)))
      assert.equal(r.observations.length, 12)
      assert.ok(
        r.observations.every((o) => o.screenshot === null),
        'passing cases carry no screenshot (the visual gate takes the pictures)'
      )
      assert.deepEqual(
        r.observations.filter((o) => o.variant === 'mobile-dark').map((o) => o.theme),
        Array(6).fill('dark')
      )
      assert.deepEqual(
        r.observations.filter((o) => o.variant === 'desktop-light').map((o) => o.theme),
        Array(6).fill(null)
      )
      assert.ok(r.observations.find((o) => o.id === 'de-home/desktop-light/menu-open').panel.width >= 1279)
      assert.equal(r.report.gates.routing.status, 'pass', JSON.stringify(r.report.gates.routing))
      assert.equal(r.report.gates.distribution.status, 'pending')
      assert.equal(r.report.gates.build.status, 'pending')
      assert.equal(r.report.status, 'pending')
      assert.equal(r.code, 1)
    })
    it('with a verified artifact and current receipts for every review gate the report passes, exit 0; a receipt for another artifact fails it', async () => {
      const artifact = path.join(mkdtempSync(path.join(tmpdir(), 'qa-art-')), 'a')
      const { artifactHash } = pack(root, miniContract(), artifact)
      const first = await qa(root, miniContract(), good.origin, ['--artifact', artifact])
      assert.equal(
        first.report.gates.distribution.status,
        'pass',
        JSON.stringify(first.report.gates.distribution)
      )
      assert.equal(first.report.artifactHash, artifactHash)
      const identity = { contractHash: first.report.contractHash, artifactHash, origin: good.origin }
      const reviews = mkdtempSync(path.join(tmpdir(), 'qa-reviews-'))
      for (const g of [
        'build',
        'security',
        'visual-review',
        'font-review',
        'viewing-contexts',
        'editability',
        'forms',
        'recovery',
        'clean-install',
        'independent'
      ])
        receipt(reviews, g, identity)
      const r = await qa(root, miniContract(), good.origin, [
        '--browser',
        '--visual',
        '--visual-scans',
        'hover',
        '--artifact',
        artifact,
        '--reviews',
        reviews
      ])
      assert.equal(
        r.report.status,
        'pass',
        JSON.stringify(
          Object.fromEntries(Object.entries(r.report.gates).filter(([, g]) => g.status !== 'pass'))
        )
      )
      assert.equal(r.code, 0)
      assert.match(readFileSync(path.join(r.out, 'REPORT.md'), 'utf8'), /# Acceptance: pass/)
      // the same receipts against a re-packed artifact from a changed source tree are stale
      writeFileSync(path.join(root, 'src/pages/index.astro'), '<h1>v2</h1>')
      const stale = await qa(root, miniContract(), good.origin, [
        '--artifact',
        artifact,
        '--reviews',
        reviews
      ])
      assert.equal(stale.report.gates.distribution.status, 'fail')
      assert.match(stale.report.gates.build.errors.join(), /stale or wrong artifactHash/)
      assert.equal(stale.report.status, 'fail')
      writeFileSync(path.join(root, 'src/pages/index.astro'), '<h1/>')
    })
    const defects = [
      ['brokenImage', /image decodes: .*\/logo.png/],
      ['stuckTheme', /observed theme matches requested theme \(dark\)/],
      ['narrowPanel', /panel spans viewport width/],
      ['wrongText', /content matches source: title/],
      ['noFavicon', /static asset response: .*favicon.svg/],
      ['noEscape', /Escape closes panel/]
    ]
    for (const [defect, re] of defects) {
      it(`defect ${defect} is a named browser finding and fails the gate`, async () => {
        const site = await serve({ [defect]: true })
        try {
          const r = await qa(root, small(), site.origin, ['--browser'])
          assert.equal(r.report.gates.browser.status, 'fail')
          assert.ok(
            findings(r).some((f) => re.test(f)),
            `${re} not in ${JSON.stringify(findings(r))}`
          )
          assert.equal(r.report.status, 'fail')
        } finally {
          await site.close()
        }
      })
    }
    it('an image served from a foreign private origin fails the viewing-context assertion even though it decodes', async () => {
      const site = await serve({ foreignMedia: true }, foreign.origin)
      try {
        const r = await qa(root, small(), site.origin, ['--browser'])
        assert.ok(
          findings(r).some((f) => /local media uses viewing origin/.test(f)),
          JSON.stringify(findings(r))
        )
        assert.ok(!findings(r).some((f) => /image decodes/.test(f)), 'the image itself did decode')
      } finally {
        await site.close()
      }
    })
    it('a glyph rendered by a font outside the locale allow-list is a finding (system substitution is never silent)', async () => {
      const site = await serve({ fontFallback: true })
      try {
        const c = small()
        c.fonts.allowed = { de: ['NoSuchFace'] }
        const r = await qa(root, c, site.origin, ['--browser'])
        assert.ok(
          findings(r).some((f) => /font .* is not in the allowed list for de/.test(f)),
          JSON.stringify(findings(r))
        )
      } finally {
        await site.close()
      }
    })
    it('missing hreflang fails the routing gate through audit.mjs while the browser matrix still passes', async () => {
      const site = await serve({ noHreflang: true })
      try {
        const r = await qa(root, small(), site.origin, ['--browser'])
        assert.equal(r.report.gates.browser.status, 'pass', JSON.stringify(findings(r)))
        assert.equal(r.report.gates.routing.status, 'fail')
        assert.match(r.report.gates.routing.errors.join(), /hreflang/)
      } finally {
        await site.close()
      }
    })
    it('browser unavailable → blocked, never pass; a contract whose source drifted → fail before any measurement', async () => {
      const r = await qa(root, small(), good.origin, ['--browser'], {
        RENDER_CHROME_PATH: '/nonexistent/chrome'
      })
      assert.equal(r.report.gates.browser.status, 'blocked')
      assert.notEqual(r.report.status, 'pass')
      const drifted = mkdtempSync(path.join(tmpdir(), 'qa-drift-'))
      cpSync(SOURCE, drifted, { recursive: true })
      writeFileSync(path.join(drifted, 'style.css'), 'body{}')
      const cfile = path.join(root, 'drift.json')
      writeFileSync(cfile, JSON.stringify(small()))
      const out = path.join(mkdtempSync(path.join(tmpdir(), 'qa-out-')), 'run')
      await assert.rejects(
        execFileP(
          process.execPath,
          [QA, '--contract', cfile, '--source', drifted, '--site', good.origin, '--out', out, '--browser'],
          { cwd: root }
        )
      )
      const report = JSON.parse(readFileSync(path.join(out, 'report.json'), 'utf8'))
      assert.equal(report.gates.contracts.status, 'fail')
      assert.equal(report.gates.browser, undefined)
    })
  })
})
