// The identity logo of Tracy Business (`<img hidden class="tracy-logo" src="">`, inc/identity.php) is rendered with [hidden] and an
// empty src when the site has no logo. The browser's own [hidden] rule is only a default: tracy.css sets display: block on every
// img under .tracy, and an author rule beats a user-agent one whatever its specificity, so without a rule of its own the empty
// image was drawn as a broken-image icon with the site name as alt text, beside the monogram (measured 03/10/2026).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (file) => readFileSync(path.join(root, file), 'utf8')
const compact = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ')

test('a hidden identity logo stays hidden, in the overlay and in the theme it generates', () => {
  for (const file of [
    'overlays/wp-tracy-business/assets/css/wp-tracy-business.css',
    'src/wp-tracy-business/assets/css/wp-tracy-business.css'
  ])
    assert.match(
      compact(read(file)),
      /\.tracy-header__brand img\.tracy-logo\[hidden\] \{ display: none; \}/,
      `${file} puts [hidden] back on the empty logo`
    )
})

test('the header still renders the logo with [hidden] when the site has none, and wears the monogram', () => {
  const header = read('overlays/wp-tracy-business/parts/header.html')
  assert.match(
    header,
    /<img class="tracy-logo" src="" alt="\{site\.name\}" data-tracy-identity="site\.logo">/
  )
  assert.match(header, /tracy-brand__mark/)
})
