/**
 * Settings › General › Keyboard shortcuts stays dsh's own row (its button opens dsh's editor) and is
 * dressed like Tracy's rows by CSS matched on the readable tail of dsh's hashed class names. If dsh
 * renames one of those classes the rule silently stops matching, so this test reads dsh's stylesheet
 * and fails first.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const styles = readFileSync(path.join(here, '..', 'src', 'client', 'styles.ts'), 'utf8')
const dshCss = readFileSync(
  path.resolve(
    here,
    '../../../../vendor/tracy/deepseek-harness/packages/client/ui-shortcuts/src/client/Reference.module.css'
  ),
  'utf8'
)

const TAILS = ['setting', 'settingText', 'settingTitle', 'settingDescription', 'button']

test('every class tail the shortcuts-row rules match still exists in dsh ui-shortcuts', () => {
  for (const tail of TAILS) {
    assert.match(dshCss, new RegExp(`\\.${tail}\\b`), `dsh no longer declares .${tail}`)
  }
})

test('the shortcuts row is restyled as a bordered 28px secondary button on Tracy tokens', () => {
  const button = styles
    .split('\n')
    .find((line) => line.includes('[class*="_settingText"]) button[class*="_button"] {'))
  assert.ok(button, 'button rule missing')
  assert.match(button, /height: 28px/)
  assert.match(button, /border: 1px solid var\(--border/)
  assert.match(button, /background: transparent/)
  assert.match(
    styles,
    /\[class\*="_settingText"\]\) button\[class\*="_button"\]:focus-visible \{ outline: 1px solid var\(--ring/
  )
  assert.match(styles, /div:has\(> \[class\*="_settingText"\]\) \{[^}]*border-bottom: 0/)
})
