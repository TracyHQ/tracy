/**
 * The public Find page pulls the plugin's Find view and nothing of dsh (council 23/10/2026): not the
 * plugin's registration (`index.tsx`), not its dsh bundle (`lib/client.js`), not `styles.ts` (an
 * esbuild define Vite cannot fill), no `@deepseek-ai/*` runtime, and exactly one React.
 *
 *   node --test packages/web/tracy-wo-find-page/test/import-tree.test.mjs
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkg = path.join(here, '..')
const plugin = path.resolve(pkg, '..', '..', 'site', 'tracy-website-opportunities')
const esbuild = createRequire(path.join(plugin, 'package.json'))('esbuild')

test('the page bundle reaches the Find view and no dsh runtime, with one React', async () => {
  const { metafile } = await esbuild.build({
    entryPoints: [path.join(pkg, 'src', 'main.tsx')],
    bundle: true,
    write: false,
    metafile: true,
    platform: 'browser',
    format: 'esm',
    jsx: 'automatic',
    loader: { '.css': 'empty' },
    logLevel: 'silent'
  })
  const inputs = Object.keys(metafile.inputs).map((p) => p.split(path.sep).join('/'))
  assert.ok(
    inputs.some((p) => p.endsWith('tracy-website-opportunities/src/client/find.tsx')),
    'the real Find view is in'
  )
  const banned = inputs.filter(
    (p) =>
      /@deepseek-ai\//.test(p) ||
      /tracy-website-opportunities\/(src\/client\/(index\.tsx|styles\.ts)|lib\/client\.js)$/.test(p)
  )
  assert.deepEqual(banned, [])
  const reacts = new Set(
    inputs
      .map((p) => /node_modules\/\.pnpm\/(react@[^/]+)\/node_modules\/react\/index\.js$/.exec(p)?.[1])
      .filter(Boolean)
  )
  assert.equal(reacts.size, 1, [...reacts].join(', '))
})
