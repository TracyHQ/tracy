/**
 * The demo QA gate's judge (`src/demo-qa.js`): every check is a pure function of page reads, so each is
 * proved here on hand-made reads — no browser. The browser half is proved against real pages by the
 * regression case `REG-PR-1427-demo-qa-gate`.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildApp } from '../src/app.js'
import {
  CHECK_IDS,
  READ_AT_ONCE,
  baselineOf,
  checkContentReachable,
  checkContrastReadable,
  checkCssIntact,
  checkLookKept,
  paintIn,
  checkCtaReal,
  checkFactsFromBrief,
  checkNoBrokenAssets,
  checkNoCmsErrorLeak,
  checkNoDemoPictures,
  checkNoDemoWords,
  checkNoEmptyBoxes,
  checkNoEmptyPictureSlots,
  checkPhotosFit,
  checkNoGoogleReviewQuoted,
  checkPlacedPicturesVisible,
  checkCollectedUsed,
  collectedOf,
  checkNoHorizontalScroll,
  checkNoRawPlaceholders,
  checkNoTextOverlap,
  checkNoThirdPartyDemo,
  checkPagesLoad,
  checkStructureKept,
  contrastRatio,
  overImageRatio,
  DEMO_FILLERS,
  DEMO_NEUTRAL_WORDS,
  cssTextProblems,
  demoQaBody,
  DEMO_QA_MAX_PAGES,
  DEMO_QA_MAX_PLAN,
  factsIn,
  hashedStem,
  navPathsOf,
  runDemoQa,
  selfOriginIn,
  textKey
} from '../src/demo-qa.js'
import { signHostCall } from '../../tracy-web/src/host/client.js'
import { neutralWords } from '../../../packages/wo/website-opportunities/domain/neutral-copy.mjs'
import { forbiddenFillers } from '../../../packages/wo/website-opportunities/domain/slot-fill-manifest.mjs'

const page = (over = {}) => ({
  path: '/',
  url: 'http://127.0.0.1:5000/',
  status: 200,
  error: null,
  loadMs: 900,
  ...over
})

test('demoQaBody: a label that could name a path, a protocol-relative page and a URL are refused', () => {
  assert.match(demoQaBody({ label: '../x', platform: 'joomla' }).error, /label/)
  assert.match(demoQaBody({ label: 'acme', platform: 'joomla', pages: ['//evil.test/'] }).error, /page/)
  assert.match(demoQaBody({ label: 'acme', platform: 'joomla', pages: ['https://evil.test/'] }).error, /page/)
  assert.match(demoQaBody({ label: 'acme', platform: 'joomla', pages: ['/\\evil'] }).error, /page/)
  const ok = demoQaBody({
    label: 'acme',
    platform: 'emdash',
    pages: ['/', '/menu', '/'],
    port: 5000,
    host: 'Not A Host'
  })
  assert.equal(ok.error, null)
  assert.deepEqual(ok.pages, ['/', '/menu'])
  assert.equal(ok.port, 5000)
  assert.equal(ok.host, null)
  assert.ok(ok.demoHosts.includes('opentable.com'))
})

test("demoQaBody: the business's logo to lay in the template logo's box is a site path or an http address", () => {
  const body = (logoPicture) => demoQaBody({ label: 'acme', platform: 'wordpress', logoPicture }).logoPicture
  assert.equal(body('/wp-content/uploads/l.png'), '/wp-content/uploads/l.png')
  assert.equal(body('https://acme.test/l.png'), 'https://acme.test/l.png')
  assert.equal(body('javascript:alert(1)'), null)
  assert.equal(body(`/${'a'.repeat(2001)}`), null)
  assert.equal(body(undefined), null)
})

test('pages-load: a page whose load never fired names what was still pending; a blocked demo host fails it too', () => {
  assert.equal(checkPagesLoad([page()]).pass, true)
  const slow = checkPagesLoad([page({ loadMs: null, pending: ['https://cdn.test/a.js'] })])
  assert.equal(slow.pass, false)
  assert.deepEqual(slow.detail[0].pending, ['https://cdn.test/a.js'])
  const blocked = checkPagesLoad([page({ blocked: ['https://secure.opentable.com/frontdoor/default.aspx'] })])
  assert.equal(blocked.pass, false)
  assert.match(blocked.detail[0].problem, /demo host/)
  assert.equal(checkPagesLoad([page({ status: 404 })]).pass, false)
  assert.equal(checkPagesLoad([page({ error: 'net::ERR_CONNECTION_REFUSED', status: null })]).pass, false)
})

test('cssTextProblems: SCSS source, a stray brace, an unclosed comment and merge markers; plain CSS is clean', () => {
  assert.deepEqual(
    cssTextProblems('a{color:red}\n@media (max-width:1px){b{c:d}}\n.x::after{content:"}"}'),
    []
  )
  const scss = cssTextProblems('$brand: #c00;\n.a { .b { color: $brand; } }\n}\n@include foo;')
  assert.ok(scss.some((p) => /\} with no \{/.test(p)))
  assert.ok(scss.some((p) => /SCSS variable/.test(p)))
  assert.ok(scss.some((p) => /@include/.test(p)))
  assert.ok(cssTextProblems('a{b:c}\n/* open').some((p) => /unclosed/.test(p)))
  assert.ok(cssTextProblems('a{b:c}\n<<<<<<< HEAD\n').some((p) => /merge/.test(p)))
  assert.ok(cssTextProblems('a{b:c').some((p) => /never closed/.test(p)))
})

test('css-intact: the template sheet may not lose rules nor its last rule; custom.css may change freely', () => {
  const baseline = {
    cssRules: {
      'templates/ja_impact/css/template.css': { rules: 3701, sentinel: '.footer{x:y}', page: '/' },
      'templates/ja_impact/css/custom.css': { rules: 20, sentinel: '.a{}', page: '/' }
    }
  }
  const sheet = (rules, sentinelFound, text = 'a{b:c}') => ({
    path: 'templates/ja_impact/css/template.css',
    rules,
    sentinel: null,
    sentinelFound,
    text
  })
  const custom = {
    path: 'templates/ja_impact/css/custom.css',
    rules: 0,
    sentinel: null,
    sentinelFound: false,
    text: ''
  }
  const broken = checkCssIntact([page({ sheets: [sheet(2223, false), custom] })], baseline)
  assert.equal(broken.pass, false)
  assert.match(broken.detail[0].problem, /2223 of its 3701/)
  assert.equal(
    checkCssIntact([page({ sheets: [sheet(3701, false), custom] })], baseline).detail[0].problem,
    'its last rule is gone'
  )
  assert.equal(checkCssIntact([page({ sheets: [sheet(3710, true), custom] })], baseline).pass, true)
  // A sheet only a page this run did not read loads is not "gone".
  assert.equal(
    checkCssIntact([page({ path: '/menu', sheets: [] })], { cssRules: { 'x.css': { rules: 3, page: '/' } } })
      .pass,
    true
  )
  assert.equal(checkCssIntact([page({ sheets: [] })], baseline).pass, false)
  // No baseline: the text scan alone still catches a SCSS leak.
  assert.equal(checkCssIntact([page({ sheets: [sheet(10, null, '$x: 1;')] })], null).pass, false)
})

test('baselineOf + no-demo-pictures: a template picture still shown fails by name, or by bytes under a new name', () => {
  const before = [
    page({
      images: [
        {
          src: 'http://127.0.0.1:5000/images/joomlart/hero/chef.png',
          sha256: 'aa',
          width: 40,
          height: 40,
          kind: 'img',
          broken: false
        },
        {
          src: 'http://127.0.0.1:5000/images/tracy-content/1f.jpg',
          sha256: 'tt',
          width: 800,
          height: 400,
          kind: 'background',
          broken: false
        },
        {
          src: 'http://127.0.0.1:5000/images/joomlart/slide-1.jpg',
          sha256: 'pp',
          width: 800,
          height: 400,
          kind: 'img',
          broken: false
        }
      ],
      blocks: [{ text: 'Our chef John brings forty years of French cooking' }]
    })
  ]
  // `slide-1.jpg` is where the build put a real photograph: reported as placed, so not the template's.
  const baseline = baselineOf(before, ['images/joomlart/slide-1.jpg'])
  assert.deepEqual(baseline.pictures.files, ['images/joomlart/hero/chef.png'])
  assert.deepEqual(baseline.pictures.shas, ['aa'])
  assert.equal(baseline.texts.length, 1)
  const after = (images) => [page({ images })]
  // A thumbnail is not exempt, nor a cut-out: it is a fact about another restaurant.
  const kept = checkNoDemoPictures(after(before[0].images), {
    baseline,
    placed: ['images/joomlart/slide-1.jpg']
  })
  assert.equal(kept.pass, false)
  assert.deepEqual(
    kept.detail.map((d) => d.file),
    ['images/joomlart/hero/chef.png']
  )
  const copied = checkNoDemoPictures(
    after([
      { src: '/images/mine/cook.png', sha256: 'aa', width: 40, height: 40, kind: 'img', broken: false }
    ]),
    { baseline }
  )
  assert.equal(copied.pass, false)
  assert.match(copied.detail[0].copyOf, /same bytes/)
  assert.equal(
    checkNoDemoPictures(
      after([{ src: '/images/tracy-content/2.jpg', sha256: 'zz', width: 9, height: 9, kind: 'img' }]),
      { baseline }
    ).pass,
    true
  )
  assert.equal(checkNoDemoPictures(after([]), { baseline: null }).skipped, 'no baseline')
  // the template's icons and decorative backgrounds are its design, not another business's photos (24/10/2026)
  const design = baselineOf(
    [
      page({
        images: [
          {
            src: '/images/joomlart/icon/item-1.png',
            width: 73,
            height: 72,
            kind: 'img',
            selector: 'div.info-img > img'
          },
          { src: '/templates/x/images/decor/mask-1.png', width: 1438, height: 891, kind: 'background' },
          { src: '/images/joomlart/blog/item-4.jpg', width: 358, height: 239, kind: 'img' }
        ]
      })
    ],
    []
  )
  assert.deepEqual(
    checkNoDemoPictures(
      after([
        {
          src: '/images/joomlart/icon/item-1.png',
          width: 73,
          height: 72,
          kind: 'img',
          selector: 'div.info-img > img'
        },
        { src: '/templates/x/images/decor/mask-1.png', width: 1438, height: 891, kind: 'background' },
        { src: '/images/joomlart/blog/item-4.jpg', width: 358, height: 239, kind: 'img' }
      ]),
      { baseline: design }
    ).detail.map((d) => d.file),
    ['images/joomlart/blog/item-4.jpg']
  )
  // …and each one passed as design is still named, unresolved, once per file, so a reviewer sees it (round 5).
  const stamp = checkNoDemoPictures(
    [
      page({
        images: [
          { src: '/templates/x/images/decor/mask-1.png', width: 1438, height: 891, kind: 'background' }
        ]
      }),
      page({
        path: '/menu',
        images: [
          { src: '/templates/x/images/decor/mask-1.png', width: 1438, height: 891, kind: 'background' }
        ]
      })
    ],
    { baseline: design }
  )
  assert.equal(stamp.pass, true)
  assert.deepEqual(
    stamp.unresolved.map((u) => [u.file, u.page]),
    [['templates/x/images/decor/mask-1.png', '/']]
  )
  assert.match(stamp.unresolved[0].why, /mask-1\.png passes as the theme's design/)
  assert.match(stamp.measured, /unresolved: mask-1\.png/)
})

test("no-demo-pictures: a background drawn from the theme's own file is its design — named unresolved once, never failing; an <img> of the theme still counts", () => {
  const masthead = {
    src: '/wp-content/themes/t/assets/img/bg-masthead.jpg',
    width: 1440,
    height: 389,
    kind: 'background'
  }
  const upload = { src: '/wp-content/uploads/2026/10/hero.jpg', width: 1440, height: 600, kind: 'background' }
  const themeImg = { src: '/wp-content/themes/t/assets/img/chef.jpg', width: 400, height: 500, kind: 'img' }
  const reads = (/** @type {any[]} */ images) =>
    ['/', '/about-us/', '/offers/'].map((path) => page({ path, images }))
  const baseline = baselineOf(reads([masthead, upload, themeImg]), [])

  const left = checkNoDemoPictures(reads([masthead]), { baseline })
  assert.equal(left.pass, true)
  assert.deepEqual(
    left.unresolved.map((u) => [u.file, u.page]),
    [['wp-content/themes/t/assets/img/bg-masthead.jpg', '/']]
  )
  assert.match(left.unresolved[0].why, /bg-masthead\.jpg passes as the theme's design/)

  const counted = checkNoDemoPictures(reads([masthead, upload, themeImg]), { baseline })
  assert.equal(counted.pass, false)
  assert.deepEqual([...new Set(counted.detail.map((d) => d.file))].sort(), [
    'wp-content/themes/t/assets/img/chef.jpg',
    'wp-content/uploads/2026/10/hero.jpg'
  ])
})

test("no-demo-pictures: a Media Library upload the hand-off never showed is the template's too — build 13's blog grid", () => {
  // The Living Room local, build 13: the template's home showed four posts' cards (marketing-*.jpg); the agent's
  // turn reordered the posts and the grid then showed eight others, their pictures kept in the theme's
  // `jd_intro_image` meta (news-1.jpg…). No baseline named them, so the check passed them.
  const card = (/** @type {string} */ name, /** @type {number} */ post) => ({
    src: `http://127.0.0.1:5000/wp-content/uploads/2026/10/${name}`,
    sha256: `sha-${name}`,
    width: 288,
    height: 288,
    kind: 'img',
    selector: 'div.post-thumb > img.attachment-post-thumbnail.size-post-thumbnail',
    link: `http://127.0.0.1:5000/?p=${post}`
  })
  const baseline = baselineOf([page({ images: [card('marketing-1.jpg', 41)] })], [])
  assert.deepEqual(baseline.pictures.files, ['wp-content/uploads/2026/10/marketing-1.jpg'])
  const result = checkNoDemoPictures(
    [
      page({
        images: [
          card('news-1.jpg', 54),
          card('guide-1.jpg', 59),
          // Tracy's own doors file elsewhere: the research's pictures and the fitted logo pass.
          { ...card('x.jpg', 41), src: '/wp-content/uploads/tracy-content/ab12.jpg' },
          {
            ...card('x.png', 41),
            src: '/wp-content/uploads/tracy-brand/logo-ab12.png',
            selector: 'img.custom-logo'
          }
        ]
      })
    ],
    { baseline }
  )
  assert.equal(result.pass, false)
  assert.deepEqual(
    result.pictures.map((p) => [p.file, p.link, p.unshown]),
    [
      ['wp-content/uploads/2026/10/news-1.jpg', 'http://127.0.0.1:5000/?p=54', true],
      ['wp-content/uploads/2026/10/guide-1.jpg', 'http://127.0.0.1:5000/?p=59', true]
    ]
  )
  assert.equal(result.pictures[0].copyOf, undefined)
})

test("no-demo-pictures: the sweep gets every template picture still shown, past the repair prompt's twenty", () => {
  // lrsweep rig round 6: 42 template pictures shown, 20 travelled back, all of them ones no door writes, so the
  // blog sidebar's banner never reached the sweep, not even as unresolved.
  const images = Array.from({ length: 42 }, (_, i) => ({
    src: `http://127.0.0.1:5000/wp-content/uploads/2026/10/demo-${i}.jpg`,
    sha256: `s${i}`,
    width: 300,
    height: 200,
    kind: 'img',
    broken: false
  }))
  const baseline = baselineOf([page({ images })], [])
  const result = checkNoDemoPictures([page({ images })], { baseline })
  assert.equal(result.pass, false)
  assert.equal(result.detail.length, 20)
  assert.equal(result.pictures.length, 42)
  assert.equal(result.pictures.at(-1).file, 'wp-content/uploads/2026/10/demo-41.jpg')
  assert.equal(checkNoDemoPictures([page({ images: [] })], { baseline }).pictures, undefined)
})

test('no-demo-words: a template block still there fails unless its words are the brief’s; vendor credits always fail', () => {
  const baseline = {
    texts: [
      textKey('Our chef John brings forty years of French cooking'),
      textKey('Pho Ba serves noodle soup on Tran Phu street')
    ]
  }
  const briefText = 'Pho Ba — noodle soup restaurant on Tran Phu street, Hoi An.'
  const reads = [
    page({
      blocks: [
        { text: 'Our  chef John brings forty years of FRENCH cooking', selector: 'p.intro' },
        { text: 'Pho Ba serves noodle soup on Tran Phu street' },
        { text: 'A brand new sentence the agent wrote today' }
      ],
      text: 'Copyright 2026. Designed by JoomlArt.com'
    })
  ]
  const r = checkNoDemoWords(reads, { baseline, briefText })
  assert.equal(r.pass, false)
  assert.equal(r.detail[0].selector, 'p.intro')
  assert.ok(r.detail.some((d) => d.credit && /Designed by/i.test(d.words)))
  // "Designed by" and "JoomlArt" match the same footer passage: the message names it once.
  assert.equal(r.detail.length, 2, JSON.stringify(r.detail))
  // a form's own words are the form working (pilot 24/10/2026)
  const form = checkNoDemoWords(
    [page({ blocks: [{ text: 'Pho Ba serves noodle soup on Tran Phu street', form: true }], text: '' })],
    { baseline, briefText: '' }
  )
  assert.equal(form.pass, true)
  assert.equal(
    checkNoDemoWords([page({ blocks: [{ text: 'A brand new sentence the agent wrote' }], text: '' })], {
      baseline,
      briefText
    }).pass,
    true
  )
})

// Local stand 24/10/2026, an EmDash bakery: the template's news categories outlived every check.
test('no-demo-words: every template category the page names travels for the sweep, past the detail cut', () => {
  const names = Array.from({ length: 30 }, (_, n) => `Topic${n}`)
  const baseline = { texts: [], labels: names.map(textKey) }
  const blog = page({
    path: '/our-blog/',
    blocks: [],
    labels: names.map((text) => ({ text, href: `/category/${text.toLowerCase()}/` })),
    text: ''
  })
  const result = checkNoDemoWords([blog], { baseline, briefText: '' })
  assert.equal(result.detail.length < names.length, true)
  assert.deepEqual(
    result.categories.map((c) => [c.page, c.name, c.category]),
    names.map((n) => ['/our-blog/', n, `/category/${n.toLowerCase()}/`])
  )
})

test('no-demo-words: a category or tag the template named fails while the page still names it, unless the brief does', () => {
  const labels = (...names) => names.map((text) => ({ text, href: `/news/category/${text.toLowerCase()}` }))
  const baseline = { texts: [], labels: ['Engineering', 'Disclosures', 'Viennoiserie'].map(textKey) }
  const briefText = 'q. patisserie — viennoiserie, cakes and tartines on Maple Street.'
  const kept = checkNoDemoWords(
    [page({ blocks: [], labels: labels('Engineering', 'Engineering', 'Viennoiserie', 'Press'), text: '' })],
    {
      baseline,
      briefText
    }
  )
  assert.equal(kept.pass, false)
  assert.deepEqual(
    kept.detail.map((d) => [d.words, d.category]),
    [['engineering', '/news/category/engineering']]
  )
  assert.equal(
    checkNoDemoWords([page({ blocks: [], labels: labels('Press', 'Viennoiserie'), text: '' })], {
      baseline,
      briefText
    }).pass,
    true
  )
  // A baseline taken before labels were read judges none.
  assert.equal(
    checkNoDemoWords([page({ blocks: [], labels: labels('Engineering'), text: '' })], {
      baseline: { texts: [] },
      briefText
    }).pass,
    true
  )
  // Local round 35: the first label left names how this CMS renames one; the rest do not repeat it.
  const emdash = checkNoDemoWords(
    [page({ blocks: [], labels: labels('Engineering', 'Disclosures'), text: '' })],
    { baseline, briefText, platform: 'emdash' }
  )
  assert.match(emdash.detail[0].fix, /taxonomy_update_term \{taxonomy, termSlug, label\}/)
  assert.equal(emdash.detail[1].fix, undefined)
  assert.equal(kept.detail[0].fix, undefined)
})

test('no-demo-words: a copyright line is the brief’s when its holder is the brief’s name; the template’s holder still fails', () => {
  const lines = [
    'Copyright © 2026 The Ridge House. All Rights Reserved.',
    '© 2020–2026 The Ridge House',
    'Copyright © 2026 JA Restaurant. All Rights Reserved.',
    'Copyright © 2026. All Rights Reserved.'
  ]
  const baseline = { texts: lines.map(textKey) }
  const briefText = 'The Ridge House \u2014 deli, bar and caf\u00e9 in Sa Pa. Phone +84 214 0000 111.'
  const r = checkNoDemoWords([page({ blocks: lines.map((text) => ({ text })), text: '' })], {
    baseline,
    briefText
  })
  assert.deepEqual(
    r.detail.map((d) => d.words),
    ['copyright © 2026 ja restaurant. all rights reserved.', 'copyright © 2026. all rights reserved.']
  )
  // The holder must be the brief's name as whole words, not part of a longer one.
  const near = checkNoDemoWords([page({ blocks: [{ text: lines[0] }], text: '' })], {
    baseline,
    briefText: 'The Ridge Housewares — paper goods in Sa Pa.'
  })
  assert.equal(near.pass, false, JSON.stringify(near.detail))
})

test('facts-from-brief: a postcode before a place name is no price \u2014 build 13\'s "1454 K\u00f8benhavn"', () => {
  // The Living Room local, build 13: every post's footer read "Larsbj\u00f8rnsstr\u00e6de 17, 1454 K\u00f8benhavn" and the check
  // took "1454 K" for a price of 1454k, since a JavaScript `\b` sees no word going on into "ø".
  const text =
    'Larsbj\u00f8rnsstr\u00e6de 17, 1454 K\u00f8benhavn, Denmark. Kaffe 45 kr, latte 5k, a 30K budget.'
  assert.deepEqual(
    factsIn(text)
      .filter((f) => f.kind === 'price')
      .map((f) => f.shown),
    ['5k', '30K']
  )
  assert.equal(
    checkFactsFromBrief([page({ text: 'Larsbj\u00f8rnsstr\u00e6de 17, 1454 K\u00f8benhavn' })], {
      briefText: 'The Living Room, Larsbj\u00f8rnsstr\u00e6de 17, 1454 K\u00f8benhavn K.'
    }).pass,
    true
  )
})

test('facts-from-brief: hours, prices, phones and a founding year the brief holds are shown as held', () => {
  assert.deepEqual(
    factsIn('Open 7AM – 10PM. Pho 45.000đ. Call +84 235 000 0101. Est. 1982').map((f) => f.kind),
    ['hour', 'hour', 'price', 'phone', 'founded']
  )
  const briefText = 'Hours: Monday 07:00–22:00. Phone: 0235 000 0101. Pho bo 45,000 VND.'
  assert.equal(
    checkFactsFromBrief([page({ text: 'Open daily 7AM to 10PM · +84 235 000 0101 · Pho 45.000đ' })], {
      briefText
    }).pass,
    true
  )
  // Hours are collected, so other times contradict them; a price the research holds nowhere is made up (local round 22,
  // 25/10/2026); no founding year was collected: made up too (plan §7, 26/10/2026: no sample exemption).
  const shown = checkFactsFromBrief([page({ text: 'Happy hour 5PM – 7PM. Wine $12. RES est 1982.' })], {
    briefText
  })
  assert.equal(shown.pass, false)
  assert.deepEqual(
    shown.detail.map((d) => d.kind),
    ['hour', 'hour', 'price', 'founded']
  )
  assert.match(shown.detail[0].words, /Happy hour/)
  // a street number right after the brief's phone is no other phone (pilot 24/10/2026)
  const street = 'Call (720) 330-2660 818 E. 3rd, Los Angeles'
  assert.equal(
    checkFactsFromBrief([page({ text: street })], { briefText: 'Phone: (720) 330-2660' }).pass,
    true
  )
  assert.equal(
    checkFactsFromBrief([page({ text: street })], { briefText: 'Phone: (212) 555-0110' }).pass,
    false
  )
  // a year then a date is no phone (dev 24/10/2026)
  assert.deepEqual(
    factsIn('Tacos since 2013. 2013-01-01 The first stand').filter((f) => f.kind === 'phone'),
    []
  )
})

// dev 24/10/2026: a timeline's "2024.\n2026" read as a phone failed collected-used with COLLECTED_UNSOURCED.
test('facts: a run of years is no phone, and a phone never runs across a line break', () => {
  const phones = (text) =>
    factsIn(text)
      .filter((f) => f.kind === 'phone')
      .map((f) => f.shown.replace(/\D/g, ''))
  for (const years of [
    'Opened in 2024.\n2026 brings a second floor',
    'Head chef 2019 - 2024',
    '© 2024 2025 Bếp Nhà Lu',
    'Our story 2010 – 2015 – 2020 – 2024',
    'Timeline\n2018\n2021\n2024',
    'Seasons 2019/2020/2021',
    // a timeline's step number before its years (local round 26, 25/10/2026)
    'the shop today. 03 2014-2017 · James Beard finalist'
  ])
    assert.deepEqual(phones(years), [], years)
  assert.deepEqual(phones('Call 0235 3910\n777 today'), ['02353910'], 'a line break ends a phone')
  assert.deepEqual(phones('Call (720) 330-2660'), ['7203302660'])
  assert.deepEqual(phones('Dubai +971 4 123 4567'), ['97141234567'])
  assert.deepEqual(phones('Office 04 123 4567'), ['041234567'])
  assert.deepEqual(phones('Office 04 3826 1234'), ['0438261234'], 'a short first group of a real phone stays')
  assert.deepEqual(phones('Zalo +84 90 123 45 67'), ['84901234567'])
  assert.deepEqual(
    phones('Hotline 2024 5678 9'),
    ['202456789'],
    'a number that starts like a year is still one'
  )
  assert.deepEqual(phones('Since 2013.\nCall +84 235 0000 777'), ['842350000777'])
})

test('collected-used: a timeline of years beside the collected phone is no unsourced phone', () => {
  const collected = collectedOf({ name: 'Bếp Nhà Lu', phone: '+84 235 0000 777' })
  const r = checkCollectedUsed(
    [page({ path: '/', text: 'Bếp Nhà Lu. Call +84 235 0000 777.\nOpened 2024.\n2026 a second floor.' })],
    { collected }
  )
  assert.deepEqual(
    r.detail.filter((d) => d.code === 'COLLECTED_UNSOURCED'),
    []
  )
})

// Harbour Sport Club, 26/10/2026: the bio lists two numbers; the main one must be on the site, the other may be.
test('collected-used: the main phone is required, the business’s other phones are collected, a third is not', () => {
  const collected = collectedOf({
    name: 'Harbour Sport Club',
    phone: '+971 50 000 1234',
    otherPhones: ['+971 50 000 5678']
  })
  assert.deepEqual(collected.otherPhones, ['+971 50 000 5678'])
  const both = checkCollectedUsed(
    [page({ path: '/contact', text: 'Harbour Sport Club. Call +971 50 000 1234 or +971 50 000 5678.' })],
    { collected }
  )
  assert.deepEqual(both.detail, [])
  const onlyOther = checkCollectedUsed(
    [page({ path: '/contact', text: 'Harbour Sport Club. Call +971 50 000 5678 or +91 124 401 0021.' })],
    { collected }
  )
  assert.deepEqual(
    onlyOther.detail.map((d) => [d.code, d.what, d.value]),
    [
      ['COLLECTED_NOT_SHOWN', 'phone', '+971 50 000 1234'],
      ['COLLECTED_UNSOURCED', 'phone', '+91 124 401 0021']
    ]
  )
})

// 🔒 No sample content (plan §7, 26/10/2026): an hour, a phone or a year the research holds nowhere is made up.
test('facts-from-brief: where the research holds no hours, phone, year or price, a shown one is made up and fails', () => {
  const made = checkFactsFromBrief(
    [page({ text: 'Open 8AM – 9PM. Call 0901 234 567. Pho 45.000đ. Est. 2001.' })],
    { briefText: 'Pho Hanoi, noodle soup. Collected 2026-10-23T10:00:00.000Z.' }
  )
  assert.equal(made.pass, false)
  assert.deepEqual(
    made.detail.map((d) => d.kind),
    ['hour', 'hour', 'price', 'phone', 'founded']
  )
  assert.equal(made.sample, undefined)
  const held = checkFactsFromBrief([page({ text: 'Pho 45.000đ.' })], {
    briefText: 'Menu: pho bo 45,000 VND.'
  })
  assert.equal(held.pass, true, 'a price the research holds passes, whatever dish it sits by')
})

test('facts-from-brief: a phone, hours or founding year that contradicts the collected one still fails', () => {
  const briefText = '- Hours: "Mon-Sun 07:00–22:00"\n- Phone: "+84 235 000 0101"\nEstablished 1998.'
  const wrong = checkFactsFromBrief([page({ text: 'Open 9AM – 5PM. Call 0901 234 567. Since 2005.' })], {
    briefText
  })
  assert.equal(wrong.pass, false)
  assert.deepEqual(
    wrong.detail.map((d) => d.kind),
    ['hour', 'hour', 'phone', 'founded']
  )
})

// 🔒 A demo keeps its visitor on the demo, judged by where a link goes (product owner, 22/10/2026): a booking button
// leads to this site's Contact page, and no button leaves the site whatever it says — a link the brief verified included.
test("cta-real: dead, demo-service and off-site buttons fail, and booking only on the Contact page; tel:, mailto: and the demo's own pages pass", () => {
  const url = 'http://127.0.0.1:5000/'
  const r = checkCtaReal(
    [
      page({
        ctas: [
          { href: '#', text: 'Book a table', booking: true },
          { href: 'https://www.opentable.com/r/x', text: 'Reserve', booking: true },
          { href: 'https://book.other.test/x', text: 'Book now', booking: true },
          { href: 'tel:+842350000101', text: 'Call us', booking: true },
          { href: 'mailto:hello@phoba.example', text: 'Reserve by email', booking: true },
          { href: 'https://www.facebook.com/phoba', text: 'Book on Facebook', booking: true },
          { href: '/contact', text: 'Book', booking: true },
          { href: '/about', text: 'Book a table', booking: true, button: true },
          { href: '/contact-us/#form', text: 'Order online', booking: true },
          { href: 'https://phoba.tracy.site/contact', text: 'Book a table', booking: true },
          { href: 'https://restaurant.example/menu', text: 'Explore dishes', booking: false, button: true },
          { href: 'https://phoba.example/menu.pdf', text: 'See the menu', booking: false },
          { href: '/menu', text: 'Full menu', booking: false, button: true },
          { href: 'tel:+842350000101', text: 'Call us', booking: false, button: true },
          { href: 'https://phoba.example/about', text: 'Our story', booking: false, button: false },
          { href: 'https://phoba.example/book', text: 'Book a table', booking: true, nav: true },
          // a nav item opening its own submenu goes there; one that opens nothing still goes nowhere
          { href: '', text: 'Reservation', booking: true, nav: true, opens: true },
          // a button inside a form submits it from script
          { href: 'javascript:void(0)', text: 'Send email', booking: false, button: true, submits: true },
          { href: '#', text: 'Reservation', booking: true, nav: true }
        ]
      })
    ],
    {
      allowedCta: ['https://www.facebook.com/phoba', 'https://restaurant.example/menu'],
      publicOrigin: 'https://phoba.tracy.site',
      host: 'phoba.tracy.site'
    }
  )
  assert.deepEqual(
    r.detail.map((d) => [d.text, d.problem]),
    [
      ['Book a table', 'goes nowhere'],
      ['Reserve', 'points at a demo service'],
      ['Book now', "a booking button leaves the demo site: point it at this site's Contact page"],
      ['Book on Facebook', "a booking button leaves the demo site: point it at this site's Contact page"],
      ['Book a table', "a booking button leads to another page: point it at this site's Contact page"],
      ['Explore dishes', 'a button leaves the demo site: point it at a page of this site'],
      ['See the menu', 'a button leaves the demo site: point it at a page of this site'],
      ['Reservation', 'goes nowhere']
    ]
  )
  assert.equal(url, page().url)
})

test("cta-real: the page the build's plan made the contact page is the Contact page, whatever its slug", () => {
  const ctas = [{ href: '/index.php/lien-he/', text: 'Book a table', booking: true, button: true }]
  assert.equal(checkCtaReal([page({ ctas })]).pass, false)
  assert.equal(checkCtaReal([page({ ctas })], { contactPaths: ['/lien-he'] }).pass, true)
  assert.equal(checkCtaReal([page({ ctas })], { contactPaths: ['/about'] }).pass, false)
})

// Local round 27, 25/10/2026 (Levain, WordPress): the hero's address words were the bakery's, its map link the template's.
test('facts-from-brief: a map link searching another street fails; the held street, a place name or no address held do not', () => {
  const brief = '"address":"167 West 74th Street, New York, NY 10023"'
  const read = (maps) => ({ path: '/', url: 'http://x.test/', text: '', maps })
  const failed = checkFactsFromBrief(
    [
      read([
        {
          query: '4 5th Avenue, Brooklyn, NY 11217',
          text: '167 West 74th St',
          selector: 'p.hero-address > a'
        }
      ])
    ],
    { briefText: brief }
  )
  assert.equal(failed.pass, false)
  assert.deepEqual(failed.detail[0], {
    page: '/',
    kind: 'map',
    shown: '4 5th Avenue, Brooklyn, NY 11217',
    words: '167 West 74th St',
    selector: 'p.hero-address > a'
  })
  const held = [
    read([
      { query: '167 West 74th St, NYC 10023', text: 'Directions' },
      { query: 'Levain Bakery', text: 'Map' }
    ])
  ]
  assert.equal(checkFactsFromBrief(held, { briefText: brief }).pass, true)
  assert.equal(
    checkFactsFromBrief([read([{ query: '4 5th Avenue', text: 'x' }])], { briefText: 'no street held' }).pass,
    true
  )
})

// Local round 25, 25/10/2026 (q. patisserie, EmDash): the search page's topic chips search the site.
test('cta-real: a link searching this site is a search suggestion, a booking word or not; off the site it is not', () => {
  const ctas = [
    { href: '/search?q=Special%20orders', text: 'Special orders', booking: true },
    { href: '/?s=order', text: 'Order', booking: true, button: true },
    { href: '/index.php?option=com_finder&searchword=cake', text: 'Order a cake', booking: true }
  ]
  assert.equal(checkCtaReal([page({ ctas })]).pass, true)
  const off = [{ href: 'https://book.other.test/?q=table', text: 'Book', booking: true }]
  assert.equal(checkCtaReal([page({ ctas: off })]).pass, false)
  const shop = [{ href: '/shop?category=cakes', text: 'Order a cake', booking: true }]
  assert.equal(checkCtaReal([page({ ctas: shop })]).pass, false)
})

test('cta-real: with the plan naming its contact page, a slug saying contact is not enough', () => {
  const ctas = [{ href: '/contact-offers/', text: 'Book a table', booking: true, button: true }]
  assert.equal(checkCtaReal([page({ ctas })]).pass, true)
  assert.equal(checkCtaReal([page({ ctas })], { contactPaths: ['/lien-he'] }).pass, false)
  // Local round 35: the site's own reservation page takes a booking too (a theme prints the button, no door moves it).
  for (const href of ['/contact/phone-reservation/', '/reservations', '/book-a-table/'])
    assert.equal(
      checkCtaReal([page({ ctas: [{ href, text: 'Book a table', booking: true, button: true }] })], {
        contactPaths: ['/lien-he']
      }).pass,
      true,
      href
    )
  assert.equal(
    checkCtaReal(
      [page({ ctas: [{ href: '/reservation-policy-pdf-and-more/x', text: 'Book', booking: true }] })],
      {
        contactPaths: ['/lien-he']
      }
    ).pass,
    false
  )
})

test('demoQaBody keeps the contact pages of the plan and drops anything that is not a site path', () => {
  const body = demoQaBody({
    label: 'acme',
    platform: 'wordpress',
    contactPaths: ['/lien-he/', 'https://evil.example/x', '//evil.example', 7]
  })
  assert.deepEqual(body.contactPaths, ['/lien-he/'])
})

test('no-horizontal-scroll, no-third-party-demo, broken assets, CMS errors and raw placeholders', () => {
  assert.equal(checkNoHorizontalScroll([page({ scrollWidth: 390 })]).pass, true)
  assert.equal(checkNoHorizontalScroll([page({ scrollWidth: 520 })]).pass, false)
  assert.equal(checkNoThirdPartyDemo([page({ blocked: ['https://secure.opentable.com/x.js'] })]).pass, false)
  assert.equal(
    checkNoBrokenAssets([page({ failed: [{ url: '/x.css', status: 404, type: 'stylesheet' }] })]).pass,
    false
  )
  assert.equal(
    checkNoBrokenAssets([
      page({ images: [{ src: '/a.jpg', kind: 'img', broken: true, width: 9, height: 9 }] })
    ]).pass,
    false
  )
  assert.equal(
    checkNoCmsErrorLeak([page({ text: 'Warning: Undefined array key "x" in /var/www/x.php' })]).pass,
    false
  )
  assert.equal(checkNoCmsErrorLeak([page({ text: 'A warning to our guests: we close early' })]).pass, true)
  for (const text of [
    'Hello {{ name }}',
    '[contact-form-7 id="12"]',
    'Price: NaN',
    'TPL_JA_RESTAURANT_READMORE',
    'LumoraHoiAn\\nHoi An',
    'Caf\\u00e9 open',
    'EUROPEAN DELI, CAFÉ\\NAND WINE BAR'
  ])
    assert.equal(checkNoRawPlaceholders([page({ text })]).pass, false, text)
  assert.equal(checkNoRawPlaceholders([page({ text: 'Our menu (seasonal) — call us' })]).pass, true)
})

test('contrast-readable and no-text-overlap: white on white fails, text over a picture is not judged', () => {
  assert.ok(Math.abs(contrastRatio([0, 0, 0], [255, 255, 255]) - 21) < 0.01)
  const white = [255, 255, 255, 1]
  const r = checkContrastReadable([
    page({
      contrast: [
        { where: 'nav', fg: white, bg: [255, 255, 255], overImage: false, selector: 'nav a' },
        { where: 'h1', fg: white, bg: null, overImage: true },
        { where: 'p', fg: white, bg: [245, 190, 160], overImage: false, selector: '.peach p' }
      ]
    })
  ])
  assert.deepEqual(
    r.detail.map((d) => d.selector),
    ['nav a', '.peach p']
  )
  // the template's own unreadable text, colours unchanged, is not the build's; a new colour pair still is (24/10/2026)
  const header = (fg) =>
    page({ contrast: [{ where: 'text', fg, bg: [200, 160, 90], overImage: false, selector: 'button span' }] })
  const kept = baselineOf([header(white)], [])
  assert.equal(checkContrastReadable([header(white)], { baseline: kept }).pass, true)
  assert.equal(checkContrastReadable([header([205, 165, 95, 1])], { baseline: kept }).pass, false)
  assert.equal(
    checkNoTextOverlap([
      page({ overlaps: [{ text: '12 Tran Phu', selector: 'p.address', coveredBy: 'img' }] })
    ]).pass,
    false
  )
  assert.equal(checkNoTextOverlap([page({ overlaps: [] })]).pass, true)
})

// Plan "10/10" P0-5 (26/10/2026): words over a picture were left to the eye; local rounds 27–31 on WordPress failed
// looks-finished on a white heading over a bright photo with no number the build could act on.
test('contrast-readable judges words over a picture against the worst of what lies under them, at both widths', () => {
  const white = [255, 255, 255, 1]
  const dark = [36, 26, 18, 1]
  const over = (fg, under, underPhone, extra = {}) => ({
    where: 'heading',
    fg,
    bg: null,
    overImage: true,
    over: 0,
    large: true,
    selector: 'section.hero > h1',
    text: 'Fresh cookies',
    under,
    underPhone,
    ...extra
  })
  // A dark photo with one bright cookie: the mean reads, the bright end does not.
  const cookie = { p15: 0.01, p50: 0.03, p85: 0.62 }
  const calm = { p15: 0.01, p50: 0.02, p85: 0.05 }
  assert.ok(overImageRatio(over(white, cookie), 'under') < 3)
  assert.ok(overImageRatio(over(white, calm), 'under') > 3)
  // Dark words are read against the dark end.
  assert.ok(overImageRatio(over(dark, { p15: 0.02, p50: 0.6, p85: 0.9 }), 'under') < 3)
  const failed = checkContrastReadable([page({ contrast: [over(white, calm, cookie)] })])
  assert.equal(failed.pass, false)
  assert.deepEqual(
    failed.detail.map((d) => [d.viewport, d.overImage, d.needs]),
    [['phone', true, 3]]
  )
  assert.equal(checkContrastReadable([page({ contrast: [over(white, calm, calm)] })]).pass, true)
  const desktopOnly = checkContrastReadable([
    page({ contrast: [over(white, calm), over(white, undefined, undefined, { text: 'Not measured' })] })
  ])
  assert.deepEqual(
    desktopOnly.measuredOver.map((m) => [m.text, m.viewports]),
    [['Fresh cookies', ['desktop']]]
  )
  // Body text needs 4.5:1: 3.4:1 reads for a heading, not for a paragraph.
  const grey = { p15: 0.1, p50: 0.12, p85: 0.26 }
  assert.equal(checkContrastReadable([page({ contrast: [over(white, grey)] })]).pass, true)
  assert.equal(
    checkContrastReadable([page({ contrast: [over(white, grey, undefined, { large: false })] })]).pass,
    false
  )
  // The template's own words over its own picture, unreadable as installed, are not the build's; once measured
  // readable at baseline, the same words failing later are.
  const kept = baselineOf([page({ contrast: [over(white, cookie)] })], [])
  assert.equal(
    checkContrastReadable([page({ contrast: [over(white, cookie)] })], { baseline: kept }).pass,
    true
  )
  const fine = baselineOf([page({ contrast: [over(white, calm)] })], [])
  assert.equal(
    checkContrastReadable([page({ contrast: [over(white, cookie)] })], { baseline: fine }).pass,
    false
  )
  // Local round 36: the same words unreadable at baseline are the build's once they lie on a photo it placed, and the
  // fix says which way the photo goes — dark words want a lighter photo, light words a darker one.
  const darkLine = { p15: 0.0135, p50: 0.0371, p85: 0.102 }
  const was = baselineOf(
    [
      page({
        contrast: [
          over(dark, darkLine, undefined, { underSrc: 'http://lev.test/wp-content/uploads/2026/10/hp-1.jpg' })
        ]
      })
    ],
    []
  )
  const placedPhoto = over(dark, darkLine, undefined, {
    underSrc: 'http://lev.test/wp-content/uploads/tracy-content/034c9add.jpg'
  })
  const judged = checkContrastReadable([page({ contrast: [placedPhoto] })], { baseline: was })
  assert.equal(judged.pass, false)
  assert.match(judged.detail[0].fix, /uniform ground luminance/)
  assert.equal(
    checkContrastReadable(
      [
        page({
          contrast: [
            over(dark, darkLine, undefined, {
              underSrc: 'http://lev.test/wp-content/uploads/2026/10/hp-1.jpg'
            })
          ]
        })
      ],
      { baseline: was }
    ).pass,
    true,
    "the template's own photo keeps its exemption"
  )
  assert.match(failed.detail[0].fix, /not a guarantee/)
  // A coloured title can read over a sufficiently dark or light ground; neither direction is discarded.
  const orange = over([210, 74, 36, 1], { p15: 0.1, p50: 0.4, p85: 0.8 }, undefined, {
    underSrc: 'http://lev.test/wp-content/uploads/tracy-content/034c9add.jpg'
  })
  const pale = checkContrastReadable([page({ contrast: [orange] })], { baseline: was })
  assert.match(pale.detail[0].fix, /uniform ground luminance in [\s\S]* or /)
})

test('contrast repair considers both ground directions and all texts in each measured background frame', () => {
  const probe = (fg, frame, extra = {}) => ({
    fg: [...fg, 1],
    overImage: true,
    large: true,
    underFrame: frame,
    under: { p15: 0.1, p50: 0.4, p85: 0.8 },
    underSrc: 'http://site.test/shared.jpg',
    ...extra
  })
  const orange = probe([210, 74, 36], 'frame-1')
  const white = probe([255, 255, 255], 'frame-1')
  const joint = checkContrastReadable([page({ contrast: [orange, white] })])
  assert.equal(joint.pass, false)
  assert.equal(joint.detail[0].uniformGround.length, 1)
  assert.equal(joint.detail[0].uniformGround[0][0], 0)
  assert.ok(joint.detail[0].uniformGround[0][1] < 0.03)
  assert.match(joint.detail[0].fix, /2 measured texts/)
  assert.match(joint.detail[0].fix, /not a guarantee/)
  // A passing line still constrains repair of its neighbour.
  const passedWhite = { ...white, under: { p15: 0, p50: 0.01, p85: 0.02 } }
  const held = checkContrastReadable([page({ contrast: [orange, passedWhite] })])
  assert.deepEqual(held.detail[0].uniformGround, joint.detail[0].uniformGround)
  // Dark brown large text and white body text have no common uniform ground.
  const impossible = checkContrastReadable([
    page({ contrast: [probe([58, 53, 47], 'frame-2'), probe([255, 255, 255], 'frame-2', { large: false })] })
  ])
  assert.deepEqual(impossible.detail[0].uniformGround, [])
  assert.match(impossible.detail[0].fix, /No uniform background luminance/)
  assert.doesNotMatch(impossible.detail[0].fix, /no photo can/i)
  // An identical file in another frame must not constrain this frame.
  const separate = checkContrastReadable([page({ contrast: [orange, probe([58, 53, 47], 'frame-other')] })])
  assert.equal(separate.detail[0].uniformGround.length, 2)
  // Old cached reads without a measured frame cannot establish shared-image constraints.
  const unknown = checkContrastReadable([page({ contrast: [probe([210, 74, 36], undefined), white] })])
  assert.match(unknown.detail[0].fix, /frame was not identified/)
})

test('no-empty-boxes fails each service box a page shows empty, and passes when none is', () => {
  const r = checkNoEmptyBoxes([
    page({ emptyBoxes: [{ selector: 'div.acm-opentable > div.ot-form', size: '1000×60' }] })
  ])
  assert.equal(r.pass, false)
  assert.deepEqual(r.detail, [{ page: '/', selector: 'div.acm-opentable > div.ot-form', size: '1000×60' }])
  assert.equal(checkNoEmptyBoxes([page({ emptyBoxes: [] }), page({})]).pass, true)
  assert.ok(CHECK_IDS.includes('no-empty-boxes'))
})

// Plan "10/10" P1 (26/10/2026): local rounds 31–33 put a selfie behind a section and one photo on two posts side by side.
test('photos-fit fails a photo of people behind a section and a photo repeated while others are unused', () => {
  const img = (src, kind, selector, size = 400) => ({
    src,
    kind,
    selector,
    width: size,
    height: size,
    broken: false
  })
  const asked = {
    placedSources: {
      '/wp-content/uploads/tracy-content/s1.jpg': 'selfie',
      '/wp-content/uploads/tracy-content/f1.jpg': 'flowers',
      '/wp-content/uploads/tracy-content/c1.jpg': 'cookies',
      '/wp-content/uploads/tracy-content/logo.png': '$logo'
    },
    sourceSubjects: { selfie: 'people', flowers: 'other', cookies: 'food' },
    collected: { pictures: 12 }
  }
  const at = (p) => `http://127.0.0.1:5000/wp-content/uploads/tracy-content/${p}`
  const r = checkPhotosFit(
    [
      page({
        path: '/offers/',
        images: [
          img(at('s1.jpg'), 'background', 'section.offers > figure.jr-section-bg'),
          img(at('c1.jpg'), 'img', 'div.card > img')
        ]
      }),
      page({
        path: '/blog/',
        images: [
          img(at('f1.jpg'), 'img', 'article.p1 > img'),
          img(at('f1.jpg'), 'img', 'article.p2 > img'),
          img(at('f1.jpg'), 'img', 'li.thumb > img', 60),
          img(at('logo.png'), 'img', 'header img'),
          img(at('logo.png'), 'img', 'footer img')
        ]
      })
    ],
    asked
  )
  assert.equal(r.pass, false)
  assert.deepEqual(
    r.detail.map((d) => [d.page, d.problem, d.subject ?? d.frames]),
    [
      ['/offers/', 'a photo of this subject behind a section', 'people'],
      ['/blog/', 'repeat', 2]
    ]
  )
  // with fewer photos than frames, using them again is the brief's own rule
  const few = checkPhotosFit(
    [page({ path: '/blog/', images: [img(at('f1.jpg'), 'img', 'a'), img(at('f1.jpg'), 'img', 'b')] })],
    { ...asked, collected: { pictures: 1 } }
  )
  assert.equal(few.pass, true)
  // a food photo behind a section, and photos with no label, pass
  assert.equal(
    checkPhotosFit([page({ images: [img(at('c1.jpg'), 'background', 'section.hero > figure')] })], asked)
      .pass,
    true
  )
  assert.ok(CHECK_IDS.includes('photos-fit'))
})

// Local round 35 (26/10/2026): a carousel's copies of its slides read as repeats, a selfie cropped to one face behind
// a WordPress cover block's words was not seen as a background, and the badge the template puts on each of its three
// happy-hours cards failed as a repeat and as a misplaced logo.
test('photos-fit skips carousel copies, sees a photo under words, and keeps the repeats the template has', () => {
  const at = (p) => `http://127.0.0.1:5000/images/tracy-content/${p}`
  const img = (src, selector, extra = {}) => ({
    src,
    kind: 'img',
    selector,
    width: 400,
    height: 300,
    broken: false,
    ...extra
  })
  const asked = {
    placedSources: {
      '/images/tracy-content/s1.jpg': 'selfie',
      '/images/tracy-content/c1.jpg': 'cookies',
      '/images/tracy-content/logo.png': '$logo'
    },
    sourceSubjects: { selfie: 'people', cookies: 'food' },
    collected: { pictures: 12 }
  }
  const clones = checkPhotosFit(
    [
      page({
        images: [
          img(at('c1.jpg'), 'div.owl-item > div.item-inner > img'),
          img(at('c1.jpg'), 'div.owl-item > div.item-inner > img', { clone: true }),
          img(at('c1.jpg'), 'div.owl-item > div.item-inner > img', { clone: true })
        ]
      })
    ],
    asked
  )
  assert.equal(clones.pass, true)
  const under = checkPhotosFit(
    [
      page({
        path: '/about-us/',
        images: [img(at('s1.jpg'), 'div.wp-block-cover > img', { underWords: true })]
      })
    ],
    asked
  )
  assert.deepEqual(
    under.detail.map((d) => [d.problem, d.subject]),
    [['a photo of this subject behind a section', 'people']]
  )
  // The template's own repeat, read at the baseline: three cards, one badge file, attachment ids aside.
  const template = baselineOf(
    [
      page({
        path: '/offers/',
        images: [
          img(
            'http://127.0.0.1:5000/wp-content/uploads/2026/10/badge-brand.png',
            'figure.hp > img.wp-image-11'
          ),
          img(
            'http://127.0.0.1:5000/wp-content/uploads/2026/10/badge-brand.png',
            'figure.hp > img.wp-image-11'
          ),
          img(
            'http://127.0.0.1:5000/wp-content/uploads/2026/10/badge-brand.png',
            'figure.hp > img.wp-image-11'
          ),
          img('http://127.0.0.1:5000/wp-content/uploads/2026/10/logo.png', 'header img', {
            width: 100,
            height: 50
          }),
          img('http://127.0.0.1:5000/wp-content/uploads/2026/10/logo.png', 'footer img', {
            width: 100,
            height: 50
          })
        ]
      })
    ],
    []
  )
  assert.deepEqual(template.repeats, {
    '/offers/': [['figure.hp > img', 'figure.hp > img', 'figure.hp > img']]
  })
  assert.deepEqual(template.marks, { '/offers/': 5 })
  const cards = [
    img(at('c1.jpg'), 'figure.hp > img.wp-image-268'),
    img(at('c1.jpg'), 'figure.hp > img.wp-image-268'),
    img(at('c1.jpg'), 'figure.hp > img.wp-image-268')
  ]
  assert.equal(checkPhotosFit([page({ path: '/offers/', images: cards })], asked).pass, false)
  assert.equal(
    checkPhotosFit([page({ path: '/offers/', images: cards })], { ...asked, baseline: template }).pass,
    true
  )
  // the same repeat in frames the template filled with different pictures still fails
  assert.equal(
    checkPhotosFit([page({ path: '/', images: cards })], { ...asked, baseline: template }).pass,
    false
  )
  // Round 36: one photo behind a feature card and again in a strip far down the page is not seen twice; within a
  // screen it is.
  const far = [
    img(at('c1.jpg'), 'div.features-item', { top: 900 }),
    img(at('c1.jpg'), 'div.item-inner > img', { top: 3200 })
  ]
  assert.equal(checkPhotosFit([page({ path: '/', images: far })], asked).pass, true)
  const near = [
    img(at('c1.jpg'), 'div.features-item', { top: 900 }),
    img(at('c1.jpg'), 'div.item-inner > img', { top: 1500 })
  ]
  assert.equal(checkPhotosFit([page({ path: '/', images: near })], asked).pass, false)
})

// Plan "10/10" §7 S3 (26/10/2026): a check read ~15 pages one after another at 2.6–6 s each.
test('runDemoQa reads home alone, then the rest a few at once, and keeps page order whatever finishes first', async () => {
  let open = 0
  let most = 0
  const order = []
  const read = async (url, path) => {
    open++
    most = Math.max(most, open)
    order.push(path)
    // later pages finish first
    await new Promise((r) => setTimeout(r, path === '/' ? 1 : 30 - path.length))
    open--
    return page({ path, url, navLinks: path === '/' ? ['/a', '/bb', '/ccc', '/dddd', '/eeeee'] : [] })
  }
  const asked = demoQaBody({ label: 'acme', platform: 'wordpress', discover: true })
  const result = await runDemoQa({ asked, base: 'http://127.0.0.1:5000/', read })
  assert.equal(order[0], '/')
  assert.equal(most, READ_AT_ONCE)
  assert.deepEqual(result.pages, ['/', '/a', '/bb', '/ccc', '/dddd', '/eeeee'])
  assert.deepEqual(
    result.visited.map((v) => v.path),
    ['/', '/a', '/bb', '/ccc', '/dddd', '/eeeee']
  )
  assert.deepEqual(result.reused, [])
})

// 28/10/2026: a host with room reads a check's pages a few at once; the verdict is the one-at-a-time verdict.
test('runDemoQa with three tabs gives the one-tab result, page by page, whatever finishes first', async () => {
  const run = async (readAtOnce) => {
    let open = 0
    let most = 0
    const read = async (url, path) => {
      open++
      most = Math.max(most, open)
      await new Promise((r) => setTimeout(r, path === '/' ? 1 : 30 - path.length))
      open--
      return page({ path, url, navLinks: path === '/' ? ['/a', '/bb', '/ccc', '/dddd', '/eeeee'] : [] })
    }
    const asked = demoQaBody({ label: 'acme', platform: 'wordpress', discover: true })
    const result = await runDemoQa({ asked, base: 'http://127.0.0.1:5000/', read, readAtOnce })
    return { result, most }
  }
  const one = await run(1)
  const three = await run(3)
  assert.equal(one.most, 1)
  assert.equal(three.most, 3)
  const { durationMs: _a, ...a } = one.result
  const { durationMs: _b, ...b } = three.result
  assert.deepEqual(JSON.parse(JSON.stringify(b)), JSON.parse(JSON.stringify(a)))
})

// Plan "10/10" §7 S5 (26/10/2026): the build's words are written page by page from the baseline's reading of each page.
test("the baseline keeps each page's words in order, headings and buttons marked, forms and nav left out", () => {
  const b = baselineOf(
    [
      page({
        path: '/',
        blocks: [
          { text: 'Welcome to Levain', selector: 'div.x > h2.title' },
          { text: 'Bar & Restaurant', selector: 'div.x > p' },
          { text: 'Your name', selector: 'form > p', form: true },
          { text: 'Welcome to Levain', selector: 'footer > p' }
        ],
        ctas: [
          { text: 'Book a Table', nav: false, href: '/contact/' },
          { text: 'Investor relations', nav: false, href: 'http://127.0.0.1:5000/investors' },
          { text: 'Call us', nav: false, href: 'tel:+19174643769' },
          { text: 'Facebook', nav: false, href: 'https://facebook.com/x' },
          { text: 'Home', nav: true }
        ]
      })
    ],
    []
  )
  // Each button keeps where it goes (local round 36: buttons to /investors written "Order a cake").
  assert.deepEqual(b.pageBlocks, {
    '/': [
      { text: 'Welcome to Levain', kind: 'heading' },
      { text: 'Bar & Restaurant', kind: 'text' },
      { text: 'Book a Table', kind: 'button', to: '/contact/' },
      { text: 'Investor relations', kind: 'button', to: '/investors' },
      { text: 'Call us', kind: 'button', to: 'phone' },
      { text: 'Facebook', kind: 'button', to: 'another site' }
    ]
  })
  assert.equal(demoQaBody({ label: 'a', platform: 'wordpress', incremental: true }).incremental, true)
})

test('selfOriginIn reads the name a site gives itself from its home page, only on one of its own hosts', () => {
  const hosts = ['wp-lumora1.wo.tracy.test']
  const wp = `<html><head><link rel='alternate' type="application/rss+xml" href="http://wp-lumora1.wo.tracy.test:46080/feed/" />
    <link href="http://wp-lumora1.wo.tracy.test:46080/wp-json/" rel="https://api.w.org/" /></head></html>`
  assert.equal(selfOriginIn(wp, hosts), 'http://wp-lumora1.wo.tracy.test:46080')
  const emdash = '<link rel="canonical" href="http://em-lumora1.wo.tracy.test:46080/">'
  assert.equal(selfOriginIn(emdash, ['em-lumora1.wo.tracy.test']), 'http://em-lumora1.wo.tracy.test:46080')
  assert.equal(
    selfOriginIn('<meta property="og:url" content="https://acme.tracy.site/" />', ['acme.tracy.site']),
    'https://acme.tracy.site'
  )
  // Joomla's home writes no such marker; a canonical on a stranger's host is not the site's name; junk never throws.
  assert.equal(selfOriginIn('<html><body>no markers</body></html>', hosts), null)
  assert.equal(selfOriginIn('<link rel="canonical" href="https://www.example.com/">', hosts), null)
  assert.equal(selfOriginIn('<link rel="canonical" href="/relative/">', hosts), null)
  assert.equal(selfOriginIn(wp, []), null)
  assert.equal(selfOriginIn(null, hosts), null)
})

test('navPathsOf keeps links on the page origin or the published host, never home, a file or a stranger', () => {
  const page = 'http://127.0.0.1:5000/'
  const hrefs = [
    'http://127.0.0.1:5000/',
    'http://127.0.0.1:5000/index.php',
    'http://127.0.0.1:5000/menu',
    // WordPress writes its menu with the site's published address, not the one the reader opened.
    'http://wp-lumora1.wo.tracy.test:46080/about/',
    'http://WP-LUMORA1.wo.tracy.test:46080/about/',
    'http://wp-lumora1.wo.tracy.test:46080/menu.pdf',
    'http://evil.test/contact',
    'https://www.facebook.com/LumoraHoiAn',
    'http://127.0.0.1:5000/gallery?x=1'
  ]
  assert.deepEqual(navPathsOf(hrefs, page, ['wp-lumora1.wo.tracy.test']), [
    '/menu',
    '/about/',
    '/gallery?x=1'
  ])
  // Without the published host, only the page's own origin counts (what Joomla and EmDash emit).
  assert.deepEqual(navPathsOf(hrefs, page), ['/menu', '/gallery?x=1'])
  assert.deepEqual(
    navPathsOf(['not a url', 'http://127.0.0.1:5000/a', 'http://127.0.0.1:5000/b'], page, [], 1),
    ['/a']
  )
})

test('runDemoQa reads home first, follows its nav with discover, never leaves the origin, and judges every check', async () => {
  const opened = []
  const read = async (url, path) => {
    opened.push(url)
    return page({ path, url, navLinks: path === '/' ? ['/menu', '//evil.test/', '/menu', '/contact'] : [] })
  }
  const asked = demoQaBody({ label: 'acme', platform: 'joomla', discover: true })
  const result = await runDemoQa({ asked, base: 'http://127.0.0.1:5000/', read })
  assert.deepEqual(result.pages, ['/', '/menu', '/contact'])
  assert.ok(opened.every((u) => u.startsWith('http://127.0.0.1:5000/')))
  assert.deepEqual(
    result.checks.map((c) => c.id),
    CHECK_IDS
  )
  assert.ok(result.baseline.cssRules && result.baseline.pictures && Array.isArray(result.baseline.texts))
  // A partial read must never become a passing check or a baseline.
  let clock = 0
  await assert.rejects(
    runDemoQa({
      asked: { ...asked, budgetMs: 1000 },
      base: 'http://127.0.0.1:5000/',
      now: () => clock,
      read: async (url, path) => {
        clock += 5000
        return page({ path, url, navLinks: ['/menu', '/contact'] })
      }
    }),
    { code: 'DEMO_QA_DEADLINE' }
  )
})

test('a signed /_host/demo-qa runs the reader against the composed target; no browser answers 503', async () => {
  const config = { hostName: 'demo', hostSecret: 'host-secret', sitesRoot: process.cwd() }
  const post = async (app, body) => {
    const raw = JSON.stringify(body)
    const headers = await signHostCall({ secret: 'host-secret', path: '/_host/demo-qa', body: raw })
    return app.fetch(
      new Request('http://tracy-host.test/_host/demo-qa', { method: 'POST', headers, body: raw })
    )
  }
  const run = async () => ({ code: 0, tail: [] })
  assert.equal((await post(buildApp({ config, run }), { label: 'acme', platform: 'joomla' })).status, 503)
  const urls = []
  const demoQa = async ({ asked, base }) => {
    urls.push(base)
    return runDemoQa({ asked, base, read: async (url, path) => page({ url, path }) })
  }
  const app = buildApp({ config, run, demoQa })
  assert.equal((await post(app, { label: '../x', platform: 'joomla' })).status, 400)
  const res = await post(app, { label: 'acme', platform: 'joomla', port: 52019, pages: ['/'] })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.deepEqual(urls, ['http://127.0.0.1:52019/'])
  assert.equal(body.checks.length, CHECK_IDS.length)
  assert.equal(typeof body.durationMs, 'number')
})

test('the demo is dialled on the first address that answers: hostname, then loopback port, then the docker-network name', async () => {
  const { baseCandidates, reachableBase } = await import('../src/demo-qa.js')
  assert.deepEqual(baseCandidates('pic-hill6', 'joomla', 52125, null), [
    'http://127.0.0.1:52125/',
    'http://pic-hill6-web-1/'
  ])
  assert.deepEqual(baseCandidates('pic-hill6', 'emdash', null, 'hill.example.com'), [
    'https://hill.example.com/',
    'http://pic-hill6-web-1:4321/'
  ])
  const refusedLoopback = async (url) => {
    if (url.startsWith('http://127.0.0.1:')) throw new Error('ECONNREFUSED')
    return new Response('', { status: 200 })
  }
  assert.equal(
    await reachableBase(baseCandidates('pic-hill6', 'joomla', 52125, null), { fetchImpl: refusedLoopback }),
    'http://pic-hill6-web-1/'
  )
  const redirecting = async () => new Response('', { status: 301, headers: { location: 'https://x/' } })
  assert.equal(
    await reachableBase(['http://127.0.0.1:1/', 'http://b/'], { fetchImpl: redirecting }),
    'http://127.0.0.1:1/'
  )
  const nobody = async () => {
    throw new Error('ETIMEDOUT')
  }
  assert.equal(
    await reachableBase(['http://127.0.0.1:1/', 'http://b/'], { fetchImpl: nobody }),
    'http://127.0.0.1:1/'
  )
})

test('content-reachable: a document that stops scrolling before its content ends fails, with the overflow it found', () => {
  // The Ridge House, 18/10/2026: `html, body { overflow-x: hidden }` on a skrollr page → 900 px document, 3829 px content.
  const clipped = checkContentReachable([
    page({
      reach: { documentHeight: 900, contentHeight: 3829, htmlOverflowY: 'auto', bodyOverflowY: 'auto' }
    })
  ])
  assert.equal(clipped.pass, false)
  assert.equal(clipped.detail[0].contentHeight, 3829)
  assert.match(clipped.detail[0].fix, /overflow from html and body/)
  assert.equal(
    checkContentReachable([page({ reach: { documentHeight: 4065, contentHeight: 4065 } })]).pass,
    true
  )
  // A footer that reaches a few pixels past the document is slack, not a clipped page; no reading is no verdict.
  assert.equal(
    checkContentReachable([page({ reach: { documentHeight: 4000, contentHeight: 4100 } })]).pass,
    true
  )
  assert.equal(checkContentReachable([page({})]).pass, true)
})

test('css-intact: T3 optimize bundles are held as one pool, so re-bundling after an unpublish is not a lost sheet', () => {
  const bundle = (name, rules) => ({
    path: `t3-assets/css/${name}.css`,
    rules,
    sentinel: null,
    sentinelFound: null,
    text: 'a{b:c}'
  })
  const baseline = {
    cssRules: {
      't3-assets/css/css-72fd6-32178.css': { rules: 819, sentinel: null, page: '/' },
      't3-assets/css/css-94f68-32178.css': { rules: 753, sentinel: null, page: '/' },
      't3-assets/css/css-c7c04-32178.css': { rules: 978, sentinel: null, page: '/' },
      't3-assets/css/css-f832a-32178.css': { rules: 806, sentinel: null, page: '/' }
    }
  }
  // Same rules under new names: fine.
  const renamed = [bundle('css-aaaaa-32190', 1572), bundle('css-bbbbb-32190', 1784)]
  assert.equal(checkCssIntact([page({ sheets: renamed })], baseline).pass, true)
  // Half the pool gone: the lumorahoian shape, whatever the names.
  const halved = checkCssIntact([page({ sheets: [bundle('css-ccccc-32190', 1200)] })], baseline)
  assert.equal(halved.pass, false)
  assert.match(halved.detail[0].problem, /1200 of the 3356 rules/)
})

test('css-intact: a content-hashed stylesheet (Astro, Vite) is held by its stem, so a rebuild is not a lost sheet', () => {
  assert.equal(hashedStem('_astro/Base.BNyaLx3F.css'), '_astro/Base.css')
  assert.equal(hashedStem('site/_astro/Contact.Bk9jmNlg.css'), 'site/_astro/Contact.css')
  assert.equal(hashedStem('assets/index-C3k9aQ2x.css'), 'assets/index.css')
  assert.equal(hashedStem('templates/ja_restaurant/css/template.css'), null)
  assert.equal(hashedStem('_astro/Base.css'), null)
  const sheet = (path, rules, sentinelFound = null) => ({
    path,
    rules,
    sentinel: null,
    sentinelFound,
    text: 'a{b:c}'
  })
  // em-lumora1, 18/10/2026: EmDash rule 8 rebuilds the site; Astro renames Base.<hash>.css; the rules stay.
  const baseline = {
    cssRules: {
      '_astro/Base.BNyaLx3F.css': { rules: 147, sentinel: '.z{color:red}', page: '/' },
      '_astro/Contact.Bk9jmNlg.css': { rules: 58, sentinel: null, page: '/' }
    }
  }
  const rebuilt = [sheet('_astro/Base.DVyY2jn1.css', 148, true), sheet('_astro/Contact.Bk9jmNlg.css', 58)]
  assert.equal(checkCssIntact([page({ sheets: rebuilt })], baseline).pass, true)
  // The rebuilt file lost half its rules: still caught, naming both files.
  const broken = checkCssIntact(
    [page({ sheets: [sheet('_astro/Base.DVyY2jn1.css', 60, true), rebuilt[1]] })],
    baseline
  )
  assert.equal(broken.pass, false)
  assert.match(broken.detail[0].file, /Base\.BNyaLx3F\.css \(now _astro\/Base\.DVyY2jn1\.css\)/)
  // The sentinel is sought in the new file: gone there is still gone.
  const noSentinel = checkCssIntact(
    [page({ sheets: [sheet('_astro/Base.DVyY2jn1.css', 150, false), rebuilt[1]] })],
    baseline
  )
  assert.equal(noSentinel.pass, false)
  assert.equal(noSentinel.detail[0].problem, 'its last rule is gone')
  // No sheet of that stem at all: gone.
  assert.equal(checkCssIntact([page({ sheets: [rebuilt[1]] })], baseline).pass, false)
})

test('cssTextProblems: an escaped quote in a Tailwind class selector is not a string start', () => {
  const tailwind =
    ".\\[\\&_svg\\:not\\(\\[class\\*\\=\\'size-\\'\\]\\)\\]\\:size-3 svg:not([class*=size-]){width:calc(var(--spacing) * 3)}.x{color:red}"
  assert.deepEqual(cssTextProblems(tailwind), [])
  // A real string with a brace inside is still skipped, and a real stray brace is still caught.
  assert.deepEqual(cssTextProblems(".a:before{content:'{'}.b{c:d}"), [])
  assert.deepEqual(cssTextProblems('.a{b:c}}'), ['a } with no { at line 1'])
})

test('runDemoQa: discovery is nav, then footer and sitemap; a page that lands on home or a footer/sitemap 404 is visited, not judged', async () => {
  const opened = []
  const routes = {
    '/': { navLinks: ['/gallery', '/broken'], extraLinks: ['/about', '/pricing/', '/gone', '/gallery'] },
    '/pricing/': { finalUrl: 'http://127.0.0.1:5000/' },
    '/gone': { status: 404 },
    '/broken': { status: 404 }
  }
  const read = async (url, path) => {
    opened.push(path)
    return page({ path, url, finalUrl: url, ...routes[path] })
  }
  const asked = demoQaBody({ label: 'acme', platform: 'wordpress', discover: true })
  const result = await runDemoQa({ asked, base: 'http://127.0.0.1:5000/', read })
  assert.deepEqual(opened, ['/', '/gallery', '/broken', '/about', '/pricing/', '/gone'])
  // A nav link that 404s is a broken page a visitor clicks: judged. A footer/sitemap one is not a page.
  assert.deepEqual(result.pages, ['/', '/gallery', '/broken', '/about'])
  assert.deepEqual(result.visited, [
    { path: '/', status: 200, finalPath: '/', from: 'home' },
    { path: '/gallery', status: 200, finalPath: '/gallery', from: 'nav' },
    { path: '/broken', status: 404, finalPath: '/broken', from: 'nav' },
    { path: '/about', status: 200, finalPath: '/about', from: 'extra' },
    { path: '/pricing/', status: 200, finalPath: '/', from: 'extra', skipped: 'redirected home' },
    { path: '/gone', status: 404, finalPath: '/gone', from: 'extra', skipped: 'not found' }
  ])
  const loaded = result.checks.find((c) => c.id === 'pages-load')
  assert.deepEqual(
    loaded.detail.map((d) => d.page),
    ['/broken']
  )
})

// ds-7f on wo2 (19/10/2026): Joomla's "Menu" parent is an alias serving About, so nav discovery never opened
// Simple Menu and the template's $ prices passed QA.
test('runDemoQa: the pages a build kept are read beside what nav finds — on Joomla under /index.php; one that 404s is visited, not judged', async () => {
  const opened = []
  const routes = {
    '/': { navLinks: ['/index.php/menu', '/index.php/about-us'] },
    '/index.php/menu': { text: 'About us. We are a European deli in Hoi An.' },
    '/index.php/menu/simple-menu': { text: 'Simple Menu. Eggs Benedict $12. Flat white $4' },
    '/index.php/contact/phone-reservation': { status: 404 },
    '/index.php/about-us': { status: 404 }
  }
  const read = async (url, path) => {
    opened.push(path)
    return page({ path, url, finalUrl: url, ...routes[path] })
  }
  const asked = demoQaBody({
    label: 'acme',
    platform: 'joomla',
    discover: true,
    plan: ['/menu/simple-menu', '/about-us', '/contact/phone-reservation']
  })
  const result = await runDemoQa({ asked, base: 'http://127.0.0.1:5000/', read })
  assert.deepEqual(opened.sort(), [
    '/',
    '/index.php/about-us',
    '/index.php/contact/phone-reservation',
    '/index.php/menu',
    '/index.php/menu/simple-menu'
  ])
  assert.ok(result.pages.includes('/index.php/menu/simple-menu'))
  assert.deepEqual(
    result.visited.find((v) => v.path === '/index.php/contact/phone-reservation'),
    {
      path: '/index.php/contact/phone-reservation',
      status: 404,
      finalPath: '/index.php/contact/phone-reservation',
      from: 'plan',
      skipped: 'not found'
    }
  )
  // Linked from the nav too: a 404 there is a broken nav link, judged.
  assert.equal(result.visited.find((v) => v.path === '/index.php/about-us').from, 'nav')
  assert.ok(result.pages.includes('/index.php/about-us'))
  const facts = result.checks.find((c) => c.id === 'facts-from-brief')
  assert.deepEqual([...new Set(facts.detail.map((d) => d.page))], ['/index.php/menu/simple-menu'])
})

test('demoQaBody: the plan widens the page cap past the nav cap, up to a ceiling', () => {
  const plan = Array.from({ length: 30 }, (_, i) => `/p${i}`)
  const asked = demoQaBody({ label: 'acme', platform: 'wordpress', plan })
  assert.equal(asked.plan.length, DEMO_QA_MAX_PLAN)
  assert.equal(asked.maxPages, DEMO_QA_MAX_PAGES + DEMO_QA_MAX_PLAN)
  assert.equal(demoQaBody({ label: 'acme', platform: 'wordpress' }).maxPages, DEMO_QA_MAX_PAGES)
  assert.match(demoQaBody({ label: 'acme', platform: 'joomla', plan: ['//evil.test/'] }).error, /plan/)
})

test('runDemoQa: a nav link that lands on home (a drafted page) is not judged as a second home', async () => {
  const read = async (url, path) =>
    page({
      path,
      url,
      finalUrl: path === '/old/' ? 'http://127.0.0.1:5000/?redirected' : url,
      navLinks: path === '/' ? ['/old/', '/menu'] : []
    })
  const asked = demoQaBody({ label: 'acme', platform: 'wordpress', discover: true })
  const result = await runDemoQa({ asked, base: 'http://127.0.0.1:5000/', read })
  assert.deepEqual(result.pages, ['/', '/menu'])
  assert.equal(result.visited.find((v) => v.path === '/old/').skipped, 'redirected home')
})

test('no-empty-picture-slots: a picture frame that shows no picture fails, with its page and selector', () => {
  const ok = checkNoEmptyPictureSlots([page({ emptySlots: [] })])
  assert.equal(ok.pass, true)
  const bad = checkNoEmptyPictureSlots([
    page({
      path: '/',
      emptySlots: [{ selector: 'div.zig > div.zig-visual', size: '560×300', kind: 'frame' }]
    }),
    page({
      path: '/gallery',
      emptySlots: [{ selector: 'figure.wp-block-image', size: '300×200', kind: 'figure' }]
    })
  ])
  assert.equal(bad.pass, false)
  assert.deepEqual(
    bad.detail.map((d) => `${d.page} ${d.selector}`),
    ['/ div.zig > div.zig-visual', '/gallery figure.wp-block-image']
  )
})

test('placed-pictures-visible: a picture Tracy placed that no page shows (hidden block, closed details) fails; one shown anywhere, on a phone or in a carousel does not', () => {
  const placed = [
    'wp-content/uploads/tracy-content/aa.jpg',
    'wp-content/uploads/tracy-content/bb.jpg',
    'wp-content/uploads/tracy-content/cc.jpg',
    'wp-content/uploads/tracy-content/dd.jpg'
  ]
  const at = (f) => `http://127.0.0.1:5000/wp-content/uploads/tracy-content/${f}`
  const reads = [
    page({ path: '/', images: [{ src: at('aa.jpg'), kind: 'img', width: 400, height: 300 }] }),
    page({
      path: '/gallery',
      images: [],
      hiddenImages: [
        { src: at('aa.jpg'), selector: 'details > img' },
        { src: at('bb.jpg'), selector: 'div[hidden] > img' },
        { src: at('cc.jpg'), selector: 'figure > img' },
        { src: at('dd.jpg'), selector: 'div.carousel-item > img', carousel: true }
      ],
      phoneImages: [at('cc.jpg')]
    })
  ]
  const r = checkPlacedPicturesVisible(reads, { placed })
  assert.equal(r.pass, false)
  assert.deepEqual(
    r.detail.map((d) => `${d.page} ${d.file}`),
    ['/gallery wp-content/uploads/tracy-content/bb.jpg']
  )
  assert.equal(checkPlacedPicturesVisible(reads, { placed: [] }).pass, true)
})

test('no-google-review-quoted: eight words in a row from a Google review fail (case, spacing and punctuation aside); seven do not', () => {
  const googleReviews = [
    'On the Thu Bồn River, between Old Town and the beach — a wood-fired oven and lovely staff!'
  ]
  const quoted = checkNoGoogleReviewQuoted(
    [page({ path: '/', text: 'Welcome.  ON THE THU BỒN RIVER between old town and the BEACH, we cook.' })],
    { googleReviews }
  )
  assert.equal(quoted.pass, false)
  assert.equal(quoted.detail[0].code, 'GOOGLE_REVIEW_QUOTED')
  assert.equal(quoted.detail[0].page, '/')
  assert.match(quoted.detail[0].words, /on the thu bồn river between old town/)
  const seven = checkNoGoogleReviewQuoted(
    [page({ path: '/', text: 'We sit on the Thu Bồn River between old houses.' })],
    { googleReviews }
  )
  assert.equal(seven.pass, true)
  assert.equal(checkNoGoogleReviewQuoted([page({ text: 'anything' })], { googleReviews: [] }).pass, true)
})

test('demoQaBody keeps the Google reviews it is sent, bounded', () => {
  const asked = demoQaBody({ label: 'acme', platform: 'joomla', googleReviews: ['A fine review.', 7, ''] })
  assert.deepEqual(asked.googleReviews, ['A fine review.'])
  assert.deepEqual(demoQaBody({ label: 'acme', platform: 'joomla' }).googleReviews, [])
})

test('look-kept: the look Tracy handed over is held — tokens, new colour or font rules, <style> blocks and inline styles (plan wo-design-follows-template)', () => {
  const template = {
    path: 'templates/tracy/css/template.css',
    rules: 300,
    sentinel: null,
    sentinelFound: null,
    text: ':root{--ds-c-bg:#ffffff;--ds-c-fg:#1d1d1f;--bg:#fff}body{color:var(--ds-c-fg);background:var(--ds-c-bg)}'
  }
  const custom = (text) => ({
    path: 'templates/tracy/css/custom.css',
    rules: 1,
    sentinel: null,
    sentinelFound: null,
    text
  })
  const styles = [{ selector: 'head > style:nth-of-type(1)', text: '.phone-only{display:none}' }]
  const before = [page({ sheets: [template, custom('.x{margin:0}')], styles, inline: [] })]
  const baseline = baselineOf(before)
  assert.deepEqual(baseline.look.tokens, { '--ds-c-bg': '#ffffff', '--ds-c-fg': '#1d1d1f', '--bg': '#fff' })
  assert.equal(checkLookKept(before, baseline).pass, true, 'the site as handed over passes its own baseline')
  // the same value written by a minifier is the same look (T4's optimised bundle on dev, 24/10/2026)
  const minified = { ...template, text: template.text.replace('--bg:#fff', '--bg:#FFFFFF') }
  const spaced = baselineOf([
    page({ sheets: [{ ...template, text: ':root{--t:rgba(33, 37, 41, 0.5)}' }], styles, inline: [] })
  ])
  assert.equal(
    checkLookKept(
      [page({ sheets: [{ ...template, text: ':root{--t:rgba(33,37,41,.5)}' }], styles, inline: [] })],
      spaced
    ).pass,
    true
  )
  assert.equal(
    checkLookKept([page({ sheets: [minified, custom('.x{margin:0}')], styles, inline: [] })], baseline).pass,
    true
  )

  // 1. The agent redefined the slot tokens in custom.css (opal-moon-bistro-j-base-2, 19/10/2026).
  const repainted = checkLookKept(
    [
      page({
        sheets: [template, custom(':root{--ds-c-bg:#f7f4ef;--ds-c-fg:#2a2319;--ds-c-accent:#2a2319}')],
        styles,
        inline: []
      })
    ],
    baseline
  )
  assert.equal(repainted.pass, false)
  assert.deepEqual(
    repainted.detail.map((d) => [d.token, d.before ?? null, d.after]),
    [
      ['--ds-c-bg', '#ffffff', '#f7f4ef'],
      ['--ds-c-fg', '#1d1d1f', '#2a2319'],
      ['--ds-c-accent', null, '#2a2319']
    ]
  )
  assert.equal(repainted.detail[0].file, 'templates/tracy/css/custom.css')

  // 1b. The template's own sheet was rewritten so every token reads its slot with the old value as the fallback
  // (opal-moon-bistro-j6 on stand wodsft, 19/10/2026: base.css `#0071e3` → `var(--ds-c-accent, #0071e3)`, 602 tokens,
  // same colours). The ruler is what the browser computes on <html>, not the text: same computed value = kept.
  const reworded = (text, computed) => [
    page({ sheets: [{ ...template, text }, custom('.x{margin:0}')], styles, inline: [], computed })
  ]
  const baselineComputed = baselineOf(
    reworded(template.text, { '--ds-c-bg': '#ffffff', '--ds-c-fg': '#1d1d1f', '--bg': '#fff' })
  )
  assert.deepEqual(baselineComputed.look.computed, {
    '--ds-c-bg': '#ffffff',
    '--ds-c-fg': '#1d1d1f',
    '--bg': '#fff'
  })
  const rewordedKept = checkLookKept(
    reworded(
      ':root{--ds-c-bg:#ffffff;--ds-c-fg:#1d1d1f;--bg:var(--ds-c-bg, #fff)}body{color:var(--ds-c-fg)}',
      {
        '--ds-c-bg': '#ffffff',
        '--ds-c-fg': '#1d1d1f',
        '--bg': '#ffffff'
      }
    ),
    baselineComputed
  )
  assert.equal(
    rewordedKept.pass,
    true,
    `a token that reads the same colour through var() is kept: ${JSON.stringify(rewordedKept.detail)}`
  )
  const rewordedPainted = checkLookKept(
    reworded(':root{--ds-c-bg:#ffffff;--ds-c-fg:#1d1d1f;--bg:var(--paper, #fff)}body{color:var(--ds-c-fg)}', {
      '--ds-c-bg': '#ffffff',
      '--ds-c-fg': '#1d1d1f',
      '--bg': '#f7f4ef'
    }),
    baselineComputed
  )
  assert.equal(rewordedPainted.pass, false, 'a token that now computes another colour is a change')
  assert.deepEqual(
    rewordedPainted.detail.map((d) => [d.token, d.before, d.after, d.computedBefore, d.computedAfter]),
    [['--bg', '#fff', 'var(--paper, #fff)', '#fff', '#f7f4ef']]
  )
  // Without a computed reading on either side (an older baseline or page report) the declared text still decides.
  assert.equal(
    checkLookKept(
      reworded(':root{--ds-c-bg:#ffffff;--ds-c-fg:#1d1d1f;--bg:var(--ds-c-bg, #fff)}', undefined),
      baseline
    ).pass,
    false
  )

  // 2. A colour or font written straight into custom.css; a layout rule there is fine; a var() reference is fine.
  const painted = checkLookKept(
    [
      page({
        sheets: [
          template,
          custom(
            '.hero{background:#2a2319;color:white;font-family:Lora,serif}.x{margin:0;padding:1rem}.y{color:var(--ds-c-fg)}'
          )
        ],
        styles,
        inline: []
      })
    ],
    baseline
  )
  assert.equal(painted.pass, false)
  assert.deepEqual(painted.detail.map((d) => d.declaration).sort(), [
    'background:#2a2319',
    'color:white',
    'font-family:Lora,serif'
  ])
  assert.equal(
    checkLookKept(
      [
        page({
          sheets: [template, custom('.x{margin:0;padding:1rem}.y{color:var(--ds-c-fg)}')],
          styles,
          inline: []
        })
      ],
      baseline
    ).pass,
    true
  )

  // 3. A rebuilt, content-hashed bundle (EmDash) is not read as a new sheet, but a token it changed is.
  const astro = (text, hash) => ({
    path: `_astro/Base.${hash}.css`,
    rules: 200,
    sentinel: null,
    sentinelFound: null,
    text
  })
  const emBase = baselineOf([
    page({
      sheets: [astro(':root{--bg:#ffffff;--accent:#0071e3}.a{color:red}', 'AAAAAAAA')],
      styles: [],
      inline: []
    })
  ])
  assert.equal(
    checkLookKept(
      [
        page({
          sheets: [astro(':root{--bg:#ffffff;--accent:#0071e3}.a{color:red}.b{color:blue}', 'BBBBBBBB')],
          styles: [],
          inline: []
        })
      ],
      emBase
    ).pass,
    true
  )
  const retoned = checkLookKept(
    [
      page({
        sheets: [astro(':root{--bg:#1a1a1a;--accent:#0071e3}.a{color:red}', 'CCCCCCCC')],
        styles: [],
        inline: []
      })
    ],
    emBase
  )
  assert.deepEqual(
    retoned.detail.map((d) => [d.token, d.before, d.after]),
    [['--bg', '#ffffff', '#1a1a1a']]
  )

  // 4. A new <style> block (WordPress Additional CSS) or a new inline style carrying a colour or a font.
  const wpCss = checkLookKept(
    [
      page({
        sheets: [template, custom('.x{margin:0}')],
        styles: [...styles, { selector: '#wp-custom-css', text: 'h1{color:#2a2319}' }],
        inline: []
      })
    ],
    baseline
  )
  assert.deepEqual(
    wpCss.detail.map((d) => [d.style, d.declaration]),
    [['#wp-custom-css', 'color:#2a2319']]
  )
  const inline = checkLookKept(
    [
      page({
        sheets: [template, custom('.x{margin:0}')],
        styles,
        inline: [{ selector: 'section.hero', style: 'background-color: rgb(42,35,25)' }]
      })
    ],
    baseline
  )
  assert.deepEqual(
    inline.detail.map((d) => [d.selector, d.style]),
    [['section.hero', 'background-color: rgb(42,35,25)']]
  )

  // A baseline from before this check existed, or none at all: nothing to hold, said as such.
  assert.equal(checkLookKept(before, { cssRules: {} }).pass, true)
  assert.match(checkLookKept(before, null).measured, /no look baseline/)
  assert.ok(CHECK_IDS.includes('look-kept'))
})

test('a T4 "optimize" bundle under media/t4/optimize/css/<hash>.css is a rebuilt bundle: look-kept and css-intact hold it as a pool, not by name (opal-moon-bistro-j6b, 19/10/2026)', () => {
  const bundle = (hash, text, rules = 3500) => ({
    path: `media/t4/optimize/css/${hash}.css`,
    rules,
    sentinel: null,
    sentinelFound: null,
    text
  })
  const template = {
    path: 'templates/tracy/css/styles/base.css',
    rules: 300,
    sentinel: null,
    sentinelFound: null,
    text: ':root{--bg:#fff}'
  }
  const before = [
    page({
      sheets: [
        template,
        bundle('38cb75c079ca76622fb104694e9c7340', '.a{color:#6e6e6f}'),
        bundle('abde6f7f55840727b14a988ef5b00a68', '.b{background:#fff}')
      ],
      styles: [],
      inline: []
    })
  ]
  const baseline = baselineOf(before)
  // The agent unpublished a module: T4 re-bundled everything under one new hash, with the template's own rules.
  const after = [
    page({
      sheets: [
        template,
        bundle(
          '185b0fd1d12d0b71ef7a9646f88d19ae',
          '.a{color:#6e6e6f}.b{background:#fff}.c{background-color:rgba(0,0,0,.68)}',
          6900
        )
      ],
      styles: [],
      inline: []
    })
  ]
  const look = checkLookKept(after, baseline)
  assert.equal(look.pass, true, JSON.stringify(look.detail))
  const css = checkCssIntact(after, baseline)
  assert.equal(css.pass, true, JSON.stringify(css.detail))
  // Its tokens are still judged: a bundle that now paints a slot token by hand is caught.
  const painted = [
    page({
      sheets: [
        template,
        bundle('ffffffffffffffffffffffffffffffff', ':root{--ds-c-bg:#f7f4ef}.a{color:#6e6e6f}', 6900)
      ],
      styles: [],
      inline: []
    })
  ]
  assert.equal(checkLookKept(painted, baseline).pass, false)
})

test('a declaration that derives its colour from the system (color-mix over var(), calc over var()) is not a paint; a literal beside a var() is (opal-moon-bistro-j6b round 3, 19/10/2026)', () => {
  assert.deepEqual(
    paintIn('.a{color:color-mix(in srgb, var(--brand-color-primary-contrast) 88%, transparent)}'),
    []
  )
  assert.deepEqual(paintIn('.a{background:var(--surface);border-color:var(--border, transparent)}'), [])
  assert.deepEqual(paintIn('.a{font-family:var(--font-body)}'), [])
  assert.deepEqual(paintIn('.a{color:#2a2319}'), ['color:#2a2319'])
  assert.deepEqual(paintIn('.a{background:linear-gradient(var(--a), #fff)}'), [
    'background:linear-gradient(var(--a),#fff)'
  ])
  assert.deepEqual(paintIn('.a{color:rgb(42 35 25 / 80%)}'), ['color:rgb(423525/80%)'])
  assert.deepEqual(paintIn('.a{font-family:"Playfair Display",serif}'), [
    'font-family:"PlayfairDisplay",serif'
  ])
  const inline = [
    {
      selector: 'div > p.clamp-2',
      style:
        'color:color-mix(in srgb, var(--brand-color-primary-contrast) 88%, transparent);font-size:var(--brand-font-size-lg)'
    }
  ]
  const read = [page({ sheets: [], styles: [], inline })]
  assert.equal(checkLookKept(read, baselineOf([page({ sheets: [], styles: [], inline: [] })])).pass, true)
})

// B1 (ai-flow audit 19/10/2026): a home that never opened gave an EMPTY baseline that judged nothing.
test('baselineOf says which pages it read; a home that did not open is unread, and no baseline is never a pass', () => {
  const broken = baselineOf([page({ error: 'net::ERR_CONNECTION_REFUSED', status: null })])
  assert.deepEqual(broken.read, [])
  assert.deepEqual(broken.unread, [{ path: '/', why: 'did not open' }])
  assert.deepEqual(broken.texts, [])
  const home502 = baselineOf([page({ status: 502 }), page({ path: '/menu', status: 404 })])
  assert.deepEqual(home502.unread, [{ path: '/', why: 'answered 502' }])
  // A nav page that is a 404 is what a visitor sees: read, not a failure of the baseline.
  assert.deepEqual(home502.read, ['/menu'])
  const fine = baselineOf([page({ blocks: [{ text: 'Our chef John brings forty years' }] })])
  assert.deepEqual(fine.read, ['/'])
  assert.deepEqual(fine.unread, [])

  const reads = [page({ blocks: [{ text: 'Our chef John brings forty years of French cooking' }], text: '' })]
  const words = checkNoDemoWords(reads, { baseline: null, briefText: '' })
  assert.equal(words.pass, false)
  assert.equal(words.skipped, 'no baseline')
  const pictures = checkNoDemoPictures(reads, { baseline: null })
  assert.equal(pictures.pass, false)
  assert.equal(pictures.skipped, 'no baseline')
  // A baseline that was read and holds no texts is genuinely empty: judged, and passes.
  assert.equal(checkNoDemoWords(reads, { baseline: { texts: [] }, briefText: '' }).pass, true)
})

test('collected testimonials pass word for word with their author; unnamed, altered and short quotes fail', () => {
  const text = 'Wonderful dinner with fresh ingredients and lovely service every evening.'
  const review = { text, author: 'Lan N.', url: 'https://www.google.com/maps/reviews/123' }
  const asked = demoQaBody({
    label: 'acme',
    platform: 'joomla',
    googleReviews: [text],
    googleReviewTestimonials: [review, null, { author: 1 }]
  })
  assert.deepEqual(asked.googleReviewTestimonials, [review])
  const credited = page({ text: `${text} Lan N. on Google`, reviewLinks: [review.url] })
  assert.equal(checkNoGoogleReviewQuoted([credited], asked).pass, true)
  assert.equal(checkNoGoogleReviewQuoted([page({ text })], asked).pass, false)
  // A link the area cannot show is a note, never a failure (26/10/2026).
  const unlinked = checkNoGoogleReviewQuoted([{ ...credited, reviewLinks: [] }], asked)
  assert.equal(unlinked.pass, true)
  assert.deepEqual(unlinked.detail[0].canAdd, ['link'])
  assert.equal(
    checkNoGoogleReviewQuoted(
      [
        {
          ...credited,
          text: `Wonderful dinner with fresh ingredients and lovely service daily. Lan N. on Google`
        }
      ],
      asked
    ).pass,
    false
  )
  assert.equal(
    checkNoGoogleReviewQuoted([page({ text: 'Great!' })], {
      googleReviews: ['Great!'],
      googleReviewTestimonials: [{ text: 'Great!', author: 'Lan' }]
    }).pass,
    false
  )
})

test('testimonial prices are opinions; the same price in business copy the brief does not hold fails', () => {
  const text = 'Dinner cost $99 and was delicious.'
  const review = { text, author: 'Lan', url: 'https://www.google.com/maps/reviews/123' }
  const asked = { briefText: 'Restaurant Acme.', googleReviewTestimonials: [review] }
  const credited = page({ text: `${text} Lan on Google`, reviewLinks: [review.url] })
  assert.equal(checkFactsFromBrief([credited], asked).pass, true)
  const copy = checkFactsFromBrief([{ ...credited, text: `${credited.text} Our dinner costs $99.` }], asked)
  assert.equal(copy.pass, false)
  assert.deepEqual(
    copy.detail.map((d) => [d.kind, d.shown]),
    [['price', '$99.']]
  )
})

test('a testimonial passes with its author whatever platform credit the page prints; the missing credit is a note', () => {
  const text = 'Un excellent repas avec un service très agréable et des produits frais.'
  const review = {
    text,
    author: 'Marie',
    provider: 'Tripadvisor',
    language: 'fr',
    url: 'https://tripadvisor.com/review/actual'
  }
  const asked = { reviewTestimonials: [review] }
  assert.equal(
    checkNoGoogleReviewQuoted(
      [page({ text: `${text} Marie · Tripadvisor`, reviewLinks: [review.url] })],
      asked
    ).pass,
    true
  )
  const other = checkNoGoogleReviewQuoted(
    [page({ text: `${text} Marie · Google`, reviewLinks: [review.url] })],
    asked
  )
  assert.equal(other.pass, true)
  assert.deepEqual(other.detail[0].canAdd, ['provider'])
  assert.equal(
    checkNoGoogleReviewQuoted([page({ text: `${text} Tripadvisor`, reviewLinks: [review.url] })], asked).pass,
    false
  )
})

test('QA accepts the signed public origin with its actual port only for the requested site host', () => {
  const input = { label: 'cafe', platform: 'joomla', host: 'cafe.tracy.test' }
  assert.equal(
    demoQaBody({ ...input, publicOrigin: 'https://cafe.tracy.test:8443' }).publicOrigin,
    'https://cafe.tracy.test:8443'
  )
  for (const publicOrigin of [
    'https://other.tracy.test:8443',
    'https://u:p@cafe.tracy.test',
    'https://cafe.tracy.test/private',
    'file:///tmp'
  ])
    assert.equal(demoQaBody({ ...input, publicOrigin }).error, 'refused public origin')
})

test('TripAdvisor quotations pass with their author; credit and link are notes; opinions never establish business facts', () => {
  const text = 'Wonderful dinner with fresh ingredients and lovely service every evening.'
  const review = {
    text,
    author: 'Lan N.',
    provider: 'TripAdvisor',
    url: 'https://www.tripadvisor.com/ShowUserReviews-r123.html'
  }
  const asked = demoQaBody({
    label: 'acme',
    platform: 'joomla',
    briefText: 'Acme restaurant.',
    googleReviewTestimonials: [review]
  })
  const credited = page({ text: `${text} Lan N. on TripAdvisor`, reviewLinks: [review.url] })
  assert.equal(checkNoGoogleReviewQuoted([credited], asked).pass, true)
  assert.equal(
    checkNoGoogleReviewQuoted([page({ ...credited, text: `${text} Lan on TripAdvisor` })], asked).pass,
    false
  )
  const bare = checkNoGoogleReviewQuoted([page({ ...credited, reviewLinks: [] })], asked)
  assert.equal(bare.pass, true)
  assert.deepEqual(bare.detail[0].canAdd, ['link'])
  assert.equal(checkFactsFromBrief([credited], asked).pass, true)
})

test('an author profile link the page could add is a note, never a failure', () => {
  const review = {
    text: 'Lovely dinner.',
    author: 'Lan',
    provider: 'TripAdvisor',
    url: 'https://www.tripadvisor.com/ShowUserReviews-r123.html',
    authorUrl: 'https://www.tripadvisor.com/Profile/lan'
  }
  const asked = demoQaBody({ label: 'acme', platform: 'joomla', googleReviewTestimonials: [review] })
  const read = page({ text: `${review.text} Lan on TripAdvisor`, reviewLinks: [review.url] })
  const check = checkNoGoogleReviewQuoted([read], asked)
  assert.equal(check.pass, true)
  assert.deepEqual(check.detail[0].canAdd, ['author link'])
  const full = checkNoGoogleReviewQuoted([{ ...read, reviewLinks: [review.url, review.authorUrl] }], asked)
  assert.deepEqual(full.detail, [])
})

test('platform credit counts only as a complete word, and its absence never fails', () => {
  for (const provider of ['Google', 'TripAdvisor']) {
    const review = { text: 'Lovely dinner.', author: 'Lan', provider, url: 'https://example.test/review' }
    const asked = demoQaBody({ label: 'acme', platform: 'joomla', googleReviewTestimonials: [review] })
    const check = checkNoGoogleReviewQuoted(
      [page({ text: `${review.text} Lan on ${provider}d`, reviewLinks: [review.url] })],
      asked
    )
    assert.equal(check.pass, true)
    assert.deepEqual(check.detail[0].canAdd, ['provider'])
  }
})

// ── structure-kept: a demo replaces, never removes (22/10/2026) ──────────────────────────────────

/** JA Restaurant's home and menu as the WO build marked them, then read. */
const builtSections = () => [
  page({
    path: '/',
    sections: [
      { name: 'slideshow', items: 3, text: 120 },
      { name: 'features-intro', items: 2, text: 300 },
      { name: 'features-intro', items: 3, text: 260 },
      { name: 'menu', items: 6, text: 400 },
      { name: 'subscribe', items: 0, text: 90 }
    ]
  }),
  page({
    path: '/menu/',
    url: 'http://127.0.0.1:5000/menu/',
    sections: [
      { name: 'tabs', items: 0, text: 40 },
      { name: 'menu', items: 7, text: 500 }
    ]
  })
]
const sectionPage = (/** @type {string} */ p) => p.replace(/(.)\/+$/, '$1')
const withSections = (reads, path, edit) =>
  reads.map((r) => (r.path === path ? { ...r, sections: edit(r.sections.map((s) => ({ ...s }))) } : r))

test('structure-kept: the baseline holds each page’s marked sections in order', () => {
  const baseline = baselineOf(builtSections())
  assert.deepEqual(
    baseline.sections['/'].map((s) => s.name),
    ['slideshow', 'features-intro', 'features-intro', 'menu', 'subscribe']
  )
  assert.deepEqual(
    baseline.sections['/menu'].map((s) => s.items),
    [0, 7]
  )
  const kept = checkStructureKept(builtSections(), baseline)
  assert.equal(kept.pass, true)
  assert.equal(kept.id, 'structure-kept')
  assert.ok(CHECK_IDS.includes('structure-kept'))
})

test('structure-kept: a features-intro the agent rewrote away fails, naming the page and section', () => {
  const baseline = baselineOf(builtSections())
  const after = withSections(builtSections(), '/', (s) =>
    s.filter((x, i) => !(x.name === 'features-intro' && i === 2))
  )
  const check = checkStructureKept(after, baseline)
  assert.equal(check.pass, false)
  assert.equal(check.detail[0].page, '/')
  assert.deepEqual(check.detail[0].missing, ['features-intro'])
  assert.match(check.detail[0].fix, /revision at build time/)
  assert.match(check.detail[0].fix, /never restore the whole page/)
})

test('structure-kept: a subscribe section that is gone fails', () => {
  const baseline = baselineOf(builtSections())
  const after = withSections(builtSections(), '/', (s) => s.filter((x) => x.name !== 'subscribe'))
  const check = checkStructureKept(after, baseline)
  assert.equal(check.pass, false)
  assert.deepEqual(check.detail[0].missing, ['subscribe'])
})

test('structure-kept: a menu showing fewer dish items than at build fails', () => {
  const baseline = baselineOf(builtSections())
  const after = withSections(builtSections(), '/menu/', (s) =>
    s.map((x) => (x.name === 'menu' ? { ...x, items: 2 } : x))
  )
  const check = checkStructureKept(after, baseline)
  assert.equal(check.pass, false)
  assert.deepEqual(
    check.detail.map(({ page: p, section, items }) => ({ p, section, items })),
    [{ p: '/menu', section: 'menu', items: '2 of 7' }]
  )
})

test('structure-kept: shorter text passes with a note in the detail', () => {
  const baseline = baselineOf(builtSections())
  const after = withSections(builtSections(), '/', (s) =>
    s.map((x) => (x.name === 'menu' ? { ...x, text: 120 } : x))
  )
  const check = checkStructureKept(after, baseline)
  assert.equal(check.pass, true)
  assert.equal(check.detail.length, 1)
  assert.equal(check.detail[0].section, 'menu')
  assert.match(check.detail[0].note, /shorter text/)
})

// A run that never opened /menu said nothing about its sections and passed (review, 22/10/2026).
test('structure-kept: a page of the baseline this run did not read fails as unread', () => {
  const baseline = baselineOf(builtSections())
  const check = checkStructureKept(
    builtSections().filter((r) => r.path !== '/menu/'),
    baseline
  )
  assert.equal(check.pass, false)
  assert.deepEqual(
    check.detail.map(({ page: p, unread, missing }) => ({ p, unread, missing })),
    [{ p: '/menu', unread: true, missing: ['tabs', 'menu'] }]
  )
  const failed = checkStructureKept(
    builtSections().map((r) => (r.path === '/menu/' ? { ...r, error: 'timeout' } : r)),
    baseline
  )
  assert.equal(failed.pass, false, 'a page that did not open is not read either')
})

test('structure-kept: a run reads every page whose sections the baseline holds, nav or not', async () => {
  const asked = demoQaBody({
    label: 'phoba',
    platform: 'wordpress',
    baseline: { cssRules: {}, sections: baselineOf(builtSections()).sections }
  })
  const built = builtSections()
  const result = await runDemoQa({
    asked,
    base: 'http://127.0.0.1:5000/',
    read: async (url, path) => ({
      ...(built.find((r) => sectionPage(r.path) === sectionPage(path)) ?? page()),
      url,
      path
    })
  })
  assert.deepEqual(result.pages, ['/', '/menu'])
  assert.equal(result.checks.find((c) => c.id === 'structure-kept').pass, true)
})

test('structure-kept: a baseline with no marks passes and says why', () => {
  const unmarked = builtSections().map(({ sections: _s, ...r }) => r)
  const baseline = baselineOf(unmarked)
  assert.equal(baseline.sections, null)
  const check = checkStructureKept(builtSections(), baseline)
  assert.equal(check.pass, true)
  assert.match(check.detail[0].note, /no tracy-sec-\* section/)
  assert.equal(checkStructureKept(builtSections(), null).pass, true)
})

// 🔒 No filler stands in for a fact (plan §7, 26/10/2026): empty or an approved neutral word is no finding.
test('no-demo-words and facts-from-brief: an empty or neutral slot is no finding; a filler the brief does not hold is', () => {
  assert.deepEqual([...DEMO_NEUTRAL_WORDS], neutralWords('en'))
  assert.deepEqual([...DEMO_FILLERS], forbiddenFillers('en'))
  const stand = 'Menu item —'
  const salmon = 'Our grilled salmon with lemon herbs'
  const before = [
    page({ text: `${stand} ${salmon}`, blocks: [{ text: stand }, { text: salmon }, { text: '' }] })
  ]
  const words = checkNoDemoWords(before, {
    baseline: baselineOf(before),
    briefText: 'Pho Hanoi, noodle soup'
  })
  assert.equal(words.pass, false)
  assert.deepEqual(
    words.detail.map((d) => d.words),
    [salmon.toLowerCase()]
  )
  // A filler fails wherever it shows, typographic apostrophe and all, unless the research holds that wording.
  const filled = [page({ text: 'Chef’s selection · Coming soon', blocks: [] })]
  const fillers = checkNoDemoWords(filled, {
    baseline: baselineOf([page({ blocks: [] })]),
    briefText: 'Pho Hanoi'
  })
  assert.equal(fillers.pass, false)
  assert.deepEqual(
    fillers.detail.map((d) => d.filler),
    ['Chef’s selection', 'Coming soon']
  )
  const held = checkNoDemoWords(filled, {
    baseline: baselineOf([page({ blocks: [] })]),
    briefText: "Pho Hanoi. Coming soon: the terrace. Chef's selection of the week."
  })
  assert.equal(held.pass, true, JSON.stringify(held.detail))
  // The build sends every site language's fillers and neutral words.
  const [viFiller] = forbiddenFillers('vi')
  const [viNeutral] = neutralWords('vi')
  const vi = [page({ text: `${viNeutral} ${viFiller}`, blocks: [{ text: viNeutral }] })]
  const asked = demoQaBody({
    label: 'acme',
    platform: 'wordpress',
    fillers: forbiddenFillers(),
    neutralWords: neutralWords()
  })
  const viWords = checkNoDemoWords(vi, { ...asked, baseline: baselineOf(vi), briefText: 'Pho Hanoi' })
  assert.deepEqual(
    viWords.detail.map((d) => d.filler),
    [viFiller]
  )
  const facts = checkFactsFromBrief([page({ text: `${stand} · Service · Product` })], {
    briefText: 'Pho Hanoi'
  })
  assert.equal(facts.pass, true)
})

test('collected-used: the name, phone, email, street, an opening time, a review and own photos must all show', () => {
  const collected = collectedOf({
    name: 'Bếp Nhà Lu',
    phone: '+84 235 0000 777',
    email: 'hello@bepnhalu.vn',
    address: '12 Trần Phú, Hội An, Quảng Nam',
    hours: ['Monday: 10:00\u202fAM – 9:30\u202fPM'],
    reviews: [
      { text: 'The cao lầu here is the best we had in Hội An, and the staff remember you.', author: 'Mai' }
    ],
    pictures: 5
  })
  const photo = (n) => ({
    src: `/wp-content/uploads/tracy-content/p${n}.jpg`,
    sha256: null,
    width: 800,
    height: 600,
    broken: false,
    kind: 'img'
  })
  const full = [
    page({
      path: '/',
      text: 'BẾP NHÀ LU — Hội An home cooking.',
      images: [photo(1), photo(2)],
      ctas: [{ href: 'tel:+842350000777', text: 'Call' }]
    }),
    page({
      path: '/contact',
      text: 'Find us at 12 Tr\u1ea7n Ph\u00fa. Open 10am to 9.30pm. hello@bepnhalu.vn \u201cThe cao l\u1ea7u here is the best we had in H\u1ed9i An, and the staff remember you.\u201d \u2014 Mai',
      images: [photo(3)]
    })
  ]
  const ok = checkCollectedUsed(full, { collected })
  assert.equal(ok.pass, true, JSON.stringify(ok.detail))
  // three crops of one photo are one photo of the place (pilot 24/10/2026)
  const crops = {
    'wp-content/uploads/tracy-content/p1.jpg': 'asset-a',
    'wp-content/uploads/tracy-content/p2.jpg': 'asset-a',
    'wp-content/uploads/tracy-content/p3.jpg': 'asset-a'
  }
  // a logo placed in every frame is no photo of the place
  const logos = Object.fromEntries(Object.keys(crops).map((f) => [f, '$logo']))
  assert.deepEqual(
    checkCollectedUsed(full, { collected, placedSources: logos }).detail.map((d) => d.what),
    ['home-photo', 'photos']
  )
  // Local stand 24/10/2026: the business's logo in a header and a footer is its place; in a third frame of one page it
  // fills a strip meant for other organisations' marks.
  const logoPage = (n) =>
    page({
      path: '/',
      text: full[0].text,
      images: [photo(1), photo(2), ...Array.from({ length: n }, () => photo(9))],
      ctas: full[0].ctas
    })
  const logoFile = { 'wp-content/uploads/tracy-content/p9.jpg': '$logo' }
  assert.equal(
    checkCollectedUsed([logoPage(2), full[1]], { collected, placedSources: logoFile }).detail.some(
      (d) => d.what === 'logo'
    ),
    false
  )
  assert.deepEqual(
    checkCollectedUsed([logoPage(4), full[1]], { collected, placedSources: logoFile })
      .detail.filter((d) => d.what === 'logo')
      .map((d) => [d.code, d.value]),
    [['COLLECTED_MISPLACED', "the business's logo in 4 frames of /"]]
  )
  // Local round 35 (26/10/2026): where the template showed its own mark in four frames, the business's may fill them.
  assert.equal(
    checkCollectedUsed([logoPage(4), full[1]], {
      collected,
      placedSources: logoFile,
      baseline: { marks: { '/': 4 } }
    }).detail.some((d) => d.what === 'logo'),
    false
  )
  const one = checkCollectedUsed(full, { collected, placedSources: crops })
  assert.deepEqual(
    one.detail.map((d) => [d.what, d.value]),
    [['photos', "1 of the place's photos shown, at least 3 expected"]]
  )
  const bare = checkCollectedUsed([page({ path: '/', text: 'Welcome to our restaurant.', images: [] })], {
    collected
  })
  assert.equal(bare.pass, false)
  assert.deepEqual(
    bare.detail.map((d) => d.what),
    ['name', 'phone', 'email', 'address', 'hours', 'reviews', 'home-photo', 'photos']
  )
})

test('collected-used: photos count by what the build placed; a waived review is reported, not failed', () => {
  const collected = collectedOf({
    reviews: [{ text: 'Lovely place, great noodles and friendly people.', author: 'Ann' }],
    reviewsWaived: 'The template has no testimonial anywhere.',
    pictures: 1
  })
  const reads = [
    page({ path: '/', text: 'Hi', images: [{ src: 'https://x.test/media/a1b2.webp', broken: false }] })
  ]
  const r = checkCollectedUsed(reads, { collected, placed: ['media/a1b2.webp'] })
  assert.equal(r.pass, true, JSON.stringify(r.detail))
  assert.deepEqual(r.waived, { reviews: 'The template has no testimonial anywhere.' })
  assert.equal(checkCollectedUsed(reads, { collected, placed: [] }).pass, false)
})

// Local round 30, 25/10/2026 (q. patisserie): the research wrote "2821 Maple St.", the page "2821 Maple Street".
test('collected-used: a street kind spelt long or short is the same street; another street still fails', () => {
  const read = (text) => [page({ path: '/about', text })]
  const profile = collectedOf({ name: 'q. patisserie', address: '2821 Maple St., San Francisco' })
  assert.equal(
    checkCollectedUsed(read('q. patisserie, at 2821 Maple Street.'), { collected: profile }).pass,
    true
  )
  const heard = collectedOf({ name: 'q. patisserie', sourced: 'We are at 2821 Maple St. @ Divisadero.' })
  assert.equal(
    checkCollectedUsed(read('q. patisserie, at 2821 Maple Street.'), { collected: heard }).pass,
    true
  )
  const other = checkCollectedUsed(read('q. patisserie, 2821 Maple St. Visit 44 Mission Street today.'), {
    collected: profile
  })
  assert.deepEqual(
    other.detail.filter((d) => d.code === 'COLLECTED_UNSOURCED').map((d) => d.value),
    ['44 Mission Street']
  )
})

// The rule (24/10/2026): a contact detail a visitor would use comes from the research; since plan §7 (26/10/2026)
// no plan row makes one a sample.
test('collected-used: an email, phone or street address the research never collected fails, a sample row or not', () => {
  const collected = collectedOf({
    name: 'Bếp Nhà Lu',
    phone: '+84 235 0000 777',
    address: '12 Trần Phú, Hội An'
  })
  const site = (text, ctas = []) => [
    page({ path: '/', text: `Bếp Nhà Lu. Call +84 235 0000 777. Find us at 12 Trần Phú. ${text}`, ctas })
  ]
  const unsourced = (r) =>
    r.detail.filter((d) => d.code === 'COLLECTED_UNSOURCED').map((d) => [d.what, d.value])
  assert.equal(checkCollectedUsed(site(''), { collected }).pass, true)
  const email = checkCollectedUsed(site('Write to info@restora-demo.com'), { collected })
  assert.equal(email.pass, false)
  assert.deepEqual(unsourced(email), [['email', 'info@restora-demo.com']])
  const mailto = checkCollectedUsed(site('', [{ href: 'mailto:hello@template.test', text: 'Mail' }]), {
    collected
  })
  assert.deepEqual(unsourced(mailto), [['email', 'hello@template.test']])
  const phone = checkCollectedUsed(site('Reservations +1 555 123 4567'), { collected })
  assert.deepEqual(unsourced(phone), [['phone', '+1 555 123 4567']])
  const street = checkCollectedUsed(site('Visit 245 Main Street, Springfield'), { collected })
  assert.deepEqual(unsourced(street), [['address', '245 Main Street']])
  assert.equal(
    checkCollectedUsed(site('', [{ href: 'tel:+842350000777', text: 'Call' }]), { collected }).pass,
    true,
    'the collected phone as a link is the research'
  )

  // A `samples` list an older build still sends exempts nothing.
  const none = collectedOf({
    name: 'Bếp Nhà Lu',
    samples: [{ page: '/contact/', about: 'Contact section: sample email for the owner' }]
  })
  assert.equal(none.samples, undefined)
  const contact = [page({ path: '/contact', text: 'Bếp Nhà Lu. Write to hello@bepnhalu.example' })]
  const marked = checkCollectedUsed(contact, { collected: none })
  assert.equal(marked.pass, false)
  assert.deepEqual(unsourced(marked), [['email', 'hello@bepnhalu.example']])
  assert.equal(marked.sample, undefined)
  // The research has an email: another one beside or instead of it is still wrong.
  const both = collectedOf({ ...none, email: 'real@bepnhalu.vn' })
  const wrong = checkCollectedUsed(
    [page({ path: '/contact', text: 'B\u1ebfp Nh\u00e0 Lu. real@bepnhalu.vn or hello@bepnhalu.example' })],
    { collected: both }
  )
  assert.deepEqual(unsourced(wrong), [['email', 'hello@bepnhalu.example']])
})

test('collected-used: a run that names nothing collected passes, so other workflows are not judged by it', () => {
  assert.equal(collectedOf(undefined), null)
  assert.equal(checkCollectedUsed([page()], {}).pass, true)
  assert.equal(demoQaBody({ label: 'acme', platform: 'joomla' }).collected, null)
})

test('no-demo-words: filler the agent wrote ("Ask at the counter", "Sample", a made-up dish) fails and is swept, "Market price" with it', async () => {
  const { residueOf } = await import('../src/demo-qa.js')
  const units = [
    { kind: 'dish', field: 'price', text: 'Ask at the counter', selector: 'span.dish-price' },
    { kind: 'dish', field: 'name', text: 'Chef’s selection', selector: 'h4.dish-name' },
    { kind: 'dish', field: 'price', text: 'Sample', selector: 'span.dish-price' },
    { kind: 'dish', field: 'name', text: 'Smørrebrød', selector: 'h4.dish-name' },
    { kind: 'dish', field: 'price', text: 'Market price', selector: 'span.dish-price' }
  ]
  const before = [page({ blocks: [], residue: { units: [], links: [] } })]
  const baseline = { ...baselineOf(before), ledger: { units: [], links: [] } }
  const reads = [page({ blocks: [], residue: { units, links: [] } })]
  const asked = { baseline, briefText: 'The Living Room, Sm\u00f8rrebr\u00f8d' }
  const residue = residueOf(reads, asked)
  assert.deepEqual(
    residue.items.map((i) => [i.field, i.text]),
    [
      ['dish-price', 'Ask at the counter'],
      ['dish-name', 'Chef’s selection'],
      ['dish-price', 'Sample'],
      ['dish-price', 'Market price']
    ]
  )
  assert.ok(residue.items.every((i) => i.filler === true))
  const check = checkNoDemoWords(reads, { ...asked, residue })
  assert.equal(check.pass, false)
  assert.equal(check.sweepable, true)
  assert.deepEqual(
    check.detail.map((d) => d.words),
    ['ask at the counter', 'chef’s selection', 'sample', 'market price']
  )
})

test('no-demo-words: a made-up dish name with "Market price" run into it is filler as a whole line, swept whole; "Ask us a question" is not filler', async () => {
  const { residueOf, isFiller } = await import('../src/demo-qa.js')
  assert.equal(isFiller('Ask us a question'), false)
  assert.equal(isFiller('Chef’s selection Market price'), true)
  const units = [
    {
      kind: 'text',
      text: 'Chef’s selection Market price',
      block: 'Chef’s selection Market price',
      selector: 'h4.dish-name'
    },
    { kind: 'text', text: 'Chef’s selection', block: 'Chef’s selection', selector: 'h4.dish-name' },
    { kind: 'text', text: 'Ask us a question', block: 'Ask us a question', selector: 'h3' }
  ]
  const before = [page({ blocks: [], residue: { units: [], links: [] } })]
  const baseline = { ...baselineOf(before), ledger: { units: [], links: [] } }
  const reads = [page({ blocks: [], residue: { units, links: [] } })]
  const residue = residueOf(reads, { baseline, briefText: 'The Living Room' })
  assert.deepEqual(
    residue.items.map((i) => [i.field, i.text, i.filler]),
    [
      ['text', 'Chef’s selection Market price', true],
      ['text', 'Chef’s selection', true]
    ]
  )
})

test('no-demo-pictures: a theme decor badge (decor_*.png) is named unresolved with its reason: words drawn in the picture, which no replace reaches', () => {
  const badge = {
    src: '/wp-content/themes/t/assets/img/decor/decor_orange.png',
    width: 180,
    height: 180,
    kind: 'background'
  }
  const reads = [page({ path: '/', images: [badge] })]
  const check = checkNoDemoPictures(reads, { baseline: baselineOf(reads, []) })
  assert.equal(check.pass, true)
  assert.match(check.unresolved[0].why, /decor_orange\.png passes as the theme's design/)
  assert.match(check.unresolved[0].why, /words drawn in it/)
  assert.match(check.unresolved[0].why, /no new picture is drawn/)
})

test('runDemoQa reads every inventory route for the content checks, past the pages every check reads', async () => {
  // The Living Room build 8c (25/10/2026): QA read eight pages, so a post's template words on any other route were
  // never residue and never swept. The routes are read after the pages, in the same browser, within their own budget.
  const LOREM = 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod'
  const opened = []
  const read = async (url, path) => {
    opened.push(path)
    return page({ path, url, blocks: path === '/post-a/' ? [{ text: LOREM, selector: 'p' }] : [] })
  }
  const routes = ['/', '/post-a/', '/post-b/', '/post-c/']
  const asked = demoQaBody({ label: 'acme', platform: 'wordpress', routes, routeBudgetMs: 60_000 })
  assert.deepEqual(asked.routes, routes)
  const base = 'http://127.0.0.1:5000/'
  const template = await runDemoQa({ asked, base, read })
  assert.deepEqual(template.pages, ['/'])
  assert.deepEqual(template.routes, ['/post-a/', '/post-b/', '/post-c/'])
  assert.ok(template.baseline.texts.length > 0, 'the routes are in the baseline')
  const built = await runDemoQa({ asked: { ...asked, baseline: template.baseline }, base, read })
  const words = built.checks.find((c) => c.id === 'no-demo-words')
  assert.equal(words.pass, false)
  assert.equal(words.detail[0].page, '/post-a/')
  // A check that judges the page itself (its load, its look) reads only the pages.
  assert.equal(built.checks.find((c) => c.id === 'pages-load').measured.includes('4'), false)
  // Past the route budget, the routes left are named, never counted as clean.
  let clock = 0
  const slow = await runDemoQa({
    asked: { ...asked, routeBudgetMs: 1000 },
    base,
    now: () => clock,
    read: async (url, path) => {
      clock += 5000
      return page({ path, url })
    }
  })
  assert.deepEqual(slow.routes, ['/post-a/'])
  assert.deepEqual(slow.routesUnread, ['/post-b/', '/post-c/'])
})

// Local round 18, 25/10/2026: q. patisserie's street and email were on the home page the research read, its profile's
// address and email fields empty, and the build failed collected-used on every page showing them.
test('collected-used: a contact detail in the research’s own words is collected; one it never read still fails', () => {
  const collected = collectedOf({
    name: 'q. patisserie',
    phone: '415.555.0170',
    sourced:
      'Our Hours Wed to Fri 8-4 2821 Maple St. @ Larkspur St. San Francisco, CA 94115 contact@qpatisserie.example 415.555.0170 visit our sister restaurant @ 2794 Maple St'
  })
  const site = (text) => [page({ path: '/', text: `q. patisserie. Call 415.555.0170. ${text}`, ctas: [] })]
  const unsourced = (r) =>
    r.detail.filter((d) => d.code === 'COLLECTED_UNSOURCED').map((d) => [d.what, d.value])
  const kept = checkCollectedUsed(
    site('Find us at 2821 Maple St. Our sister: 2794 Maple St. Write to contact@qpatisserie.example'),
    { collected }
  )
  assert.deepEqual(unsourced(kept), [])
  assert.deepEqual(
    unsourced(
      checkCollectedUsed(site('Visit 245 Main Street or write to hello@patisserie.example'), { collected })
    ),
    [
      ['email', 'hello@patisserie.example'],
      ['address', '245 Main Street']
    ]
  )
})

// Local round 20, 25/10/2026 (q. patisserie, EmDash): a step number after a sentence, a postal code before a street
// number and a year on the line above a street were read as a phone and a street the research never collected.
test('facts: a sentence ends a phone, a postal code after its region is no part of one, and a street line is one line', () => {
  const phones = (text) =>
    factsIn(text)
      .filter((f) => f.kind === 'phone')
      .map((f) => f.shown)
  const digitsOf = (list) => list.join('|').replace(/[^\d|]/g, '')
  assert.deepEqual(phones('by phone at 415.555.0170. 04 Pick up'), ['415.555.0170'])
  assert.deepEqual(phones('San Francisco, CA 94115 2794 Maple St. our sister restaurant'), [])
  assert.equal(digitsOf(phones('Call (415) 555-0170 today')), '4155550170')
  const collected = collectedOf({
    name: 'q. patisserie',
    phone: '415.555.0170',
    sourced: '2821 Maple St. @ Larkspur St. San Francisco, CA 94115 415.555.0170'
  })
  const r = checkCollectedUsed(
    [
      page({
        path: '/about',
        text: 'q. patisserie, 2821 Maple St. Call 415.555.0170. 04 Pick up\nSan Francisco, CA 94115 2794 Maple St.\n2012\nThe Maple Street shop opens'
      })
    ],
    { collected }
  )
  assert.deepEqual(
    r.detail.filter((d) => d.code === 'COLLECTED_UNSOURCED').map((d) => [d.what, d.value]),
    [['address', '2794 Maple St.']],
    'only the street the research never read'
  )
})

// Local round 20, 25/10/2026 (Levain, WordPress): a PNG sketch set as a section's background through an <img> was
// flagged as a template picture, and the build put a photo behind words it then could not show readably.
test('no-demo-pictures: a drawn background set through an <img> is the template’s decoration; a photo background is not', () => {
  const baseline = {
    pictures: {
      files: ['wp-content/uploads/2026/10/background.png', 'wp-content/uploads/2026/10/acymailing.jpg'],
      shas: []
    }
  }
  const reads = [
    page({
      path: '/',
      images: [
        {
          src: 'https://x.test/wp-content/uploads/2026/10/background.png',
          kind: 'background',
          width: 500,
          height: 399,
          broken: false
        },
        {
          src: 'https://x.test/wp-content/uploads/2026/10/acymailing.jpg',
          kind: 'background',
          width: 1440,
          height: 777,
          broken: false
        }
      ]
    })
  ]
  const r = checkNoDemoPictures(reads, { baseline })
  assert.deepEqual(
    r.detail.map((d) => d.file),
    ['wp-content/uploads/2026/10/acymailing.jpg']
  )
})

// Local round 22, 25/10/2026 (q. patisserie, EmDash): the template's "Selected projects" heading stayed through every
// check, two words under the four a passage needs.
test('no-demo-words: a short template heading with a word that is neither the brief’s nor the site’s furniture is copy left', () => {
  const baseline = { texts: ['Selected projects', 'Opening Hours', 'Kouign amann'].map(textKey), labels: [] }
  const reads = [
    page({
      path: '/',
      blocks: [
        { text: 'Selected projects', selector: 'h2', short: true },
        { text: 'Opening Hours', selector: 'h3', short: true },
        { text: 'Kouign amann', selector: 'h3', short: true }
      ]
    })
  ]
  const r = checkNoDemoWords(reads, { baseline, briefText: 'q. patisserie bakes kouign amann every morning' })
  assert.deepEqual(
    r.detail.map((d) => d.words),
    ['selected projects']
  )
  // Local round 31 (Levain): a short line is judged by each word, never by sharing one with the research — "Bar &
  // Restaurant" stays the template's although a research page names restaurants and a restaurant; "Our Bakery" and a
  // timetable's "Mon - Fri" are the brief's and the site's furniture.
  const accent = checkNoDemoWords(
    [
      page({
        path: '/',
        blocks: ['Bar & Restaurant', 'Our Bakery', 'Mon - Fri', 'Est. 1982'].map((text) => ({
          text,
          selector: 'p.hero-heading-accent',
          short: true
        }))
      })
    ],
    {
      baseline: {
        texts: ['Bar & Restaurant', 'Our Bakery', 'Mon - Fri', 'Est. 1982'].map(textKey),
        labels: []
      },
      briefText:
        'levain bakery baked bread for restaurants; the restaurant next door buys our cookies. open daily'
    }
  )
  assert.deepEqual(
    accent.detail.map((d) => d.words),
    ['bar & restaurant', 'est. 1982']
  )
})

// 🔒 Product owner, 26/10/2026: a rewritten template post takes a slug from its new title, so QA opens each template
// post where it answers now, and names one it cannot open there.
test('runDemoQa: a renamed template post is read at its current route; a 404 there or no route found is named in pages-load', async () => {
  const opened = []
  const routes = {
    '/': { navLinks: [] },
    '/blog/sample-post/': { status: 404 },
    '/reservations/': { text: 'Reservations. Groups of eight or more book ahead.' },
    '/hours/': { status: 404 }
  }
  const read = async (url, path) => {
    opened.push(path)
    return page({ path, url, finalUrl: url, ...routes[path] })
  }
  const asked = demoQaBody({
    label: 'acme',
    platform: 'wordpress',
    discover: true,
    routes: ['/reservations/', '/hours/', '/about/'],
    routeBudgetMs: 60_000,
    postRoutes: [
      {
        was: '/burger-king-takes-a-stand/',
        route: '/reservations/',
        post: { kind: 'post', id: 58 },
        title: 'Burger King takes a stand',
        tried: ['live inventory']
      },
      {
        was: '/sample-hours/',
        route: '/hours/',
        post: { kind: 'post', id: 59 },
        title: 'Sample hours',
        tried: ['live inventory']
      },
      {
        was: '/gone-post/',
        route: null,
        post: { kind: 'post', id: 60 },
        title: 'Gone post',
        tried: ['live inventory', 'slug in /gone-post/']
      }
    ],
    baseline: { cssRules: {}, ledger: { post: '/burger-king-takes-a-stand/' } }
  })
  assert.equal(asked.postRoutes.length, 3)
  const result = await runDemoQa({ asked, base: 'http://127.0.0.1:5000/', read })
  // The baseline's post is opened where it answers now, never at its frozen route.
  assert.ok(opened.includes('/reservations/'))
  assert.ok(!opened.includes('/burger-king-takes-a-stand/'))
  const loaded = result.checks.find((c) => c.id === 'pages-load')
  assert.equal(loaded.pass, false)
  assert.deepEqual(loaded.detail, [
    {
      page: '/hours/',
      was: '/sample-hours/',
      post: { kind: 'post', id: 59 },
      title: 'Sample hours',
      problem: 'the template post answered 404 at its current route',
      tried: ['live inventory', 'read /hours/']
    },
    {
      page: '/gone-post/',
      was: '/gone-post/',
      post: { kind: 'post', id: 60 },
      title: 'Gone post',
      problem: "the template post's current route was not found on the site",
      tried: ['live inventory', 'slug in /gone-post/']
    }
  ])
  assert.match(loaded.measured, /2 template posts not open at their current route/)
  // A route that is no post keeps the old rule: a 404 is visited, not judged.
  const plain = await runDemoQa({
    asked: demoQaBody({
      label: 'acme',
      platform: 'wordpress',
      discover: true,
      routes: ['/hours/'],
      routeBudgetMs: 60_000
    }),
    base: 'http://127.0.0.1:5000/',
    read
  })
  assert.equal(plain.checks.find((c) => c.id === 'pages-load').pass, true)
})

test('pages-load: a template post route read as a page and failing names the post, its old route and what was tried', async () => {
  const read = async (url, path) =>
    page({ path, url, finalUrl: url, ...(path === '/new/' ? { status: 404 } : {}) })
  const asked = demoQaBody({
    label: 'acme',
    platform: 'wordpress',
    pages: ['/', '/new/'],
    postRoutes: [
      {
        was: '/old/',
        route: '/new/',
        post: { kind: 'post', id: 58 },
        title: 'Old',
        tried: ['live inventory']
      }
    ]
  })
  const result = await runDemoQa({ asked, base: 'http://127.0.0.1:5000/', read })
  const loaded = result.checks.find((c) => c.id === 'pages-load')
  assert.deepEqual(loaded.detail, [
    {
      page: '/new/',
      problem: 'answered 404',
      was: '/old/',
      post: { kind: 'post', id: 58 },
      title: 'Old',
      tried: ['live inventory', 'read /new/']
    }
  ])
})

test('pages-load: a template post route read as a route that fails another way or lands home is named, never skipped', async () => {
  const routes = {
    '/err/': { status: 500 },
    '/home-again/': { finalUrl: 'http://127.0.0.1:5000/' },
    '/fine/': {}
  }
  const read = async (url, path) => page({ path, url, finalUrl: url, ...routes[path] })
  const post = (was, route, id) => ({
    was,
    route,
    post: { kind: 'post', id },
    title: `Post ${id}`,
    tried: []
  })
  const asked = demoQaBody({
    label: 'acme',
    platform: 'wordpress',
    routes: ['/err/', '/home-again/', '/fine/'],
    routeBudgetMs: 60_000,
    postRoutes: [post('/a/', '/err/', 1), post('/b/', '/home-again/', 2), post('/c/', '/fine/', 3)]
  })
  const result = await runDemoQa({ asked, base: 'http://127.0.0.1:5000/', read })
  const loaded = result.checks.find((c) => c.id === 'pages-load')
  assert.deepEqual(
    loaded.detail.map((d) => [d.page, d.was, d.problem]),
    [
      ['/err/', '/a/', 'the template post answered 500 at its current route'],
      ['/home-again/', '/b/', 'the template post redirected home from its current route']
    ]
  )
})
// #1780 items 15 and 16 (Akemi 26/10/2026, ADR 0023 and 0037 amended): the logo's one accent and a WhatsApp button.
test('look-kept: the brand accent Tracy gave is allowed on its accent tokens, at its values only', () => {
  const template = {
    path: 'templates/tracy/css/template.css',
    rules: 300,
    sentinel: null,
    sentinelFound: null,
    text: '.btn{background:var(--ds-c-accent,#f44141);color:var(--ds-c-accent-on,#fff)}'
  }
  const custom = (text) => ({
    path: 'templates/tracy/css/custom.css',
    rules: 1,
    sentinel: null,
    sentinelFound: null,
    text
  })
  const baseline = baselineOf([page({ sheets: [template, custom('.x{margin:0}')], styles: [], inline: [] })])
  const accentTokens = { '--ds-c-accent': '#052514', '--ds-c-accent-on': '#ffffff' }
  const given = [
    page({
      sheets: [template, custom(':root{--ds-c-accent:#052514;--ds-c-accent-on:#FFF}')],
      styles: [],
      inline: []
    })
  ]
  assert.equal(
    checkLookKept(given, baseline).pass,
    false,
    'without the brief, still a slot token set by hand'
  )
  assert.equal(checkLookKept(given, baseline, { accentTokens }).pass, true)
  // Another value, or another slot token, is still a restyle.
  const other = [
    page({
      sheets: [template, custom(':root{--ds-c-accent:#ff00ff;--ds-c-bg:#000}')],
      styles: [],
      inline: []
    })
  ]
  assert.deepEqual(
    checkLookKept(other, baseline, { accentTokens }).detail.map((d) => d.token),
    ['--ds-c-accent', '--ds-c-bg']
  )
})

test('cta-real: the WhatsApp button the brief gives may leave the demo, no other wa.me link', () => {
  const ctas = [{ href: 'https://wa.me/971500001234', text: 'WhatsApp', button: true }]
  assert.equal(checkCtaReal([page({ ctas })]).pass, false)
  assert.equal(checkCtaReal([page({ ctas })], { whatsappLinks: ['https://wa.me/971500001234'] }).pass, true)
  const stranger = [{ href: 'https://wa.me/441234567890', text: 'WhatsApp', button: true }]
  assert.equal(
    checkCtaReal([page({ ctas: stranger })], { whatsappLinks: ['https://wa.me/971500001234'] }).pass,
    false
  )
})

test('demoQaBody keeps the accent tokens and WhatsApp links it is sent, only those shapes', () => {
  const asked = demoQaBody({
    label: 'acme',
    platform: 'joomla',
    accentTokens: { '--ds-c-accent': '#052514', '--ds-c-bg': '#000000', '--ds-c-accent-on': 'red;x' },
    whatsappLinks: ['https://wa.me/971500001234', 'https://evil.test/x']
  })
  assert.deepEqual(asked.accentTokens, { '--ds-c-accent': '#052514' })
  assert.deepEqual(asked.whatsappLinks, ['https://wa.me/971500001234'])
  assert.deepEqual(demoQaBody({ label: 'acme', platform: 'joomla' }).accentTokens, {})
})

test('cta-real: ordinary navigation cannot lead to a read-confirmed empty main', () => {
  const source = page({
    ctas: [{ href: '/contact/', text: 'Visit us', booking: false, button: false, nav: true }]
  })
  const empty = page({ path: '/contact/', mainContent: { state: 'empty', selector: 'main' } })
  const populated = page({
    path: '/contact/contact-us/',
    mainContent: { state: 'present', selector: 'main' }
  })
  const bad = checkCtaReal([source, empty, populated])
  assert.equal(bad.pass, false)
  assert.match(bad.detail[0].problem, /no main content/)
  assert.equal(bad.detail[0].target, '/contact/')
  assert.equal(
    checkCtaReal([
      { ...source, ctas: [{ ...source.ctas[0], href: '/contact/contact-us/' }] },
      empty,
      populated
    ]).pass,
    true
  )
})

test('cta-real: unread, unknown, failed and query-distinct navigation destinations are not judged empty', () => {
  const source = page({
    ctas: [{ href: '/contact/', text: 'Visit us', booking: false, button: false, nav: true }]
  })
  for (const destination of [
    [],
    [page({ path: '/contact', mainContent: { state: 'empty', selector: 'main' } })],
    [page({ path: '/contact/', mainContent: { state: 'unknown', selector: null } })],
    [page({ path: '/contact/', status: 500, mainContent: { state: 'empty', selector: 'main' } })],
    [page({ path: '/contact/?q=search', mainContent: { state: 'empty', selector: 'main' } })]
  ]) {
    const answer = checkCtaReal([source, ...destination])
    assert.equal(answer.pass, true)
    assert.deepEqual(answer.navigationTargets, { checked: 0, unknown: 1 })
  }
})

test('cta-real: a redirect to populated main and a submenu toggle are valid navigation', () => {
  const source = page({
    ctas: [
      { href: '/contact/', text: 'Visit us', booking: false, button: false, nav: true },
      { href: '#', text: 'More', booking: false, button: false, nav: true, opens: true }
    ]
  })
  const destination = page({
    path: '/contact/',
    finalUrl: 'http://127.0.0.1:5000/contact/contact-us/',
    mainContent: { state: 'present', selector: 'main' }
  })
  const answer = checkCtaReal([source, destination])
  assert.equal(answer.pass, true)
  assert.deepEqual(answer.navigationTargets, { checked: 1, unknown: 0 })
})

test('cta-real: footer fragments and redirected aliases retain destination identity without trusting an off-site read', () => {
  const link = {
    href: '/contact/#enquiries',
    text: 'Bakery',
    booking: false,
    button: false,
    navigation: true
  }
  const source = page({ ctas: [link] })
  const alias = page({
    path: '/alias',
    finalUrl: 'http://127.0.0.1:5000/contact/',
    mainContent: { state: 'empty', selector: 'main' }
  })
  assert.equal(checkCtaReal([source, alias]).pass, false)
  const foreign = { ...alias, path: '/contact/', finalUrl: 'https://elsewhere.test/contact/' }
  const unknown = checkCtaReal([source, foreign])
  assert.equal(unknown.pass, true)
  assert.deepEqual(unknown.navigationTargets, { checked: 0, unknown: 1 })
  assert.equal(
    checkCtaReal([
      page({ path: '/contact/', ctas: [link], mainContent: { state: 'present', selector: 'main' } })
    ]).pass,
    true
  )
  const booking = { ...link, href: '/about/', text: 'Book a table', booking: true }
  assert.equal(checkCtaReal([page({ ctas: [booking] })]).pass, false)
})

test('demoQaBody keeps the link tokens of the brand accent, where the build gave them, and the gate allows them', () => {
  const sent = {
    '--ds-c-accent': '#9c2a1e',
    '--ds-c-accent-hover': '#89251a',
    '--ds-c-accent-active': '#7a2118',
    '--ds-c-accent-on': '#ffffff',
    '--ds-c-accent-text': '#9c2a1e',
    '--ds-c-accent-text-hover': '#89251a'
  }
  const asked = demoQaBody({ label: 'acme', platform: 'joomla', accentTokens: sent })
  assert.deepEqual(asked.accentTokens, sent)
  const template = {
    path: 'templates/tracy/css/template.css',
    rules: 1,
    sentinel: null,
    sentinelFound: null,
    text: ''
  }
  const custom = (text) => ({
    path: 'templates/tracy/css/custom.css',
    rules: 1,
    sentinel: null,
    sentinelFound: null,
    text
  })
  const baseline = baselineOf([page({ sheets: [template, custom('.x{margin:0}')], styles: [], inline: [] })])
  const rule = `:root{${Object.entries(sent)
    .map(([t, v]) => `${t}:${v}`)
    .join(';')}}`
  assert.equal(
    checkLookKept([page({ sheets: [template, custom(rule)], styles: [], inline: [] })], baseline, asked).pass,
    true
  )
})
