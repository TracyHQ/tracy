/**
 * Where a packaged app finds the files build/package.sh wrote into it (`origin`, `update-channel`,
 * `repo-path`, `app-update.yml`) on each operating system's install layout. The path flavour and the
 * folders are passed in, so the Windows layout is checked with Windows paths on any host.
 *
 *   node --test packages/desktop/tracy-desktop/test/bundle-layout.test.mjs
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { bundleLayout } = require('../src/bundle-layout.js')

test('macOS: the pinned files sit in Contents/Resources/app, the feed file in Contents/Resources', () => {
  const layout = bundleLayout({
    srcDir: '/Applications/Tracy Cowork.app/Contents/Resources/app/src',
    resourcesPath: '/Applications/Tracy Cowork.app/Contents/Resources',
    pathApi: path.posix
  })
  assert.equal(layout.pinnedFile('origin'), '/Applications/Tracy Cowork.app/Contents/Resources/app/origin')
  assert.equal(layout.appUpdateYml, '/Applications/Tracy Cowork.app/Contents/Resources/app-update.yml')
})

test('Windows: the pinned files sit in <install>\\resources\\app, the feed file in <install>\\resources', () => {
  const install = 'C:\\Users\\tester\\AppData\\Local\\Programs\\tracy-cowork'
  const layout = bundleLayout({
    srcDir: `${install}\\resources\\app\\src`,
    resourcesPath: `${install}\\resources`,
    pathApi: path.win32
  })
  assert.equal(layout.pinnedFile('origin'), `${install}\\resources\\app\\origin`)
  assert.equal(layout.pinnedFile('update-channel'), `${install}\\resources\\app\\update-channel`)
  assert.equal(layout.appUpdateYml, `${install}\\resources\\app-update.yml`)
})

test('Linux: the same, under the install folder (an AppImage mount or /opt)', () => {
  const layout = bundleLayout({
    srcDir: '/opt/Tracy Cowork/resources/app/src',
    resourcesPath: '/opt/Tracy Cowork/resources',
    pathApi: path.posix
  })
  assert.equal(layout.pinnedFile('repo-path'), '/opt/Tracy Cowork/resources/app/repo-path')
  assert.equal(layout.appUpdateYml, '/opt/Tracy Cowork/resources/app-update.yml')
})

test('a source run finds the repo four folders above src/, on either path flavour', () => {
  assert.equal(
    bundleLayout({
      srcDir: '/w/TCH/packages/desktop/tracy-desktop/src',
      resourcesPath: '/x',
      pathApi: path.posix
    }).sourceRepo,
    '/w/TCH'
  )
  assert.equal(
    bundleLayout({
      srcDir: 'D:\\w\\TCH\\packages\\desktop\\tracy-desktop\\src',
      resourcesPath: 'D:\\x',
      pathApi: path.win32
    }).sourceRepo,
    'D:\\w\\TCH'
  )
})
