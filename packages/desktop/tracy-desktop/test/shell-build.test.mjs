/**
 * The window shell bundles from shell/ and the dsh submodule's desktop sources. This is where a dsh
 * upgrade that renames or moves what shell/*.ts imports turns red, before anyone packages the app.
 *
 *   node --test packages/desktop/tracy-desktop/test/shell-build.test.mjs
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = mkdtempSync(path.join(tmpdir(), 'tracy-desktop-shell-'))
after(() => rmSync(out, { recursive: true, force: true }))
execFileSync(process.execPath, [path.join(PKG, 'build/build-shell.mjs'), out], { stdio: 'pipe' })

const requires = (file) => [
  ...new Set(
    [...readFileSync(path.join(out, file), 'utf8').matchAll(/require\("([^"]+)"\)/g)].map((match) => match[1])
  )
]

test('the preload is one file that requires only electron, as a sandboxed preload must', () => {
  assert.deepEqual(requires('shell-preload.cjs'), ['electron'])
})

test("the preload carries dsh's platform mark and shortcut bridge", () => {
  const source = readFileSync(path.join(out, 'shell-preload.cjs'), 'utf8')
  assert.match(source, /dataset\.platform = process\.platform/)
  assert.match(source, /dsh-desktop:shortcuts-input/)
  assert.match(source, /dsh-desktop:native-theme-set/)
})

test('the preload asks dsh for the kept rail and the integrated chrome row, on macOS only', () => {
  // Which platform gets `integratedChrome` is test/window-chrome.test.mjs; here, that the marks hang off it.
  const source = readFileSync(path.join(out, 'shell-preload.cjs'), 'utf8')
  const darwin = source.slice(source.indexOf('if (marks.integratedChrome) {'))
  assert.notEqual(source.indexOf('if (marks.integratedChrome) {'), -1)
  assert.match(darwin, /setAttribute\("data-desktop-sidebar-rail", ""\)/)
  assert.match(darwin, /setAttribute\("data-desktop-chrome", "integrated"\)/)
})

test("the preload carries dsh's Windows caption row, started for the product page on Windows only", () => {
  const source = readFileSync(path.join(out, 'shell-preload.cjs'), 'utf8')
  assert.match(source, /dataset\.windowsTitlebar = ""/)
  assert.match(source, /--dsh-windows-titlebar-height/)
  assert.match(source, /dsh-desktop:windows-appearance/)
  assert.match(source, /if \(marks\.windowsCaption && product\) \{\s*syncWindowsAppearance\(\);/)
})

test('on Windows the preload has dsh measure the palette again when the colour scheme changes', () => {
  // Tracy's server-rendered pages change theme through prefers-color-scheme alone, which dsh's
  // caption row does not watch; dsh does watch <head>, so the preload nudges it there.
  const source = readFileSync(path.join(out, 'shell-preload.cjs'), 'utf8')
  const windows = source.slice(source.indexOf('if (marks.windowsCaption && product) {'))
  assert.match(windows, /matchMedia\("\(prefers-color-scheme: dark\)"\)\.addEventListener\("change"/)
  // ...and dsh still watches <head> for that nudge.
  const dsh = readFileSync(
    path.resolve(PKG, '../../../vendor/tracy/deepseek-harness/apps/desktop/src/preload-windows.ts'),
    'utf8'
  )
  assert.ok(
    dsh.includes('observer.observe(document.head, { childList: true, subtree: true, characterData: true })')
  )
})

test('dsh still clears its Windows caption row off the mark the preload sets', () => {
  // A dsh upgrade that renames the mark leaves the overlay buttons over the page's first row.
  const client = path.resolve(PKG, '../../../vendor/tracy/deepseek-harness/packages/client')
  const css = readFileSync(path.join(client, 'ui-layout/src/client/AppFrame.module.css'), 'utf8')
  assert.ok(css.includes(':global([data-windows-titlebar]) .frame {'))
  assert.ok(css.includes('padding-top: var(--dsh-windows-titlebar-height);'))
})

test("the main half answers dsh's caption row: its palette and its menus", () => {
  const source = readFileSync(path.join(out, 'shell-main.cjs'), 'utf8')
  assert.match(source, /dsh-desktop:windows-appearance/)
  assert.match(source, /dsh-desktop:windows-menu/)
  assert.match(source, /WINDOWS_TITLEBAR_HEIGHT = 40/)
})

test("dsh still answers the integrated chrome mark the preload sets, and Tracy's rail follows it", () => {
  // A dsh upgrade that drops the Tracy fork patch leaves the mark answered by nothing: the app falls
  // back to columns whose borders cross the traffic lights, with no error anywhere.
  const MODE = ":global(html[data-platform='darwin'][data-desktop-chrome='integrated'])"
  const client = path.resolve(PKG, '../../../vendor/tracy/deepseek-harness/packages/client')
  const sheets = {
    'ui-layout/src/client/AppFrame.module.css': [
      `${MODE} {`,
      `${MODE} .centerCol::before {`,
      '--dsh-chrome-height: 44px;'
    ],
    'ui-conversation/src/client/skeleton/ConversationRoot.module.css': [`${MODE} .root {`],
    'ui-dockkit/src/components/dockkit.module.css': [`${MODE} .tabHost:not(.float) .tabStrip {`],
    'ui-sidebar-right/src/client/shell/SidebarRight.module.css': [
      `${MODE} .panel[data-sidebar-right-panel='fullscreen']`
    ]
  }
  for (const [file, needles] of Object.entries(sheets)) {
    const css = readFileSync(path.join(client, file), 'utf8')
    for (const needle of needles) assert.ok(css.includes(needle), `${file}: ${needle}`)
  }
  const rail = readFileSync(path.resolve(PKG, '../../ui/tracy-sidebar/src/client/styles.ts'), 'utf8')
  assert.match(
    rail,
    /html\[data-platform='darwin'\]\[data-desktop-chrome='integrated'\] \.tsb-root \{ background: transparent; border-inline-end-width: 0; \}/
  )
})

test("the main half bundles dsh's shortcut installer with nothing but electron and node built-ins outside", () => {
  for (const name of requires('shell-main.cjs'))
    assert.ok(name === 'electron' || name.startsWith('node:'), name)
  const source = readFileSync(path.join(out, 'shell-main.cjs'), 'utf8')
  assert.match(source, /function installDesktopShortcuts\(/)
  assert.match(source, /keybindings\.json/)
})

test('no absolute path of the machine that built it ends up in the bundles', () => {
  for (const file of ['shell-main.cjs', 'shell-preload.cjs'])
    assert.equal(readFileSync(path.join(out, file), 'utf8').includes(PKG), false, file)
})

test("the preload gives the page Tracy's link bridge, and the main half answers it on the same channels", () => {
  const preload = readFileSync(path.join(out, 'shell-preload.cjs'), 'utf8')
  const main = readFileSync(path.join(out, 'shell-main.cjs'), 'utf8')
  assert.match(preload, /exposeInMainWorld\("tracyDesktop"/)
  for (const channel of ['links-ready', 'links-ask', 'links-answer', 'links-execute', 'open-external']) {
    assert.ok(preload.includes(`tracy-desktop:${channel}`), `preload: ${channel}`)
    assert.ok(main.includes(`tracy-desktop:${channel}`), `main: ${channel}`)
  }
  assert.match(main, /function installLinks\(/)
})

test('electron-updater is bundled whole: outside the bundle only electron and node built-ins', () => {
  const builtins = new Set(builtinModules)
  const names = requires('electron-updater.cjs')
  assert.ok(names.length > 0)
  for (const name of names) assert.ok(name === 'electron' || builtins.has(name.replace(/^node:/, '')), name)
  const source = readFileSync(path.join(out, 'electron-updater.cjs'), 'utf8')
  assert.match(source, /MacUpdater\.filterFilesForArch/)
  assert.match(source, /x-user-staging-id/)
  assert.equal(source.includes(PKG), false)
})

test('the preload carries the update bridge, on the same product-only frame as the links bridge', () => {
  const source = readFileSync(path.join(out, 'shell-preload.cjs'), 'utf8')
  for (const channel of [
    'tracy-desktop:app-info',
    'tracy-desktop:update-state',
    'tracy-desktop:update-set-auto-check'
  ])
    assert.ok(source.includes(channel), channel)
  assert.match(
    source,
    /if \(product\)\s*import_electron\d*\.contextBridge\.exposeInMainWorld\("tracyDesktop", \{\s*protocolVersion: PROTOCOL_VERSION,\s*window: \{ role \},\s*links: createLinksApi\(\),\s*app: createAppApi\(\)\s*\}\)/
  )
})

test('the preload gives dsh the OS languages and the picked language as __DSH_LOCALE__', () => {
  const source = readFileSync(path.join(out, 'shell-preload.cjs'), 'utf8')
  assert.match(source, /exposeInMainWorld\("__DSH_LOCALE__"/)
  assert.match(source, /tracy-desktop:locale-languages/)
  assert.match(source, /tracy_lang/)
})

test('the preload carries the notification status push (onChange)', () => {
  const source = readFileSync(path.join(out, 'shell-preload.cjs'), 'utf8')
  assert.match(source, /NOTIFY_CHANNELS\.changed/)
})

test('the preload carries the Website Opportunities push (websiteOpportunities.onOpen) inside the app API', () => {
  const source = readFileSync(path.join(out, 'shell-preload.cjs'), 'utf8')
  assert.match(source, /WEBSITE_OPPORTUNITIES_CHANNELS\.open/)
  assert.match(source, /websiteOpportunities: \{\s*onOpen\(/)
})

test('the main half takes the Website Opportunities menu state into the menus it builds', () => {
  const source = readFileSync(path.join(out, 'shell-main.cjs'), 'utf8')
  assert.equal(source.match(/websiteOpportunities: websiteOpportunities\?\.\(\)/g)?.length, 2)
})
