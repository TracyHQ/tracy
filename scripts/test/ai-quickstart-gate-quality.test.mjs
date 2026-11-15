// Template quality of the release gate (ticket #586, product decision 4): the site check's page groups, named, run on
// the marker site and on the untouched human quickstart; only a block failure the untouched template does not have is a
// regression and blocks; the rest is recorded as the template's own. A fake host stands in for the browser.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  baselineControl,
  measureQuality,
  QUALITY_GROUPS,
  qualityGroupsOf,
  qualityOf
} from '../ai-quickstart/gate/quality.mjs'

const failure = (group, extra = {}) => ({
  group,
  page: '/x',
  width: 1440,
  level: 'block',
  reason: 'r',
  ...extra
})
const run = (groups) => ({ groups })

test('the named groups are the site check groups of that name; an unknown name throws', () => {
  assert.deepEqual(
    qualityGroupsOf(QUALITY_GROUPS).map((g) => g.name),
    [...QUALITY_GROUPS]
  )
  for (const name of [
    'cms-errors',
    'empty-frames',
    'text-overflow',
    'main-heading',
    'orphan-row',
    'blank-footer-column',
    'empty-controls',
    'stretched-pictures',
    'band-contrast',
    'words-over-picture',
    'logo-readable'
  ])
    assert.ok(QUALITY_GROUPS.includes(name), name)
  assert.throws(() => qualityGroupsOf(['cms-errors', 'no-such-group']), /no-such-group/)
})

test('a block failure the control does not have is a regression; one it has is the template own', () => {
  const marker = run([
    {
      name: 'text-overflow',
      status: 'red',
      failures: [
        failure('text-overflow', { selector: '.hero h1', page: '/a' }),
        failure('text-overflow', { selector: '.card p', width: 390 }),
        failure('text-overflow', { selector: '.card p', width: 390, level: 'warn' })
      ]
    },
    { name: 'cms-errors', status: 'green', failures: [] }
  ])
  // The control printed the hero heading over its box at the same width, on another page.
  const control = run([
    {
      name: 'text-overflow',
      status: 'red',
      failures: [failure('text-overflow', { selector: '.hero h1', page: '/b' })]
    },
    { name: 'cms-errors', status: 'green', failures: [] }
  ])
  // The marker site's /a and the control's /b are the same template page (one page key).
  marker.pageKeys = { '/a': 'hero-page', '/x': 'card-page' }
  control.pageKeys = { '/b': 'hero-page', '/x': 'card-page' }
  const q = qualityOf({ marker, control: { from: 'measured', ...control } })
  assert.equal(q.status, 'failed')
  assert.deepEqual(
    q.regressions.map((r) => [r.group, r.width, r.selector]),
    [['text-overflow', 390, '.card p']]
  )
  assert.deepEqual(
    q.sameAsTemplate.map((r) => [r.group, r.selector, r.class]),
    [['text-overflow', '.hero h1', 'same_as_template']]
  )
  // A warning is recorded, never a regression.
  assert.equal(q.warnings.length, 1)
  // Without the regression the measurement passes, with the template's own failure recorded.
  const fine = qualityOf({
    marker: {
      pageKeys: marker.pageKeys,
      ...run([{ ...marker.groups[0], failures: marker.groups[0].failures.slice(0, 1) }, marker.groups[1]])
    },
    control: { from: 'measured', ...control }
  })
  assert.equal(fine.status, 'passed')
  assert.equal(fine.sameAsTemplate.length, 1)
})

test('the same selector at another width is a regression', () => {
  const at = (width) =>
    run([
      {
        name: 'text-overflow',
        status: 'red',
        failures: [failure('text-overflow', { selector: '.hero h1', width })]
      }
    ])
  assert.equal(qualityOf({ marker: at(390), control: { from: 'measured', ...at(1440) } }).status, 'failed')
  assert.equal(qualityOf({ marker: at(1440), control: { from: 'measured', ...at(1440) } }).status, 'passed')
})

test('a failure with no selector is matched on its reason', () => {
  const marker = run([
    {
      name: 'main-heading',
      status: 'red',
      failures: [failure('main-heading', { width: null, reason: 'two main headings' })]
    }
  ])
  const same = run([
    {
      name: 'main-heading',
      status: 'red',
      failures: [failure('main-heading', { width: null, reason: 'two main headings', page: '/y' })]
    }
  ])
  marker.pageKeys = { '/x': 'article' }
  same.pageKeys = { '/y': 'article' }
  assert.equal(qualityOf({ marker, control: { from: 'measured', ...same } }).status, 'passed')
  const other = run([
    {
      name: 'main-heading',
      status: 'red',
      failures: [failure('main-heading', { width: null, reason: 'no main heading' })]
    }
  ])
  assert.equal(qualityOf({ marker, control: { from: 'measured', ...other } }).status, 'failed')
})

test('a group the control could not measure falls back to the baseline file; with neither it is incomplete', () => {
  const marker = run([
    {
      name: 'main-heading',
      status: 'red',
      failures: [failure('main-heading', { reason: 'two', width: null })]
    },
    { name: 'band-contrast', status: 'red', failures: [failure('band-contrast', { reason: 'faint' })] }
  ])
  const control = run([
    { name: 'main-heading', status: 'unmeasured', failures: [] },
    { name: 'band-contrast', status: 'unmeasured', failures: [] }
  ])
  const baseline = baselineControl({
    schemaVersion: 'tracy-demo-measures/v1',
    groups: [
      {
        name: 'main-heading',
        status: 'red',
        failures: [failure('main-heading', { reason: 'two', width: null })]
      }
    ]
  })
  const q = qualityOf({ marker, control: { from: 'measured', ...control }, baseline })
  assert.equal(q.status, 'incomplete')
  assert.deepEqual(q.byGroup['main-heading'].control, 'baseline')
  assert.deepEqual(q.byGroup['band-contrast'].control, 'none')
  assert.deepEqual(
    q.uncompared.map((f) => f.group),
    ['band-contrast']
  )
  assert.equal(q.regressions.length, 0)
})

test('a group the marker site could not measure leaves the measurement incomplete, never passed', () => {
  const q = qualityOf({
    marker: run([{ name: 'cms-errors', status: 'unmeasured', reason: 'no host', failures: [] }]),
    control: { from: 'measured', ...run([{ name: 'cms-errors', status: 'green', failures: [] }]) }
  })
  assert.equal(q.status, 'incomplete')
  assert.deepEqual(q.unmeasured, [{ group: 'cms-errors', reason: 'no host' }])
})

test('missing SEO items block whatever the control says', () => {
  const q = qualityOf({
    marker: run([{ name: 'cms-errors', status: 'green', failures: [] }]),
    control: { from: 'measured', ...run([{ name: 'cms-errors', status: 'green', failures: [] }]) },
    seo: { status: 'failed', missing: [{ page: '/', item: 'description' }] }
  })
  assert.equal(q.status, 'failed')
  assert.equal(q.seo.missing.length, 1)
})

test('measureQuality runs the named groups through the site check on the pages, through the host only', async () => {
  const asked = []
  const host = async (payload) => {
    asked.push(payload)
    return {
      checks: [
        {
          id: 'no-cms-error-leak',
          pass: false,
          expected: 'no CMS error',
          detail: [{ page: '/a', text: 'Warning: x' }]
        },
        { id: 'no-raw-placeholders', pass: true, detail: [] }
      ],
      pageMeasures: []
    }
  }
  const out = await measureQuality({ host, pages: ['/', '/a'], names: ['cms-errors'] })
  assert.deepEqual(
    out.groups.map((g) => [g.name, g.status]),
    [['cms-errors', 'red']]
  )
  assert.equal(out.groups[0].failures[0].measured, 'Warning: x')
  assert.ok(asked.length >= 1)
  assert.deepEqual(out.pages, ['/', '/a'])
  await assert.rejects(measureQuality({ host, pages: ['/'], names: ['nope'] }), /nope/)
})

test('the same failure on another template page is a regression: the page is part of the key', () => {
  const heading = (page) => failure('main-heading', { width: null, reason: 'no main heading', page })
  const marker = {
    pageKeys: { '/m-contact': 'contact', '/m-about': 'about' },
    ...run([{ name: 'main-heading', status: 'red', failures: [heading('/m-contact')] }])
  }
  const control = {
    from: 'measured',
    pageKeys: { '/about-us': 'about', '/contact': 'contact' },
    ...run([{ name: 'main-heading', status: 'red', failures: [heading('/about-us')] }])
  }
  const q = qualityOf({ marker, control })
  assert.equal(q.status, 'failed')
  assert.deepEqual(
    q.regressions.map((r) => r.page),
    ['/m-contact']
  )
  // A marker page the control has no counterpart of is judged on its own: any block failure there blocks.
  const alone = {
    pageKeys: { '/m-new': 'made-by-the-build' },
    ...run([{ name: 'main-heading', status: 'red', failures: [heading('/m-new')] }])
  }
  const q2 = qualityOf({ marker: alone, control })
  assert.equal(q2.status, 'failed')
  assert.equal(q2.regressions[0].counterpart, 'none')
})

test('a red group that lists no failure is incomplete, never passed', () => {
  const q = qualityOf({
    marker: run([{ name: 'cms-errors', status: 'red', failures: [] }]),
    control: { from: 'measured', ...run([{ name: 'cms-errors', status: 'red', failures: [] }]) }
  })
  assert.equal(q.status, 'incomplete')
  assert.deepEqual(
    q.unmeasured.map((u) => u.reason),
    ['red_without_failures']
  )
})

test('a system page the template titles is compared with the untouched template; a page the build writes is not', () => {
  const marker = run([{ name: 'cms-errors', status: 'green', failures: [] }])
  const login = 'index.php?option=com_users&view=login'
  const shared = { page: login, item: 'unique title', detail: 'shared by 4 pages' }
  const control = {
    from: 'measured',
    ...run([{ name: 'cms-errors', status: 'green', failures: [] }]),
    seo: { status: 'failed', missing: [{ ...shared, detail: 'shared by 5 pages' }] }
  }
  const systemPages = [login]
  const same = qualityOf({ marker, control, systemPages, seo: { status: 'failed', missing: [shared] } })
  assert.equal(same.status, 'passed')
  assert.deepEqual(
    same.sameAsTemplate.map((s) => [s.group, s.page, s.item]),
    [['seo', login, 'unique title']]
  )
  // A build page missing an item blocks, whatever the control.
  const home = { page: 'index.php', item: 'unique title', detail: 'shared by 4 pages' }
  const built = qualityOf({
    marker,
    control,
    systemPages,
    seo: { status: 'failed', missing: [shared, home] }
  })
  assert.equal(built.status, 'failed')
  assert.deepEqual(
    built.seo.blocking.map((m) => m.page),
    ['index.php']
  )
  // A system page item the control does not miss blocks; with no control SEO it cannot be compared.
  const worse = qualityOf({
    marker,
    control: { ...control, seo: { status: 'passed', missing: [] } },
    systemPages,
    seo: { status: 'failed', missing: [shared] }
  })
  assert.equal(worse.status, 'failed')
  const blind = qualityOf({
    marker,
    control: { ...control, seo: undefined },
    systemPages,
    seo: { status: 'failed', missing: [shared] }
  })
  assert.equal(blind.status, 'incomplete')
})

test('the Joomla page key is the component, view and layout the body prints; the same page on two sites meets', async () => {
  const { joomlaPageKey } = await import('../ai-quickstart/gate/adapters/joomla-page-key.mjs')
  const { pageKeysOf } = await import('../ai-quickstart/gate/quality.mjs')
  const page = (item) =>
    '<html><body class="site com_content view-article layout-default item-' +
    item +
    ' no-task">x</body></html>'
  assert.equal(joomlaPageKey(page(101)), 'com_content layout-default view-article')
  assert.equal(joomlaPageKey(page(101)), joomlaPageKey(page(205)))
  assert.equal(joomlaPageKey('<html><body>no classes</body></html>'), null)
  const keys = pageKeysOf(
    [
      { path: 'index.php?Itemid=5', status: 200, html: page(5) },
      { path: 'index.php?Itemid=6', status: 200, html: '<body>bare</body>' }
    ],
    joomlaPageKey
  )
  assert.deepEqual(keys, {
    '/index.php?Itemid=5': 'com_content layout-default view-article',
    '/index.php?Itemid=6': '/index.php?Itemid=6'
  })
})
