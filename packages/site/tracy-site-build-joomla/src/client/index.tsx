/**
 * Client half of `@tracy/dsh-site-build-joomla`: the Joomla Build tab on the side card, the
 * running card of a `tracy_site_build_joomla` call, and the picture card at the tail of the
 * turn that built the site. All of it is `@tracy/site-build-core`, bundled in; what is this
 * plugin's is its names, its stage lines, and its stylesheet.
 *
 * Design-inspiration's preview opens the tab (`betterSidebar.openTab({ type: 'tracy:build:joomla', meta })`)
 * when the customer presses Create with Joomla — the press picks the plugin (Lee, 09/09).
 */
import { CLIENT_INJECT, makeSiteBuildClient } from '@tracy/site-build-core/client'
import { JoomlaIcon } from '@tracy/ui/icons/platforms/joomla'

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
  name: 'tracy-site-build-joomla',
  ns: NS,
  en,
  tab: 'tracy:build:joomla',
  /**
   * The Joomla mark, sized to the tab strip. `width`/`height` rather than a `size` prop: this is
   * `@tracy/ui`'s compound icon, an SVG that defaults to `1em` and swaps light/dark itself through
   * Tailwind's `dark:` — which this plugin's stylesheet maps onto dsh's own `[data-ds-dark-theme]`.
   */
  icon: (size: number) => <JoomlaIcon width={size} height={size} aria-hidden="true" />,
  tool: 'tracy_site_build_joomla',
  platform: 'joomla',
  platformName: 'Joomla',
  // The host's own list, in its order (`STAGES` in `src/host/stages.mjs`): the tab counts and fills
  // by this length while the job it reads carries the host's stages (#811 F-S4-001).
  stages: ['check', 'template', 'style', 'copy', 'seed', 'language', 'shot'],
  // No `allowedLanguages` here on purpose. The questionnaire the host serves carries the offer
  // (`languages.options`, generated from the language-pack catalog and guarded by the `questions`
  // gate), and the form prefers that over this field. Bundling `questions.json` into the client to
  // repeat it here put 27 translated labels into a JavaScript file — the `language` gate refused
  // the bundle, and it was right: translations are data, not code. Before 21/09/2026 this line
  // said `['en', 'fr']` by hand while the package shipped 52 packs.
  css: TAILWIND,
  workspace: {
    // Joomla's administrator, and the edit screen of the three kinds the seed writes. The paths
    // are Joomla's own (`com_content`, `com_menus`, `com_modules`); anything else lands on the root.
    adminUrl: (siteUrl, target) => {
      const admin = new URL('administrator/', siteUrl)
      if (!target?.entityId) return admin.href
      const screen =
        target.kind === 'article'
          ? `option=com_content&task=article.edit&id=${target.entityId}`
          : target.kind === 'menuItem'
            ? `option=com_menus&task=item.edit&id=${target.entityId}`
            : target.kind === 'module'
              ? `option=com_modules&task=module.edit&id=${target.entityId}`
              : null
      return screen ? `${admin.href}index.php?${screen}` : admin.href
    }
  }
})
