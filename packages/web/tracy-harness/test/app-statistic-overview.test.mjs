import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { opsI18nPlugin } from './support/ops-i18n-esbuild.mjs'

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const rootRequire = createRequire(path.resolve(pkgRoot, '../../../package.json'))
let lib

before(async () => {
  const built = await rootRequire('esbuild').build({
    stdin: {
      contents: `export { AppStatisticOverview } from './AppStatisticOverview'; export { AppStatisticRecords } from './AppStatisticRecords'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server'`,
      resolveDir: path.join(pkgRoot, 'src/beta'),
      loader: 'tsx'
    },
    absWorkingDir: pkgRoot,
    bundle: true,
    plugins: [opsI18nPlugin()],
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    loader: { '.css': 'empty', '.svg': 'empty', '.png': 'empty' },
    external: ['react', 'react/jsx-runtime', 'react-dom/server'],
    write: false,
    logLevel: 'silent'
  })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(require, module, module.exports)
  lib = module.exports
})

function render(
  view,
  partialEnd = false,
  compare = true,
  activityAvailable = false,
  currentValue = 5,
  desktopGrowth = null
) {
  const previousWindow = globalThis.window
  globalThis.window = { location: new URL('https://preview.test/ops/app-statistic') }
  const totals = (value) => ({
    activeAppUsers: value,
    users: value,
    downloads: value,
    installs: value,
    quickstarts: value,
    linkedInstalls: value,
    unlinkedInstalls: value
  })
  const report = {
    view,
    activityAvailable,
    activityMinimumVersion: '0.6.1',
    summary: totals(currentValue),
    analytics: {
      desktopGrowth,
      previous: totals(13),
      daily: [{ day: '2026-10-22', ...totals(5) }],
      previousDaily: [{ day: '2026-10-21', ...totals(13) }],
      range: { start: '2026-10-21T17:00:00Z', end: '2026-10-22T17:00:00Z', partialEnd }
    }
  }
  try {
    return lib.renderToStaticMarkup(lib.createElement(lib.AppStatisticOverview, { report, compare }))
  } finally {
    globalThis.window = previousWindow
  }
}

test('A-M1 latest-state people and app copies disclose mutable history without favorable growth comparisons', () => {
  for (const view of ['users', 'installs']) {
    const html = render(view)
    assert.match(html, /People in current records/)
    assert.match(html, /Latest connection distribution/)
    assert.match(html, /aria-label="App connections and opens"/)
    assert.match(html, /Connections are update checks. App opens are counted separately./)
    assert.match(html, /Latest-state comparison/)
    assert.doesNotMatch(html, /; favorable|; unfavorable/)
    assert.match(html, /latest-state account union/)
    assert.match(html, /Previous records by day/)
  }
})

test('A-M2 incomplete request periods disclose partial versus full comparison and stay neutral', () => {
  for (const view of ['downloads', 'quickstarts']) {
    const html = render(view, true)
    assert.match(html, /Partial vs full period/)
    assert.match(html, /This period is still in progress; the previous one is complete/)
    assert.doesNotMatch(html, /; favorable|; unfavorable/)
    assert.match(html, /Day in progress/)
  }
})

test('complete request periods retain comparisons while comparison-off hides their disclosure', () => {
  assert.match(render('downloads'), /; unfavorable/)
  assert.doesNotMatch(render('downloads'), /Partial vs full period/)
  assert.doesNotMatch(render('downloads', true, false), /Partial vs full period/)
})

test('foreground activity KPI is hidden until the filter scope has opening records', () => {
  const unavailable = render('users')
  assert.doesNotMatch(unavailable, /Active app users/)
  assert.doesNotMatch(unavailable, /No data yet/)
  const tracked = render('users', false, true, true)
  assert.doesNotMatch(tracked, /No data yet/)
  const zero = render('users', false, true, true, 0)
    .split('data-signal-tile="Active app users"')[1]
    .split('data-signal-tile=')[0]
  assert.match(zero, /0 people \/ app copies recorded/)
  assert.doesNotMatch(zero, /No data yet/)
  const tile = tracked.split('data-signal-tile="Active app users"')[1].split('data-signal-tile=')[0]
  assert.match(tile, /5<small>people \/ app copies/)
  assert.match(tile, /Down 8; unfavorable/)
  assert.match(tile, /vs 13 previous/)
  assert.match(tile, /Distinct people \/ app copies each day, may repeat/)
  assert.match(tile, /same account count once/)
  assert.match(tile, /Background update checks do not count/)
  assert.doesNotMatch(tile, /Latest-state comparison/)
  assert.doesNotMatch(
    render('users', false, false, true)
      .split('data-signal-tile="Active app users"')[1]
      .split('data-signal-tile=')[0],
    /vs 13 previous/
  )
})

function records(activityAvailable, daysUsed = 0, lastOpened = null) {
  const previousWindow = globalThis.window
  globalThis.window = { location: new URL('https://preview.test/ops/app-statistic') }
  try {
    return lib.renderToStaticMarkup(
      lib.createElement(lib.AppStatisticRecords, {
        report: {
          view: 'users',
          activityAvailable,
          activityMinimumVersion: '0.6.1',
          rows: [
            {
              id: 'person',
              userId: 'person',
              name: 'Mia',
              email: 'mia@example.com',
              versions: [],
              installs: 1,
              downloads: 0,
              attention: 0,
              daysUsed,
              lastOpened
            }
          ]
        },
        loading: false,
        error: null,
        selected: null,
        remote: {
          total: 1,
          page: 1,
          pageSize: 10,
          pages: 1,
          sort: 'lastOpened',
          direction: 'desc',
          onChange: () => {}
        },
        onSelect: () => {},
        jump: () => null,
        link: () => null,
        timeCell: (time) =>
          time
            ? lib.createElement('time', { dateTime: time, title: '22 Oct 2026, 10:00:00 UTC+7' }, '5 min ago')
            : null
      })
    )
  } finally {
    globalThis.window = previousWindow
  }
}

test('people activity columns are hidden without scoped opens and remain sortable when measured', () => {
  const unavailable = records(false)
  assert.doesNotMatch(unavailable, /Last opened/)
  assert.doesNotMatch(unavailable, /Days used/)
  assert.doesNotMatch(unavailable, /No data yet/)
  const empty = records(true)
  assert.match(empty, /No recorded opens/)
  assert.doesNotMatch(empty, /No data yet/)
  const tracked = records(true, 3, '2026-10-22T03:00:00.000Z')
  assert.match(tracked, /dateTime="2026-10-22T03:00:00.000Z"/)
  assert.match(tracked, /title="22 Oct 2026, 10:00:00 UTC\+7"/)
  assert.match(tracked, /5 min ago/)
  assert.match(tracked, /UTC\+7 calendar days/)
  assert.match(tracked, /aria-sort="descending"/)
  assert.match(tracked, />3<\/td>/)
})

test('anonymous downloads do not present account counts or per-person download KPIs', () => {
  assert.doesNotMatch(render('downloads'), /People requesting app downloads/)
  assert.doesNotMatch(render('users'), /Account app download requests/)
})

test('future opening panels are absent until scoped records exist; current copy analysis stays', () => {
  const growth = {
    unit: 'app copies',
    distributionTotal: 0,
    distribution: [],
    funnel: { copies: 0, signedIn: 0, opened: 0 },
    openedCopiesOutsideConnections: 0,
    activityCollectionStart: null,
    newCopies: [],
    adoption: []
  }
  const hidden = render('users', false, true, false, 0, growth)
  assert.doesNotMatch(hidden, /data-app-funnel|data-app-adoption|No app opening data|No recorded opens/)
  assert.match(hidden, /data-app-new-copies/)
  assert.match(hidden, /data-app-distribution/)
  const shown = render('users', false, true, true, 1, growth)
  assert.match(shown, /data-app-funnel/)
  assert.match(shown, /data-app-adoption/)
})
