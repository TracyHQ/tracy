/**
 * Vite's `import.meta.glob` for a test's esbuild bundle of /ops screens. Without it the bundle has
 * no English (`src/i18n/english.ts`) and screens show their keys. Add it to any `esbuild.build`
 * that bundles a screen using `useT`/`tr`/`Trans`:
 *
 *   import { opsI18nPlugin } from './support/ops-i18n-esbuild.mjs'
 *   await esbuild.build({ ..., plugins: [opsI18nPlugin()] })
 *
 * Eager globs become static namespace imports; lazy ones become `() => import(…)` returning the
 * default export, as `{ import: 'default' }` does in Vite.
 */
import { globSync, readFileSync } from 'node:fs'
import path from 'node:path'

const GLOB_CALL = /import\.meta\.glob(?:<[^>]*>)?\(\s*'([^']+)'\s*(?:,\s*(\{[^}]*\}))?\s*\)/g

export function opsI18nPlugin() {
  return {
    name: 'ops-i18n-glob',
    setup(build) {
      build.onLoad({ filter: /[\\/]src[\\/]i18n[\\/][^\\/]+\.tsx?$/ }, (args) => {
        const source = readFileSync(args.path, 'utf8')
        if (!source.includes('import.meta.glob')) return undefined
        const dir = path.dirname(args.path)
        let n = 0
        const imports = []
        const contents = source.replace(GLOB_CALL, (_all, pattern, options = '') => {
          const files = globSync(pattern, { cwd: dir }).sort()
          const eager = /eager:\s*true/.test(options)
          const entries = files.map((file) => {
            const spec = `./${file.split(path.sep).join('/')}`
            if (!eager)
              return `${JSON.stringify(spec)}: () => import(${JSON.stringify(spec)}).then((m) => m.default ?? m)`
            const name = `__ops_glob_${n++}`
            imports.push(`import * as ${name} from ${JSON.stringify(spec)}`)
            return `${JSON.stringify(spec)}: ${name}`
          })
          return `({ ${entries.join(', ')} })`
        })
        return {
          contents: `${imports.join('\n')}\n${contents}`,
          loader: args.path.endsWith('.tsx') ? 'tsx' : 'ts',
          resolveDir: dir
        }
      })
    }
  }
}
