/**
 * The desktop app on Windows (tasks/todo-desktop-windows.md §4 row F). dsh's frame collapses the left
 * column to zero width there (ui-layout AppFrame: no icon rail under html[data-windows-titlebar]) and
 * expects the column's own reopen control to stay in the 40px caption row. Tracy's column replaces
 * dsh's, so its rail's open button must take that seat — measured on the Windows VM 10/10/2026: a
 * collapsed column (every page load collapses it once) had no way back.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const read = (rel) => readFileSync(path.join(HERE, rel), 'utf8')

test("the rail's open button carries the caption-row class", () => {
  const rail = read('../src/client/rail.tsx')
  const open = rail.slice(
    rail.indexOf("aria-label={t('toggle.open')}") - 400,
    rail.indexOf("aria-label={t('toggle.open')}")
  )
  assert.match(open, /className="tsb-rail-open size-9"/)
})

test('under the Windows caption row the open button sits fixed in the seat dsh leaves free, and never drags', () => {
  const css = read('../src/client/styles.ts')
  const rule = /html\[data-windows-titlebar\] \.tsb-rail \.tsb-rail-open \{([^}]*)\}/.exec(css)
  assert.ok(rule, 'a rule scoped to html[data-windows-titlebar]')
  assert.match(rule[1], /position: fixed;/)
  assert.match(rule[1], /left: 12px;/)
  assert.match(rule[1], /top: calc\(\(var\(--dsh-windows-titlebar-height, 40px\) - 28px\) \/ 2\);/)
  assert.match(rule[1], /-webkit-app-region: no-drag;/)
  // 12 + 28 ends before dsh's Application / Edit menu, which starts at --dsh-windows-menu-start (48px).
  assert.match(rule[1], /width: 28px;/)
})

test('dsh still collapses the column to zero width under its Windows caption row, and starts its menu at 48px', () => {
  const dsh = path.join(HERE, '../../../../vendor/tracy/deepseek-harness')
  const frame = readFileSync(path.join(dsh, 'packages/client/ui-layout/src/client/AppFrame.tsx'), 'utf8')
  assert.ok(
    frame.includes("document.documentElement.hasAttribute('data-windows-titlebar') ? 0 : SIDEBAR_COLLAPSED")
  )
  const menu = readFileSync(path.join(dsh, 'apps/desktop/src/preload-menu.ts'), 'utf8')
  assert.ok(menu.includes('left: var(--dsh-windows-menu-start, 48px)'))
})
