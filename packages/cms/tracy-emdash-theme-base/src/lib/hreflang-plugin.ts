// Entrypoint of the tracy-hreflang plugin (see ./hreflang.ts for the why). Native plugin: the
// integration imports `createPlugin` from this file and calls it with the descriptor's options.
// It runs in the host process and reads the alternates Base.astro attached to the page context.
import { definePlugin } from 'emdash'
import type { PageMetadataContribution } from 'emdash'
import { ALTERNATES_KEY, HEAD_POLICY_KEY, type Alternate, type HeadPolicy } from './hreflang'

export function createPlugin() {
  return definePlugin({
    id: 'tracy-hreflang',
    version: '0.2.0',
    hooks: {
      'page:metadata': ({ page }) => {
        const bag = page as unknown as Record<string, unknown>
        const alternates = bag[ALTERNATES_KEY] as Alternate[] | undefined
        const policy = bag[HEAD_POLICY_KEY] as HeadPolicy | undefined
        const out: PageMetadataContribution[] = (alternates ?? []).map((a) => ({
          kind: 'link' as const,
          rel: 'alternate' as const,
          href: a.href,
          hreflang: a.hreflang
        }))
        // The template's head policy, restated as contributions so it survives the 0.38 SEO-panel
        // overlay (see HEAD_POLICY_KEY). Same keys the base layer uses, so dedup replaces base one for one.
        if (policy) {
          out.push({ kind: 'property', property: 'og:title', content: policy.title })
          out.push({ kind: 'meta', name: 'twitter:title', content: policy.title })
          if (policy.description) {
            out.push({ kind: 'meta', name: 'description', content: policy.description })
            out.push({ kind: 'property', property: 'og:description', content: policy.description })
            out.push({ kind: 'meta', name: 'twitter:description', content: policy.description })
          }
          out.push({ kind: 'meta', name: 'robots', content: policy.robots })
          if (policy.canonical) {
            out.push({ kind: 'link', rel: 'canonical', href: policy.canonical })
            out.push({ kind: 'property', property: 'og:url', content: policy.canonical })
          }
          if (policy.image) {
            out.push({ kind: 'property', property: 'og:image', content: policy.image })
            out.push({ kind: 'meta', name: 'twitter:image', content: policy.image })
          }
        }
        return out.length ? out : null
      }
    }
  })
}
export default createPlugin
