/**
 * Client half of `@tracy/dsh-site-build-emdash`: the EmDash Build tab on the side card, the running
 * card of a `tracy_site_build_emdash` call, and the picture card at the tail of the turn that built
 * the site. All of it is `@tracy/site-build-core`, bundled in; what is this plugin's is its names,
 * its three stages, and its stylesheet.
 *
 * Design-inspiration's preview opens the tab (`betterSidebar.openTab({ type: 'tracy:build:emdash', meta })`)
 * when the customer presses Create with EmDash — the press picks the plugin (Lee, 09/09).
 *
 * 🔒 WHY THE FORM ASKS ONLY FOR A NAME, AND WHY THERE ARE SO FEW STAGES. An EmDash site is not
 * dressed after it is born: the archive the fleet restores (`tracy-business/emdash`, the default
 * base template — Lee, 15/09, D35) IS the site, pages and copy in every language it ships. So
 * "about", "pages", "tone" and "languages" would be answers nothing reads, and `theme`, `style`,
 * `copy`, `seed` would be stages with nothing to do. What is left is to prove that the site
 * answers as the template it claims to be (`check`), to put the customer's details in
 * (`personalize`), and to show what it looks like (`shot`). The design
 * inspiration the customer picked is carried on the message, noted for later — not applied, and
 * the message says so.
 */
import { CLIENT_INJECT, makeSiteBuildClient } from '@tracy/site-build-core/client'
import { EmdashIcon } from '@tracy/ui/icons/platforms/emdash'

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
  name: 'tracy-site-build-emdash',
  ns: NS,
  en,
  tab: 'tracy:build:emdash',
  /**
   * The EmDash mark, sized to the tab strip. `width`/`height` rather than a `size` prop: this is
   * `@tracy/ui`'s compound icon, an SVG that defaults to `1em` and swaps light/dark itself through
   * Tailwind's `dark:` — which this plugin's stylesheet maps onto dsh's own `[data-ds-dark-theme]`.
   */
  icon: (size: number) => <EmdashIcon width={size} height={size} aria-hidden="true" />,
  tool: 'tracy_site_build_emdash',
  platform: 'emdash',
  platformName: 'EmDash',
  // The host's own list, in its order (`STAGES` in `src/host/stages.mjs`): the tab counts and fills
  // by this length while the job it reads carries the host's stages (#811 F-S4-001).
  stages: ['check', 'personalize', 'shot'],
  css: TAILWIND,
  workspace: {
    // EmDash's admin lives under `/_emdash/admin`; an entity opens its collection's list. A
    // setting opens the site settings, where the title and tagline live.
    adminUrl: (siteUrl, target) => {
      const admin = new URL('_emdash/admin/', siteUrl)
      if (target?.kind === 'setting') return `${admin.href}settings`
      if (target?.kind && target.entityId) return `${admin.href}content/${target.kind}/${target.entityId}`
      return admin.href
    }
  }
})
