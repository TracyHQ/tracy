/**
 * The guide table of the Road to live panel (`src/cms/problem-guides.ts`): every step code the
 * server's `road` sends has a title and a short why line; at most one short fact line and three
 * short steps (11/10/2026: keep the words short); a step fixed on /ops points at a control,
 * one fixed outside /ops is ONE text to paste plus a doc (never an owner), from the docs only; no
 * sentence is ever matched; and no copy carries a dash.
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { opsI18nPlugin } from './support/ops-i18n-esbuild.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..')
const repoRoot = path.resolve(pkgRoot, '..', '..', '..')
const rootRequire = createRequire(path.join(repoRoot, 'package.json'))

let mod

before(async () => {
  const built = await rootRequire('esbuild').build({
    stdin: {
      contents: `export * from './cms/problem-guides'
        export { failedInstallGuide, RETRY_STEPS, stepInWords } from './cms/demo-failure-guides'`,
      resolveDir: path.join(pkgRoot, 'src'),
      loader: 'ts'
    },
    absWorkingDir: pkgRoot,
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    logLevel: 'silent',
    plugins: [opsI18nPlugin()]
  })
  mod = await import(
    `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`
  )
})

const JOOMLA = {
  tag: 'quickstart/ja-restaurant/j6',
  cms: 'Joomla',
  platform: 'joomla',
  version: '1.0.2',
  label: 'JA Restaurant'
}

/** ja-restaurant on dev, 11/10/2026 (demo and listing wait for the contract), as `roadOf` builds it (`apps/tracy-web/test/road-to-live.test.mjs`). */
const JA_RESTAURANT = [
  { step: 'release', state: 'done', code: 'release-published', params: { github: 'published' } },
  { step: 'install-file', state: 'done', code: 'install-file-ready', params: { version: '1.0.2' } },
  {
    step: 'contract',
    state: 'todo',
    code: 'no-contract',
    params: {
      platform: 'joomla',
      slug: 'ja-restaurant',
      version: '1.0.2',
      tags: ['quickstart/ja-restaurant/j6'],
      path: 'direct',
      batchInScope: false
    }
  },
  {
    step: 'customize',
    state: 'blocked',
    code: 'customize-waiting',
    params: { passed: 0, total: 0, mustFix: [], worthFixing: [], version: '1.0.2' },
    blockedBy: 'contract'
  },
  {
    step: 'demo',
    state: 'blocked',
    code: 'demo-failed',
    params: { reason: null, step: 'provision', version: '1.0.0', releaseVersion: '1.0.2' },
    blockedBy: 'contract'
  },
  { step: 'listing', state: 'blocked', code: 'no-listing', params: { demo: false }, blockedBy: 'demo' },
  { step: 'published', state: 'blocked', code: 'not-published', params: {}, blockedBy: 'listing' },
  {
    step: 'polish',
    state: 'warn',
    code: 'polish',
    params: { items: [{ code: 'no-pages-file', params: {} }] }
  }
]
const CONTRACT = JA_RESTAURANT[2]
const DEMO = JA_RESTAURANT[4]
const LISTING = JA_RESTAURANT[5]

/** A Customize your site check with one must-fix and one worth-fixing rule, as `roadOf` sends it. */
const CUSTOMIZE_UNCHECKED = {
  passed: 28,
  total: 28,
  version: '1.0.3',
  checkedAt: '2026-10-25T09:00:12.000Z',
  mustFix: [],
  worthFixing: [],
  notChecked: [
    {
      rule: 'STAB-1',
      text: 'The build does not finish in one press, or an answer has no place.',
      question: 'All questions',
      owner: 'contract',
      message: 'whether Claude Cowork 0.24.64 (latest) carries ja-boxing-j6 could not be read: timed out',
      fix: null
    }
  ]
}
const CUSTOMIZE_FAILING = {
  passed: 26,
  total: 29,
  version: '1.0.2',
  mustFix: [
    {
      rule: 'LOGO-1',
      text: 'Some pages keep the demo logo.',
      question: 'Logo',
      owner: 'template',
      message: 'JA Restaurant Joomla 1.0.2 fails LOGO-1: the header keeps logo.svg.',
      fix: 'Bind the header logo to the brand slot.'
    },
    {
      rule: 'STAB-1',
      text: 'The build does not finish in one press, or an answer has no place.',
      question: 'All questions',
      owner: 'contract',
      message: 'no content contract seals this release',
      fix: null
    }
  ],
  worthFixing: [
    {
      rule: 'LANG-6',
      text: 'Dates keep the English format.',
      question: 'Site language',
      owner: 'template',
      message: 'the template prints F j, Y',
      fix: null
    }
  ]
}

/** A Design system step with one rule in each group, as the server's road sends it (ADR 0031). */
const DS_FAILING = {
  passed: 5,
  total: 7,
  mustFix: [
    {
      rule: 'CSS-1',
      text: "A stylesheet paints the template's colours without reading the slot.",
      question: 'Stylesheets',
      owner: 'template',
      message: '1 stylesheet paints the palette without reading the slot: css/template.css (40 colours).',
      fix: 'Tokenize them with templates/joomla-ja-restaurant.json and release the template again.'
    }
  ],
  worthFixing: [
    {
      rule: 'BAND-1',
      text: "Some bands keep the template's colours under every system.",
      question: 'Bands',
      owner: 'contract',
      message: "2 of 2 bands keep the template's own colours under every system (.t4-footer, #t4-header).",
      fix: null
    }
  ]
}

/** Every code the server's road emits today, with params of the shape it sends. */
/** Content coverage of ja-restaurant 1.0.2, as `content-coverage/road-step.js` sends it. */
const COVERAGE_BASE = {
  version: '1.0.2',
  slug: 'ja-restaurant',
  platform: 'joomla',
  contract: 'ja-restaurant/j6/1.0.2',
  live: false
}
const ROLES_MISSING = {
  ...COVERAGE_BASE,
  rolesState: 'missing',
  rolesCount: 3,
  rolesShown: ['module-183.9', 'module-191.2', 'module-236.5']
}
/** The Slot fit group (ADR 0039 decision 7): ten slots of a map that declares Slot fit have no fit. */
const FIT_MISSING = {
  ...COVERAGE_BASE,
  fitState: 'missing',
  fitCount: 10,
  fitShown: ['module-183.9', 'module-191.2']
}
/** The label rules group (ADR 0040): R3 and R2 fail on a version 3 map. */
const LABELS_FAILING = {
  ...COVERAGE_BASE,
  labelState: 'failing',
  labelFailing: [
    { rule: 'R2', title: 'fact-like sample without a contact or price role', count: 1, keys: ['home.intro'] },
    {
      rule: 'R3',
      title: 'URL slot without a role',
      count: 14,
      keys: ['home.paragraph.2.link.1', 'home.button.1.url']
    }
  ],
  labelFactShare: 7.5,
  labelHolds: true,
  labelWarns: false
}
/** The label judge (spec #37): a phone labelled editorial, a claim heading labelled editorial, one finer mismatch. */
const JUDGE_WRONG = {
  ...COVERAGE_BASE,
  judgeState: 'wrong-group',
  judgeReason: null,
  judgeWrongGroup: [
    {
      key: 'module-12.phone',
      role: 'editorial.paragraph',
      suggested: 'contact.phone',
      why: 'a phone number'
    },
    {
      key: 'module-9.title',
      role: 'editorial.heading',
      suggested: 'claim.heading',
      why: 'a ranking and a year'
    }
  ],
  judgeWrongGroupCount: 3,
  judgeMismatch: [
    { key: 'module-13.intro', role: 'editorial.paragraph', suggested: 'editorial.heading', why: 'a heading' }
  ],
  judgeMismatchCount: 1,
  judgeNotJudged: 0,
  judgeHolds: true,
  judgeWarns: false
}
const COVERAGE_HOLES = {
  ...COVERAGE_BASE,
  coverage: { text: 88.4, images: 61.5, links: 100 },
  holes: 3,
  byClass: { capture: 2, template: 1 },
  lockedContent: 1,
  accepted: 0,
  incomplete: null,
  causes: [
    { cause: 'author name (users table, never in a contract)', class: 'capture', count: 2 },
    { cause: 'template: template language file', class: 'template', count: 1 }
  ],
  shown: [
    { kind: 'text', value: 'Drew Stokes', class: 'capture', lock: 'undeclared' },
    { kind: 'text', value: 'Try a class', class: 'template', lock: null }
  ]
}

const EVERY_CODE = [
  ['release', 'release-published', {}],
  ['release', 'release-draft', {}],
  ['install-file', 'install-file-ready', { version: '1.0.0' }],
  ['install-file', 'no-install-file', {}],
  ['install-file', 'install-file-invalid', { reason: 'install.webroot names no file' }],
  ['install-file', 'no-template', {}],
  ['install-file', 'template-not-an-id', { template: 'JA Restaurant' }],
  ['install-file', 'asset-missing', { files: ['w.tar.gz'] }],
  ['content-coverage', 'coverage-not-needed', {}],
  ['content-coverage', 'coverage-waiting', {}],
  ['content-coverage', 'coverage-not-measured', COVERAGE_BASE],
  [
    'content-coverage',
    'coverage-stale',
    { ...COVERAGE_BASE, reason: 'content-map.json changed after it was measured' }
  ],
  [
    'content-coverage',
    'coverage-invalid',
    { ...COVERAGE_BASE, reason: 'schemaVersion is not tracy-content-coverage/v1' }
  ],
  ['content-coverage', 'coverage-holes', COVERAGE_HOLES],
  ['content-coverage', 'coverage-live-holes', { ...COVERAGE_HOLES, live: true }],
  [
    'content-coverage',
    'coverage-ready',
    { ...COVERAGE_BASE, coverage: { text: 100, images: 100 }, accepted: 2 }
  ],
  ['content-coverage', 'coverage-roles', ROLES_MISSING],
  ['content-coverage', 'coverage-live-roles', { ...ROLES_MISSING, live: true }],
  [
    'content-coverage',
    'coverage-roles',
    { ...COVERAGE_BASE, rolesState: 'none', rolesCount: 0, rolesShown: [] }
  ],
  [
    'content-coverage',
    'coverage-roles',
    { ...COVERAGE_BASE, rolesState: 'invalid', rolesReason: 'slot "a" has unknown role "x"', rolesShown: [] }
  ],
  [
    'content-coverage',
    'coverage-roles',
    { ...COVERAGE_BASE, rolesState: 'stale', rolesReason: 'the contract files changed', rolesShown: [] }
  ],
  ['content-coverage', 'coverage-fit', FIT_MISSING],
  ['content-coverage', 'coverage-live-fit', { ...FIT_MISSING, live: true }],
  [
    'content-coverage',
    'coverage-fit',
    { ...COVERAGE_BASE, fitState: 'none', fitCount: 1521, fitShown: ['a'] }
  ],
  [
    'content-coverage',
    'coverage-fit',
    {
      ...COVERAGE_BASE,
      fitState: 'invalid',
      fitReason: 'slot "a" (image) needs customize "keep"',
      fitShown: []
    }
  ],
  ['content-coverage', 'coverage-labels', LABELS_FAILING],
  [
    'content-coverage',
    'coverage-live-labels',
    { ...LABELS_FAILING, live: true, labelHolds: false, labelWarns: true }
  ],
  ['content-coverage', 'coverage-judge', JUDGE_WRONG],
  [
    'content-coverage',
    'coverage-judge-warn',
    { ...JUDGE_WRONG, live: true, judgeHolds: false, judgeWarns: true }
  ],
  ['customize', 'customize-waiting', { passed: 0, total: 0, mustFix: [], worthFixing: [] }],
  ['customize', 'customize-not-checked', { passed: 0, total: 0, mustFix: [], worthFixing: [] }],
  ['customize', 'customize-checking', { passed: 0, total: 0, mustFix: [], worthFixing: [] }],
  [
    'customize',
    'customize-error',
    { passed: 0, total: 0, mustFix: [], worthFixing: [], reason: 'GitHub answered 404' }
  ],
  ['customize', 'customize-must-fix', CUSTOMIZE_FAILING],
  ['customize', 'customize-worth-fixing', { ...CUSTOMIZE_FAILING, mustFix: [] }],
  ['customize', 'customize-live-failing', CUSTOMIZE_FAILING],
  ['customize', 'customize-ready', { passed: 29, total: 29, mustFix: [], worthFixing: [] }],
  ['customize', 'customize-unchecked', CUSTOMIZE_UNCHECKED],
  ['customize', 'customize-live-unchecked', CUSTOMIZE_UNCHECKED],
  ['design-system', 'ds-waiting', { passed: 0, total: 0, mustFix: [], worthFixing: [] }],
  ['design-system', 'ds-not-checked', { passed: 0, total: 0, mustFix: [], worthFixing: [] }],
  ['design-system', 'ds-checking', { passed: 0, total: 0, mustFix: [], worthFixing: [] }],
  [
    'design-system',
    'ds-error',
    { passed: 0, total: 0, mustFix: [], worthFixing: [], reason: 'GitHub answered 404' }
  ],
  ['design-system', 'ds-must-fix', DS_FAILING],
  ['design-system', 'ds-worth-fixing', { ...DS_FAILING, mustFix: [] }],
  ['design-system', 'ds-live-failing', DS_FAILING],
  [
    'design-system',
    'ds-not-at-probe',
    {
      passed: 0,
      total: 0,
      grade: null,
      version: '1.0.6',
      mustFix: [],
      worthFixing: [],
      unmeasured: [],
      notAtProbe: { current: 9, measured: null, measure: 'Measure 1.0.6 (...):\nnode stand.mjs up' }
    }
  ],
  [
    'design-system',
    'ds-not-measured',
    {
      passed: 7,
      total: 15,
      grade: 'C',
      version: '1.0.2',
      mustFix: [],
      worthFixing: [],
      unmeasured: [
        {
          rule: 'ROLE-1',
          text: 'Not measured yet.',
          question: 'Built site',
          owner: 'contract',
          message:
            'Headings, text, buttons, cards and containers wear the system: not measured yet on 1.0.2.',
          fix: 'Measure with the tdsr skill and bring design-system-measurement.json with the fix.'
        }
      ]
    }
  ],
  ['design-system', 'ds-ready', { passed: 7, total: 7, mustFix: [], worthFixing: [] }],
  ['demo', 'demo-live', { url: 'https://d/', version: '1.0.2' }],
  ['demo', 'demo-version', { url: 'https://d/', demoVersion: '1.0.0', version: '1.0.2' }],
  ['demo', 'no-demo', {}],
  ['demo', 'demo-failed', { reason: 'boom', step: 'provision', version: '1.0.0', releaseVersion: '1.0.2' }],
  ['listing', 'listing-saved', { hidden: true }],
  [
    'listing',
    'listing-incomplete',
    {
      hidden: true,
      missing: [{ id: 'blog', label: 'Resources', path: '/blog' }],
      forbidden: [{ label: 'Login', path: '/login' }],
      noDesktop: 1,
      pages: 4
    }
  ],
  ['listing', 'no-listing', { demo: false }],
  ['listing', 'no-listing', { demo: true }],
  ['contract', 'contract-not-needed', {}],
  ['contract', 'contract-exact', { profile: 'p/1.0.2' }],
  ['contract', 'contract-lower', { profile: 'p/1.0.0', version: '1.0.2' }],
  [
    'contract',
    'no-contract',
    { slug: 'ja-restaurant', version: '1.0.2', tags: ['x'], path: 'direct', batchInScope: false }
  ],
  [
    'contract',
    'no-contract',
    { slug: 'ja-restaurant', version: '1.0.2', tags: ['x'], path: 'full', batchInScope: false }
  ],
  ['contract', 'sibling-no-contract', { tags: ['quickstart/ja-restaurant/wp7'] }],
  ['published', 'published', {}],
  ['published', 'not-published', {}],
  ['published', 'ready-to-publish', {}],
  ['published', 'not-showable', { why: 'Tracy cannot start a site from this release.' }],
  ['polish', 'polish-done', {}],
  [
    'polish',
    'polish',
    {
      items: [
        { code: 'pictures-missing', params: { missing: 1, total: 3, files: ['a.png'] } },
        { code: 'layouts-without-shots', params: { layouts: 2 } },
        { code: 'no-category', params: {} },
        { code: 'no-thumbnail', params: {} },
        { code: 'no-blurb', params: {} },
        { code: 'no-pages-file', params: {} }
      ]
    }
  ]
]

/** Every string a guide holds, flattened, for the copy checks. */
function wordsOf(g) {
  const out = [g.title, g.why, g.detail ?? '', ...(g.ops?.steps ?? []), g.ops?.target.label ?? '']
  if (g.outside) out.push(g.outside.label, g.outside.text, g.outside.note ?? '', g.outside.doc.label)
  return out
}

test('every code the road sends has a title and a reason it matters, and no dash in its copy', () => {
  for (const [step, code, params] of EVERY_CODE) {
    const g = mod.guideOf({ step, state: 'todo', code, params }, JOOMLA)
    assert.ok(g.title && g.title !== code, `${code} has its own title`)
    assert.ok(g.why, `${code} says why`)
    for (const w of wordsOf(g)) assert.doesNotMatch(w, /[—–]/, `${code}: "${w}"`)
  }
})

/** The codes that only ever say a step is done: nothing to act on, so no action is asked of them. */
const DONE_CODES = new Set([
  'release-published',
  'install-file-ready',
  'demo-live',
  'listing-saved',
  'contract-not-needed',
  'contract-exact',
  'published',
  'not-published',
  'polish-done',
  'coverage-not-needed',
  'coverage-waiting',
  'coverage-ready',
  'customize-waiting',
  'customize-checking',
  'customize-ready',
  'ds-waiting',
  'ds-checking',
  'ds-ready'
])

test('every code that asks for work has a title, a why line and at least one concrete action', () => {
  for (const [step, code, params] of EVERY_CODE) {
    const g = mod.guideOf({ step, state: 'todo', code, params }, JOOMLA)
    assert.ok(g.title.trim(), `${code}: title`)
    assert.ok(g.why.trim(), `${code}: why`)
    if (DONE_CODES.has(code)) continue
    // Check again is a press on the row itself (Customize your site).
    const actions = [
      ...(g.ops?.steps ?? []),
      ...(g.outside ? [g.outside.text] : []),
      ...(g.checkAgain ? ['Press Check again on the row.'] : [])
    ]
    assert.ok(actions.length > 0, `${code}: at least one step to do`)
    for (const a of actions) assert.ok(a.trim().length > 10, `${code}: "${a}" is a real step`)
    if (g.ops) assert.ok(g.ops.target.control, `${code}: Go there focuses a control`)
    if (g.outside)
      assert.ok(g.outside.label && g.outside.text && g.outside.doc.href, `${code}: label, text, doc`)
  }
})

test('short copy: why lines and fact lines fit one line, /ops steps are at most three short ones', () => {
  for (const s of Object.values(mod.STEP_WHY)) assert.ok(s.length <= 90, `why too long: "${s}"`)
  for (const [step, code, params] of EVERY_CODE) {
    const g = mod.guideOf({ step, state: 'todo', code, params }, JOOMLA)
    assert.ok(g.why.length <= 90, `${code}: why "${g.why}"`)
    if (g.detail) assert.ok(g.detail.length <= 90, `${code}: detail "${g.detail}" (${g.detail.length})`)
    const steps = g.ops?.steps ?? []
    assert.ok(steps.length <= 3, `${code}: ${steps.length} steps`)
    for (const x of steps) assert.ok(x.split(/\s+/).length <= 9, `${code}: step "${x}"`)
    // The outside block is the text, a doc and at most one line: production, or why the pages file.
    if (g.outside) {
      assert.deepEqual(
        Object.keys(g.outside).sort(),
        g.outside.note ? ['doc', 'label', 'note', 'text'] : ['doc', 'label', 'text']
      )
      if (g.outside.note)
        assert.ok(
          ['Production: ask Vincent.', 'Lets customers pick which pages to keep.'].includes(g.outside.note),
          `${code}: note "${g.outside.note}"`
        )
    }
  }
})

test('no internal words in the copy an admin reads', () => {
  for (const [step, code, params] of EVERY_CODE) {
    const g = mod.guideOf({ step, state: 'todo', code, params }, JOOMLA)
    const words = [g.title, g.why, g.detail ?? '', ...(g.ops?.steps ?? [])]
    for (const w of words)
      assert.doesNotMatch(
        w,
        /\bprofile\b|\bbind|hidden mark|full path|direct capture|\bsealed\b|\bK6\b/i,
        `${code}: "${w}"`
      )
  }
})

test('the road is in the order steps finish: the contract third, Content coverage fourth, Customize your site fifth, Design system sixth, polish last', () => {
  assert.deepEqual(mod.ROAD_ORDER, [
    'release',
    'install-file',
    'contract',
    'content-coverage',
    'customize',
    'design-system',
    'demo',
    'listing',
    'published',
    'polish'
  ])
})

test('Customize your site not checked: the rule, the reason and when, then Check again; live only warns', () => {
  const todo = mod.guideOf(
    { step: 'customize', state: 'todo', code: 'customize-unchecked', params: CUSTOMIZE_UNCHECKED },
    JOOMLA
  )
  assert.equal(todo.title, 'Customize your site · STAB-1 not checked')
  assert.equal(todo.detail, 'Could not be read on 2026-10-25 09:00 UTC. Publish waits until it is.')
  assert.equal(todo.checkAgain, true)
  assert.match(
    todo.outside.text,
    /could not read STAB-1 \(whether Claude Cowork 0\.24\.64 \(latest\) carries ja-boxing-j6 could not be read: timed out\)/
  )
  assert.match(todo.outside.text, /on 2026-10-25 09:00 UTC/)
  const live = mod.guideOf(
    { step: 'customize', state: 'warn', code: 'customize-live-unchecked', params: CUSTOMIZE_UNCHECKED },
    JOOMLA
  )
  assert.equal(live.detail, 'Live, so it stays published. Check again once it can be read.')
})

test('ja-restaurant: the failed demo is step 7, one short line, retry twice then report once', () => {
  const demo = mod.guideOf({ ...DEMO, state: 'todo' }, JOOMLA)
  assert.equal(demo.title, 'Demo install failed')
  assert.equal(demo.why, 'Customers preview the live demo from the card.')
  assert.equal(demo.detail, 'Failed on 1.0.0. Retry installs 1.0.2.')
  assert.deepEqual(
    [demo.ops.target.view, demo.ops.target.section, demo.ops.target.control],
    ['card', 'demo-site', 'demo-install']
  )
  assert.deepEqual(demo.ops.steps, [
    'Press Retry install twice.',
    'Still failing? Send the reason to the dev team.'
  ])
  // The raw reason stays on the Demo Site row; it is never repeated in the step body.
  const raw = mod.guideOf(
    {
      ...DEMO,
      state: 'todo',
      params: { ...DEMO.params, reason: 'Warning: simplexml_load_file(): pkg_acymailing.xml' }
    },
    JOOMLA
  )
  assert.doesNotMatch(raw.detail, /simplexml/)
  assert.equal(
    wordsOf(raw)
      .join(' ')
      .match(/dev team/g).length,
    1,
    'said once'
  )
  assert.equal(mod.stepNumber('demo'), 7)
  assert.equal(mod.waitingLine(DEMO), 'Waiting for step 3: the contract may make a new version.')
  assert.equal(mod.waitingLine(LISTING), 'Waiting for step 7: Demo site')
})

test('no listing yet: with a demo, Create listing in two short steps; without one, install the demo first', () => {
  const withDemo = mod.guideOf(
    { step: 'listing', state: 'todo', code: 'no-listing', params: { demo: true } },
    JOOMLA
  )
  assert.equal(withDemo.title, 'No listing yet')
  assert.equal(withDemo.why, 'What customers see on the card.')
  assert.equal(withDemo.detail, undefined)
  assert.equal(withDemo.ops.target.control, 'create-listing')
  const without = mod.guideOf({ ...LISTING, state: 'todo' }, JOOMLA)
  assert.equal(without.detail, 'Install the demo first.')
  assert.equal(without.ops.target.control, 'demo-install')
})

test('no contract on Joomla: ONE prompt with the whole sequence, the version not pinned, never batch-contracts out of scope', () => {
  const g = mod.guideOf(CONTRACT, JOOMLA)
  assert.equal(g.ops, undefined, 'nothing on /ops makes a contract')
  assert.equal(g.why, 'Tells the site agent what it may edit without breaking the design.')
  assert.equal(g.detail, 'May make a new version; demo and listing wait for it.')
  const o = g.outside
  assert.equal(o.label, 'Paste into Claude Code')
  assert.equal(o.note, 'Production: ask Vincent.')
  assert.ok(!o.text.includes('batch-contracts'))
  const prompt = o.text
  assert.ok(
    prompt.startsWith(
      'Use the quickstart-contract skill to make the content contract for the Joomla release quickstart/ja-restaurant/j6 (currently 1.0.2). First check this machine has what the skill needs (DDEV, Docker, gh signed in on the machine that runs DDEV, tracy-dev 0.7.1, checkouts of claude-cowork and joomlart-products, and a local Tracy) and tell me what is missing before you start.'
    ),
    prompt
  )
  assert.ok(prompt.includes('If the skill makes a new version, tell me its number.'))
  assert.doesNotMatch(prompt, /version 1\.0\.2/, 'the skill decides the version')
  assert.ok(prompt.endsWith('Stop before every commit, push, PR, release and upload, and wait for my go.'))
  for (const word of [
    'tch PR',
    'claude-cowork',
    'quickstarts.json and design-templates.json, in apps/tracy-web/src/ and in packages/fleet/tracy-fleet-operation/scripts/provision/',
    'merge the PR to develop',
    'Gavick',
    // What the old step list said now lives in the prompt: when it shows here, and what it reads.
    'once CI has deployed this server',
    'shows ja-restaurant/j6/<version> instead of None'
  ])
    assert.ok(prompt.includes(word), word)
  assert.equal('owner' in o, false, 'the admin does it with Claude Code; no owner')
  assert.match(o.doc.href, /\.agents\/skills\/quickstart-contract\/SKILL\.md$/)
  const at = (w) => prompt.indexOf(w)
  assert.ok(at('First check this machine') < at('When the contract passes'))
  assert.ok(at('tch PR') < at('claude-cowork repository'))
  assert.ok(at('claude-cowork repository') < at('quickstarts.json'))
  assert.ok(at('quickstarts.json') < at('merge the PR'))
  assert.ok(at('merge the PR') < at('Stop before'))
  assert.doesNotMatch(prompt, /tracy_setting\.json/, 'a captured site keeps its install file')
})

test('no contract on the full path: a new version is cut, switched on after the merge', () => {
  const g = mod.guideOf({ ...CONTRACT, params: { ...CONTRACT.params, path: 'full' } }, JOOMLA)
  assert.equal(g.detail, 'May make a new version; demo and listing wait for it.')
  const prompt = g.outside.text
  assert.match(
    prompt,
    /upload the new package files to the release \(every file except tracy_setting\.json\)/
  )
  assert.ok(
    prompt.indexOf('merge the PR') < prompt.indexOf('upload the new tracy_setting.json'),
    'the install file is switched on after the merge'
  )
})

test('batch-contracts is offered only when the server says the release is in its scope, inside the prompt', () => {
  const inScope = mod.guideOf({ ...CONTRACT, params: { ...CONTRACT.params, batchInScope: true } }, JOOMLA)
  assert.ok(
    inScope.outside.text.includes(
      'node packages/cms/tracy-quickstart-tools/batch-contracts.mjs capture --only ja-restaurant --platform joomla --project-prefix qc-batch --cowork-source <absolute path of a claude-cowork checkout> --artifacts <absolute path of an empty folder outside the repo>'
    )
  )
})

test('a release with no card yet gets the batch command naming it with --without-card', () => {
  const cardless = mod.guideOf(
    { ...CONTRACT, params: { ...CONTRACT.params, batchInScope: true, batchWithoutCard: true } },
    JOOMLA
  )
  assert.ok(
    cardless.outside.text.includes(
      `batch-contracts.mjs capture --only ja-restaurant --platform joomla --without-card ${JOOMLA.tag} --project-prefix qc-batch`
    )
  )
  const withCard = mod.guideOf({ ...CONTRACT, params: { ...CONTRACT.params, batchInScope: true } }, JOOMLA)
  assert.ok(!withCard.outside.text.includes('--without-card'))
})

test('no contract on WordPress names its folder, says no skill covers it, and pins no version', () => {
  const g = mod.guideOf(
    { step: 'contract', state: 'todo', code: 'no-contract', params: { slug: 'ja-nova', version: '1.0.7' } },
    { ...JOOMLA, tag: 'quickstart/ja-nova/wp7', cms: 'WordPress', platform: 'wordpress', version: '1.0.7' }
  )
  const prompt = g.outside.text
  assert.ok(
    prompt.startsWith(
      'Make the WordPress content contract for the release quickstart/ja-nova/wp7 (currently 1.0.7)'
    )
  )
  assert.ok(prompt.includes('packages/cms/tracy-wordpress-quickstart/contracts/ja-nova/wp7/<version>/'))
  assert.ok(prompt.includes('If the skill makes a new version, tell me its number.'))
  assert.match(prompt, /First check this machine has what the README needs/)
  assert.match(prompt, /manifest\.json, content-map\.json and presentation-lock\.json/)
  assert.match(prompt, /Stop before every commit, push, PR and merge, and wait for my go\.$/)
  assert.equal(g.outside.note, 'Production: ask Vincent.')
  assert.equal('owner' in g.outside, false)
})

test('an install file to fix outside /ops: one prompt with write, upload after my go, check, from the doc', () => {
  const g = mod.guideOf(
    { step: 'install-file', state: 'todo', code: 'install-file-invalid', params: { reason: 'bad' } },
    JOOMLA
  )
  assert.equal(g.detail, 'bad')
  const t = g.outside.text
  assert.ok(t.includes("node scripts/tracy-setting.mjs write 'quickstart/ja-restaurant/j6'"))
  assert.ok(t.includes("node scripts/tracy-setting.mjs check 'quickstart/ja-restaurant/j6'"))
  assert.ok(t.includes('The file it has now is refused: bad'))
  assert.ok(
    t.indexOf('write') < t.indexOf('wait for my go') && t.indexOf('wait for my go') < t.indexOf(' check ')
  )
  assert.match(g.outside.doc.label, /quickstart-release\.md/)
  // No file at all can also be created on /ops.
  const none = mod.guideOf(
    { step: 'install-file', state: 'todo', code: 'no-install-file', params: {} },
    JOOMLA
  )
  assert.equal(none.ops.target.control, 'create-setting')
})

test('Publish says how far it reaches, in one line', () => {
  const g = mod.guideOf({ step: 'published', state: 'todo', code: 'ready-to-publish', params: {} }, JOOMLA)
  assert.equal(g.detail, 'Every Tracy server shows it, production too, with the pictures it stores.')
  assert.equal(g.ops.target.control, 'listing-publish')
  const waiting = mod.guideOf(
    { step: 'published', state: 'blocked', code: 'not-published', params: {} },
    JOOMLA
  )
  assert.equal(waiting.detail, undefined, 'a waiting step says only what it waits for')
  assert.equal(
    mod.waitingLine({
      step: 'published',
      state: 'blocked',
      code: 'not-published',
      params: { waiting: ['contract', 'listing'] },
      blockedBy: 'listing'
    }),
    'Waiting for steps 3 and 8: Content contract, Listing'
  )
  assert.equal(
    mod.waitingLine({
      step: 'demo',
      state: 'blocked',
      code: 'no-demo',
      params: {},
      blockedBy: 'install-file'
    }),
    'Waiting for step 2: Install file'
  )
})

test('polish: one short line of gaps; the pages file is made with the tracy-template-dev generator, attached to the existing release', () => {
  const g = mod.guideOf(
    {
      step: 'polish',
      state: 'warn',
      code: 'polish',
      params: { items: [{ code: 'no-pages-file', params: {} }] }
    },
    JOOMLA
  )
  // The why line holds for every polish item: the pages file feeds the Pages question, not the card.
  assert.equal(g.why, 'Nice to have. Publish works without them.')
  assert.doesNotMatch(g.why, /card/)
  assert.equal(g.detail, 'Missing: pages file.')
  assert.equal(g.outside.note, 'Lets customers pick which pages to keep.')
  const t = g.outside.text
  assert.match(t, /tracy-template-dev checkout/)
  // The generator is not released: the prompt says so plainly, and names no tracy-dev subcommand.
  assert.match(t, /not released yet: it is only on the draft branch feat\/site-pages-file/)
  assert.match(t, /https:\/\/github\.com\/TracyHQ\/tracy-template-dev\/pull\/1 and/)
  assert.doesNotMatch(t, /tracy-dev site-pages/)
  assert.ok(
    t.includes("node plugins/tracy-dev/lib/site-pages.mjs --release 'quickstart/ja-restaurant/j6' --out .")
  )
  assert.match(t, /No new release is needed/)
  assert.match(t, /Wait for my go before the upload\./)
  assert.equal(g.ops, undefined, 'nothing on the card to fix')
})

test('a sibling with no contract: the work is worded for THAT release, not this one', () => {
  const g = mod.guideOf(
    {
      step: 'contract',
      state: 'todo',
      code: 'sibling-no-contract',
      params: {
        tags: ['quickstart/ja-nova/wp7'],
        missing: [{ tag: 'quickstart/ja-nova/wp7', platform: 'wordpress', version: '1.0.7' }]
      }
    },
    { ...JOOMLA, tag: 'quickstart/ja-nova/j6' }
  )
  assert.match(g.detail, /Missing: quickstart\/ja-nova\/wp7\./)
  assert.match(g.outside.text, /release quickstart\/ja-nova\/wp7 \(currently 1\.0\.7\)/)
  assert.doesNotMatch(g.outside.text, /j6/)
})

test('an unknown code keeps the step name and gets no steps', () => {
  const g = mod.guideOf({ step: 'demo', state: 'todo', code: 'something-new', params: {} }, JOOMLA)
  assert.equal(g.title, 'Demo site')
  assert.equal(g.ops, undefined)
  assert.equal(g.outside, undefined)
})

test('the listing rules are codes; each has its words', () => {
  for (const code of [
    'demo-required',
    'pages-need-label-and-path',
    'pages-shooting',
    'layout-no-desktop',
    'picture-not-held',
    'no-category',
    'no-blurb',
    'no-home-picture',
    'no-thumbnail'
  ]) {
    const text = mod.listingRuleText(code, { count: 2, missing: 1, total: 3, files: ['a.png'] })
    assert.ok(text && text !== code, code)
    assert.doesNotMatch(text, /[—–]/)
  }
  assert.equal(mod.listingRuleText('demo-required'), 'Install the demo first.')
})

test('until a failure is understood, its guide adds no fact and invents no steps', () => {
  const g = mod.failedInstallGuide('some reason nobody has looked at', 'provision')
  assert.equal(g.whatToDo, null)
  assert.deepEqual(g.howTo, mod.RETRY_STEPS)
})

test('a job step reads in plain words', () => {
  assert.equal(mod.stepInWords('provision'), 'setting up the site')
  assert.equal(mod.stepInWords('teardown'), 'taking the old copy down')
  assert.equal(mod.stepInWords(null), 'installing')
})

// ── Customize your site (ADR 0029 §4) ─────────────────────────────────────────────────────────

test('Customize your site: the score in the title, both groups, ONE prompt naming every rule, the repo and the skill', () => {
  const g = mod.guideOf(
    { step: 'customize', state: 'todo', code: 'customize-must-fix', params: CUSTOMIZE_FAILING },
    JOOMLA
  )
  assert.equal(g.title, 'Customize your site · 26/29 passed')
  assert.deepEqual(
    g.rules.mustFix.map((r) => r.rule),
    ['LOGO-1', 'STAB-1']
  )
  assert.deepEqual(
    g.rules.worthFixing.map((r) => r.rule),
    ['LANG-6']
  )
  assert.equal(g.checkAgain, true)
  assert.equal(g.outside.label, 'Paste into Claude Code')
  const prompt = g.outside.text
  for (const rule of ['LOGO-1', 'STAB-1', 'LANG-6']) assert.match(prompt, new RegExp(rule))
  assert.match(prompt, /quickstart\/ja-restaurant\/j6/)
  assert.match(prompt, /JoomlArt-Products\/joomlart-products/)
  assert.match(prompt, /joomlart-t4-template skill/)
  assert.match(prompt, /quickstart-contract skill/)
  assert.match(prompt, /template-customization-question-readiness\.mjs/)
  assert.match(prompt, /Check again/)
  assert.match(prompt, /wait for my go/)
  assert.ok(prompt.indexOf('LOGO-1') < prompt.indexOf('LANG-6'), 'must fix first')
  assert.match(g.outside.doc.href, /spec-template-customization-question-readiness\.md$/)
})

test('Customize your site names the skill of each CMS, and a rule only Tracy fixes goes to the dev team', () => {
  const on = (platform) =>
    mod.guideOf(
      { step: 'customize', state: 'todo', code: 'customize-must-fix', params: CUSTOMIZE_FAILING },
      { ...JOOMLA, platform }
    ).outside.text
  assert.match(on('emdash'), /tracy-emdash-template skill/)
  assert.match(on('wordpress'), /tracy-wordpress-theme skill/)
  const tracyOnly = mod.guideOf(
    {
      step: 'customize',
      state: 'todo',
      code: 'customize-must-fix',
      params: {
        ...CUSTOMIZE_FAILING,
        mustFix: [{ ...CUSTOMIZE_FAILING.mustFix[0], owner: 'tracy' }],
        worthFixing: []
      }
    },
    JOOMLA
  )
  assert.equal(tracyOnly.outside.label, 'Send to the dev team')
})

test('Customize your site sends each fix where its file lives: the contract in tch, a JA template to joomlart-products, an EmDash template to its folder in tch', () => {
  const about3 = (owner) => ({
    ...CUSTOMIZE_FAILING,
    mustFix: [
      {
        rule: 'ABOUT-3',
        text: 'Some places keep the demo company name.',
        question: 'Business name',
        owner,
        message: 'the demo company name is not declared.',
        fix: null
      }
    ],
    worthFixing: []
  })
  const prompt = (owner, ctx) =>
    mod.guideOf({ step: 'customize', state: 'todo', code: 'customize-must-fix', params: about3(owner) }, ctx)
      .outside.text
  // Tracy Business WordPress 1.3.4 on dev, 12/10/2026: demoCompanyNames is in the contract's .copy.json.
  const wp = prompt('contract', {
    ...JOOMLA,
    tag: 'tracy-business/wp7',
    platform: 'wordpress',
    template: 'tracy-business'
  })
  assert.match(wp, /ABOUT-3 \(must fix, Business name, fix in the content contract in the tch repository/)
  assert.doesNotMatch(wp, /fix in the template package/)
  // A JA template's source is on joomlart-products, in its own product folder.
  assert.match(
    prompt('template', JOOMLA),
    /fix in the template source in JoomlArt-Products\/joomlart-products \(products\/joomlart\/\*\/ja_restaurant\/source\)\)/
  )
  // Tracy's EmDash templates are built from their folder in tch, and that folder exists.
  const em = prompt('template', {
    ...JOOMLA,
    tag: 'tracy-business/emdash-0.x',
    platform: 'emdash',
    template: 'tracy-business'
  })
  assert.match(
    em,
    /fix in the template package in the tch repository \(packages\/cms\/tracy-emdash-theme-business\)/
  )
  for (const template of ['tracy-business', 'tracy-saas', 'tracy-base'])
    assert.ok(
      existsSync(
        path.join(here, '..', '..', '..', 'cms', `tracy-emdash-theme-${template.replace(/^tracy-/, '')}`)
      ),
      template
    )
})

test('Customize your site while checking, ready or live: short lines, no prompt where nothing fails', () => {
  const checking = mod.guideOf(
    { step: 'customize', state: 'checking', code: 'customize-checking', params: {} },
    JOOMLA
  )
  assert.equal(checking.title, 'Customize your site')
  assert.equal(checking.detail, 'Checking now. This takes a few minutes.')
  const ready = mod.guideOf(
    {
      step: 'customize',
      state: 'done',
      code: 'customize-ready',
      params: { passed: 29, total: 29, mustFix: [], worthFixing: [] }
    },
    JOOMLA
  )
  assert.equal(ready.title, 'Customize your site · 29/29 passed')
  assert.equal(ready.outside, undefined)
  assert.equal(ready.rules, undefined)
  const live = mod.guideOf(
    { step: 'customize', state: 'warn', code: 'customize-live-failing', params: CUSTOMIZE_FAILING },
    JOOMLA
  )
  assert.equal(live.detail, 'Live, so it stays published. Fix it in the next version.')
  assert.equal(
    mod.waitingLine({
      step: 'customize',
      state: 'blocked',
      code: 'customize-waiting',
      params: {},
      blockedBy: 'contract'
    }),
    'Waiting for step 3: Content contract'
  )
})

// ── Customize your site prompt audit (12/10/2026) ──────────────────────────────────────────────
// Every Published release on dev, by family: the prompt must send each owner to the folder that
// holds its files, name skills and files that exist, and ask for a new release only when a
// template rule fails.

const FAMILIES = [
  { tag: 'quickstart/ja-kinetic/j6', platform: 'joomla', template: 'ja-kinetic' },
  { tag: 'tracy-business/j6', platform: 'joomla', template: 'tracy-business' },
  { tag: 'tracy-base/j6', platform: 'joomla', template: 'tracy' },
  { tag: 'tracy-apple/j6', platform: 'joomla', template: 'tracy' },
  ...['ja-impact', 'ja-essence', 'ja-morgan', 'ja-nova', 'ja-vega', 'ja-kinetic'].map((t) => ({
    tag: `quickstart/${t}/wp7`,
    platform: 'wordpress',
    template: t
  })),
  { tag: 'tracy-base/wp7', platform: 'wordpress', template: 'tracy-base' },
  { tag: 'tracy-business/wp7', platform: 'wordpress', template: 'tracy-business' },
  { tag: 'tracy-base/emdash-0.x', platform: 'emdash', template: 'tracy-base' },
  { tag: 'tracy-saas/emdash-0.x', platform: 'emdash', template: 'tracy-saas' }
]

const failing = (owners) => ({
  ...CUSTOMIZE_FAILING,
  mustFix: owners.map((owner, i) => ({
    rule: `LOGO-${i + 1}`,
    text: 'Some pages keep the demo logo.',
    question: 'Logo',
    owner,
    message: 'x',
    fix: null
  })),
  worthFixing: []
})

const promptOf = (family, owners) =>
  mod.guideOf(
    { step: 'customize', state: 'todo', code: 'customize-must-fix', params: failing(owners) },
    { ...JOOMLA, cms: family.platform, label: family.template, version: '1.0.0', ...family }
  ).outside.text

/** Every path of this repository a prompt names, without placeholders. */
const TCH_PATH = /\b(?:packages|apps|vendor|scripts|tasks|docs|\.agents)\/[\w./-]*[\w-]/g

test('every tch file or folder a Customize your site prompt names exists, on every family', () => {
  const missing = new Set()
  for (const family of FAMILIES)
    for (const m of promptOf(family, ['template', 'contract', 'plugin', 'tracy']).matchAll(TCH_PATH))
      if (!existsSync(path.join(repoRoot, m[0]))) missing.add(`${family.tag}: ${m[0]}`)
  assert.deepEqual([...missing], [])
})

test('a template fix goes where that template is made: JA Joomla on joomlart-products, Tracy Joomla to the patches, WordPress to its overlay', () => {
  const at = (tag) =>
    promptOf(
      FAMILIES.find((f) => f.tag === tag),
      ['template']
    )
  assert.match(
    at('quickstart/ja-kinetic/j6'),
    /fix in the template source in JoomlArt-Products\/joomlart-products \(products\/joomlart\/\*\/ja_kinetic\/source\)/
  )
  for (const tag of ['tracy-business/j6', 'tracy-base/j6', 'tracy-apple/j6']) {
    assert.match(at(tag), /packages\/cms\/tracy-joomla-quickstart\/template-patches/, tag)
    assert.doesNotMatch(at(tag), /ja-products \(/, tag)
  }
  assert.match(at('quickstart/ja-morgan/wp7'), /packages\/cms\/tracy-wordpress-theme\/overlays\/wp-ja-morgan/)
  assert.match(at('tracy-base/wp7'), /packages\/cms\/tracy-wordpress-theme\/overlays\/tracy-base\b/)
  assert.match(at('tracy-business/wp7'), /packages\/cms\/tracy-wordpress-theme\/overlays\/wp-tracy-business/)
  for (const f of FAMILIES.filter((x) => x.platform === 'wordpress'))
    assert.doesNotMatch(at(f.tag), /fix in the template package in JoomlArt-Products/, f.tag)
})

test('a contract fix names its own contract folder; EmDash has none', () => {
  assert.match(
    promptOf(FAMILIES[0], ['contract']),
    /packages\/cms\/tracy-joomla-quickstart\/contracts\/ja-kinetic\/j6/
  )
  assert.match(
    promptOf({ tag: 'quickstart/ja-nova/wp7', platform: 'wordpress', template: 'ja-nova' }, ['contract']),
    /packages\/cms\/tracy-wordpress-quickstart\/contracts\/ja-nova\/wp7/
  )
  assert.doesNotMatch(
    promptOf({ tag: 'tracy-base/emdash-0.x', platform: 'emdash', template: 'tracy-base' }, ['contract']),
    /content contract/
  )
})

test('only a template or plugin rule asks for a new release; a contract or Tracy rule is a tch PR', () => {
  const tracyAndContract = promptOf(FAMILIES[0], ['contract', 'tracy'])
  assert.doesNotMatch(tracyAndContract, /release a new version/i)
  assert.match(tracyAndContract, /tch PR/)
  assert.match(promptOf(FAMILIES[0], ['template', 'tracy']), /new release/)
})

test('Design system: the score in the title, both groups, ONE prompt naming every rule, the tdsr skill and its own check', () => {
  const g = mod.guideOf(
    { step: 'design-system', state: 'todo', code: 'ds-must-fix', params: DS_FAILING },
    JOOMLA
  )
  assert.equal(g.title, 'Design system · 5/7 passed')
  assert.deepEqual(
    [g.rules.mustFix.map((r) => r.rule), g.rules.worthFixing.map((r) => r.rule)],
    [['CSS-1'], ['BAND-1']]
  )
  assert.equal(g.checkAgain, true)
  assert.equal(g.outside.label, 'Paste into Claude Code')
  const prompt = g.outside.text
  assert.match(prompt, /The Design system check of the release quickstart\/ja-restaurant\/j6/)
  assert.match(prompt, /tdsr skill/)
  assert.match(
    prompt,
    /template-design-system-readiness\.mjs <an empty folder> --tag 'quickstart\/ja-restaurant\/j6' --fetch/
  )
  assert.match(prompt, /packages\/design\/tracy-ds-slot\/templates/)
  assert.match(prompt, /move maxVersion/)
  assert.match(prompt, /wait for my go/)
  assert.match(prompt, /Check again on Design system/)
  assert.ok(prompt.indexOf('CSS-1') < prompt.indexOf('BAND-1'), 'must fix first')
  assert.match(g.outside.doc.href, /spec-template-design-system-readiness\.md$/)
  // Every tch path the prompt names exists.
  for (const m of prompt.matchAll(TCH_PATH))
    assert.ok(existsSync(path.join(repoRoot, m[0])), `${m[0]} named by the Design system prompt`)
})

test('Design system while checking, ready or live: short lines, no prompt where nothing fails', () => {
  const at = (code, params = DS_FAILING) =>
    mod.guideOf({ step: 'design-system', state: 'todo', code, params }, JOOMLA)
  assert.equal(at('ds-ready', { passed: 7, total: 7, mustFix: [], worthFixing: [] }).outside, undefined)
  assert.equal(at('ds-checking').detail, 'Checking now. This takes a few minutes.')
  assert.equal(at('ds-live-failing').detail, 'Live, so it stays published. Fix it in the next version.')
  assert.equal(at('ds-not-checked').checkAgain, true)
})

test('Design system: a built-site rule with no measurement file is "Not measured yet", graded C, with the file named in the prompt (#1313)', () => {
  const params = {
    passed: 7,
    total: 15,
    grade: 'C',
    version: '1.0.2',
    mustFix: [],
    worthFixing: [],
    unmeasured: [
      {
        rule: 'SCREEN-1',
        text: 'Not measured yet.',
        question: 'Built site',
        owner: 'contract',
        message: 'The first screen visibly changes: not measured yet on 1.0.2. Measure with the tdsr skill.',
        fix: 'Measure with the tdsr skill and bring design-system-measurement.json with the fix.'
      }
    ]
  }
  const g = mod.guideOf({ step: 'design-system', state: 'warn', code: 'ds-not-measured', params }, JOOMLA)
  assert.equal(g.title, 'Design system · C · 7/15 passed')
  assert.equal(g.detail, 'Not measured yet on 1.0.2.')
  // phase 2 (#1319): the step is a todo that holds Publish, and the detail says what lifts it
  const held = mod.guideOf(
    {
      step: 'design-system',
      state: 'todo',
      code: 'ds-not-measured',
      params: { ...params, unmeasuredHolds: true }
    },
    JOOMLA
  )
  assert.equal(
    held.detail,
    'Not measured yet on 1.0.2. Publish waits for a design-system-measurement.json of this version (tdsr skill).'
  )
  assert.deepEqual(
    g.rules.unmeasured.map((r) => r.rule),
    ['SCREEN-1']
  )
  assert.deepEqual([g.rules.mustFix, g.rules.worthFixing], [[], []])
  assert.equal(g.checkAgain, true)
  assert.match(g.outside.text, /has rules not measured yet/)
  assert.match(g.outside.text, /SCREEN-1 \(not measured yet, Built site\)/)
  assert.match(g.outside.text, /design-system-measurement\.json/)
  for (const m of g.outside.text.matchAll(TCH_PATH))
    assert.ok(existsSync(path.join(repoRoot, m[0])), `${m[0]} named by the Design system prompt`)
})

test('Design system: measured rules say which run they came from, and the screenshots are a link (#1313)', () => {
  const g = mod.guideOf(
    {
      step: 'design-system',
      state: 'warn',
      code: 'ds-worth-fixing',
      params: {
        ...DS_FAILING,
        mustFix: [],
        grade: 'B',
        measuredOn: '1.0.3, 2026-10-13, imac',
        evidence: 'tasks/evidence/ds-sweep-2026-10-13-moxie'
      }
    },
    JOOMLA
  )
  assert.equal(g.title, 'Design system · B · 5/7 passed')
  assert.equal(g.detail, 'Measured on 1.0.3, 2026-10-13, imac.')
  assert.equal(
    g.evidence.href,
    'https://github.com/TracyHQ/tch/blob/develop/tasks/evidence/ds-sweep-2026-10-13-moxie'
  )
  // a path that climbs out of the tree is not linked
  const bad = mod.guideOf(
    {
      step: 'design-system',
      state: 'warn',
      code: 'ds-worth-fixing',
      params: { ...DS_FAILING, evidence: '../x' }
    },
    JOOMLA
  )
  assert.equal(bad.evidence, undefined)
})

test('Design system not measured with the current preview probe: that alone, and the prompt is the measure commands', () => {
  const params = EVERY_CODE.find(([, code]) => code === 'ds-not-at-probe')[2]
  const g = mod.guideOf({ step: 'design-system', state: 'todo', code: 'ds-not-at-probe', params }, JOOMLA)
  assert.equal(g.title, 'Design system · Not measured with preview probe v9')
  assert.equal(g.rules, undefined, 'no rule groups built from older evidence')
  assert.match(
    g.outside.text,
    /no measurement at the current preview probe v9[^\n]*\nMeasure 1\.0\.6 \(\.\.\.\):\nnode stand\.mjs up/
  )
})

test('Content coverage: holes in the title, where they come from in one line, ONE prompt with the audit command', () => {
  const g = mod.guideOf(
    { step: 'content-coverage', state: 'todo', code: 'coverage-holes', params: COVERAGE_HOLES },
    JOOMLA
  )
  assert.equal(g.title, 'Content coverage · 3 holes')
  assert.equal(g.detail, '2 in the database (1 locked), 1 in the template, 0 unknown.')
  assert.equal(g.outside.label, 'Paste into Claude Code')
  const text = g.outside.text
  assert.match(
    text,
    /content-coverage\/cli\.mjs --site <local site url> --contract packages\/cms\/tracy-joomla-quickstart\/contracts\/ja-restaurant\/j6\/1\.0\.2 /
  )
  assert.match(text, /2 capture: author name/)
  assert.match(text, /text "Drew Stokes" \(capture\)/)
  assert.match(text, /quickstart-contract/)
  assert.match(text, /wait for my go/)
  assert.ok(existsSync(path.join(repoRoot, 'packages/cms/tracy-quickstart-tools/content-coverage/cli.mjs')))
  assert.ok(existsSync(path.join(repoRoot, g.outside.doc.label)))
  const live = mod.guideOf(
    {
      step: 'content-coverage',
      state: 'warn',
      code: 'coverage-live-holes',
      params: { ...COVERAGE_HOLES, live: true }
    },
    JOOMLA
  )
  assert.equal(live.detail, 'Live, so it stays published. Fix it in the next version.')
  const none = mod.guideOf(
    { step: 'content-coverage', state: 'todo', code: 'coverage-not-measured', params: COVERAGE_BASE },
    JOOMLA
  )
  assert.equal(none.detail, 'Publish waits for content-coverage.json of this contract.')
  assert.equal(mod.STEP_TITLE['content-coverage'], 'Content coverage')
  assert.equal(mod.stepNumber('content-coverage'), 4)
})

/** JA Boxing 1.0.2 on 24/10/2026: the four page problems the gate finds, as the road sends them. */
const BOXING_PROBLEMS = [
  {
    kind: 'php-error',
    value:
      'Deprecated: nl2br(): Passing null (templates/ja_boxing/html/com_contact/contact/default_address.php:94)',
    pages: 1,
    firstPage: '/index.php/about-us/contact'
  },
  { kind: 'language-constant', value: 'TPL_FOLLOW_US', pages: 44, firstPage: '/' },
  {
    kind: 'language-constant',
    value: 'COM_FINDER_SEARCH_FORM_LIST_LABEL',
    pages: 1,
    firstPage: '/index.php?Itemid=162'
  },
  {
    kind: 'placeholder',
    token: 'TITLE',
    value: 'Here’s everything you need to know to get ready for your first TITLE workout!',
    pages: 9,
    firstPage: '/index.php/classes/advanced-boxing'
  }
]

test('Content coverage red: the prompt carries the whole fix loop, so an agent that knows nothing can run it', () => {
  const g = mod.guideOf(
    {
      step: 'content-coverage',
      state: 'todo',
      code: 'coverage-holes',
      params: { ...COVERAGE_HOLES, hygiene: 4, hygieneByKind: {}, hygieneShown: BOXING_PROBLEMS }
    },
    JOOMLA
  )
  assert.equal(g.title, 'Content coverage · 3 holes, 4 page problems')
  const text = g.outside.text
  // measure, read by class
  assert.match(text, /content-coverage\/cli\.mjs .* --write/)
  assert.match(text, /report\.html/)
  // capture: fix the RULE for every template, test first, never one contract; locked demo content is a hole
  assert.match(text, /capture-contract\.py/)
  assert.match(text, /contract door of the Claude Cowork plugin/)
  assert.match(text, /for every template, test first; never edit one contract by hand/)
  assert.match(text, /carve it out of the lock/)
  // template and page problems: the template source, the next version, the same package format; language strings by override
  assert.match(
    text,
    /fix the template source in JoomlArt-Products\/joomlart-products, build the next quickstart version in the same package format/
  )
  assert.match(text, /language override/)
  // core: nothing; accepted only with a reason of 12 characters or more; measure again; order of PRs and releases
  assert.match(text, /core: nothing to do/)
  assert.match(text, /"accepted" reason of at least 12 characters/)
  assert.match(text, /Measure again until the command exits 0, commit content-coverage\.json/)
  assert.match(text, /sections 8 and 9/)
  assert.match(text, /Page problems: php error Deprecated: nl2br\(\)/)
  assert.match(text, /language constant TPL_FOLLOW_US \(44 pages, first \/\)/)
  assert.match(text, /placeholder TITLE in "Here’s everything/)
  assert.match(text, /ONE round, before the PR, so every fix lands in one PR/)
  assert.match(text, /section 7b/)
  // the skill it names holds the loop
  const skill = readFileSync(path.join(repoRoot, '.agents/skills/quickstart-contract/SKILL.md'), 'utf8')
  assert.match(skill, /Fix loop when K8 is red/)
  // the page problems are their own group on the step, with the true counts
  assert.deepEqual(
    g.lists.map((l) => [l.heading, l.count, l.lines.length]),
    [
      ['Not declared', 3, 2],
      ['Page problems', 4, 4]
    ]
  )
  assert.equal(
    g.lists[1].lines[2],
    'language constant COM_FINDER_SEARCH_FORM_LIST_LABEL (1 page, first /index.php?Itemid=162)'
  )
})

test('Content coverage with page problems only: the title and the fact line say so', () => {
  const g = mod.guideOf(
    {
      step: 'content-coverage',
      state: 'todo',
      code: 'coverage-holes',
      params: {
        ...COVERAGE_BASE,
        holes: 0,
        byClass: {},
        causes: [],
        shown: [],
        hygiene: 4,
        hygieneShown: BOXING_PROBLEMS
      }
    },
    JOOMLA
  )
  assert.equal(g.title, 'Content coverage · 4 page problems')
  assert.equal(g.detail, 'Raw language constants, PHP errors or placeholders on the pages.')
  assert.deepEqual(
    g.lists.map((l) => l.heading),
    ['Page problems']
  )
  assert.match(g.outside.text, /finds 4 page problems customers must never see\./)
})

test('Slot roles group of Content coverage: guides, lists and ONE prompt that binds roles in content-map.json', () => {
  assert.equal(mod.ROAD_ORDER.includes('slot-roles'), false)
  assert.equal(mod.ROAD_ORDER.length, 10)

  const missing = mod.guideOf(
    { step: 'content-coverage', state: 'todo', code: 'coverage-roles', params: ROLES_MISSING },
    JOOMLA
  )
  assert.equal(missing.title, 'Content coverage · 3 slots without a role')
  assert.equal(missing.detail, 'Every text and image slot needs a role in content-map.json.')
  assert.deepEqual(missing.lists, [
    {
      heading: 'Slots without a role',
      count: 3,
      lines: ['module-183.9', 'module-191.2', 'module-236.5']
    }
  ])
  assert.equal(missing.outside.label, 'Paste into Claude Code')
  const prompt = missing.outside.text
  assert.match(prompt, /quickstart\/ja-restaurant\/j6 \(Joomla 1\.0\.2\)/)
  assert.match(prompt, /module-183\.9, module-191\.2, module-236\.5/)
  assert.match(prompt, /bind roles in content-map\.json during capture, per the quickstart-contract skill/)
  assert.match(prompt, /--previous-map/)
  assert.match(
    prompt,
    /node scripts\/slot-roles\/check\.mjs packages\/cms\/tracy-joomla-quickstart\/contracts\/ja-restaurant\/j6\/1\.0\.2/
  )
  assert.match(prompt, /place-content-roles\/2/)
  assert.match(prompt, /wait for my go/)
  assert.doesNotMatch(prompt, /propose\.mjs|slot-roles\.json/)
  assert.ok(existsSync(path.join(repoRoot, 'scripts/slot-roles/check.mjs')))
  assert.ok(existsSync(path.join(repoRoot, 'scripts/slot-roles/rule-tables.mjs')))
  assert.ok(existsSync(path.join(repoRoot, missing.outside.doc.label)))

  const live = mod.guideOf(
    {
      step: 'content-coverage',
      state: 'warn',
      code: 'coverage-live-roles',
      params: { ...ROLES_MISSING, live: true }
    },
    JOOMLA
  )
  assert.equal(live.title, 'Content coverage · 3 slots without a role')
  assert.equal(live.detail, 'Live, so it stays published. Fix it in the next version.')

  const none = mod.guideOf(
    {
      step: 'content-coverage',
      state: 'todo',
      code: 'coverage-roles',
      params: { ...COVERAGE_BASE, rolesState: 'none', rolesShown: [] }
    },
    JOOMLA
  )
  assert.equal(none.title, 'Content coverage · no slot roles')
  assert.equal(none.lists, undefined)
  assert.match(none.outside.text, /declares no slot roles/)

  const invalid = mod.guideOf(
    {
      step: 'content-coverage',
      state: 'todo',
      code: 'coverage-roles',
      params: {
        ...COVERAGE_BASE,
        rolesState: 'invalid',
        rolesReason: 'slot "a" has unknown role "x"',
        rolesShown: []
      }
    },
    JOOMLA
  )
  assert.equal(invalid.title, 'Content coverage · slot roles invalid')
  assert.match(invalid.outside.text, /slot "a" has unknown role "x"/)

  // holes and roles together: one prompt, the roles steps appended to the coverage fix loop
  const both = mod.guideOf(
    {
      step: 'content-coverage',
      state: 'todo',
      code: 'coverage-holes',
      params: { ...COVERAGE_HOLES, ...ROLES_MISSING }
    },
    JOOMLA
  )
  assert.match(both.title, /holes.*3 slots without a role/)
  assert.deepEqual(
    both.lists.map((l) => l.heading),
    ['Not declared', 'Slots without a role']
  )
  assert.match(both.outside.text, /5a\. Slot roles: bind roles in content-map\.json during capture/)
})

test('Slot fit group of Content coverage: guides, lists and ONE prompt that measures Slot fit with the audit', () => {
  const missing = mod.guideOf(
    { step: 'content-coverage', state: 'todo', code: 'coverage-fit', params: FIT_MISSING },
    JOOMLA
  )
  assert.equal(missing.title, 'Content coverage · 10 slots without a fit')
  assert.equal(missing.detail, 'Every text and image slot needs a measured fit in content-map.json.')
  assert.deepEqual(missing.lists, [
    { heading: 'Slots without a fit', count: 10, lines: ['module-183.9', 'module-191.2'] }
  ])
  assert.equal(missing.outside.label, 'Paste into Claude Code')
  const prompt = missing.outside.text
  assert.match(prompt, /Slot fit of the release quickstart\/ja-restaurant\/j6 \(Joomla 1\.0\.2\)/)
  assert.match(prompt, /leaves 10 text or image slots without a fit \(module-183\.9, module-191\.2, \.\.\.\)/)
  assert.match(prompt, /content-coverage\/cli\.mjs .*--write --fit/)
  assert.match(prompt, /Never write a fit by hand/)
  assert.match(prompt, /next contract version/)
  assert.match(
    prompt,
    /node scripts\/slot-roles\/check\.mjs packages\/cms\/tracy-joomla-quickstart\/contracts\/ja-restaurant\/j6\//
  )
  assert.match(prompt, /wait for my go/)
  assert.ok(existsSync(path.join(repoRoot, 'packages/cms/tracy-quickstart-tools/content-coverage/cli.mjs')))
  assert.ok(existsSync(path.join(repoRoot, 'docs/adr/0039-slot-fit-lives-in-content-map.md')))

  const live = mod.guideOf(
    {
      step: 'content-coverage',
      state: 'warn',
      code: 'coverage-live-fit',
      params: { ...FIT_MISSING, live: true }
    },
    JOOMLA
  )
  assert.equal(live.title, 'Content coverage · 10 slots without a fit')
  assert.equal(live.detail, 'Live, so it stays published. Fix it in the next version.')

  const none = mod.guideOf(
    {
      step: 'content-coverage',
      state: 'todo',
      code: 'coverage-fit',
      params: { ...COVERAGE_BASE, fitState: 'none', fitCount: 1521, fitShown: ['a', 'b'] }
    },
    JOOMLA
  )
  assert.equal(none.title, 'Content coverage · no Slot fit')
  assert.equal(none.detail, 'Captured before Slot fit existed. Measure it for the next version.')
  assert.equal(none.lists, undefined)
  assert.match(none.outside.text, /declares no Slot fit/)

  const invalid = mod.guideOf(
    {
      step: 'content-coverage',
      state: 'todo',
      code: 'coverage-fit',
      params: {
        ...COVERAGE_BASE,
        fitState: 'invalid',
        fitReason:
          'slot "p" (image) is kind photo, which a build replaces, so it must not carry customize "keep"',
        fitShown: []
      }
    },
    JOOMLA
  )
  assert.equal(invalid.title, 'Content coverage · Slot fit invalid')
  assert.match(invalid.outside.text, /must not carry customize "keep"/)

  // roles and fit together: one prompt, both groups' steps
  const both = mod.guideOf(
    {
      step: 'content-coverage',
      state: 'todo',
      code: 'coverage-roles',
      params: { ...ROLES_MISSING, ...FIT_MISSING }
    },
    JOOMLA
  )
  assert.match(both.title, /3 slots without a role, 10 slots without a fit/)
  assert.deepEqual(
    both.lists.map((l) => l.heading),
    ['Slots without a role', 'Slots without a fit']
  )
  assert.match(both.outside.text, /Slot roles: bind roles/)
  assert.match(both.outside.text, /Slot fit: measure it/)

  // holes and fit together: the fit steps join the coverage fix loop
  const holes = mod.guideOf(
    {
      step: 'content-coverage',
      state: 'todo',
      code: 'coverage-holes',
      params: { ...COVERAGE_HOLES, ...FIT_MISSING }
    },
    JOOMLA
  )
  assert.match(holes.title, /holes.*10 slots without a fit/)
  assert.deepEqual(
    holes.lists.map((l) => l.heading),
    ['Not declared', 'Slots without a fit']
  )
  assert.match(holes.outside.text, /5a\. Slot fit: measure it/)

  // a platform the audit does not measure: the group says nothing
  const wp = mod.guideOf(
    {
      step: 'content-coverage',
      state: 'todo',
      code: 'coverage-roles',
      params: { ...ROLES_MISSING, fitState: 'not-applicable', fitShown: [] }
    },
    JOOMLA
  )
  assert.doesNotMatch(wp.title, /fit/i)
})

test('label rules group of Content coverage: names the failing rules and gives ONE prompt to relabel and re-run the audit', () => {
  const held = mod.guideOf(
    { step: 'content-coverage', state: 'todo', code: 'coverage-labels', params: LABELS_FAILING },
    JOOMLA
  )
  assert.equal(held.title, 'Content coverage · 2 label rules failing')
  assert.equal(held.detail, 'Relabel the listed slots in Claude Code, then run the audit again.')
  assert.deepEqual(held.lists, [
    {
      heading: 'R2 fact-like sample without a contact or price role',
      count: 1,
      lines: ['home.intro']
    },
    {
      heading: 'R3 URL slot without a role',
      count: 14,
      lines: ['home.paragraph.2.link.1', 'home.button.1.url']
    }
  ])
  assert.equal(held.outside.label, 'Paste into Claude Code')
  const prompt = held.outside.text
  assert.match(
    prompt,
    /label rules of the release quickstart\/ja-restaurant\/j6 \(Joomla 1\.0\.2\) .* fail: R2 /
  )
  assert.match(
    prompt,
    /R3 URL slot without a role \(14: home\.paragraph\.2\.link\.1, home\.button\.1\.url, \.\.\.\)/
  )
  assert.match(prompt, /node scripts\/slot-roles\/check\.mjs/)
  assert.match(prompt, /audit again with --write/)
  assert.match(prompt, /wait for my go/)

  const live = mod.guideOf(
    {
      step: 'content-coverage',
      state: 'warn',
      code: 'coverage-live-labels',
      params: { ...LABELS_FAILING, live: true, labelHolds: false, labelWarns: true }
    },
    JOOMLA
  )
  assert.equal(live.detail, 'Live, so it stays published. Fix it in the next version.')

  const one = mod.guideOf(
    {
      step: 'content-coverage',
      state: 'todo',
      code: 'coverage-labels',
      params: { ...LABELS_FAILING, labelFailing: [LABELS_FAILING.labelFailing[1]] }
    },
    JOOMLA
  )
  assert.equal(one.title, 'Content coverage · 1 label rule failing')
})

test('Content coverage on WordPress: the prompt measures the WordPress contract folder and names the WordPress capture', () => {
  const wordpress = { ...COVERAGE_HOLES, platform: 'wordpress', contract: 'ja-diner/wp7/1.0.1' }
  const guide = mod.guideOf(
    { step: 'content-coverage', state: 'todo', code: 'coverage-holes', params: wordpress },
    { ...JOOMLA, platform: 'wordpress', tag: 'quickstart/ja-diner/wp7', version: '1.0.1' }
  )
  const prompt = guide.outside.text
  assert.match(
    prompt,
    /--contract packages\/cms\/tracy-wordpress-quickstart\/contracts\/ja-diner\/wp7\/1\.0\.1 /
  )
  assert.match(prompt, /tracy-wordpress-quickstart\/scripts\/capture-contract\.mjs \(run it with --all-text/)
  assert.doesNotMatch(prompt, /capture-contract\.py|tracy-joomla-quickstart/)
})

test('label judge of Content coverage: lists the wrongly labelled slots with the suggested role and gives ONE prompt', () => {
  const held = mod.guideOf(
    { step: 'content-coverage', state: 'todo', code: 'coverage-judge', params: JUDGE_WRONG },
    JOOMLA
  )
  assert.equal(held.title, 'Content coverage · 3 slots in the wrong group')
  assert.equal(
    held.detail,
    'Relabel the listed slots in Claude Code, then run the audit so the judge looks again.'
  )
  assert.deepEqual(held.lists, [
    {
      heading: 'Fact or editorial group wrong',
      count: 3,
      lines: [
        'module-12.phone: editorial.paragraph -> contact.phone',
        'module-9.title: editorial.heading -> claim.heading'
      ]
    },
    {
      heading: 'Another role suggested',
      count: 1,
      lines: ['module-13.intro: editorial.paragraph -> editorial.heading']
    }
  ])
  const prompt = held.outside.text
  assert.match(prompt, /label judge of the release quickstart\/ja-restaurant\/j6 \(Joomla 1\.0\.2\)/)
  assert.match(
    prompt,
    /module-12\.phone is labelled editorial\.paragraph, the judge suggests contact\.phone \(a phone number\)/
  )
  assert.match(prompt, /, \.\.\./)
  assert.match(prompt, /labelJudge in content-coverage\.json/)
  assert.match(prompt, /wait for my go/)

  const live = mod.guideOf(
    {
      step: 'content-coverage',
      state: 'warn',
      code: 'coverage-judge-warn',
      params: { ...JUDGE_WRONG, live: true, judgeHolds: false, judgeWarns: true }
    },
    JOOMLA
  )
  assert.equal(live.detail, 'Live, so it stays published. Fix it in the next version.')

  const finer = mod.guideOf(
    {
      step: 'content-coverage',
      state: 'warn',
      code: 'coverage-judge-warn',
      params: {
        ...JUDGE_WRONG,
        judgeState: 'mismatch',
        judgeWrongGroup: [],
        judgeWrongGroupCount: 0,
        judgeHolds: false,
        judgeWarns: true
      }
    },
    JOOMLA
  )
  assert.equal(finer.title, 'Content coverage · 1 slot role to check')

  const unjudged = mod.guideOf(
    {
      step: 'content-coverage',
      state: 'warn',
      code: 'coverage-judge-warn',
      params: {
        ...JUDGE_WRONG,
        judgeState: 'not-judged',
        judgeReason: 'NO_VISION_MODEL',
        judgeWrongGroup: [],
        judgeWrongGroupCount: 0,
        judgeMismatch: [],
        judgeMismatchCount: 0,
        judgeNotJudged: 40,
        judgeHolds: false,
        judgeWarns: true
      }
    },
    JOOMLA
  )
  assert.equal(unjudged.title, 'Content coverage · 40 slots not judged')
  assert.equal(unjudged.detail, 'No vision model judged these labels. Run the audit with a vision key.')
  assert.equal(unjudged.lists, undefined)
  assert.match(unjudged.outside.text, /TRACY_VISION_API_KEY/)
})
