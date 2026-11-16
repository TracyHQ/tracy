/**
 * Bundles a few modules of the client (`src/client`) into one CommonJS file a node test can require, the way
 * `plan-card-words.test.mjs` does: dsh's icon package is stubbed, everything else is the real source.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const corePkg = path.resolve(root, '..', '..', 'core', 'tracy-core')

/** The Vietnamese table of this plugin, as the browser loads it. */
export const viTablePath = path.resolve(root, '../../locale/tracy-locale-vi/vi/tracy-build-chat.json')

/**
 * Bundle `contents` (an entry written against `src/client`) and require it.
 * @param {string} contents - the entry module's source
 * @returns {Promise<{ lib: any, done: () => void }>} the module, and a function that removes the bundle
 */
export async function bundleClient(contents) {
  const esbuild = require('esbuild')
  const out = mkdtempSync(path.join(tmpdir(), 'build-chat-client-'))
  const outfile = path.join(out, 'client.cjs')
  await esbuild.build({
    stdin: { contents, resolveDir: path.join(root, 'src', 'client'), loader: 'tsx' },
    absWorkingDir: root,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    nodePaths: [path.join(corePkg, 'node_modules')],
    plugins: [
      {
        name: 'icons-only',
        setup(b) {
          b.onResolve({ filter: /^@deepseek-ai\/dsh-client-ui-primitives$/ }, () => ({
            path: 'icons',
            namespace: 'stub'
          }))
          b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
            contents:
              'export const IconCloseOutlineRegular = () => null; export const IconEditOutlineRegular = () => null',
            loader: 'js'
          }))
        }
      }
    ],
    outfile,
    logLevel: 'silent'
  })
  return { lib: require(outfile), done: () => rmSync(out, { recursive: true, force: true }) }
}

/** A translator over a table, English for a key it lacks: the shape of the card's `t`. */
export const translatorOf =
  (table, en) =>
  (key, vars = {}) =>
    (table[key] ?? en[key]).replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''))
