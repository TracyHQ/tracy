import assert from 'node:assert/strict'
import { test } from 'node:test'
import { appStatisticListUrl } from '../src/beta/app-statistic-api.ts'
import { appStatus, cmsLabel, releaseTypeLabel, sourceLabel } from '../src/beta/app-statistic-copy.ts'
import { en } from '../src/i18n/ns/appstat.ts'
import { translate } from '../src/i18n/translator.ts'
import {
  defaultAppStatisticState,
  readAppStatisticState,
  saveAppStatisticState,
  shouldResetAppStatisticDaily
} from '../src/beta/app-statistic-state.ts'

function browser(href, run) {
  const previous = globalThis.window
  const entries = [new URL(href)]
  let index = 0
  globalThis.window = {
    get location() {
      return entries[index]
    },
    history: {
      pushState(_state, _title, url) {
        entries.splice(++index)
        entries.push(new URL(url))
      },
      back() {
        index = Math.max(0, index - 1)
      }
    }
  }
  try {
    run(globalThis.window)
  } finally {
    globalThis.window = previous
  }
}

test('people default to app contact while other tabs retain request or connection time', () => {
  for (const view of ['users', 'downloads', 'installs', 'quickstarts']) {
    browser(`https://preview.test/ops/app-statistic?view=${view}`, () => {
      const state = readAppStatisticState()
      assert.equal(state.sort, view === 'users' ? 'lastAppContact' : 'time')
      assert.equal(state.direction, 'desc')
    })
  }
  browser('https://preview.test/ops/app-statistic?view=users&sort=time', () => {
    assert.equal(readAppStatisticState().sort, 'time')
  })
})

const t = (key, params) => translate('en', {}, en, key, params)

test('person status distinguishes app contact from requests without claiming completed downloads', () => {
  assert.equal(
    appStatus({ installs: 0, downloads: 0, lastOpened: '2026-10-22T03:00:00Z', daysUsed: 1 }, t),
    'Opened app'
  )
  assert.equal(appStatus({ installs: 1, downloads: 0 }, t), 'Signed in to app')
  assert.equal(appStatus({ installs: 0, downloads: 0, quickstarts: 2 }, t), 'Template requests only')
  assert.equal(sourceLabel({ source: null }, t), 'Unknown')
  assert.equal(sourceLabel({ source: { source: 'joomlart', medium: 'email' } }, t), 'joomlart · email')
  assert.equal(sourceLabel({ source: { source: 'email', medium: 'email' } }, t), 'email')
})

test('values the server sends show as sent; only missing ones are worded', () => {
  assert.equal(cmsLabel('j6', t), 'Joomla 6')
  assert.equal(cmsLabel('drupal', t), 'drupal')
  assert.equal(cmsLabel(null, t), 'Not recorded')
  assert.equal(releaseTypeLabel('stable', t), 'Public')
  assert.equal(releaseTypeLabel('nightly', t), 'nightly')
  assert.equal(releaseTypeLabel(undefined, t), 'Not recorded')
})

test('custom date filters, record selection, table state and comparison survive URL reload and Back', () => {
  browser('https://preview.test/ops/app-statistic?view=downloads&days=7&keep=other', (window) => {
    const first = readAppStatisticState()
    const changed = {
      ...first,
      days: 'custom',
      start: '2026-10-01',
      end: '2026-10-03',
      q: 'mac app',
      version: '1.0.2',
      channel: 'dev',
      platform: 'macos',
      source: 'newsletter',
      account: 'linked',
      attention: true,
      sort: 'platform',
      direction: 'asc',
      page: 2,
      pageSize: 25,
      user: '11111111-1111-4111-8111-111111111111',
      selected: 'download-42',
      compare: false
    }
    saveAppStatisticState(changed)
    const reloaded = readAppStatisticState()
    assert.equal(reloaded.q, 'mac app')
    assert.equal(reloaded.view, 'downloads')
    assert.equal(reloaded.days, 'custom')
    assert.equal(reloaded.start, '2026-10-01')
    assert.equal(reloaded.end, '2026-10-03')
    assert.equal(reloaded.selected, 'download-42')
    assert.equal(reloaded.compare, false)
    assert.equal(reloaded.page, 2)
    assert.equal(reloaded.pageSize, 25)
    assert.equal(reloaded.sort, 'platform')
    assert.equal(reloaded.direction, 'asc')
    const query = new URL(appStatisticListUrl(reloaded), window.location).searchParams
    assert.equal(query.get('days'), null)
    assert.equal(query.get('q'), 'mac app')
    assert.equal(query.get('version'), '1.0.2')
    assert.equal(query.get('attention'), 'all')
    assert.equal(query.get('account'), 'all')
    assert.equal(window.location.searchParams.get('keep'), 'other')
    window.history.back()
    const restored = readAppStatisticState()
    assert.equal(restored.days, '7')
    assert.equal(restored.q, '')
    assert.equal(restored.selected, null)
    assert.equal(restored.page, 1)
  })
})

test('invalid pagination falls back safely while a partial date range remains visibly custom', () => {
  browser('https://preview.test/ops/app-statistic?view=invalid&page=-5&pageSize=999&start=2026-10-01', () => {
    const state = readAppStatisticState('quickstarts', 'initial-record')
    assert.equal(state.view, 'quickstarts')
    assert.equal(state.page, 1)
    assert.equal(state.pageSize, 10)
    assert.equal(state.days, 'custom')
    assert.equal(state.start, '2026-10-01')
    assert.equal(state.end, '')
    assert.equal(state.selected, 'initial-record')
  })
})

test('changing global scope resets the daily page while preserving page size, unrelated keys and Back history', () => {
  browser(
    'https://preview.test/ops/app-statistic?days=30&signals_app-daily_page=3&signals_app-daily_pageSize=25&keep=other',
    (window) => {
      const initial = readAppStatisticState()
      saveAppStatisticState({ ...initial, days: '7' }, true)
      assert.equal(window.location.searchParams.get('signals_app-daily_page'), '1')
      for (const id of ['app-funnel', 'app-platform', 'app-version', 'app-new-copies', 'app-adoption'])
        assert.equal(window.location.searchParams.get(`signals_${id}_page`), '1')
      assert.equal(window.location.searchParams.get('signals_app-daily_pageSize'), '25')
      assert.equal(window.location.searchParams.get('keep'), 'other')
      window.history.back()
      assert.equal(window.location.searchParams.get('signals_app-daily_page'), '3')
      assert.equal(readAppStatisticState().days, '30')
      saveAppStatisticState({ ...initial, page: 2 })
      assert.equal(window.location.searchParams.get('signals_app-daily_page'), '3')
    }
  )
})

test('view navigation and Reset reset daily pagination even when their patch restores table sort and page size', () => {
  browser(
    'https://preview.test/ops/app-statistic?view=downloads&days=30&signals_app-daily_page=2',
    (window) => {
      const current = readAppStatisticState()
      const navigation = { view: 'users', sort: 'time', direction: 'desc', q: '', account: 'all' }
      saveAppStatisticState({ ...current, ...navigation }, shouldResetAppStatisticDaily(navigation))
      assert.equal(window.location.searchParams.get('signals_app-daily_page'), '1')
      assert.equal(readAppStatisticState().view, 'users')
      window.history.back()
      assert.equal(window.location.searchParams.get('signals_app-daily_page'), '2')
      saveAppStatisticState(defaultAppStatisticState, shouldResetAppStatisticDaily(defaultAppStatisticState))
      assert.equal(window.location.searchParams.get('signals_app-daily_page'), '1')
      window.history.back()
      const sortOnly = { sort: 'platform', direction: 'asc' }
      saveAppStatisticState({ ...current, ...sortOnly }, shouldResetAppStatisticDaily(sortOnly))
      assert.equal(window.location.searchParams.get('signals_app-daily_page'), '2')
      const sizeOnly = { page: 1, pageSize: 25 }
      saveAppStatisticState({ ...current, ...sizeOnly }, shouldResetAppStatisticDaily(sizeOnly))
      assert.equal(window.location.searchParams.get('signals_app-daily_page'), '2')
    }
  )
})
