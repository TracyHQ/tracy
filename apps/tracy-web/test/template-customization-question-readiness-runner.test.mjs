/**
 * Template Customization Question Readiness, the tooling that runs the check over every release
 * Design inspiration shows (no network): which GitHub releases a `GET /api/templates` answer names
 * (`gallery-cache.js`), which assets of a release the cache needs, and the table the `--all`
 * runner prints (`readiness-table.js`).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  contentAssetsOf,
  galleryReleases,
  isSmallAsset,
  themeZipOf
} from '../src/lib/template-customization-question-readiness/gallery-cache.js'
import { themeZipsInOrder } from '../src/lib/template-customization-question-readiness/readers/theme-zips.js'
import {
  buildReadinessTable,
  renderReadinessTable
} from '../src/lib/template-customization-question-readiness/readiness-table.js'
import { templateCards } from '../src/lib/quickstart-releases.js'

/** A readable release as `readReleases` returns it, enough for `templateCards`. */
const release = (tag, platform, template, version) => ({
  tag,
  platform,
  choosable: true,
  inspirationHidden: false,
  inspiration: { template },
  setting: { label: template, version, template }
})

test('the tag of a gallery card is the release tag templateCards wrote, local packs left out', () => {
  const cards = templateCards([
    release('tracy-business/j6', 'joomla', 'tracy-business', '1.2.1'),
    release('tracy-business/emdash-0.x', 'emdash', 'tracy-business', '1.7.2'),
    release('quickstart/ja-voyara/j6', 'joomla', 'ja-voyara', '1.0.4'),
    { ...release('local/ja-new/j6', 'joomla', 'ja-new', '0.1.0'), local: { dir: '/x' } }
  ])
  const { releases, skipped } = galleryReleases({ templates: cards })
  assert.deepEqual(releases, [
    { template: 'tracy-business', platform: 'joomla', version: '1.2.1', tag: 'tracy-business/j6' },
    { template: 'tracy-business', platform: 'emdash', version: '1.7.2', tag: 'tracy-business/emdash-0.x' },
    { template: 'ja-voyara', platform: 'joomla', version: '1.0.4', tag: 'quickstart/ja-voyara/j6' }
  ])
  assert.equal(skipped.length, 1)
  assert.match(skipped[0], /local\/ja-new\/j6/)
})

test('a tag that is not a release tag never reaches gh', () => {
  const { releases, skipped } = galleryReleases({
    templates: [{ id: 'x', platforms: [{ platform: 'joomla', tag: '--repo=evil/j6', version: '1' }] }]
  })
  assert.deepEqual(releases, [])
  assert.equal(skipped.length, 1)
})

test('the cache takes the small assets and only the content the readers open', () => {
  assert.ok(isSmallAsset('tracy_setting.json') && isSmallAsset('SHA256SUMS'))
  assert.ok(!isSmallAsset('ja-impact-wp7-database-1.0.7.sql.gz'))
  const wp = {
    platform: 'wordpress',
    version: '1.0.7',
    install: { webroot: { file: 'w.tar.gz' }, database: { file: 'd-1.0.7.sql.gz' } }
  }
  const names = [
    'w.tar.gz',
    'd-1.0.6.sql.gz',
    'd-1.0.7.sql.gz',
    'wp-ja-impact.zip',
    'wp-ja-impact-1.0.6.zip',
    'wp-ja-impact-1.0.7.zip'
  ]
  assert.deepEqual(contentAssetsOf(wp, names), ['d-1.0.7.sql.gz', 'wp-ja-impact-1.0.7.zip'])
  assert.deepEqual(contentAssetsOf({ ...wp, version: '9.9.9' }, names), [
    'd-1.0.7.sql.gz',
    'wp-ja-impact.zip'
  ])
  assert.deepEqual(contentAssetsOf(wp, names, { withWebroot: true }), [
    'd-1.0.7.sql.gz',
    'w.tar.gz',
    'wp-ja-impact-1.0.7.zip'
  ])
  const joomla = { platform: 'joomla', version: '1.0.0', install: { installer: { file: 'q.zip' } } }
  assert.deepEqual(contentAssetsOf(joomla, ['q.zip', 'other.zip']), ['q.zip'])
  const emdash = {
    platform: 'emdash',
    version: '1.7.2',
    install: { source: { file: 's.zip' }, state: { file: 't.tar.gz' } }
  }
  assert.deepEqual(contentAssetsOf(emdash, ['s.zip', 't.tar.gz']), ['s.zip'])
})

/**
 * JA Morgan WordPress 1.1.12 and JA Kinetic WordPress 1.0.7 (12/10/2026): the theme zip carries the
 * THEME's version (manifest.json theme.version 1.1.11 and 1.1.9), not the release's, so no zip is
 * named after the release version. The server downloaded no theme zip and, since the release has
 * some wp-*.zip, no webroot either, and nine rules failed with "the release carries no theme zip and
 * no webroot", while the same check on a full download read the newest zip and passed them.
 */
test('the server downloads the theme zip the readers open first, even when no zip carries the release version', () => {
  const morgan = {
    platform: 'wordpress',
    version: '1.1.12',
    template: 'ja-morgan',
    install: {
      webroot: { file: 'ja-morgan-wp7-webroot-1.1.12.tar.gz' },
      database: { file: 'ja-morgan-wp7-database-1.1.12.sql.gz' }
    }
  }
  const names = [
    'ja-morgan-wp7-database-1.1.12.sql.gz',
    'ja-morgan-wp7-webroot-1.1.12.tar.gz',
    'wp-ja-morgan-1.1.2.zip',
    'wp-ja-morgan-1.1.10.zip',
    'wp-ja-morgan-1.1.11.zip',
    'wp-ja-morgan-1.1.9.zip'
  ]
  assert.equal(themeZipOf(morgan, names), 'wp-ja-morgan-1.1.11.zip')
  assert.deepEqual(contentAssetsOf(morgan, names), [
    'ja-morgan-wp7-database-1.1.12.sql.gz',
    'wp-ja-morgan-1.1.11.zip'
  ])
  // A release with no theme zip at all has none to pick: the caller downloads the webroot instead.
  assert.equal(
    themeZipOf(
      morgan,
      names.filter((n) => !n.endsWith('.zip'))
    ),
    null
  )
  // The pick is always the zip the readers open first, whatever the names.
  const shapes = [
    names,
    ['wp-ja-impact.zip', 'wp-ja-impact-1.0.6.zip', 'wp-ja-impact-1.0.7.zip'],
    ['wp-tracy-business-1.1.6.zip', 'wp-tracy-business.zip', 'claude-cowork-0.14.3.zip'],
    ['wp-ja-kinetic-1.0.0.zip', 'wp-ja-kinetic-1.1.9.zip', 'wp-ja-kinetic-1.1.2.zip']
  ]
  for (const shape of shapes)
    for (const version of ['1.0.7', '1.1.12', '1.3.4']) {
      const setting = { ...morgan, version, template: shape[0].replace(/^wp-|(-[\d.]+)?\.zip$/g, '') }
      assert.equal(
        themeZipOf(setting, shape),
        themeZipsInOrder(shape, `wp-${setting.template}`, version)[0] ?? null,
        `${shape.join(' ')} @ ${version}`
      )
    }
})

/**
 * Tracy Base WordPress names its theme zips after the theme alone, with no wp- prefix
 * (tracy-base-1.1.5.zip in release 1.1.2, 12/10/2026), so the readers skipped them and read the
 * 64 MB webroot instead, and the server downloaded it for nothing.
 */
test('a theme zip named after the theme without wp- is a theme zip too; a plugin zip never is', () => {
  const names = [
    'tracy-base-0.1.0.zip',
    'tracy-base-1.1.0.zip',
    'tracy-base-1.1.5.zip',
    'tracy-base-1.1.1.zip',
    'claude-cowork-0.14.3.zip',
    'tracy-base-wp7-webroot-1.1.2.tar.gz'
  ]
  const setting = { platform: 'wordpress', version: '1.1.2', template: 'tracy-base', install: {} }
  assert.equal(themeZipOf(setting, names), 'tracy-base-1.1.5.zip')
  assert.deepEqual(themeZipsInOrder(names, 'tracy-base', '1.1.2'), [
    'tracy-base-1.1.5.zip',
    'tracy-base-1.1.1.zip',
    'tracy-base-1.1.0.zip',
    'tracy-base-0.1.0.zip'
  ])
  assert.equal(themeZipsInOrder(names, 'tracy-base', '1.1.5')[0], 'tracy-base-1.1.5.zip')
})

const result = (id, status, extra = {}) => ({
  id,
  status,
  message: `${id} ${status}`,
  fix: null,
  owner: 'template',
  ...extra
})

test('the table has a column per rule id the reports carry, a later rule included', () => {
  const table = buildReadinessTable([
    {
      tag: 'tracy-business/j6',
      template: 'tracy-business',
      report: {
        template: 'tracy_business',
        cms: 'joomla',
        version: '1.2.1',
        results: [result('REL-2', 'fail', { fix: 'Upload the list again.' }), result('NAME-1', 'live-only')]
      }
    },
    {
      tag: 'tracy-business/emdash-0.x',
      report: {
        template: 'tracy-business',
        cms: 'emdash',
        version: '1.7.2',
        results: [result('REL-2', 'pass'), result('NEW-9', 'not-applicable')]
      }
    },
    { tag: 'quickstart/ja-broken/j6', error: 'no tracy_setting.json' }
  ])
  assert.deepEqual(table.ruleIds, ['REL-2', 'NAME-1', 'NEW-9'])
  assert.deepEqual(table.rows[0].cells, { 'REL-2': 'fail', 'NAME-1': 'live-only' })
  assert.equal(table.rows[0].template, 'tracy-business')
  assert.equal(table.rows[1].template, 'tracy-business')
  assert.equal(table.rows[2].error, 'no tracy_setting.json')

  const md = renderReadinessTable(table)
  const lines = md.split('\n')
  assert.equal(lines[0], '| template | cms | version | tag | REL-2 | NAME-1 | NEW-9 |')
  assert.equal(lines[2], '| tracy-business | joomla | 1.2.1 | tracy-business/j6 | fail | live-only |  |')
  assert.equal(lines[3], '| tracy-business | emdash | 1.7.2 | tracy-business/emdash-0.x | pass |  | n-a |')
  assert.equal(lines[4], '| ? | ? | ? | quickstart/ja-broken/j6 | error | error | error |')
  assert.ok(md.includes('- REL-2: 1 pass, 1 fail, 0 live-only, 0 n-a'))
  assert.ok(
    md.includes('**tracy-business/j6** REL-2 (owner: template): REL-2 fail Fix: Upload the list again.')
  )
  assert.ok(md.includes('**quickstart/ja-broken/j6**: could not be checked: no tracy_setting.json'))
})

test('a cell never breaks the Markdown table', () => {
  const md = renderReadinessTable(
    buildReadinessTable([
      { tag: 'a/j6', report: { template: 'x|y', cms: 'joomla', version: '1\n2', results: [] } }
    ])
  )
  assert.equal(md.split('\n')[2], '| x\\|y | joomla | 1 2 | a/j6 |')
})
