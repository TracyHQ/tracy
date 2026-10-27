/**
 * Dev/CI tsdown config: emits three artifacts:
 *
 *   - `lib/index.js`      — node half (plain ESM, bundles src/index.ts)
 *   - `lib/invariant.js`  — node half (plain ESM, bundles src/invariant.ts)
 *   - `lib/client.js`     — browser half (CJS wrapped in DSH's
 *                            `window.__ModuleLoader__.load({id, factory})`
 *                            so the client module loader can compose it)
 *
 * Since the v0.1.2-alpha.1 adaptation the client half is a pure language
 * pack: it registers bundled dictionaries through `ctx.locale.addLanguage`
 * / `ctx.locale.register(ns, locale, dict)` and has no runtime imports of
 * any DSH or React module (all DSH references are type-only, erased at
 * build time). Externals are kept for those type-only specifiers and as a
 * guard against accidental value imports.
 */
import { defineConfig, type UserConfig } from 'tsdown'

const ID = '@huanlin/dsh-plugin-better-locale'

/** DSH platform modules that stay external in the host bundles (peer deps). */
const HOST_EXTERNALS = [
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-invariants',
]

/** DSH platform modules that stay external in the browser bundle. */
const CLIENT_EXTERNALS = [
  'react',
  'react-dom',
  'react/jsx-runtime',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-client-locale/client',
]

const libConfig: UserConfig = {
  name: ID,
  entry: { index: 'src/index.ts', invariant: 'src/invariant.ts' },
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  dts: false,
  clean: true,
  external: HOST_EXTERNALS,
}

const clientBundleConfig: UserConfig = {
  name: `${ID}/client`,
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: ['cjs'],
  platform: 'browser',
  target: 'es2024',
  dts: false,
  sourcemap: true,
  clean: false,
  external: CLIENT_EXTERNALS,
  noExternal: (id: string) => (CLIENT_EXTERNALS.includes(id) ? undefined : true),
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
  },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

export default defineConfig([libConfig, clientBundleConfig])
