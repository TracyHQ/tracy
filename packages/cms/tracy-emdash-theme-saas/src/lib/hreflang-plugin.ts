// Entrypoint of the tracy-hreflang plugin (see ./hreflang.ts for the why). Native plugin: the
// integration imports `createPlugin` from this file and calls it with the descriptor's options.
// It runs in the host process and reads the alternates Base.astro attached to the page context.
import { definePlugin } from 'emdash'
import { ALTERNATES_KEY, type Alternate } from './hreflang'

export function createPlugin() {
  return definePlugin({
    id: 'tracy-hreflang',
    version: '0.1.0',
    hooks: {
      'page:metadata': ({ page }) => {
        const alternates = (page as unknown as Record<string, unknown>)[ALTERNATES_KEY] as
          | Alternate[]
          | undefined
        if (!alternates?.length) return null
        return alternates.map((a) => ({
          kind: 'link' as const,
          rel: 'alternate' as const,
          href: a.href,
          hreflang: a.hreflang
        }))
      }
    }
  })
}
export default createPlugin
