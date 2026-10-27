// Images inside the header and footer template parts (#58): the seeder imports the source images
// the page content names, and in the same run writes each part's image blocks with the
// attachment's URL and id — a fresh stand is complete after one seed, and a second seed changes
// nothing. The part comes from the theme source (--theme-src) or, without one, from WordPress
// (get_block_file_template); both paths are exercised against the fake site.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { parseArgs, runSeed, resolvePartMedia } from '../seed.mjs'
import { fakeSite } from './lib/fake-site.mjs'

const THEME = 'wp-tracy-business'
const scratch = () => mkdtempSync(join(process.env.TRACY_TEST_SCRATCH ?? tmpdir(), 'seed-parts-'))
const body = (t) => `<!-- wp:paragraph --><p>${t}</p><!-- /wp:paragraph -->`
const figure = (src, alt = '') => `<figure class="wp-block-image size-full"><img src="${src}" alt="${alt}"/></figure>`

// The header: a navigation slot, a mega-menu card whose 40 px icon is a slot named by its source
// key (the placeholder src is the theme's), and an image block that names its source by src.
const HEADER = [
  '<!-- wp:group {"tagName":"header"} --><header class="wp-block-group">',
  '<!-- wp:navigation {"overlayMenu":"mobile"} /-->',
  `<!-- wp:image {"width":"40px","sizeSlug":"full","metadata":{"name":"images/icons/card.svg"}} -->${figure(`/wp-content/themes/${THEME}/assets/placeholder.svg`, 'Card icon')}<!-- /wp:image -->`,
  `<!-- wp:image {"sizeSlug":"full"} -->${figure('/images/icons/badge.png', 'Badge')}<!-- /wp:image -->`,
  '</header><!-- /wp:group -->'
].join('\n')

// The footer: an uploads-form logo (resolved through the image table of the modules on every
// page), a link to a source document image (rewriteMediaRefs), an external image and a theme
// asset (neither is a source image: both stay as written).
const FOOTER = [
  '<!-- wp:group {"tagName":"footer"} --><footer class="wp-block-group">',
  `<!-- wp:image {"sizeSlug":"full"} -->${figure('/wp-content/uploads/logo.png', 'Logo')}<!-- /wp:image -->`,
  '<!-- wp:paragraph --><p><a href="/images/docs/licence.png">Licence</a> · No. 214</p><!-- /wp:paragraph -->',
  `<!-- wp:image {"sizeSlug":"full"} -->${figure('https://cdn.example.com/badge.png', 'External')}<!-- /wp:image -->`,
  `<!-- wp:image {"sizeSlug":"full"} -->${figure(`/wp-content/themes/${THEME}/assets/mark.svg`, 'Mark')}<!-- /wp:image -->`,
  '</footer><!-- /wp:group -->'
].join('\n')

/** A home page whose body names every image the parts use; the footer module is on every page. */
function writeSpec(dir, edit = null) {
  const pm = [
    { file: 'index.html', path: '/', slug: 'home', title: 'Home', view: 'front-page' },
    { file: '404.html', path: '/404', slug: '404', title: 'Not found', view: '404' }
  ]
  const content = {
    site: { name: 'Fake', tagline: 'Site', locales: ['en'], defaultLocale: 'en' },
    pages: [
      {
        ...pm[0],
        parent: null,
        status: 'publish',
        meta: {},
        content: body('Home lead text for the page here.'),
        images: [
          { src: '/images/icons/card.svg', file: 'card.svg', original: 'images/icons/card.svg', alt: '' },
          { src: '/images/icons/badge.png', file: 'badge.png', original: 'images/icons/badge.png', alt: '' },
          { src: '/images/docs/licence.png', file: 'licence.png', original: 'images/docs/licence.png', alt: '' }
        ]
      },
      { ...pm[1], parent: null, status: 'publish', meta: {}, content: body('Nothing here, the page you asked for is gone.'), images: [] }
    ],
    posts: [],
    categories: [],
    archives: [],
    images: []
  }
  const sections = {
    acm: [],
    custom: [
      {
        id: '126',
        title: 'Company',
        position: 'footinfo-1',
        scope: 'page',
        pages: ['ALL'],
        html: '<div><p>Company line</p></div>',
        images: [{ src: '/wp-content/uploads/logo.png', file: 'logo.png', original: 'images/brand/logo.png', alt: 'Logo' }]
      }
    ],
    other: []
  }
  const menus = { menus: [{ menutype: 'tracy', title: 'Header', items: [{ id: 't1', label: 'Home', url: '/', published: true, children: [] }] }] }
  edit?.({ content, sections, menus })
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'page-map.json'), JSON.stringify({ locales: ['en'], defaultLocale: 'en', pages: pm }))
  writeFileSync(join(dir, 'content.json'), JSON.stringify(content))
  writeFileSync(join(dir, 'sections.json'), JSON.stringify(sections))
  writeFileSync(join(dir, 'menus.json'), JSON.stringify(menus))
  writeFileSync(join(dir, 'redirects.json'), JSON.stringify({ rules: [] }))
  writeFileSync(join(dir, 'patterns.map.json'), JSON.stringify({ types: {} }))
}

/** The theme source a part is read from: `<root>/theme/src/<theme>/parts/<slug>.html`. */
function writeThemeParts(root, parts) {
  const dir = join(root, 'theme', 'src', THEME, 'parts')
  mkdirSync(dir, { recursive: true })
  for (const [slug, markup] of Object.entries(parts)) writeFileSync(join(dir, `${slug}.html`), markup)
  return join(root, 'theme')
}

/**
 * The fake site's runner with the theme's part files as WordPress reads them
 * (get_block_file_template), and `failImport` making the next `wp media import` fail. `order`
 * lists the media imports and the batches that write a part, as they happen.
 */
function withParts(site, parts = {}) {
  const state = { failImport: 0, order: [] }
  const run = (args, opts) => {
    if (String(args[0]) === 'media' && String(args[1]) === 'import') {
      state.order.push('import')
      if (state.failImport > 0) {
        state.failImport--
        return { code: 1, stdout: '', stderr: 'Error: upload failed' }
      }
    }
    if (String(args[0]) === 'eval-file') {
      const b64 = /\$tracy_payload_b64 = '([^']*)'/.exec(opts?.stdin ?? '')?.[1]
      const items = b64 ? (JSON.parse(Buffer.from(b64, 'base64').toString('utf8')).items ?? []) : []
      if (items.some((it) => it.post_type === 'wp_template_part')) state.order.push('part')
    }
    if (String(args[0]) === 'eval' && String(args[1]).includes('get_block_file_template')) {
      const slug = /\/\/(\w+)"/.exec(args[1])?.[1]
      return { code: 0, stdout: parts[slug] ?? '', stderr: '' }
    }
    return site.wp.run(args, opts)
  }
  const out = (args, opts) => {
    const r = run(args, opts)
    if (r.code !== 0) throw new Error(`wp ${args.slice(0, 2).join(' ')}: ${r.stderr}`)
    return r.stdout.trim()
  }
  const json = (args, opts) => {
    const text = out(args.some((a) => String(a).startsWith('--format=')) ? args : [...args, '--format=json'], opts)
    return text ? JSON.parse(text) : null
  }
  const ids = (args, opts) => {
    const text = out([...args, '--format=ids'], opts)
    return text ? text.split(/\s+/).map(Number) : []
  }
  const wp = { run, out, json, ids, phpEval: (code, opts) => out(['eval', code], opts), calls: site.calls, dryRun: false }
  return { wp, state }
}

const fetchOk = async () => ({ status: 200, headers: new Map() })

async function seed(runner, root, { themeSrc = null, edit = null, n = 1 } = {}) {
  const spec = join(root, 'spec')
  writeSpec(spec, edit)
  const opts = parseArgs([
    '--spec', spec, '--wp', 'fake', '--theme', THEME,
    '--patterns-map', join(spec, 'patterns.map.json'), '--images', '/img',
    '--base-url', 'http://x', '--report', join(root, `report-${n}.json`),
    ...(themeSrc ? ['--theme-src', themeSrc] : [])
  ])
  const stderr = console.error
  console.error = () => {}
  try {
    return await runSeed(opts, { runner, fetch: fetchOk })
  } finally {
    console.error = stderr
  }
}

const part = (site, slug) => [...site.posts.values()].filter((p) => p.post_type === 'wp_template_part' && p.post_name === slug)
const attachments = (site) => [...site.posts.values()].filter((p) => p.post_type === 'attachment')
const urlOf = (site, id) => `/wp-content/uploads/${site.posts.get(id).post_name}.jpg`
const counted = (report) => Object.entries(report.counts).filter(([, v]) => v.created || v.updated)

/** A fake site that records which source file each attachment was imported from. */
function recordingSite() {
  const site = fakeSite()
  const sources = new Map()
  site.attachmentName = (file) => {
    const name = `att-${sources.size + 1}`
    sources.set(name, file.replace(/^\/img\//, ''))
    return name
  }
  site.sourceOf = (id) => sources.get(site.posts.get(id).post_name)
  site.idOf = (key) => attachments(site).find((a) => sources.get(a.post_name) === key)?.ID
  return site
}

/** Every resolved image of both parts, checked against the attachments the same run imported. */
function assertResolved(site) {
  const [header] = part(site, 'header')
  const [footer] = part(site, 'footer')
  const card = site.idOf('icons/card.svg')
  const badge = site.idOf('icons/badge.png')
  const logo = site.idOf('brand/logo.png')
  const licence = site.idOf('docs/licence.png')
  for (const id of [card, badge, logo, licence]) assert.ok(id, 'every image the parts use was imported')
  // The slot: the attachment's URL and id; its metadata.name, width and alt kept.
  assert.match(header.content, new RegExp(`<!-- wp:image \\{"width":"40px","sizeSlug":"full","metadata":\\{"name":"images/icons/card.svg"\\},"id":${card}\\} -->`))
  assert.match(header.content, new RegExp(`<img src="${urlOf(site, card)}" alt="Card icon" class="wp-image-${card}">`))
  assert.ok(!header.content.includes('placeholder.svg'), 'the placeholder src is replaced')
  // The image named by its src.
  assert.match(header.content, new RegExp(`<img src="${urlOf(site, badge)}" alt="Badge" class="wp-image-${badge}">`))
  assert.match(header.content, new RegExp(`"id":${badge}\\}`))
  assert.ok(!header.content.includes('/images/icons/'), 'no source image path is left in the header')
  // The navigation slot is still filled.
  assert.match(header.content, /<!-- wp:navigation \{"ref":\d+,"overlayMenu":"mobile"\} \/-->/)
  // Footer: the uploads-form logo through the module table, the linked document, the rest as written.
  assert.match(footer.content, new RegExp(`<img src="${urlOf(site, logo)}" alt="Logo" class="wp-image-${logo}">`))
  assert.match(footer.content, new RegExp(`<a href="${urlOf(site, licence)}">Licence</a>`))
  assert.ok(footer.content.includes('src="https://cdn.example.com/badge.png"'), 'an external image stays as written')
  assert.ok(footer.content.includes(`src="/wp-content/themes/${THEME}/assets/mark.svg"`), 'a theme asset stays as written')
  // The part's copy is still typeset (the no-break space binds "No. 214").
  assert.ok(footer.content.includes('No. 214'), 'the part copy is typeset')
}

// ---------------------------------------------------------------- whole seed

test('seed: part images from the theme source resolve to the attachments imported in the same run; a second seed is +0 ~0 (#58)', async () => {
  const site = recordingSite()
  const root = scratch()
  const themeSrc = writeThemeParts(root, { header: HEADER, footer: FOOTER })
  const { wp, state } = withParts(site)
  const first = await seed(wp, root, { themeSrc })
  assertResolved(site)
  assert.equal(first.counts.templateParts.created, 2)
  // One import, and it came before the one batch that wrote the parts.
  assert.deepEqual(state.order, ['import', 'part'])

  const ids = { header: part(site, 'header')[0].ID, footer: part(site, 'footer')[0].ID }
  const contents = { header: part(site, 'header')[0].content, footer: part(site, 'footer')[0].content }
  const media = attachments(site).length
  const second = await seed(wp, root, { themeSrc, n: 2 })
  assert.deepEqual(counted(second), [], 'nothing created or updated on the second seed')
  assert.equal(second.media.imported, 0)
  assert.equal(attachments(site).length, media)
  for (const slug of ['header', 'footer']) {
    assert.equal(part(site, slug).length, 1)
    assert.equal(part(site, slug)[0].ID, ids[slug])
    assert.equal(part(site, slug)[0].content, contents[slug])
  }
  assert.deepEqual(second.templateParts, ids)
})

test('seed: part images read from WordPress (get_block_file_template, no theme source) resolve the same way (#58)', async () => {
  const site = recordingSite()
  const root = scratch()
  const { wp } = withParts(site, { header: HEADER, footer: FOOTER })
  await seed(wp, root)
  assertResolved(site)
  const media = attachments(site).length
  const second = await seed(wp, root, { n: 2 })
  assert.deepEqual(counted(second), [])
  assert.equal(second.media.imported, 0)
  assert.equal(attachments(site).length, media)
})

test('seed: an override written before, with its images unresolved, is updated in place and then left alone (#58)', async () => {
  const site = recordingSite()
  const root = scratch()
  // What the seeder wrote before this fix: the part file with only its navigation filled.
  site.posts.set(90, { ID: 90, post_type: 'wp_template_part', post_name: 'header', post_title: 'Header', post_status: 'publish', content: HEADER, meta: { _tracy_seed: 'stale' } })
  site.posts.set(91, { ID: 91, post_type: 'wp_template_part', post_name: 'footer', post_title: 'Footer', post_status: 'publish', content: FOOTER, meta: { _tracy_seed: 'stale' } })
  const { wp } = withParts(site, { header: HEADER, footer: FOOTER })
  const first = await seed(wp, root)
  assert.equal(first.counts.templateParts.created, 0)
  assert.equal(first.counts.templateParts.updated, 2)
  assert.deepEqual(first.templateParts, { header: 90, footer: 91 })
  assertResolved(site)
  const second = await seed(wp, root, { n: 2 })
  assert.deepEqual(counted(second), [])
  assert.deepEqual(second.templateParts, { header: 90, footer: 91 })
})

test('seed: an ambiguous or unimported part image is not guessed; the report names the part (#58)', async () => {
  const site = recordingSite()
  const root = scratch()
  const header = [
    `<!-- wp:image {"metadata":{"name":"/wp-content/uploads/twin.png"}} -->${figure('/wp-content/uploads/twin.png', 'Twin')}<!-- /wp:image -->`,
    // The slot's own image was not imported; its src names one that was — still not guessed.
    `<!-- wp:image {"metadata":{"name":"images/icons/absent.png"}} -->${figure('/images/icons/badge.png', 'Absent')}<!-- /wp:image -->`,
    `<!-- wp:image -->${figure('/images/../secret.png', 'Traversal')}<!-- /wp:image -->`
  ].join('\n')
  const { wp } = withParts(site, { header, footer: FOOTER })
  const edit = ({ sections }) => {
    sections.custom[0].images.push(
      { src: '/wp-content/uploads/twin.png', file: 'twin.png', original: 'images/one/twin.png', alt: '' },
      { src: '/wp-content/uploads/twin.png', file: 'twin.png', original: 'images/two/twin.png', alt: '' }
    )
  }
  const report = await seed(wp, root, { edit })
  const [written] = part(site, 'header')
  assert.equal(written.content, header, 'nothing in the header resolves: it is written as the theme has it')
  const notes = report.notes.filter((n) => n.part === 'header')
  assert.ok(notes.some((n) => n.image === '/wp-content/uploads/twin.png' && /ambiguous/.test(n.note)), JSON.stringify(notes))
  assert.equal(notes.filter((n) => n.image === '/wp-content/uploads/twin.png').length, 1, 'the ambiguous name is noted once')
  assert.ok(notes.some((n) => n.image === 'images/icons/absent.png' && /not in the media index/.test(n.note)), JSON.stringify(notes))
  assert.ok(!notes.some((n) => n.image === '/images/../secret.png'), 'a path that leaves the images tree is not a source image')
})

test('seed: a failed media import writes no part; the next seed converges without duplicates (#58)', async () => {
  const site = recordingSite()
  const root = scratch()
  const { wp, state } = withParts(site, { header: HEADER, footer: FOOTER })
  state.failImport = 1
  await assert.rejects(seed(wp, root), /media import|upload failed/)
  assert.equal(part(site, 'header').length + part(site, 'footer').length, 0, 'no part is written before its images exist')
  await seed(wp, root, { n: 2 })
  assertResolved(site)
  assert.equal(part(site, 'header').length, 1)
  assert.equal(part(site, 'footer').length, 1)
  const media = attachments(site).length
  const third = await seed(wp, root, { n: 3 })
  assert.deepEqual(counted(third), [])
  assert.equal(attachments(site).length, media)
})

test('seed: a part source that is not a regular file is not read; the part comes from WordPress and the report says so (#58)', { timeout: 30000 }, async () => {
  const site = recordingSite()
  const root = scratch()
  const themeSrc = writeThemeParts(root, { footer: FOOTER })
  const fifo = join(themeSrc, 'src', THEME, 'parts', 'header.html')
  const made = spawnSync('mkfifo', [fifo])
  if (made.status !== 0) mkdirSync(fifo)
  const { wp } = withParts(site, { header: HEADER, footer: '' })
  const report = await seed(wp, root, { themeSrc })
  assert.ok(report.notes.some((n) => n.part === 'header' && /not a regular file/.test(n.note)))
  assertResolved(site)
})

test('seed: a part source that is a broken symlink is reported; the part comes from WordPress (#58)', async (t) => {
  const site = recordingSite()
  const root = scratch()
  const themeSrc = writeThemeParts(root, { footer: FOOTER })
  try {
    symlinkSync(join(root, 'nowhere.html'), join(themeSrc, 'src', THEME, 'parts', 'header.html'))
  } catch (e) {
    t.skip(`no symlinks here: ${e.code}`)
    return
  }
  const { wp } = withParts(site, { header: HEADER, footer: '' })
  const report = await seed(wp, root, { themeSrc })
  assert.ok(report.notes.some((n) => n.part === 'header' && /is a broken symlink; the part is read from the site/.test(n.note)), JSON.stringify(report.notes))
  assert.ok(!report.notes.some((n) => n.part === 'footer' && /regular file|symlink/.test(n.note)), 'the regular footer file is read without a note')
  assertResolved(site)
})

test('seed: a part with no file anywhere is skipped and noted, as before (#58)', async () => {
  const site = recordingSite()
  const root = scratch()
  const { wp } = withParts(site, { header: HEADER })
  const report = await seed(wp, root)
  assert.equal(part(site, 'footer').length, 0)
  assert.ok(report.notes.some((n) => n.part === 'footer' && /theme part file not found/.test(n.note)))
  assert.equal(part(site, 'header').length, 1)
})

// ---------------------------------------------------------------- resolvePartMedia

const hits = { 'images/a.png': { id: 7, url: '/wp-content/uploads/2026/09/a.png' } }
const byKey = (ref) => hits[String(ref).replace(/^\//, '')] ?? null

test('resolvePartMedia: a part with nothing to resolve comes back byte for byte (#58)', () => {
  const plain = '<!-- wp:group --><div class="wp-block-group"><!-- wp:site-logo /--><!-- wp:image {"sizeSlug":"full"} -->\n<figure class="wp-block-image"><img src="https://cdn.example.com/x.png" alt=""/></figure>\n<!-- /wp:image --></div><!-- /wp:group -->'
  assert.equal(resolvePartMedia(plain, byKey, { theme: 't' }), plain)
})

test('resolvePartMedia: an image slot takes the attachment URL and id; the src form is resolved too (#58)', () => {
  const slot = `<!-- wp:image {"metadata":{"name":"images/a.png"}} -->${figure('/wp-content/themes/t/assets/p.svg', 'A')}<!-- /wp:image -->`
  const out = resolvePartMedia(slot, byKey, { theme: 't' })
  assert.equal(out, '<!-- wp:image {"metadata":{"name":"images/a.png"},"id":7} --><figure class="wp-block-image size-full"><img src="/wp-content/uploads/2026/09/a.png" alt="A" class="wp-image-7"></figure><!-- /wp:image -->')
  const bySrc = `<!-- wp:image {"id":3} --><figure class="wp-block-image"><img src="/images/a.png" alt="" class="wp-image-3"/></figure><!-- /wp:image -->`
  assert.equal(
    resolvePartMedia(bySrc, byKey, { theme: 't' }),
    '<!-- wp:image {"id":7} --><figure class="wp-block-image"><img src="/wp-content/uploads/2026/09/a.png" alt="" class="wp-image-7"></figure><!-- /wp:image -->'
  )
  // Resolved once more, the written URL is not a reference to resolve again.
  const seen = []
  resolvePartMedia(out, (ref) => (seen.push(ref), byKey(ref)), { theme: 't' })
  assert.deepEqual(seen, ['images/a.png'])
})

test('resolvePartMedia: a slot name that is not an image key, markup that does not parse and unresolved refs stay as written (#58)', () => {
  const named = `<!-- wp:image {"metadata":{"name":"brand.logo"}} -->${figure('https://cdn.example.com/x.png')}<!-- /wp:image -->`
  assert.equal(resolvePartMedia(named, byKey, { theme: 't' }), named)
  const notes = []
  const broken = `<!-- wp:image {"metadata":{"name":"images/a.png"}} -->${figure('/images/a.png')}`
  assert.equal(resolvePartMedia(broken, () => null, { theme: 't', notes }), broken)
  assert.match(notes[0].note, /does not parse as blocks/)
  const missing = []
  const absent = `<!-- wp:image -->${figure('/images/b.png')}<!-- /wp:image -->`
  assert.equal(resolvePartMedia(absent, byKey, { theme: 't', notes: missing }), absent)
  assert.deepEqual(missing, [{ image: '/images/b.png', note: 'not in the media index; left as written' }])
})

test('resolvePartMedia: an image block left unresolved keeps its src even when that src would resolve; the rest is still rewritten (#58)', () => {
  const notes = []
  const block = `<!-- wp:image {"metadata":{"name":"images/missing.png"}} -->${figure('/images/a.png', 'A')}<!-- /wp:image -->`
  const link = '<!-- wp:paragraph --><p><a href="/images/a.png">A</a></p><!-- /wp:paragraph -->'
  const markup = `<!-- wp:group --><div class="wp-block-group">${block}${link}</div><!-- /wp:group -->`
  const out = resolvePartMedia(markup, byKey, { theme: 't', notes })
  assert.ok(out.includes(block), 'the unresolved image block is written as it was, its src and id included')
  assert.ok(out.includes('<a href="/wp-content/uploads/2026/09/a.png">A</a>'), 'a link outside it is still resolved')
  assert.deepEqual(notes, [{ image: 'images/missing.png', note: 'not in the media index; left as written' }])
})

test('resolvePartMedia: markup that does not parse is left whole, even where a src would resolve (#58)', () => {
  const notes = []
  const broken = `<!-- wp:image {"metadata":{"name":"images/a.png"}} -->${figure('/images/a.png')}<p><a href="/images/a.png">A</a></p>`
  assert.equal(resolvePartMedia(broken, byKey, { theme: 't', notes }), broken)
  assert.equal(notes.length, 1)
  assert.match(notes[0].note, /does not parse as blocks.*left as written/)
  const badJson = `<!-- wp:image {"metadata": -->${figure('/images/a.png')}<!-- /wp:image -->`
  assert.equal(resolvePartMedia(badJson, byKey, { theme: 't', notes }), badJson)
})

test('resolvePartMedia: an image block with a resolvable slot but no <img> is left as written and noted, not thrown on (#58)', () => {
  for (const empty of [
    '<!-- wp:image {"metadata":{"name":"images/a.png"}} /-->',
    '<!-- wp:image {"metadata":{"name":"images/a.png"}} --><figure class="wp-block-image"></figure><!-- /wp:image -->'
  ]) {
    const notes = []
    const markup = `${empty}<!-- wp:paragraph --><p><a href="/images/a.png">A</a></p><!-- /wp:paragraph -->`
    const out = resolvePartMedia(markup, byKey, { theme: 't', notes })
    assert.ok(out.startsWith(empty), out)
    assert.ok(out.includes('href="/wp-content/uploads/2026/09/a.png"'))
    assert.deepEqual(notes, [{ image: 'images/a.png', note: 'image block has no <img>; left as written' }])
  }
})

test('resolvePartMedia: a wp:image delimiter the block parser does not read leaves the part whole, noted (#58)', () => {
  const link = '<!-- wp:paragraph --><p><a href="/images/a.png">A</a></p><!-- /wp:paragraph -->'
  for (const bad of [
    '<!-- wp:image invalid /--><img src="/images/a.png">',
    '<!--wp:image {"metadata":{"name":"images/a.png"}} /--><img src="/images/a.png">',
    '<!-- WP:IMAGE --><figure><img src="/images/a.png"></figure><!-- /WP:IMAGE -->',
    `<!-- wp:image -->${figure('/images/a.png')}<!-- /wp:image --><!-- wp:image invalid /-->`,
    '<!-- wp:image/--><img src="/images/a.png">',
    '<!-- wp:core/image/--><img src="/images/a.png">',
    `<!-- wp:group --><div class="wp-block-group"><!-- wp:image/-->${figure('/images/a.png')}</div><!-- /wp:group -->`,
    '<!-- wp:paragraph --><p>x</p><!-- /wp:paragraph --><!--wp:separator /-->'
  ]) {
    const notes = []
    const markup = `${bad}${link}`
    assert.equal(resolvePartMedia(markup, byKey, { theme: 't', notes }), markup, bad)
    assert.equal(notes.length, 1, bad)
    assert.match(notes[0].note, /delimiter\(s\) the block parser does not read; the part left as written/)
  }
})

test('resolvePartMedia: an image block setImage cannot write is left as written and noted, not thrown on (#58)', () => {
  for (const block of [
    '<!-- wp:image {"metadata":{"name":"images/a.png"}} --><img src="/images/b.png" alt=""/><!-- /wp:image -->',
    '<!-- wp:image {"metadata":{"name":"images/a.png"}} --><p>caption</p><figure class="wp-block-image"><img src="/images/b.png" alt=""/></figure><!-- /wp:image -->',
    '<!-- wp:image --><img src="/images/a.png" alt=""/><!-- /wp:image -->',
    '<!-- wp:image {"metadata":{"name":"images/a.png"}} --><figure class="wp-block-image"><img src="/images/b.png"/><img src="/images/a.png"/></figure><!-- /wp:image -->',
    '<!-- wp:image {"metadata":{"name":"images/a.png"}} --><figure class="wp-block-image"><!-- x --><img src="/images/b.png"/></figure><!-- /wp:image -->',
    '<!-- wp:image {"metadata":{"name":"images/a.png"}} --><figure class="wp-block-image"><img src="/images/b.png"/><!-- wp:paragraph --><p><a href="/images/a.png">x</a></p><!-- /wp:paragraph --></figure><!-- /wp:image -->',
    '<!-- wp:image {"metadata":{"name":"images/a.png"}} --><figure class="wp-block-image"><img src="/images/b.png"/></figure><p>extra</p><!-- /wp:image -->',
    '<!-- wp:image --><figure class="wp-block-image"><img src="/images/a.png"/></figure><p>extra</p><!-- /wp:image -->',
    '<!-- wp:image --><figure class="wp-block-image"><img src="/images/a.png"/></figure><figure><img src="/images/b.png"/></figure><!-- /wp:image -->',
    '<!-- wp:image --><figure class="wp-block-image"><span><img src="/images/a.png"/></span></figure><!-- /wp:image -->',
    '<!-- wp:image --><figure class="wp-block-image"><img src="/images/a.png"/><figcaption><img src="/images/b.png"/></figcaption></figure><!-- /wp:image -->'
  ]) {
    const notes = []
    const markup = `<!-- wp:group --><div class="wp-block-group">${block}<!-- wp:paragraph --><p><a href="/images/a.png">A</a></p><!-- /wp:paragraph --></div><!-- /wp:group -->`
    const out = resolvePartMedia(markup, byKey, { theme: 't', notes })
    assert.ok(out.includes(block), `${block} → ${out}`)
    assert.ok(out.includes('<a href="/wp-content/uploads/2026/09/a.png">A</a>'), 'the rest of the part is still resolved')
    assert.deepEqual(notes, [{ image: notes[0]?.image, note: 'image block is not one element holding one <img>; left as written' }], block)
    assert.ok(['images/a.png', '/images/a.png'].includes(notes[0].image))
  }
})

test('resolvePartMedia: an image block the HTML parser would repair or respell is left as written and noted (#58)', () => {
  for (const block of [
    '<!-- wp:image --><figure><img src="/images/a.png"><figcaption><div>x</figcaption></figure><!-- /wp:image -->',
    '<!-- wp:image --><figure class="wp-block-image"><img src="/images/a.png"/><figcaption>a <b>b</b></b> c</figcaption></figure><!-- /wp:image -->',
    '<!-- wp:image --><figure class="wp-block-image"><img src="/images/a.png"/><figcaption><p>x</figcaption></figure><!-- /wp:image -->',
    '<!-- wp:image --><figure class="wp-block-image"><img src="/images/a.png"/><figcaption>x</br></figcaption></figure><!-- /wp:image -->',
    '<!-- wp:image {"metadata":{"name":"images/a.png"}} --><figure class="wp-block-image"><img src="/images/b.png"/><figcaption><em>x</figcaption></figure><!-- /wp:image -->',
    // A duplicate attribute: the parser keeps the first and drops the rest.
    '<!-- wp:image --><figure><img src="/images/a.png" alt="one" alt="two"></figure><!-- /wp:image -->',
    '<!-- wp:image --><figure class="wp-block-image" class="x"><img src="/images/a.png"/></figure><!-- /wp:image -->',
    '<!-- wp:image --><figure class="wp-block-image"><a href="/" href="/b"><img src="/images/a.png"/></a></figure><!-- /wp:image -->',
    // Markup the parser reads but writes back in another spelling.
    '<!-- wp:image --><figure class=wp-block-image><img src="/images/a.png"/></figure><!-- /wp:image -->',
    '<!-- wp:image --><figure class="wp-block-image"><img src="/images/a.png" alt=\'x\'/></figure><!-- /wp:image -->',
    '<!-- wp:image --><figure class="wp-block-image"><img src="/images/a.png"/><figcaption>&copy; 2026</figcaption></figure><!-- /wp:image -->',
    '<!-- wp:image --><FIGURE class="wp-block-image"><img src="/images/a.png"/></FIGURE><!-- /wp:image -->'
  ]) {
    const notes = []
    const markup = `<!-- wp:group --><div class="wp-block-group">${block}<!-- wp:paragraph --><p><a href="/images/a.png">A</a></p><!-- /wp:paragraph --></div><!-- /wp:group -->`
    const out = resolvePartMedia(markup, byKey, { theme: 't', notes })
    assert.ok(out.includes(block), `${block} → ${out}`)
    assert.ok(out.includes('<a href="/wp-content/uploads/2026/09/a.png">A</a>'), 'the rest of the part is still resolved')
    assert.deepEqual(notes, [{ image: notes[0]?.image, note: 'image block markup is not written back as it stands (the HTML parser repairs or respells it); left as written' }], block)
  }
})

test('resolvePartMedia: whitespace around a well-formed captioned image does not stop it resolving (#58)', () => {
  const notes = []
  const markup = '<!-- wp:image -->\n<figure class="wp-block-image">\n  <img src="/images/a.png" alt=""/>\n  <figcaption>a &amp; <br/>b</figcaption>\n</figure>\n<!-- /wp:image -->'
  const out = resolvePartMedia(markup, byKey, { theme: 't', notes })
  assert.ok(out.includes('class="wp-image-7"'), out)
  assert.ok(out.includes('<!-- wp:image {"id":7} -->'), out)
  assert.deepEqual(notes, [])
})

test('resolvePartMedia: an empty paired image block beside a resolvable one leaves the rest of the part resolving (#58)', () => {
  const notes = []
  const empty = '<!-- wp:image --><!-- /wp:image -->'
  const markup = `<!-- wp:group --><div class="wp-block-group">${empty}<!-- wp:image -->${figure('/images/a.png')}<!-- /wp:image --></div><!-- /wp:group -->`
  const out = resolvePartMedia(markup, byKey, { theme: 't', notes })
  assert.ok(out.includes('<img src="/wp-content/uploads/2026/09/a.png" alt="" class="wp-image-7">'), out)
  assert.ok(out.includes('<!-- wp:image {"id":7} -->'), out)
  assert.deepEqual(notes, [])
})

test('resolvePartMedia: a linked and captioned image block is the supported form and resolves (#58)', () => {
  const notes = []
  const markup = '<!-- wp:image --><figure class="wp-block-image"><a href="/"><img src="/images/a.png" alt="A > B"/></a><figcaption class="wp-element-caption">A <em>caption</em></figcaption></figure><!-- /wp:image -->'
  const out = resolvePartMedia(markup, byKey, { theme: 't', notes })
  assert.ok(out.includes('src="/wp-content/uploads/2026/09/a.png"'), out)
  assert.ok(out.includes('class="wp-image-7"'), out)
  assert.ok(out.includes('<figcaption class="wp-element-caption">A <em>caption</em></figcaption>'), out)
  assert.deepEqual(notes, [])
})
