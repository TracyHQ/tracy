/**
 * The pipeline without a network: material built from a string (`prefetchFromHtml`), then every file
 * `writeDirection` promises — the same tree `@tracy/dsh-design-system` will read. Plus the input
 * rules that stand before any `path.join`.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { prefetchFromHtml } from '@tracy/od-brand-engine'

import {
  brandHostOf,
  extractBrand,
  kindOf,
  listBrands,
  manifestOf,
  NO_ENRICH,
  urlOf,
  writeDirection
} from '../src/host/pipeline.mjs'

test('brandHostOf / urlOf: public hosts only, bare or as a URL; never an IP, a port, a path or another scheme', () => {
  assert.equal(brandHostOf('https://www.Stripe.com/pricing?x=1'), 'stripe.com')
  assert.equal(brandHostOf('fijitrips.example'), 'fijitrips.example')
  assert.equal(brandHostOf('http://lucaswp.tracy.ai'), 'lucaswp.tracy.ai')
  assert.equal(brandHostOf('localhost'), null)
  assert.equal(brandHostOf('127.0.0.1'), null, 'digits-only labels are an IP')
  assert.equal(brandHostOf('-bad.com'), null)
  assert.equal(brandHostOf('../etc'), null)
  assert.equal(brandHostOf('file:///etc/passwd'), null)
  assert.equal(brandHostOf(''), null)
  assert.equal(urlOf('stripe.com'), 'https://stripe.com/')
  assert.equal(urlOf('https://stripe.com/pricing'), 'https://stripe.com/pricing')
  assert.equal(urlOf('ftp://stripe.com'), null)
  assert.equal(urlOf('javascript:alert(1)'), null)
})

test('kindOf: the lane site is own, everything else a reference, unless the caller says', () => {
  assert.equal(kindOf('fijitrips.example', 'fijitrips.example', undefined), 'own')
  assert.equal(kindOf('fijitrips.example', 'www.fijitrips.example', undefined), 'own')
  assert.equal(kindOf('stripe.com', 'fijitrips.example', undefined), 'reference')
  assert.equal(kindOf('stripe.com', null, undefined), 'reference')
  assert.equal(kindOf('fijitrips.example', 'fijitrips.example', 'reference'), 'reference')
})

test('manifestOf: the catalog row the library needs, category by kind', () => {
  const m = manifestOf({
    host: 'stripe.com',
    kind: 'reference',
    name: 'Stripe',
    slug: 'stripe',
    description: 'd',
    url: 'https://stripe.com/',
    finalUrl: 'https://stripe.com/',
    thin: false,
    blocked: false,
    notes: [],
    counts: {},
    extractedAt: '2026-09-06T00:00:00.000Z'
  })
  assert.equal(m.id, 'brand:stripe.com')
  assert.equal(m.category, 'Reference')
  assert.equal(
    manifestOf({ ...m, kind: 'own', notes: [], counts: {}, extractedAt: '' }).category,
    'Your brand'
  )
})

const HTML = `<!doctype html><html><head>
<title>Acme Tools | Hand tools since 1950</title>
<meta name="description" content="Acme makes hand tools that last a lifetime.">
<style>
  @font-face { font-family: "Glyphicons Halflings"; src: url(x.woff2); }
  body { font-family: "Glyphicons Halflings"; color: #222222; background: #ffffff }
  h1, h2, .lead { font-family: "Fraunces", serif; }
  a, .btn-primary { color: #b7410e; background-color: #b7410e; border-color: #b7410e }
  .btn-primary:hover { background-color: #8f320a }
  .muted { color: #777777 } .card { border: 1px solid #dddddd }
</style></head><body>
<nav><a href="/">Home</a><a href="/tools">Tools</a><a href="/about">About</a></nav>
<h1>Tools that outlive their owners.</h1>
<p class="lead">Forged in Sheffield, guaranteed for life. Every hammer, chisel and plane leaves the bench by hand.</p>
<h2>What we make</h2><p>Hammers, chisels, planes and the odd anvil.</p>
</body></html>`

test('writeDirection: from material to the whole Brand/<host>/ tree, refined and numbered like the 152', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'tracy-brand-'))
  try {
    const dir = path.join(root, 'Brand', 'acme.example')
    const material = await prefetchFromHtml(HTML, '', 'https://acme.example/', dir)
    assert.ok(material, 'material from a string')
    const steps = []
    // The three harvesters are injected: a fake logo lands, imagery yields two files, Google Fonts none.
    const enrich = {
      logo: async (_url, logosDir, slot) => {
        mkdirSync(logosDir, { recursive: true })
        writeFileSync(path.join(logosDir, 'apple-touch-icon.png'), 'png')
        slot.primary = 'logos/apple-touch-icon.png'
        return { changed: true }
      },
      imagery: async (_url, imageryDir, slot) => {
        mkdirSync(imageryDir, { recursive: true })
        for (const f of ['cover-0.jpg', 'hero-1.jpg']) writeFileSync(path.join(imageryDir, f), 'jpg')
        slot.samples = [
          { file: 'imagery/cover-0.jpg', kind: 'cover', caption: 'Social cover image' },
          { file: 'imagery/hero-1.jpg', kind: 'hero' }
        ]
        return { changed: true }
      },
      googleFonts: NO_ENRICH.googleFonts
    }
    const manifest = await writeDirection(material, {
      url: 'https://acme.example/',
      host: 'acme.example',
      kind: 'own',
      dir,
      enrich,
      onProgress: (s) => steps.push(s)
    })
    assert.deepEqual(steps, [
      'brand',
      'logo-fallback',
      'imagery',
      'imagery-done',
      'google-fonts',
      'google-fonts-done',
      'system',
      'library',
      'done'
    ])
    for (const f of [
      'prefetch/material.md',
      'brand.json',
      'DESIGN.md',
      'tokens.css',
      'components.html',
      'slots.json',
      'artifact-slots.json',
      'manifest.json',
      // The two files a vendored system has that a brand folder lacked (ADR 0023): the agent's
      // reading order and the compact component inventory.
      'USAGE.md',
      'components.manifest.json',
      'system/kit.html',
      'system/kit.dark.html',
      'system/variables.css',
      'system/artifacts/landing.html',
      'system/artifacts/typography.html',
      'system/artifacts/deck.html',
      'system/artifacts/poster.html',
      'system/artifacts/email.html',
      'system/artifacts/newsletter.html',
      'system/artifacts/form.html'
    ]) {
      assert.ok(existsSync(path.join(dir, f)), `${f} written`)
    }
    const brand = JSON.parse(readFileSync(path.join(dir, 'brand.json'), 'utf8'))
    assert.equal(brand.name, 'Acme Tools', 'the shortest title segment, not the tagline')
    assert.equal(brand.typography.display.family, 'Fraunces', 'the icon face lost to the real one')
    assert.equal(brand.colors.find((c) => c.role === 'accent').hex, '#b7410e')
    assert.equal(brand.logo.primary, 'logos/apple-touch-icon.png', 'the logo harvester filled the empty slot')
    assert.deepEqual(
      brand.imagery.samples.map((x) => x.file),
      ['imagery/cover-0.jpg', 'imagery/hero-1.jpg'],
      'the imagery harvester filled brand.imagery.samples'
    )
    assert.equal(manifest.counts.imagery, 2)
    assert.match(manifest.refined.join('\n'), /logo: none in the page; took logos\/apple-touch-icon\.png/)
    assert.equal(manifest.id, 'brand:acme.example')
    assert.equal(manifest.category, 'Your brand')
    assert.ok(manifest.refined.length >= 1, 'notes explain what moved')
    const tokens = readFileSync(path.join(dir, 'tokens.css'), 'utf8')
    assert.match(tokens, /--accent: #b7410e;/)
    assert.match(tokens, /--font-display: Fraunces, /)
    assert.equal((tokens.match(/^  --[a-z0-9-]+: /gm) ?? []).length, 56, 'the 56 tokens of the library')
    const usage = readFileSync(path.join(dir, 'USAGE.md'), 'utf8')
    assert.match(usage, /^# Acme Tools Usage/m)
    assert.match(usage, /tokens\.css/)
    const inventory = JSON.parse(readFileSync(path.join(dir, 'components.manifest.json'), 'utf8'))
    assert.equal(inventory.schemaVersion, 1)
    assert.equal(inventory.brandId, 'brand:acme.example')
    assert.equal(inventory.tokens.declared.length, 56)
    assert.ok(
      inventory.groups.some((g) => g.id === 'buttons' && g.present === true),
      'a kit has buttons'
    )
    const slots = JSON.parse(readFileSync(path.join(dir, 'slots.json'), 'utf8'))
    assert.equal(slots.schemaVersion, 'tracy-od-slots/v1')
    assert.ok(slots.slots.length > 100, `a kit has well over a hundred text slots (${slots.slots.length})`)
    assert.equal(manifest.counts.slots, slots.slots.length)
    const art = JSON.parse(readFileSync(path.join(dir, 'artifact-slots.json'), 'utf8'))
    assert.deepEqual(Object.keys(art.artifacts).sort(), [
      'deck',
      'email',
      'form',
      'landing',
      'newsletter',
      'poster',
      'typography'
    ])
    // Tracy's specimen: only the sentences are copy; hex codes, size labels and the notes are marked skip.
    assert.ok(
      art.artifacts.typography.length >= 8 && art.artifacts.typography.length <= 16,
      `typography slots: ${art.artifacts.typography.length}`
    )
    const typo = readFileSync(path.join(dir, 'system', 'artifacts', 'typography.html'), 'utf8')
    assert.match(typo, /Type scale/)
    assert.match(typo, /class="t-sec t-notes"/, "the brand's DESIGN.md rides along")
    assert.ok(art.artifacts.form.length > 10, 'the form artifact has its own slot map')
    assert.match(readFileSync(path.join(dir, 'components.html'), 'utf8'), /^<!doctype html>/i)

    const list = await listBrands(root)
    assert.equal(list.length, 1)
    assert.equal(list[0].id, 'brand:acme.example')
    assert.deepEqual(await listBrands(path.join(root, 'nowhere')), [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

/** Fork a site, phase 1 + 2: the crawl feeds the pipeline from disk — one network pass, then files. */
const FORK_SITE = {
  'https://acme.example/':
    '<!doctype html><html><head><title>Acme Tools | Hand tools since 1950</title><link rel="stylesheet" href="/main.css"></head>' +
    '<body><nav><a href="/tools/">Tools</a><a href="/about">About</a></nav><h1>Tools that outlive their owners.</h1>' +
    '<p class="lead">Forged in Sheffield, guaranteed for life.</p></body></html>',
  'https://acme.example/main.css':
    'body{font-family:"Fraunces",serif;color:#222222;background:#ffffff} a,.btn-primary{color:#b7410e;background-color:#b7410e}',
  'https://acme.example/tools/':
    '<html><head><title>Tools</title></head><body><h1>Every tool</h1></body></html>',
  'https://acme.example/about':
    '<html><head><title>About</title></head><body><h1>Since 1950</h1></body></html>'
}

test('extractBrand with pages: crawls first, then reads the inspiration from the folder; counts.pages in the manifest', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'tracy-brand-fork-'))
  try {
    const fetch = async (url) => {
      const body = FORK_SITE[url]
      if (body === undefined) return new Response('', { status: 404 })
      return new Response(body, {
        status: 200,
        headers: { 'content-type': url.endsWith('.css') ? 'text/css' : 'text/html' }
      })
    }
    const steps = []
    const r = await extractBrand({
      input: 'https://acme.example/',
      siteDir: root,
      siteKey: null,
      kind: 'reference',
      pages: true,
      fetch,
      enrich: NO_ENRICH,
      onProgress: (s) => steps.push(s)
    })
    assert.equal(r.ok, true, JSON.stringify(r))
    const dir = path.join(root, 'Brand', 'acme.example')
    assert.ok(existsSync(path.join(dir, 'pages', 'pages.json')))
    assert.ok(existsSync(path.join(dir, 'pages', '01-home.html')))
    assert.ok(existsSync(path.join(dir, 'brand.json')))
    assert.ok(existsSync(path.join(dir, 'tokens.css')))
    assert.equal(r.manifest.counts.pages, 3)
    assert.equal(r.manifest.source.pages, true)
    assert.equal(
      r.manifest.source.recon,
      'skipped:no-browser',
      'no browser on this machine → a note, not a failure'
    )
    assert.ok(steps.includes('crawl'), 'the crawl reports progress')
    assert.ok(steps.indexOf('crawl') < steps.indexOf('brand'), 'crawl before the inspiration')
    const brand = JSON.parse(readFileSync(path.join(dir, 'brand.json'), 'utf8'))
    assert.equal(
      brand.typography.display.family,
      'Fraunces',
      'the linked stylesheet reached phase 2 through pages/styles.css'
    )
    assert.equal(brand.colors.find((c) => c.role === 'accent').hex, '#b7410e')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('extractBrand on a forked host without pages: the fork is kept — re-crawled, not wiped (Extract again on the card)', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'tracy-brand-fork-again-'))
  try {
    const fetch = async (url) => {
      const body = FORK_SITE[url]
      if (body === undefined) return new Response('', { status: 404 })
      return new Response(body, {
        status: 200,
        headers: { 'content-type': url.endsWith('.css') ? 'text/css' : 'text/html' }
      })
    }
    const first = await extractBrand({
      input: 'https://acme.example/',
      siteDir: root,
      siteKey: null,
      kind: 'reference',
      pages: true,
      fetch,
      enrich: NO_ENRICH
    })
    assert.equal(first.ok, true)
    const again = await extractBrand({
      input: 'https://acme.example/',
      siteDir: root,
      siteKey: null,
      kind: 'reference',
      fetch,
      enrich: NO_ENRICH
    })
    assert.equal(again.ok, true, JSON.stringify(again))
    assert.equal(again.manifest.source.pages, true, 'still a fork')
    assert.equal(again.manifest.counts.pages, 3)
    assert.ok(
      existsSync(path.join(root, 'Brand', 'acme.example', 'pages', 'pages.json')),
      'pages/ survived the plain re-extract'
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
