// The SEO stage of a brief build (spec TracyHQ/tracy#189, criteria 8.1 to 8.5, R12 group G): the Joomla writer is the last
// word on every page's head, and the final checks judge every served page. Real JA Boxing 1.0.8 content map; every
// business is made up.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildBlockers } from 'website-opportunities/domain/build-blockers.mjs'
import { ruleOfFinding } from 'website-opportunities/domain/build-rules.mjs'
import { mainHeadingProblems } from 'website-opportunities/domain/main-headings.mjs'
import { recordSeoPlanOf } from 'website-opportunities/domain/record-seo.mjs'
import { openGraphFile } from '../src/sites/brief-engines/joomla-open-graph.js'
import { altSteps, pictureAltsOf } from '../src/sites/brief-engines/joomla-picture-alt.js'
import {
  recordSeoSteps,
  SCHEMA_NOTE,
  seoMenuSteps,
  writeJoomlaSeo
} from '../src/sites/brief-engines/joomla-seo-stage.js'
import {
  checkBusinessSchema,
  checkPageHeads,
  checkPictureAlt,
  checkSitemap
} from '../src/opportunities-build/site-head-check.js'

const boxing = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL(
        '../../../packages/cms/tracy-joomla-quickstart/contracts/ja-boxing/j6/1.0.8/content-map.json',
        import.meta.url
      )
    ),
    'utf8'
  )
)
const lock = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL(
        '../../../packages/cms/tracy-joomla-quickstart/contracts/ja-boxing/j6/1.0.8/presentation-lock.json',
        import.meta.url
      )
    ),
    'utf8'
  )
)
/** The release's own menu rows, as the site holds them after restore. */
const menuRows = () =>
  Object.entries(lock.entities)
    .filter(([key]) => key.startsWith('menuItem-'))
    .map(([key, row]) => ({ id: Number(key.slice('menuItem-'.length)), ...row }))

const NAME = 'Brightsmile Dental Studio'
const plans = [
  {
    id: 'home',
    path: '/',
    role: 'home',
    title: `Dental care in Port Marlow | ${NAME}`,
    description: `${NAME}, based in Eastbrook, Port Marlow. Teeth whitening, implants and braces for the whole family.`
  },
  {
    id: 'about-us/contact',
    path: '/about-us/contact',
    role: 'contact',
    title: `Contact | ${NAME}`,
    description: `Contact ${NAME} in Port Marlow: call +44 20 7946 0123.`
  }
]

test('the planned title and description go back onto an entry a later whole-params write emptied', () => {
  const rows = menuRows()
  const contact = rows.find((r) => r.path === 'about-us/contact')
  assert.ok(contact, 'JA Boxing 1.0.8 ships its Contact page at about-us/contact')
  // As measured: the contact record's settings were written onto the entry from params read before the title was set.
  contact.params = JSON.stringify({ ...JSON.parse(contact.params), page_title: '', show_email_form: '0' })
  const steps = seoMenuSteps({ rows, plans })
  const step = steps.find((s) => s.id === Number(contact.id))
  assert.ok(step, 'the Contact entry is written')
  const params = JSON.parse(step.fields.params)
  assert.equal(params.page_title, `Contact | ${NAME}`)
  assert.equal(params['menu-meta_description'], plans[1].description)
  assert.equal(params.og_title, `Contact | ${NAME}`)
  // Every other setting of the entry is kept as read.
  assert.equal(params.show_email_form, '0')
  // An entry that already says its plan is not written again.
  const written = rows.map((r) => {
    const s = steps.find((x) => x.id === Number(r.id))
    return s ? { ...r, params: s.fields.params } : r
  })
  assert.deepEqual(seoMenuSteps({ rows: written, plans }), [])
})

test("each record page's article takes its own title and a description cut from its written copy", () => {
  const records = recordSeoPlanOf(
    boxing,
    {
      records: ['article-2', 'article-14'].map((entity, i) => ({
        kind: 'service',
        group: `${entity}.offering`,
        decision: 'keep',
        assigned: { id: `s${i}`, label: ['Sourdough Classes', 'Cake Decorating'][i] }
      }))
    },
    { name: 'Copperleaf Bakery', city: 'Port Marlow' }
  )
  const articles = ['article-2', 'article-14'].map((key) => {
    const e = boxing.entities.find((x) => x.key === key)
    return { id: e.sourceId, alias: e.identity.alias, metadesc: '', attribs: '{"show_title":"0"}' }
  })
  const summary = boxing.slots.find((s) => s.entity === 'article-2' && s.role === 'offering.summary')
  const steps = recordSeoSteps({
    records,
    contentMap: boxing,
    articles,
    written: {
      [summary.key]: 'Bake a crusty sourdough loaf from your own starter in one small morning class.'
    }
  })
  assert.equal(steps.length, 2)
  const first = steps.find((s) => s.id === articles[0].id)
  assert.equal(JSON.parse(first.fields.attribs).article_page_title, 'Sourdough Classes | Copperleaf Bakery')
  assert.equal(JSON.parse(first.fields.attribs).show_title, '0')
  assert.equal(
    first.fields.metadesc,
    'Bake a crusty sourdough loaf from your own starter in one small morning class.'
  )
  // No copy written for the second: a sentence of facts, never the demo's.
  assert.equal(steps[1].fields.metadesc, 'Cake Decorating at Copperleaf Bakery in Port Marlow.')
})

test('the stage writes the menu, the record pages and one business record module on every page', async () => {
  const calls = []
  const apply = async (call) => {
    calls.push(call)
    if (call.action === 'content.list') {
      const kind = call.params.kind
      if (call.params.offset > 0) return { ok: true, items: [] }
      if (kind === 'menuItem') return { ok: true, items: menuRows() }
      if (kind === 'module')
        return {
          ok: true,
          items: [{ id: 90, module: 'mod_custom', published: 1, position: 'footer', note: '' }]
        }
      return { ok: true, items: [] }
    }
    if (call.action === 'content.get') return { ok: true, item: { menuids: '[0]' } }
    return { ok: true, id: 501 }
  }
  const sitePlan = {
    seo: {
      pages: plans,
      records: [],
      schema: {
        '@context': 'https://schema.org',
        '@type': 'Dentist',
        name: NAME,
        telephone: '+44 20 7946 0123'
      }
    }
  }
  const out = await writeJoomlaSeo({ apply, siteKey: 's', sitePlan, contentMap: boxing, note: () => {} })
  assert.ok(out.menu >= 2, JSON.stringify(out))
  assert.equal(out.schema, 1)
  const made = calls.find((c) => c.action === 'content.update' && c.params.fields?.note === SCHEMA_NOTE)
  assert.match(made.params.fields.content, /^<script type="application\/ld\+json">\{.*"@type":"Dentist"/)
  assert.ok(calls.some((c) => c.params?.kind === 'moduleAssignment' && c.params.fields?.menuids === '[0]'))
})

/** A served page, as a brief build of the pilot shape left it. */
const page = (path, head, body) => ({
  path,
  status: 200,
  html: `<!doctype html><html lang="en-gb"><head>${head}</head><body>${body}</body></html>`
})
const goodHead = (title, description, path) =>
  `<title>${title}</title><meta name="description" content="${description}">` +
  `<meta property="og:title" content="${title}"><meta property="og:description" content="${description}">` +
  `<meta property="og:image" content="https://site.example/images/hero.jpg"><meta property="og:url" content="https://site.example${path}">`
const LONG =
  'Copperleaf Bakery in Port Marlow bakes sourdough, rye and seeded loaves every morning, with cakes to order and a small cafe for breakfast and lunch.'

test('the final checks name a missing or template title, a missing description and h1, share words, the record, sitemap and alt', () => {
  const sitePlan = {
    brand: { name: { value: 'Copperleaf Bakery' } },
    seo: { schema: { '@type': 'Bakery', name: 'Copperleaf Bakery', telephone: '+44 20 7946 0555' } }
  }
  const pages = [
    page(
      '/',
      goodHead('Sourdough and cakes in Port Marlow | Copperleaf Bakery', LONG, '/'),
      '<h1>Fresh bread</h1><img src="/images/a.jpg" alt="A sourdough loaf on a board">'
    ),
    page('/contact', '<title>Contact</title>', '<h2>Visit us</h2><img src="/images/map.jpg">'),
    page(
      '/classes/rye',
      '<title>Fitness, and Boxing Studio Joomla Template</title>' +
        `<meta name="description" content="${LONG}">`,
      '<h1>Rye</h1><h1>Rye again</h1><img src="/images/frame.png" alt="">'
    )
  ]
  const heads = checkPageHeads({ pages, sitePlan })
  const at = (path, kind, severity) =>
    heads.filter((f) => f.page === path && f.kind === kind && f.severity === severity)
  assert.equal(
    at('/', 'page-title', 'blocker').length +
      at('/', 'page-description', 'blocker').length +
      at('/', 'page-h1', 'blocker').length,
    0
  )
  assert.equal(at('/contact', 'page-title', 'minor').length >= 1, true, 'no business name in the title')
  assert.equal(at('/contact', 'page-description', 'blocker').length, 1)
  assert.equal(at('/contact', 'page-h1', 'blocker').length, 1)
  assert.equal(at('/contact', 'share-preview', 'minor').length, 1)
  assert.equal(at('/classes/rye', 'page-title', 'blocker').length, 1, "the template's title")
  assert.equal(at('/classes/rye', 'page-h1', 'minor').length, 1, 'two h1')
  assert.equal(
    at('/classes/rye', 'page-description', 'minor').length,
    1,
    'the same description as the home page'
  )
  // The gate stops on the blockers, and each belongs to its rule.
  assert.equal(ruleOfFinding(at('/contact', 'page-description', 'blocker')[0])?.id, 'page-head')
  assert.equal(ruleOfFinding(at('/contact', 'page-h1', 'blocker')[0])?.id, 'page-main-heading')
  const gate = buildBlockers({ findings: heads })
  assert.equal(gate.state, 'needs-fixes')
  assert.deepEqual(gate.items.map((i) => i.rule).sort(), ['page-head', 'page-main-heading'])
  // No LocalBusiness record on the home page, then one that says the business.
  assert.equal(checkBusinessSchema({ pages, sitePlan }).length, 1)
  const withRecord = [
    page(
      '/',
      `<script type="application/ld+json">${JSON.stringify({ '@type': 'Bakery', name: 'Copperleaf Bakery', telephone: '+44 20 7946 0555' })}</script>`,
      '<h1>x</h1>'
    )
  ]
  assert.deepEqual(checkBusinessSchema({ pages: withRecord, sitePlan }), [])
  // No sitemap; then one missing a page, with robots.txt pointing to it.
  assert.equal(checkSitemap({ pages, files: { '/sitemap.xml': { status: 404, html: '' } } }).length, 1)
  const sitemap = {
    status: 200,
    html: '<urlset><url><loc>https://site.example/</loc></url><url><loc>https://site.example/contact</loc></url></urlset>'
  }
  const robots = { status: 200, html: 'User-agent: *\nSitemap: https://site.example/sitemap.xml\n' }
  assert.deepEqual(
    checkSitemap({ pages, files: { '/sitemap.xml': sitemap, '/robots.txt': robots } }).map((f) => f.page),
    ['/classes/rye']
  )
  // A picture with no alt at all is named; a decorative frame's empty alt is right.
  assert.deepEqual(
    checkPictureAlt({ pages }).map((f) => [f.page, f.found]),
    [['/contact', '1']]
  )
})

test('JA Boxing 1.0.8 declares where every page prints its one h1; a map that leaves a page out cannot be packed', () => {
  assert.deepEqual(mainHeadingProblems(boxing), [])
  const trimmed = { ...boxing, mainHeadings: boxing.mainHeadings.filter((e) => e.via !== 'field') }
  const problems = mainHeadingProblems(trimmed)
  assert.ok(
    problems.some((p) => p.startsWith('article-2 is a page with no declared main heading')),
    problems.join('; ')
  )
  assert.deepEqual(mainHeadingProblems({ ...boxing, mainHeadings: 'not-a-list' }), [
    'mainHeadings must be a list'
  ])
})

test('each page takes its declared h1: the page heading, a listing sub-heading, or the record title field', () => {
  const rows = menuRows().map((r) => (r.path === 'classes' ? { ...r, title: 'Bread classes' } : r))
  const steps = seoMenuSteps({ rows, plans: [], contentMap: boxing })
  const paramsOf = (path) => {
    const row = rows.find((r) => r.path === path)
    const step = steps.find((s) => s.id === row.id)
    return step ? JSON.parse(step.fields.params) : null
  }
  // The Contact page: the component's own page heading, named as its menu entry.
  assert.equal(paramsOf('about-us/contact').show_page_heading, '1')
  assert.equal(
    paramsOf('about-us/contact').page_heading,
    rows.find((r) => r.path === 'about-us/contact').title
  )
  // The listing whose page heading would also show on every record page beneath it: its sub-heading instead.
  assert.equal(paramsOf('classes').page_subheading, 'Bread classes')
  assert.notEqual(paramsOf('classes').show_page_heading, '1')
  // The home page's template already prints its h1.
  assert.equal(paramsOf('home'), null)
  // A record page whose title field the build left blank takes the record's name as its h1.
  const e = boxing.entities.find((x) => x.key === 'article-14')
  const [step] = recordSeoSteps({
    records: [{ entity: 'article-14', label: 'Rye & Spelt', name: 'Copperleaf Bakery' }],
    contentMap: boxing,
    articles: [
      {
        id: e.sourceId,
        alias: e.identity.alias,
        attribs: JSON.stringify({ 'classes-title': '&nbsp;<br><span>&nbsp;</span>' })
      }
    ]
  })
  assert.match(JSON.parse(step.fields.attribs)['classes-title'], /^<h1 style="[^"]*">Rye &amp; Spelt<\/h1>$/)
})

test('every placed picture says what it shows from its label, a decorative one says nothing, beside where it is written', () => {
  const shaped = [
    {
      hash: 'aaa',
      ext: 'jpg',
      group: { role: 'section', slots: [{ key: 'article-2.5' }] },
      receipt: { kind: 'photo', subject: 'A baker shaping sourdough loaves' }
    },
    {
      hash: 'bbb',
      ext: 'png',
      group: { role: 'icon', slots: [{ key: 'module-1.3' }] },
      receipt: { kind: 'drawn' }
    },
    {
      hash: 'ccc',
      ext: 'jpg',
      group: { role: 'section', slots: [{ key: 'article-14.5' }] },
      receipt: { kind: 'drawn' }
    }
  ]
  const alts = pictureAltsOf(shaped, { 'article-14.offering': 'Cake Decorating' })
  assert.equal(alts.get('aaa.jpg'), 'A baker shaping sourdough loaves')
  assert.equal(alts.get('bbb.png'), '')
  assert.equal(alts.get('ccc.jpg'), 'Cake Decorating')
  const articles = [
    {
      id: 2,
      images: JSON.stringify({
        image_intro: 'images/tracy-content/aaa.jpg#joomlaImage://x',
        image_intro_alt: 'Boxer at the bag'
      }),
      fulltext: '<p><img src="/images/tracy-content/ccc.jpg" alt=""></p>',
      attribs: JSON.stringify({ 'classes-video-thumb': 'images/tracy-content/ccc.jpg' })
    }
  ]
  const { steps, missed } = altSteps({ rows: articles, kind: 'article', alts })
  assert.equal(JSON.parse(steps[0].fields.images).image_intro_alt, 'A baker shaping sourdough loaves')
  assert.match(steps[0].fields.fulltext, /alt="Cake Decorating"/)
  // A field with no alt beside it is counted, never guessed.
  assert.equal(missed, 1)
  const modules = [
    {
      id: 9,
      params: JSON.stringify({
        config: JSON.stringify({ items: [{ img: 'images/tracy-content/bbb.png', img_alt: 'Gloves' }] })
      })
    }
  ]
  const nested = altSteps({ rows: modules, kind: 'module', alts })
  assert.equal(JSON.parse(JSON.parse(nested.steps[0].fields.params).config).items[0].img_alt, '')
})

test("a T4 template's own Open Graph is switched on in its site settings file; a template without one is left", () => {
  const base = Buffer.from(JSON.stringify({ system_optimizecss: '0' }))
  const on = openGraphFile({ local: null, base })
  assert.deepEqual(JSON.parse(on.bytes.toString()), { system_optimizecss: '0', system_opengraph: '1' })
  assert.equal(openGraphFile({ local: Buffer.from('{"system_opengraph":"1"}'), base: null }).already, true)
  assert.equal(openGraphFile({ local: null, base: null }).bytes, null)
})
