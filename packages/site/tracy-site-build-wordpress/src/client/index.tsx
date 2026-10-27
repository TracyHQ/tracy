/**
 * Client half of `@tracy/dsh-site-build-wordpress`: the WordPress Build tab on the side card, the
 * running card of a `tracy_site_build_wordpress` call, and the picture card at the tail of the
 * turn that built the site. All of it is `@tracy/site-build-core`, bundled in; what is this
 * plugin's is its names, its stage lines, and its stylesheet.
 *
 * Design-inspiration's preview opens the tab (`betterSidebar.openTab({ type: 'tracy:build:wordpress', meta })`)
 * when the customer presses Create with WordPress — the press picks the plugin (Lee, 09/09).
 */
import { CLIENT_INJECT, makeSiteBuildClient } from '@tracy/site-build-core/client'
import { WordpressIcon } from '@tracy/ui/icons/platforms/wordpress'

import { en, NS } from './strings'
import { TAILWIND } from './styles'

/**
 * 🔒 `betterSidebar` is a CLIENT-ONLY service, and cordis throws the moment a property outside
 * `inject` is READ. Declaring it means this plugin only activates once better-sidebar is up.
 * Spelled out (not `[...CLIENT_INJECT]`) because `build-client.mjs` reads it off the source.
 */
export const inject = [
  'betterSidebar',
  'locale',
  'slots',
  'uiConversation',
  'sessions',
  'remote',
  'remote.agentPresets',
  'workspaces'
]

/** For the identity test: what core expects, to compare with `inject` above. */
export const expectedInject: readonly string[] = CLIENT_INJECT

export const apply = makeSiteBuildClient({
  name: 'tracy-site-build-wordpress',
  ns: NS,
  en,
  tab: 'tracy:build:wordpress',
  /**
   * The WordPress mark, sized to the tab strip. `width`/`height` rather than a `size` prop: this is
   * `@tracy/ui`'s compound icon, an SVG that defaults to `1em` and swaps light/dark itself through
   * Tailwind's `dark:` — which this plugin's stylesheet maps onto dsh's own `[data-ds-dark-theme]`.
   */
  icon: (size: number) => <WordpressIcon width={size} height={size} aria-hidden="true" />,
  tool: 'tracy_site_build_wordpress',
  platform: 'wordpress',
  platformName: 'WordPress',
  stages: ['check', 'theme', 'style', 'copy', 'seed', 'shot'],
  css: TAILWIND,
  workspace: {
    // wp-admin, and the editor of a post or page by id; a setting opens General Settings, where
    // the site title and tagline live.
    adminUrl: (siteUrl, target) => {
      const admin = new URL('wp-admin/', siteUrl)
      if (target?.kind === 'setting') return `${admin.href}options-general.php`
      if (target?.kind === 'post' && target.entityId)
        return `${admin.href}post.php?post=${target.entityId}&action=edit`
      return admin.href
    }
  }
})
