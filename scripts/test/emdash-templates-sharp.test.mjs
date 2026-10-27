// Every Tracy EmDash quickstart must list `sharp` as its OWN dependency.
//
// Astro pulls sharp in only as an optional dependency, and pnpm keeps a transitive dependency out
// of the project's node_modules root. EmDash is `ssr.noExternal`, so Vite bundles the image
// service it imports; sharp, not resolvable from the project root, is bundled with it, and its
// native loader then looks for `@img/sharp-<platform>` from dist/server/chunks/ and finds nothing.
// Result: `/_image` answered 500 `MissingSharp` on every EmDash site (admin Media and Pages; 157
// times on dev). Listed directly, sharp sits at node_modules/sharp, Vite leaves it external, and
// the image endpoint loads it at run time (measured in a container of each template's image).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const TEMPLATES = ['base', 'business', 'saas']
const root = new URL('../../', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

for (const name of TEMPLATES) {
  const dir = `packages/cms/tracy-emdash-theme-${name}`

  test(`${name}: sharp is a direct dependency, pinned exactly`, () => {
    const pkg = JSON.parse(read(`${dir}/package.json`))
    assert.match(pkg.dependencies?.sharp ?? '', /^\d+\.\d+\.\d+$/, `${dir}/package.json dependencies.sharp`)
  })

  test(`${name}: the lockfile installs sharp at the root, not as an optional extra`, () => {
    const pkg = JSON.parse(read(`${dir}/package.json`))
    const lock = read(`${dir}/pnpm-lock.yaml`)
    const importer = lock.slice(lock.indexOf('\n  .:\n'), lock.indexOf('\npackages:\n'))
    assert.match(importer, new RegExp(`\\n      sharp:\\n        specifier: ${pkg.dependencies?.sharp}\\n`))
    const snapshot = lock.slice(
      lock.indexOf(`\n  sharp@${pkg.dependencies?.sharp}:`, lock.indexOf('\nsnapshots:\n'))
    )
    const entry = snapshot.slice(0, snapshot.indexOf('\n\n'))
    assert.doesNotMatch(entry, /optional: true/, `${dir}/pnpm-lock.yaml still marks sharp optional`)
  })
}
