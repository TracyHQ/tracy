/**
 * PIC-1 of the Template Design System Readiness check: an icon the release shows as a picture (an
 * `<img src="….svg">` in its content or markup, a CSS background url) must not be drawn in the
 * template's brand colour, since a worn design system cannot recolour a closed picture. The case that
 * asked for it: JA Kinetic WP 1.0.11's Integrations icons (`stroke="#A3E635"`, the template's lime,
 * inserted from the media library), lime and olive under every system (20/10/2026). Judged against the
 * slot contracts this tree carries, with no measurement: it runs on Check again.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { gunzipSync, gzipSync } from 'node:zlib'

import { checkRelease, RULES } from '../src/lib/template-design-system-readiness/index.js'
import {
  refsInStylesheet,
  refsInText
} from '../src/lib/template-design-system-readiness/readers/icon-refs.js'
import {
  brandColoursOf,
  brandDrawing
} from '../src/lib/template-design-system-readiness/readers/svg-paint.js'
import { summarizeDsReadiness } from '../src/lib/template-design-system-readiness/severity.js'

/** A minimal ustar tar.gz of `files` (path -> text). */
function tarGz(files) {
  const blocks = []
  for (const [name, text] of Object.entries(files)) {
    const body = Buffer.from(text)
    const header = Buffer.alloc(512)
    header.write(name, 0, 100)
    header.write('0000644\0', 100)
    header.write(`${body.length.toString(8).padStart(11, '0')}\0`, 124)
    header.write('0', 156)
    header.write('ustar\0', 257)
    header.fill(' ', 148, 156)
    let sum = 0
    for (const b of header) sum += b
    header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148)
    blocks.push(header, body, Buffer.alloc((512 - (body.length % 512)) % 512))
  }
  return gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)]))
}

const q = (/** @type {string} */ s) => `'${s.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`

/** The Kinetic Integrations icon as released: one lime stroke. */
const LIME_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#A3E635" stroke-width="2"><path d="M8 6l-6 6 6 6M16 6l6 6-6 6"/></svg>'
/** An illustration: the brand green beside an orange and a blue. */
const ILLUSTRATION =
  '<svg viewBox="0 0 400 300"><rect fill="#4D7C0F" width="10" height="10"/><circle fill="#F97316" r="4"/><path stroke="#2563EB" d="M0 0"/></svg>'
/** A grey line icon. */
const GREY_ICON = '<svg viewBox="0 0 24 24"><path stroke="#6B7280" fill="none" d="M0 0"/></svg>'

/**
 * A WordPress release of JA Kinetic (theme wp-ja-kinetic 1.1.18, contract wordpress-ja-kinetic) whose
 * posts are `posts` ([type, status, content]) and whose webroot holds `files`.
 */
function kineticWp(posts, files = {}, css = '') {
  const setting = {
    schemaVersion: 'tracy-setting/v1',
    platform: 'wordpress',
    label: 'JA Kinetic',
    version: '1.0.11',
    cms: '7.1.3',
    template: 'ja-kinetic',
    install: {
      webroot: { file: 'w.tar.gz', sha256: 'a'.repeat(64) },
      database: { file: 'd.sql.gz', sha256: 'b'.repeat(64) }
    }
  }
  const sql = [
    'CREATE TABLE `tr_posts` (\n  `ID` bigint NOT NULL,\n  `post_type` varchar(20),\n  `post_status` varchar(20),\n  `post_name` varchar(200),\n  `post_content` longtext\n);',
    ...posts.map(
      ([type, status, content], i) =>
        `INSERT INTO \`tr_posts\` VALUES (${i + 1},${q(type)},${q(status)},${q(`p${i + 1}`)},${q(content)});`
    )
  ].join('\n')
  const all = {
    'tracy_setting.json': Buffer.from(JSON.stringify(setting)),
    'd.sql.gz': gzipSync(sql),
    'w.tar.gz': tarGz({
      'wp-content/themes/wp-ja-kinetic/style.css': `/*\nTheme Name: JA Kinetic\nVersion: 1.1.18\n*/\n${css}`,
      ...files
    })
  }
  return source('quickstart/ja-kinetic/wp7', all)
}

const source = (tag, all) => ({
  tag,
  where: `memory:${tag}`,
  names: async () => Object.keys(all).sort(),
  read: async (name) => (name in all ? all[name] : null)
})

/** A Joomla release of JA Prodex (contract joomla-ja-prodex) whose one custom module shows `html`. */
function prodex(html, files = {}) {
  const setting = {
    schemaVersion: 'tracy-setting/v1',
    platform: 'joomla',
    label: 'JA Prodex',
    version: '1.0.4',
    cms: '6.0.3',
    template: 'ja_prodex',
    install: {
      webroot: { file: 'w.tar.gz', sha256: 'a'.repeat(64) },
      database: { file: 'd.sql.gz', sha256: 'b'.repeat(64) }
    }
  }
  const sql = [
    'CREATE TABLE `#__modules` (\n  `id` int NOT NULL,\n  `title` varchar(100),\n  `content` text,\n  `published` tinyint\n);',
    `INSERT INTO \`#__modules\` VALUES (1,'Features',${q(html)},1);`
  ].join('\n')
  return source('quickstart/ja-prodex/j6', {
    'tracy_setting.json': Buffer.from(JSON.stringify(setting)),
    'd.sql.gz': gzipSync(sql),
    'w.tar.gz': tarGz({ 'templates/ja_prodex/css/template.css': 'body { color: #333 }', ...files })
  })
}

const pic1 = async (release) =>
  (await checkRelease(release, { only: ['PIC-1'] })).results.find((r) => r.id === 'PIC-1')

const img = (src, cls = '') =>
  `<figure class="wp-block-image"><img src="https://demo.test/${src}" alt="" class="${cls}"/></figure>`

test('PIC-1 is registered for every CMS, owned by the template, and must-fix', async () => {
  const rule = RULES.find((r) => r.id === 'PIC-1')
  assert.ok(rule)
  assert.deepEqual(rule.platforms, ['joomla', 'wordpress', 'emdash'])
  assert.equal(rule.owner, 'template')
  const failing = await pic1(
    kineticWp([['page', 'publish', img('wp-content/uploads/2026/09/icon-code.svg')]], {
      'wp-content/uploads/2026/09/icon-code.svg': LIME_ICON
    })
  )
  assert.equal(failing.status, 'fail')
  assert.deepEqual(
    summarizeDsReadiness({ results: [failing] }).mustFix.map((m) => m.rule),
    ['PIC-1']
  )
})

test('PIC-1 fails the Kinetic WP Integrations icons: a lime <img> SVG of the media library', async () => {
  const r = await pic1(
    kineticWp([['page', 'publish', img('wp-content/uploads/2026/09/icon-code.svg', 'wp-image-1482')]], {
      'wp-content/uploads/2026/09/icon-code.svg': LIME_ICON
    })
  )
  assert.equal(r.status, 'fail')
  assert.match(r.message, /wp-content\/uploads\/2026\/09\/icon-code\.svg/)
  assert.match(r.details[0], /#a3e635/)
})

test('PIC-1 passes what a system can paint or what is not a brand icon', async (t) => {
  const cases = {
    'a multi-colour illustration': [
      img('wp-content/uploads/hero.svg'),
      { 'wp-content/uploads/hero.svg': ILLUSTRATION }
    ],
    'a grey icon': [img('wp-content/uploads/g.svg'), { 'wp-content/uploads/g.svg': GREY_ICON }],
    'a logo in the brand colour': [
      img('wp-content/uploads/logo-kinetic.svg'),
      { 'wp-content/uploads/logo-kinetic.svg': LIME_ICON }
    ],
    'an SVG embedding a photograph': [
      img('wp-content/uploads/p.svg'),
      {
        'wp-content/uploads/p.svg':
          '<svg><image href="data:image/png;base64,AAAA"/><rect fill="#A3E635"/></svg>'
      }
    ],
    'a brand icon drawn as a mask': [
      '<span style="mask-image:url(/wp-content/uploads/i.svg);background-color:var(--ds-c-accent)"></span>',
      { 'wp-content/uploads/i.svg': LIME_ICON }
    ]
  }
  for (const [name, [content, files]] of Object.entries(cases))
    await t.test(name, async () =>
      assert.equal((await pic1(kineticWp([['page', 'publish', content]], files))).status, 'pass')
    )
})

test('PIC-1 reads only content a visitor sees: not attachments, revisions, drafts or trash', async () => {
  const files = { 'wp-content/uploads/i.svg': LIME_ICON }
  const hidden = [
    ['attachment', 'inherit', 'https://demo.test/wp-content/uploads/i.svg'],
    ['revision', 'inherit', img('wp-content/uploads/i.svg')],
    ['page', 'draft', img('wp-content/uploads/i.svg')],
    ['page', 'trash', img('wp-content/uploads/i.svg')]
  ]
  assert.equal((await pic1(kineticWp(hidden, files))).status, 'pass')
})

test('PIC-1 reads a stylesheet background: a brand data: SVG fails, the same as a mask passes', async () => {
  const lime = `url("data:image/svg+xml,${encodeURIComponent(LIME_ICON)}")`
  const bg = await pic1(kineticWp([], {}, `.check li::before { background-image: ${lime} }`))
  assert.equal(bg.status, 'fail')
  assert.match(bg.details[0], /\.check li::before/)
  const mask = await pic1(
    kineticWp([], {}, `.check li::before { mask-image: ${lime}; background: currentColor }`)
  )
  assert.equal(mask.status, 'pass')
})

test('PIC-1 passes an icon the template recolours in its worn scope', async () => {
  const css = ':root:has(#tracy-ds-slot) .integ img { filter: brightness(0) }'
  const r = await pic1(
    kineticWp(
      [['page', 'publish', `<div class="integ">${img('wp-content/uploads/i.svg')}</div>`]],
      { 'wp-content/uploads/i.svg': LIME_ICON },
      css
    )
  )
  assert.equal(r.status, 'pass')
})

test('PIC-1 passes an icon the slot contract turns ink, and fails one it only inverts', async () => {
  // joomla-ja-prodex: style-4 icons { filter: brightness(0) }; style-2 icons are inkImages (inverted, hues kept)
  const violet = '<svg viewBox="0 0 24 24"><path fill="#5137FF" d="M0 0"/></svg>'
  const files = { 'images/icons/i.svg': violet }
  const icon = (style) =>
    `<div class="acm-features ${style}"><div class="features-item"><div class="img-icon"><img src="images/icons/i.svg"></div></div></div>`
  assert.equal((await pic1(prodex(icon('style-4'), files))).status, 'pass')
  const kept = await pic1(prodex(icon('style-2'), files))
  assert.equal(kept.status, 'fail')
  assert.match(kept.details[0], /images\/icons\/i\.svg: drawn in #5137ff/)
  // a module that is not published shows nothing
  const unpublished = prodex(icon('style-2'), files)
  const read = unpublished.read
  unpublished.read = async (n) =>
    n === 'd.sql.gz'
      ? gzipSync(
          gunzipSync(await read(n))
            .toString('utf8')
            .replace(',1);', ',0);')
        )
      : read(n)
  assert.equal((await pic1(unpublished)).status, 'pass')
})

test('the SVG reading: brand hue within 15 degrees, references found where they are shown', () => {
  const brand = brandColoursOf([{ accent: '#4D7C0F', 'accent-hover': '#3F6A0A' }], false)
  assert.deepEqual(
    brand.map((b) => b.hex),
    ['#4d7c0f', '#3f6a0a']
  )
  assert.ok(brandDrawing(LIME_ICON, brand))
  assert.equal(brandDrawing(ILLUSTRATION, brand), null)
  assert.equal(brandDrawing(GREY_ICON, brand), null)
  assert.deepEqual(brandColoursOf([{ accent: '#333333' }], false), [])
  const refs = refsInText(
    '{"icon":"images\\/icons\\/a.svg#joomlaImage://local-images/icons/a.svg?width=24"} <img class="x" src="/b.svg">',
    'row'
  )
  assert.deepEqual(
    refs.map((r) => [r.via, r.ref]),
    [
      ['field', 'images/icons/a.svg'],
      ['img', 'b.svg']
    ]
  )
  const css = refsInStylesheet(
    '.a { background: url(../img/x.svg) } .b { -webkit-mask: url(../img/y.svg) }',
    'css/t.css',
    'templates/t/'
  )
  assert.deepEqual(
    css.map((r) => r.ref),
    ['templates/t/img/x.svg']
  )
})

test('PIC-1 leaves out a status picture: a field-state tick, or one drawn in a status colour', async () => {
  // Kinetic's success is #30A46C: a tick in it is a state, even on a :valid selector or not
  const tick = `url("data:image/svg+xml,${encodeURIComponent('<svg viewBox="0 0 8 8"><path fill="#30A46C" d="M0 0"/></svg>')}")`
  assert.equal(
    (await pic1(kineticWp([], {}, `.form-control.is-valid { background-image: ${tick} }`))).status,
    'pass'
  )
  const brandTick = `url("data:image/svg+xml,${encodeURIComponent(LIME_ICON)}")`
  assert.equal(
    (await pic1(kineticWp([], {}, `.was-validated .form-control:valid { background-image: ${brandTick} }`)))
      .status,
    'pass'
  )
})

test('PIC-1 keeps a state the worn rule does not cover: :focus painted after the worn rest rule', async () => {
  const lime = `url("data:image/svg+xml,${encodeURIComponent(LIME_ICON)}")`
  const css = [
    `:where(:root:has(#tracy-ds-slot)) .finder .q.q { background-image: none }`,
    `.finder .q { background-image: ${lime} }`
  ].join('\n')
  assert.equal(
    (await pic1(kineticWp([], {}, css))).status,
    'pass',
    'the rest picture is cleared under a system'
  )
  const r = await pic1(kineticWp([], {}, `${css}\n.finder .q:focus { background-image: ${lime} }`))
  assert.equal(r.status, 'fail')
  assert.match(r.details[0], /\.finder \.q:focus/)
})

test('PIC-1 reads a JA ACM image field through its layout: a flood filter follows, a plain <img> does not', async () => {
  const violet = '<svg viewBox="0 0 24 24"><path stroke="#5137FF" fill="none" d="M0 0"/></svg>'
  const params = JSON.stringify({
    'jatools-config': JSON.stringify({
      ':type': 'ja_prodex:features-intro',
      'features-intro': {
        'jatools-layout-features-intro': 'style-3',
        'features-intro[img-icon]': [
          'images/icons/i.svg#joomlaImage://local-images/icons/i.svg?width=256&height=256'
        ]
      }
    })
  })
  const release = (layout) => {
    const setting = {
      schemaVersion: 'tracy-setting/v1',
      platform: 'joomla',
      label: 'JA Prodex',
      version: '1.0.4',
      cms: '6.0.3',
      template: 'ja_prodex',
      install: {
        webroot: { file: 'w.tar.gz', sha256: 'a'.repeat(64) },
        database: { file: 'd.sql.gz', sha256: 'b'.repeat(64) }
      }
    }
    const sql = [
      'CREATE TABLE `#__modules` (\n  `id` int NOT NULL,\n  `title` varchar(100),\n  `params` text,\n  `published` tinyint\n);',
      `INSERT INTO \`#__modules\` VALUES (1,'Make you happy',${q(params)},1);`
    ].join('\n')
    return source('quickstart/ja-prodex/j6', {
      'tracy_setting.json': Buffer.from(JSON.stringify(setting)),
      'd.sql.gz': gzipSync(sql),
      'w.tar.gz': tarGz({
        'templates/ja_prodex/css/template.css': 'body { color: #333 }',
        'templates/ja_prodex/acm/features-intro/tmpl/style-3.php': layout,
        'images/icons/i.svg': violet
      })
    })
  }
  const flood = `<div class="features-item"><div class="img-icon"><img style="filter: url(#tint)" src="<?php echo $helper->get('img-icon', $i) ?>" alt="" /></div></div>`
  assert.equal((await pic1(release(flood))).status, 'pass')
  const plain = '<div class="clients"><img src="<?php echo $card[\'img\']; ?>" alt=""></div>'
  const r = await pic1(release(plain))
  assert.equal(r.status, 'fail')
  assert.match(r.details[0], /images\/icons\/i\.svg.*acm\/features-intro\/tmpl\/style-3\.php/)
  const mask = `<span class="ic" style="mask-image: url(<?php echo $icon ?>)"></span>`
  assert.equal(
    (await pic1(release(mask))).status,
    'pass',
    'a layout that draws the field only as a mask shows no picture'
  )
})

test('PIC-1 matches a rule that names one ACM picture by its address against the address the layout prints', async () => {
  // JA Kinetic J6's Integrations icons: acm/clients style-2 prints each card's image as
  // <img src="<?php echo $card['img']; ?>">, and the slot contract masks each icon by its file
  // (img[src$="icon-code.svg"]): matched against the PHP, no address rule ever reached (20/10/2026)
  const { acmRefs } = await import('../src/lib/template-design-system-readiness/readers/icon-refs.js')
  const { selectorReaches } = await import(
    '../src/lib/template-design-system-readiness/readers/recolour-rules.js'
  )
  const params = JSON.stringify({
    'jatools-config': JSON.stringify({
      ':type': 'ja_kinetic:clients',
      clients: {
        'jatools-layout-clients': 'style-2',
        'clients[item-image]': ['images/integrations/icon-code.svg']
      }
    })
  })
  // the module's id printed before its classes ended the tag at `?>` (the real layout's first line)
  const php = `<div id="acm-clients-<?php echo $mid; ?>" class="ja-acm acm-clients style-2"><?php if ($card['img']) : ?><span class="acm-clients-mark"><img src="<?php echo $card['img']; ?>" alt="<?php echo $alt; ?>" loading="lazy"></span><?php endif; ?></div>`
  const refs = acmRefs(params, new Map([['acm/clients/tmpl/style-2.php', php]]), 'jd_modules.params')
  assert.equal(refs?.length, 1)
  const chain = refs[0].chain ?? []
  assert.ok(selectorReaches('.acm-clients.style-2 .acm-clients-mark img[src$="icon-code.svg"]', chain))
  assert.ok(!selectorReaches('.acm-clients.style-2 .acm-clients-mark img[src$="icon-cloud.svg"]', chain))
  assert.ok(
    selectorReaches('.acm-clients.style-2 .acm-clients-mark img', chain),
    'a rule for every picture still reaches it'
  )
})

test("PIC-1 covers a template's dark twin of a state by the Joomla contract rule for that state", async () => {
  // JA Voyara 1.0.10: `.voy-itinerary__button.accordion-button:not(.collapsed)::after` and its twin under
  // `html.t4-dark` draw the open item's minus in the brand terracotta. A Joomla contract rule is written under
  // six :root and outranks the twin, so one rule recolours both; a WordPress worn rule (no such weight) does not
  const { selectorCovers } = await import(
    '../src/lib/template-design-system-readiness/readers/recolour-rules.js'
  )
  const open = '.voy-itinerary__button.accordion-button:not(.collapsed)::after'
  assert.ok(selectorCovers(open, `html.t4-dark ${open}`, { outranksRoot: true }))
  assert.ok(!selectorCovers(open, `html.t4-dark ${open}`), 'without the weight the twin is its own rule')
  assert.ok(
    !selectorCovers(open.replace(':not(.collapsed)', ''), `html.t4-dark ${open}`, { outranksRoot: true }),
    'the state still counts'
  )
  assert.ok(
    !selectorCovers(open, `.other ${open}`, { outranksRoot: true }),
    'only a root or body lead is dropped'
  )
})

test('PIC-1 counts a sideRules recolour only on its own side: a picture fixed on one side still fails', async () => {
  // joomla-ja-prodex: `.btn-close` takes a grayscale filter in sideRules.dark only, so a violet close
  // picture is recoloured under a dark system and stays violet under a light one (a false negative
  // before 20/10/2026: any contract block counted for both sides)
  const violet = '<svg viewBox="0 0 16 16"><path fill="#5137FF" d="M0 0"/></svg>'
  const css = `.btn-close { background-image: url("data:image/svg+xml,${encodeURIComponent(violet)}") }`
  const r = await pic1(prodex('<p>x</p>', { 'templates/ja_prodex/css/template.css': css }))
  assert.equal(r.status, 'fail')
  assert.match(r.details[0], /\.btn-close/)
  assert.match(r.details[0], /light side/)
  const { contractBlocks } = await import(
    '../src/lib/template-design-system-readiness/readers/recolour-rules.js'
  )
  const blocks = contractBlocks({
    rules: { '.a': { filter: 'brightness(0)' } },
    sideRules: { dark: { '.b': { filter: 'brightness(0)' } }, light: { '.c': { color: 'red' } } },
    pictureRules: { '.d': { 'mask-image': 'url(x.svg)' } }
  })
  assert.deepEqual(
    blocks.map((b) => [b.selector, b.sides.join('+')]),
    [
      ['.a', 'light+dark'],
      ['.b', 'dark'],
      ['.c', 'light'],
      ['.d', 'light+dark']
    ]
  )
})
