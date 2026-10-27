/**
 * Every PHP file a theme loads as code starts with `<?php`: anything before the tag is printed on
 * every page. JA Vega 1.1.16 shipped four lines of PHP above the tag of `inc/extra.php` (commit
 * da2c435712), and every page of every JA Vega site printed `defined( 'ABSPATH' ) || exit; …` with no
 * stylesheet after it (13/10/2026). Template fragments that are meant to print (`motion-head.php`
 * opens with its `<script>`) are named here, never skipped by pattern.
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
/** Files that are HTML with PHP inside, printed where they are included. */
const PRINTED = new Set(['inc/motion-head.php'])

const phpUnder = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return phpUnder(full)
    return name.endsWith('.php') ? [full] : []
  })

test('every inc/*.php and functions.php of every theme and overlay opens with <?php', () => {
  const bad = []
  for (const top of ['src', 'overlays'])
    for (const theme of readdirSync(path.join(ROOT, top))) {
      const dir = path.join(ROOT, top, theme)
      if (!statSync(dir).isDirectory()) continue
      const files = [
        ...(readdirSync(dir).includes('functions.php') ? [path.join(dir, 'functions.php')] : []),
        ...(readdirSync(dir).includes('inc') ? phpUnder(path.join(dir, 'inc')) : [])
      ]
      for (const file of files) {
        const rel = path.relative(dir, file)
        if (PRINTED.has(rel)) continue
        if (!readFileSync(file, 'utf8').startsWith('<?php')) bad.push(path.relative(ROOT, file))
      }
    }
  assert.deepEqual(bad, [])
})
