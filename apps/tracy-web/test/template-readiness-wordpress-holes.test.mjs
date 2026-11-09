/**
 * The coverage holes met on JA Diner WP7 (TracyHQ/tracy#459), on an invented WordPress bakery: each one, put into a copy
 * of the release's measured coverage file, turns the Content coverage step of the readiness verdict red with the state
 * code the wordpress-template-readiness skill's recipe table (`SKILL.md`) names, and the fixed copy is green. The label
 * rules block is computed by the audit's own rules (`labelRulesOf`) over the invented map and holes, then read by
 * `roadOf`, the way Road to live reads a committed `content-coverage.json`. Nothing here is a Diner fact.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { readContracts } from '../src/lib/contracts.js'
import { roadOf } from '../src/lib/road-to-live.js'
import { DEMO_MEASURES_CHECK } from '../src/lib/template-readiness/demo-measures-check.js'
import { measureDemo } from '../src/site-check/demo-measures.js'
import { labelRulesOf } from '../../../packages/cms/tracy-quickstart-tools/content-coverage/lib/label-rules.mjs'

const TAG = 'quickstart/bakery/wp7'
const V3 = 'place-content-roles/3'
const sha = (s) => createHash('sha256').update(s).digest('hex')
const LOCK = '{"entities":{}}'
const SKILL = readFileSync(
  new URL('../../../.agents/skills/wordpress-template-readiness/SKILL.md', import.meta.url),
  'utf8'
)

const text = (key, sample, role, extra = {}) => ({
  key,
  type: 'text',
  sample,
  role,
  fit: { measured: false },
  ...extra
})
const hole = (over) => ({ kind: 'text', lock: 'undeclared', pages: 2, firstPage: '/', cause: 'x', ...over })
const calm = text('hero.title', 'Fresh bread every day', 'editorial.heading')

/** A contract folder with one invented WordPress version and its committed coverage file. */
function contractWith({ slots = [], holes = [] }) {
  const map = JSON.stringify({
    roleVocabularyVersion: V3,
    slotFitVersion: 'slot-fit/1',
    slots: [calm, ...slots]
  })
  const doc = {
    schemaVersion: 'tracy-content-coverage/v1',
    tool: { name: 'test', version: '1.7.0' },
    contract: { id: `${TAG}/1.0.0`, contentMapSha256: sha(map), presentationLockSha256: sha(LOCK) },
    measuredAt: '2026-11-08T10:00:00.000Z',
    pages: { audited: 5, inMap: 5, notInMap: 0, failed: 0, capReached: false },
    counts: {},
    coverage: { text: 100, images: 100, links: 100 },
    holes,
    hygiene: [],
    labelRules: labelRulesOf({ map: JSON.parse(map), pages: [], holes })
  }
  const dir = mkdtempSync(path.join(tmpdir(), 'wp-holes-'))
  const at = path.join(dir, 'bakery', 'wp7', '1.0.0')
  mkdirSync(at, { recursive: true })
  writeFileSync(
    path.join(at, 'manifest.json'),
    JSON.stringify({
      id: `${TAG}/1.0.0`,
      platform: 'wordpress',
      quickstart: { release: TAG, version: '1.0.0' }
    })
  )
  writeFileSync(path.join(at, 'content-map.json'), map)
  writeFileSync(path.join(at, 'presentation-lock.json'), LOCK)
  writeFileSync(path.join(at, 'content-coverage.json'), JSON.stringify(doc))
  return readContracts(dir)
}

const release = {
  tag: TAG,
  name: 'Bakery',
  kind: 'quickstart',
  github: 'published',
  tracy: 'ready',
  assets: [{ name: 'w.tar.gz' }],
  setting: {
    platform: 'wordpress',
    version: '1.0.0',
    template: 'bakery',
    install: { webroot: { file: 'w.tar.gz' } }
  },
  inspiration: null,
  inspirationHidden: true,
  pages: [{ id: 'home', label: 'Home', home: true }],
  local: null,
  choosable: true,
  platform: 'wordpress'
}
const stepOf = (input) =>
  roadOf(release, { contracts: contractWith(input) }).find((s) => s.step === 'content-coverage')
const rulesOf = (step) => (step.params.labelFailing ?? []).map((f) => f.rule)

const CASES = [
  {
    id: 'H1 business words in a pattern',
    broken: {
      holes: [
        hole({ value: '(555) 010-2030', class: 'template', evidence: 'themes/bakery/patterns/contact.php' })
      ]
    },
    code: 'coverage-holes',
    fixed: {
      slots: [
        text('theme.bakery_contact_phone', '(555) 010-2030', 'contact.phone', {
          group: { id: 'c.0', item: 0, kind: 'contact' }
        })
      ]
    }
  },
  {
    id: 'H2 fact in a core/html band',
    broken: { holes: [hole({ value: '555-010-9999', class: 'unknown', evidence: '' })] },
    code: 'coverage-holes',
    fixed: {
      slots: [
        text('theme.bakery_contact_phone', '555-010-9999', 'contact.phone', {
          group: { id: 'c.0', item: 0, kind: 'contact' }
        })
      ]
    }
  },
  {
    id: 'H3 priced name',
    broken: {
      slots: [
        text('menu.dish.1', 'Salad $30', 'offering.name', {
          group: { id: 'm.0', item: 0, kind: 'menu_item' }
        })
      ]
    },
    code: 'coverage-labels',
    rules: ['R2'],
    fixed: {
      slots: [
        text('menu.dish.1', 'Salad ((span class="price"))$30((/span))', 'offering.name', {
          markup: 'inline',
          group: { id: 'm.0', item: 0, kind: 'menu_item' }
        })
      ]
    }
  },
  {
    id: 'H4 cut-out picture',
    broken: {
      slots: [
        {
          key: 'hero.plate',
          type: 'image',
          sample: 'x.png',
          role: 'editorial.design_element',
          customize: 'keep',
          fit: {
            measured: true,
            kind: 'cutout',
            replace: 'keep',
            aspect: 1,
            tolerance: 0.1,
            minWidth: 300,
            crop: 'contain',
            boxes: { desktop: { width: 300, height: 300 } }
          }
        }
      ]
    },
    code: 'coverage-labels',
    rules: ['R5'],
    // The label judge, once it has looked at the crop and said right, is what clears R5 on a real run; here the
    // measured kind is the plain decoration it is.
    fixed: {
      slots: [
        {
          key: 'hero.plate',
          type: 'image',
          sample: 'x.png',
          role: 'editorial.design_element',
          customize: 'keep',
          fit: {
            measured: true,
            kind: 'decoration',
            replace: 'keep',
            aspect: 1,
            tolerance: 0.1,
            minWidth: 300,
            crop: 'contain',
            boxes: { desktop: { width: 300, height: 300 } }
          }
        }
      ]
    }
  },
  {
    id: 'H5 template part not captured (footer or header)',
    broken: {
      holes: [hole({ value: 'Open daily until late', class: 'capture', evidence: 'posts#97.post_content' })]
    },
    code: 'coverage-holes',
    fixed: { slots: [text('footer.hours', 'Open daily until late', 'editorial.paragraph')] }
  },
  {
    id: 'H6 style guide sample reads as a fact',
    broken: {
      holes: [
        hole({
          value: 'Company Name 12 Example Road P: (555) 010-2030',
          class: 'capture',
          accepted: 'Style guide sample, a customer never writes it.',
          evidence: 'posts#9.post_content'
        })
      ]
    },
    code: 'coverage-labels',
    rules: ['R9'],
    fixed: { holes: [] }
  },
  {
    id: 'H7 typography or other block not named',
    broken: {
      holes: [hole({ value: 'Our sourdough story', class: 'capture', evidence: 'posts#12.post_content' })]
    },
    code: 'coverage-holes',
    fixed: { slots: [text('about.story', 'Our sourdough story', 'editorial.heading')] }
  },
  {
    id: 'H9 link inside inline markup',
    broken: {
      holes: [hole({ kind: 'link', value: '/menu/', class: 'capture', evidence: 'posts#12.post_content' })]
    },
    code: 'coverage-holes',
    fixed: { holes: [] }
  },
  {
    id: 'H10 page title',
    broken: { holes: [hole({ value: 'About us', class: 'capture', evidence: 'posts#12.post_title' })] },
    code: 'coverage-holes',
    fixed: { slots: [text('page-about.title', 'About us', 'editorial.heading')] }
  },
  {
    id: 'H11 theme picture option',
    broken: {
      holes: [
        hole({
          kind: 'image',
          value: 'uploads/banner.jpg',
          class: 'capture',
          evidence: 'options#106 wp_bakery_blog_banner_image'
        })
      ]
    },
    code: 'coverage-holes',
    fixed: {
      slots: [
        {
          key: 'theme.blog_banner',
          type: 'image',
          sample: 'uploads/banner.jpg',
          role: 'editorial.illustration',
          fit: { measured: false }
        }
      ]
    }
  }
]

test('the unbroken invented bakery is green', () => {
  const step = stepOf({})
  assert.deepEqual([step.state, step.code], ['done', 'coverage-ready'])
})

for (const c of CASES) {
  test(`${c.id}: red with ${c.code}, green once fixed`, () => {
    const red = stepOf(c.broken)
    assert.deepEqual(
      [red.state, red.code],
      ['todo', c.code],
      String(red.params.rolesReason ?? red.params.fitReason)
    )
    if (c.rules) assert.deepEqual(rulesOf(red), c.rules)
    const green = stepOf(c.fixed)
    assert.deepEqual([green.state, green.code], ['done', 'coverage-ready'])
  })

  test(`${c.id}: SKILL.md leads from ${c.code} to its recipe`, () => {
    const recipe = c.id.split(' ')[0]
    assert.match(SKILL, new RegExp(`\\| \`${c.code}\`[^\\n]*\\b${recipe}\\b`))
  })
}

// H15: the demo-measures fault `demo-main-heading`, found by counting `<h1` per route (the recipe's own detect step).
const h1sOf = (html) =>
  [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').trim())
const MASTHEAD = (tag) => `<${tag} class="site-title">Fresh Bakery</${tag}>`
const PAGES_H15 = {
  broken: { '/': `${MASTHEAD('h1')}<h1>Fresh bread</h1>`, '/error': `${MASTHEAD('h1')}<p>Not found</p>` },
  fixed: { '/': `${MASTHEAD('p')}<h1>Fresh bread</h1>`, '/error': `${MASTHEAD('p')}<h1>Not found</h1>` }
}

async function demoMeasuresVerdict(pages) {
  const host = async (payload) => ({
    checks: ['no-empty-picture-slots', 'no-empty-boxes'].map((id) => ({
      id,
      pass: true,
      detail: [],
      measured: 0,
      expected: 'none'
    })),
    visited: payload.pages.map((p) => ({ path: p, status: 200 })),
    pageMeasures: payload.pages.flatMap((p) =>
      [1440, 390].map((width) => ({
        path: p,
        width,
        textBoxes: [],
        mainHeadings: h1sOf(pages[p]),
        orphanRows: [],
        blankFooterColumns: []
      }))
    )
  })
  const doc = await measureDemo({
    host,
    pages: Object.keys(pages),
    quickstart: { slug: 'bakery', version: '1.0.0' }
  })
  const dir = mkdtempSync(path.join(tmpdir(), 'wp-h15-'))
  writeFileSync(path.join(dir, 'demo-measures.json'), JSON.stringify(doc))
  const contracts = new Map([[`${TAG}@1.0.0`, { id: 'bakery/wp7/1.0.0', dir, platform: 'wordpress' }]])
  return DEMO_MEASURES_CHECK.judge(release, { contracts }, { steps: [], version: '1.0.0' })
}

test('H15 repeated masthead h1: red with demo-main-heading, green once the masthead is no heading', async () => {
  const red = await demoMeasuresVerdict(PAGES_H15.broken)
  assert.deepEqual([red.state, red.code], ['todo', 'demo-main-heading'])
  assert.equal(red.params.faults[0].page, '/')
  const green = await demoMeasuresVerdict(PAGES_H15.fixed)
  assert.deepEqual([green.state, green.code], ['done', 'demo-measures-clean'])
})

test('H15: SKILL.md leads from demo-main-heading to its recipe', () => {
  assert.match(SKILL, /\| `demo-main-heading`[^\n]*\bH15\b/)
})
