/**
 * `?settings=<name>[&vendor=<id>]` (`src/client/settings-link.ts`): which section an address opens,
 * which vendor's row the AI accounts section should bring into view, and that both parameters are
 * spent on arrival (stripped from the address, every other parameter kept).
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
let outDir = ''
/** @type {any} */
let lib

before(async () => {
  outDir = mkdtempSync(path.join(tmpdir(), 'ts-settings-link-'))
  const outfile = path.join(outDir, 'link.cjs')
  await require('esbuild').build({
    entryPoints: [path.join(here, '..', 'src', 'client', 'settings-link.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile,
    logLevel: 'silent'
  })
  lib = require(outfile)
})

after(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

function take(search, hash = '') {
  const replaced = []
  const history = { state: null, replaceState: (_state, _title, url) => replaced.push(url) }
  const asked = lib.takeSettingsLink({ pathname: '/site/', search, hash }, history)
  return { asked, replaced }
}

test('?settings=ai-accounts opens the AI accounts section', () => {
  assert.equal(lib.sectionFromSearch('?settings=ai-accounts'), 'tracy-model-plan')
  const { asked, replaced } = take('?settings=ai-accounts')
  assert.deepEqual(asked, { section: 'tracy-model-plan', vendor: null })
  assert.deepEqual(replaced, ['/site/'])
})

test('a vendor rides along with the section and is stripped with it', () => {
  const { asked, replaced } = take('?settings=ai-accounts&vendor=copilot&tab=tracy:inbox', '#x')
  assert.deepEqual(asked, { section: 'tracy-model-plan', vendor: 'copilot' })
  assert.deepEqual(replaced, ['/site/?tab=tracy:inbox#x'])
})

test('a vendor id outside ^[a-z][a-z0-9-]*$ is dropped, the section still opens', () => {
  for (const bad of ['Copilot', '1abc', 'a_b', '', 'a b', '-x', 'x/../y', '<script>']) {
    const { asked } = take(`?settings=ai-accounts&vendor=${encodeURIComponent(bad)}`)
    assert.deepEqual(asked, { section: 'tracy-model-plan', vendor: null }, bad)
  }
  assert.equal(lib.vendorFromSearch('?vendor=kimi-2'), 'kimi-2')
  assert.equal(lib.vendorFromSearch('?vendor=Kimi'), null)
})

test('vendor without settings is left alone; settings without a known section opens nothing', () => {
  const alone = take('?vendor=copilot')
  assert.equal(alone.asked, null)
  assert.deepEqual(alone.replaced, [], 'an address without settings is not rewritten')
  const unknown = take('?settings=nope&vendor=copilot')
  assert.equal(unknown.asked, null)
  assert.deepEqual(unknown.replaced, ['/site/'], 'both parameters are spent')
})

test('the existing sections still resolve, with no vendor', () => {
  assert.deepEqual(take('?settings=notifications').asked, { section: 'tracy-notifications', vendor: null })
  assert.deepEqual(take('?settings=help').asked, { section: 'tracy-help-about', vendor: null })
  assert.equal(lib.withoutSettingsParam('?settings=help&vendor=x&a=1'), '?a=1')
})

test('Settings hands the asked vendor to the asked section only', async () => {
  const coreModules = path.resolve(here, '..', '..', '..', 'core', 'tracy-core', 'node_modules')
  const outfile = path.join(outDir, 'page.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        import { createElement } from 'react'
        import { renderToStaticMarkup } from 'react-dom/server'
        import { SettingsPage } from './index'
        export function page(rows, activeId, asked) {
          const renderSlot = (name, props, options) =>
            createElement('i', {
              'data-rendered': name + (options && options.only ? ':' + options.only : ''),
              'data-vendor': props && props.vendor ? props.vendor : 'none'
            })
          return renderToStaticMarkup(
            createElement(SettingsPage, {
              t: (key) => key, renderSlot, rows, activeId, asked, onSelect: () => {}, onClose: () => {}
            })
          )
        }
      `,
      resolveDir: path.join(here, '..', 'src', 'client'),
      loader: 'tsx'
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    nodePaths: [coreModules],
    define: { __TAILWIND_CSS__: '""' },
    outfile,
    logLevel: 'silent'
  })
  const { page } = require(outfile)
  const rows = [
    { id: 'tracy-model-plan', order: 21, label: 'AI accounts', group: 'user' },
    { id: 'tracy-notifications', order: 22, label: 'Notifications', group: 'user' }
  ]
  const asked = { section: 'tracy-model-plan', vendor: 'copilot' }
  assert.match(
    page(rows, 'tracy-model-plan', asked),
    /data-rendered="settings.section:tracy-model-plan" data-vendor="copilot"/
  )
  assert.match(
    page(rows, 'tracy-notifications', asked),
    /data-rendered="settings.section:tracy-notifications" data-vendor="none"/
  )
  assert.match(page(rows, 'tracy-model-plan', undefined), /data-vendor="none"/)
})

// ── a request from the app to open a section (desktop: a notification, Help › What's New…) ───────

test('a request made before Settings listens waits, and is delivered once when it starts listening', () => {
  const requests = lib.createSectionRequests()
  requests.ask('tracy-help-about')
  const got = []
  const off = requests.register((id) => got.push(id))
  assert.deepEqual(got, ['tracy-help-about'])
  off()
  // Spent: a second listener does not open it again.
  const again = []
  requests.register((id) => again.push(id))()
  assert.deepEqual(again, [])
})

test('a request while Settings listens goes straight to it; after it stops, the next one waits', () => {
  const requests = lib.createSectionRequests()
  const got = []
  const off = requests.register((id) => got.push(id))
  requests.ask('tracy-help-about')
  requests.ask('tracy-help-about')
  assert.deepEqual(got, ['tracy-help-about', 'tracy-help-about'])
  off()
  requests.ask('tracy-notifications')
  assert.deepEqual(got, ['tracy-help-about', 'tracy-help-about'])
  const later = []
  requests.register((id) => later.push(id))
  assert.deepEqual(later, ['tracy-notifications'])
})
