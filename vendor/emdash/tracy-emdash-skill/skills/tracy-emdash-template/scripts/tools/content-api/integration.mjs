import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { NATIVE_PATH } from './command.mjs'
export { NATIVE_PATH }
// Opt-in scalar reader. Does not advertise complete Content API capability.
export function contentApi({ root = new URL('./', import.meta.url) } = {}) {
  const at = (p) => new URL(p, root)
  const mapping = JSON.parse(readFileSync(at('seed/content-api-map.json'), 'utf8'))
  const model = JSON.parse(readFileSync(at('seed/site-model.json'), 'utf8'))
  const config = JSON.parse(readFileSync(at('template.config.json'), 'utf8'))
  for (const p of [
    'public/content.json',
    'src/pages/content.json.ts',
    'src/pages/content.json.js',
    'src/pages/content.json.astro'
  ]) {
    if (existsSync(at(p))) throw new Error(`Content API route collision: ${p}`)
  }
  return {
    name: 'tracy-content-api-scalars',
    hooks: {
      'astro:config:setup': ({ injectRoute, addMiddleware, updateConfig, config: astro }) => {
        if (astro.base !== '/') throw new Error('Content API scalar adapter requires root installation')
        injectRoute({
          pattern: NATIVE_PATH,
          entrypoint: fileURLToPath(new URL('./route.mjs', import.meta.url)),
          prerender: false
        })
        addMiddleware({ entrypoint: fileURLToPath(new URL('./errors.mjs', import.meta.url)), order: 'pre' })
        addMiddleware({ entrypoint: fileURLToPath(new URL('./alias.mjs', import.meta.url)), order: 'post' })
        updateConfig({
          vite: {
            plugins: [
              {
                name: 'tracy-content-map',
                resolveId(id) {
                  if (id === 'virtual:tracy-content-map') return '\0tracy-content-map'
                },
                load(id) {
                  if (id === '\0tracy-content-map')
                    return `export default ${JSON.stringify({ mapping, types: model.types, locales: config.locales, defaultLocale: config.defaultLocale })}`
                }
              }
            ]
          }
        })
      }
    }
  }
}
