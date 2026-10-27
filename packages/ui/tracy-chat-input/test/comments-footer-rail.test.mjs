/**
 * The Comments tab's bottom row lines its hairline up with the one above the Settings gear in the left
 * column (Akemi 02/10/2026). That column's foot lives in another plugin (tracy-sidebar), so this file
 * pins the three numbers styles.ts mirrors from it: if the sidebar's foot changes, this fails instead of
 * the two lines drifting apart on screen with no error.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { CSS } from '../src/client/styles.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const sidebar = path.resolve(here, '..', '..', 'tracy-sidebar', 'src', 'client')
const read = (file) => readFileSync(path.join(sidebar, file), 'utf8')

test("the sidebar's foot is still 8px padding + a 44px Settings button + its hairline 7px above it", () => {
  const rail = read('rail.tsx')
  assert.match(rail, /<div className=\{cn\('shrink-0 p-2'/, 'the footer wrapper keeps p-2 (8px)')
  const styles = read('styles.ts')
  const button = styles.match(
    // The button sits in the account menu's anchor (`.ts-account`) since the face replaced the gear.
    /\.tsb-root \[data-slot="sidebar\.settings"\] > \.ts-account > \[data-slot="button"\] \{([^}]*)\}/
  )?.[1]
  assert.ok(button, 'the Settings button rule')
  assert.match(button, /height: 44px/)
  assert.match(button, /margin-top: 7px/)
  assert.match(
    styles,
    /\[data-slot="sidebar\.settings"\] > \.ts-account > \[data-slot="button"\]::before \{[^}]*top: -7px;[^}]*height: 1px/,
    'the hairline sits 7px above the button'
  )
})

test('the Comments footer band is that foot, its hairline drawn inside it', () => {
  assert.match(CSS, /--tv-cv-rail-foot: calc\(8px \+ 44px \+ 7px\)/)
  assert.match(CSS, /\.tv-cv-footer \{[^}]*[^-]height: var\(--tv-cv-rail-foot\);/)
  assert.match(
    CSS,
    /\[data-composer-seat\]:has\(\.tv-cv-footer\) \{\s*box-shadow: inset 0 1px 0 var\(--border/
  )
})
