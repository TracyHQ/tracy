/**
 * Settings › Font size says it only affects the conversation, but dsh's docking kit sizes its tab
 * chips on the same content axis (`--dsh-content-font-size-secondary`), so the right column's tab
 * strip (My Sites, Site changes, Team…) grew and shrank with it (Akemi, 03/10/2026). Tracy pins
 * that variable on the strip. The rule hangs on dsh's data attributes and its variable name, so
 * this test reads dsh's own sources and fails first if either is renamed.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const styles = readFileSync(path.join(here, '..', 'src', 'client', 'styles.ts'), 'utf8')
const dockkit = path.resolve(
  here,
  '../../../../vendor/tracy/deepseek-harness/packages/client/ui-dockkit/src/components'
)
const dockkitCss = readFileSync(path.join(dockkit, 'dockkit.module.css'), 'utf8')
const tabPanel = readFileSync(path.join(dockkit, 'TabPanel.tsx'), 'utf8')

test('dsh still marks the tab strip with data-dockkit-strip and sizes chips on the secondary axis', () => {
  assert.match(tabPanel, /data-dockkit-strip=/, 'dsh no longer marks the strip with data-dockkit-strip')
  assert.match(dockkitCss, /\.tab \{[^}]*font-size: var\(--dsh-content-font-size-secondary/)
})

test('the tab strip pins the secondary content size, so Font size leaves the tabs alone', () => {
  const rule = styles.split('\n').find((line) => line.startsWith('[data-dockkit-strip] {'))
  assert.ok(rule, 'no rule on [data-dockkit-strip]')
  assert.match(rule, /--dsh-content-font-size-secondary: 13px/)
})

test('dsh still gives the strip 10px above the chips and none below', () => {
  assert.match(dockkitCss, /\.tabStrip \{[^}]*padding: 10px 6px 0 /)
})

test('the right column strip repeats the 10px top gap below the chips', () => {
  const rule = styles
    .split('\n')
    .find((line) => line.startsWith('[data-slot="rightbar"] [data-dockkit-strip] {'))
  assert.ok(rule, 'no padding rule on the right column strip')
  assert.match(rule, /padding-bottom: 10px/)
})
