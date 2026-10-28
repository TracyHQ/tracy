/**
 * English baseline for the `tracy-design-inspiration` namespace.
 *
 * This package OWNS the namespace: it ships `en` here and nothing else. Vietnamese arrives from
 * `@tracy/dsh-tracy-locale-vi`, which registers `(namespace, locale)` pairs separately —
 * `ctx.locale.register` throws on a duplicate pair, so exactly one place may ship each.
 *
 * Words follow `docs/references/vocabulary.md` §1 "Redesign": the customer reads
 * "Design template", never "design system"; nothing here says issue, ticket or triage.
 */

/**
 * The namespace this package owns.
 *
 * 🔒 IT LIVES HERE, beside `en`. `check-dsh-locale` finds owners by reading the exported `NS` of
 * each `strings.ts`; declaring it inside `index.tsx` instead makes the namespace invisible to the
 * gate, which then cannot notice a missing translation.
 */
export const NS = 'tracy-design-inspiration'

export const en = {
  /** Catalog categories (`groups.mjs` `categoryKey`, `category-<slug>`): the catalog's English strings, shown translated. */
  'category-your-brand': 'Your brand',
  'category-reference': 'Reference',
  'category-community': 'Community',
  'category-ai-llm': 'AI & LLM',
  'category-productivity-saas': 'Productivity & SaaS',
  'category-developer-tools': 'Developer Tools',
  'category-backend-data': 'Backend & Data',
  'category-professional-corporate': 'Professional & Corporate',
  'category-fintech-crypto': 'Fintech & Crypto',
  'category-automotive': 'Automotive',
  'category-e-commerce-retail': 'E-Commerce & Retail',
  'category-creative-artistic': 'Creative & Artistic',
  'category-bold-expressive': 'Bold & Expressive',
  'category-themed-unique': 'Themed & Unique',
  'category-design-creative': 'Design & Creative',
  'category-retro-nostalgic': 'Retro & Nostalgic',
  'category-editorial-print': 'Editorial & Print',
  'category-editorial-personal-publication': 'Editorial / Personal / Publication',
  'category-editorial-studio': 'Editorial · Studio',
  'category-modern-minimal': 'Modern & Minimal',
  'category-morphism-effects': 'Morphism & Effects',
  'category-layout-structure': 'Layout & Structure',
  'category-starter': 'Starter',
  'category-media-consumer': 'Media & Consumer',
  'category-social-messaging': 'Social & Messaging',
  'category-uncategorised': 'Uncategorised',
  /** Accessible name of a dialog's X button (screen readers, tooltips). */
  'action.close': 'Close',
  /** Tab title; the site name is appended by the code (`Design templates · joomlart.com`). */
  'tab.title': 'Design templates',
  // The picker's groups for a business of a known trade (`trade-groups.mjs`): its trade's cards first, then the
  // cards for any business, then the rest. One heading per trade so each language words it whole.
  'trade.recommended': 'Recommended for your business',
  'trade.recommended.food': 'Recommended for a food business',
  'trade.recommended.nonprofit': 'Recommended for a nonprofit',
  'trade.recommended.events': 'Recommended for an events business',
  'trade.recommended.beauty': 'Recommended for a beauty business',
  'trade.recommended.health': 'Recommended for a health business',
  'trade.recommended.fitness': 'Recommended for a fitness business',
  'trade.recommended.hospitality': 'Recommended for a hospitality business',
  'trade.recommended.travel': 'Recommended for a travel business',
  'trade.recommended.professional': 'Recommended for a professional services business',
  'trade.recommended.creative': 'Recommended for a creative business',
  'trade.recommended.education': 'Recommended for an education business',
  'trade.recommended.retail': 'Recommended for a retail business',
  'trade.recommended.auto': 'Recommended for an automotive business',
  'trade.recommended.home': 'Recommended for a home services business',
  'trade.recommendedHint': 'Made for your trade, shown first',
  /** The generic group's heading, and the tag on each of its cards. */
  'trade.generic': 'Fits any business',
  'trade.genericHint': 'General templates that suit most trades',
  'trade.rest': 'All other templates',
  /** The badge on a card made for the business's trade. */
  'card.recommended': 'Recommended',
  /** The picker above the grid (`Filter.tsx`): one box that finds a brand by name or a category. */
  /** The search box; the example is a name everyone knows, from the catalog. */
  'filter.search': 'Search, e.g. {brand}',
  'filter.searchPlain': 'Search design templates',
  /** The category picker's button. */
  'filter.categories': 'Categories',
  /** The count line under the toolbar: all, or a filtered part (15/09). Zero keeps the
      "0 of {total}" shape; the grid's own empty line says "No designs match" once. */
  'filter.countAll': 'Showing all {total} designs',
  'filter.count': 'Showing {shown} of {total} designs',
  'filter.clear': 'Clear',
  'filter.fromCommunity': 'From Community',
  'filter.empty': 'No designs match',
  /** The CMS chips' group name, read by a screen reader; the chips themselves are CMS names. */
  'filter.platforms': 'Platforms',
  /** Tracy's groups over OpenDesign's categories (`groups.mjs`); the brand group leads. */
  'group.provider': 'Provider',
  /** The quickstart preview (a finished site framed live). */
  'template.openDemo': 'Open demo',
  /** The live/screenshot switch in the preview's page row: its group name, then its two sides. */
  'template.view': 'View',
  'template.viewLive': 'Live',
  'template.viewShot': 'Screenshot',
  'template.oneOf': 'one of {count} pages on this layout',
  'template.demoDown': 'The demo site is not reachable right now.',
  'template.loading': 'Loading the live demo…',
  'template.noLayouts': 'This template lists no layouts.',
  'dialog.createWithNone': '{name} has no {platform} build yet',
  /** A brand's greyed button: no quickstart on that CMS can wear a brand yet (`create-with.mjs`). */
  'dialog.createWithNoBrand': 'No {platform} template can wear a brand yet',
  'group.brand': 'Your brand',
  'group.community': 'Community',
  'group.product': 'Product & tools',
  'group.business': 'Business',
  'group.creative': 'Creative & expressive',
  'group.minimal': 'Minimal & layout',
  'group.media': 'Media & social',
  /** Accessible name of the tab's loading bar (a 2px line under the tab strip, no visible words). */
  'loading.label': 'Loading',
  /** The preview dialog's words while it reads the library (the tab itself shows only its bar). */
  'state.reading': 'Reading the library…',
  'state.noLibrary': 'This lane has no design library. It arrives with the next image.',
  'state.failed': 'Could not read the library. Try again shortly.',
  'card.preview': 'Open preview',
  'card.comingSoon': 'Coming soon',
  /** Under a hero band when the site has no image at all (skill step 1 rule). */
  'band.noImage': 'No image on the site',
  /** The device frame the page is drawn in: a fixed design viewport, scaled to fit (spec §4b-bis). */
  'dialog.device': 'Device',
  'dialog.desktop': 'Desktop',
  'dialog.tablet': 'Tablet',
  'dialog.mobile': 'Mobile',
  /** Title of the device pill: a click steps to the next device, no menu (06/09). */
  /** OpenDesign's engine derives one dark canvas for every system; only one system ships its own. */
  'dialog.dark': 'Dark',
  /** The light/dark switch's group name, read by a screen reader. */
  'dialog.theme': 'Theme',
  'dialog.light': 'Light',
  'dialog.darkTitle': "Dark, as OpenDesign derives it — not this design template's own dark mode",
  'dialog.darkUnsafe':
    'This design template paints parts of its page in fixed light colours, so Dark is offered only on its sample products',
  /** The six sample products of an inspiration, as chips beside the site's real pages (§4h decision 1). */
  'kind.landing': 'Landing',
  'kind.deck': 'Deck',
  'kind.poster': 'Poster',
  'kind.email': 'Email',
  'kind.newsletter': 'Newsletter',
  'kind.form': 'Form',
  'kind.typography': 'Typography',
  'kind.missing': 'This design template does not ship this page.',
  'dialog.prev': 'Previous design template',
  'dialog.next': 'Next design template',
  'dialog.position': '{index} of {total}',
  'dialog.use': 'Use this design template',
  /** The right corner of the header: create a site on a CMS from this inspiration (07/09). */
  'dialog.createWith': 'Create with',
  'dialog.createWithTitle': 'Create a {platform} site from {name}',
  'dialog.createTold': 'Asked the agent to create a {platform} site from {name}.',
  'dialog.createFailed': 'Could not reach the agent. Open a chat session first.',
  /** The Build tab took over: the questions are there, the chat stays quiet until Build is pressed. */
  /** After "Use this design template": the choice is recorded for the agent to pick up. */
  'dialog.chosen': 'Noted. Tell the agent to continue with {name}.',
  /** The choice was recorded AND sent into the chat, so the agent is already on it. */
  'dialog.chosenTold': 'Noted — the agent is continuing with {name}.',
  'dialog.chooseFailed': 'Could not record the choice. Ask the agent to read the site first.',
  /** The version strip down the left of the frame (§4h decision 2): names show on hover. */
  'version.yours': 'Your words',
  'version.default': 'Default',
  'version.more': 'More version',
  'version.working': 'Tracy is writing…',
  'version.remove': 'Remove {title}',
  /** The same control after one press: it asks before it removes, and the next press is the answer. */
  'version.removeConfirm': 'Remove {title}?',
  'version.removeConfirmTitle': 'Press again to remove {title}',
  /** The host said no; `{message}` is its code or status. */
  'version.removeFailed': 'Could not remove {title}: {message}',
  /** No answer the host stands behind came back, so nobody knows which way it went. */
  'version.removeUnsure':
    'No confirmation came back for removing {title} ({message}), so it may or may not be gone. Check the list before trying again.',
  /** A take that failed: the host's message, in the tile, until the next press. */
  'version.failed': 'Could not write this one: {message}',
  /** The take's job is gone from the host (it restarted mid-write); shown inside `version.failed`. */
  'version.forgotten': 'The server restarted and lost this one. Try again.',
  'version.retry': 'Try again',
  /** The one-box prompt behind the pencil (§4h decision 6), prefilled by the kind, then by the model's suggestion. */
  'prompt.open': 'Write it your way',
  'prompt.title': 'Same page, a different take',
  'prompt.label': 'Custom prompt',
  'prompt.note': 'One model call · about 15 s',
  'prompt.go': 'Write it',
  /** Sorting the library by closeness to the customer's own brand (the first card). */
  'sort.fit': 'Closest to your brand',
  /** What the dialog says to the agent, in the chat, on the customer's behalf. */
  'msg.use': 'I chose the design template "{name}" ({id}). Continue with step 3.',
  /** What a Create with button says to the agent; the platform label is the proper noun. */
  'msg.createWith': 'Create a {platform} site from the design template "{name}" ({id}).',
  /** With the Build tab present: the decision, in the customer's words; the agent answers by sending the form there. */
  'msg.buildWith': 'Build "{name}" ({id}) with {platform} on this site.',
  'action.retry': 'Try again',
  /** Over the three cards the agent leads with, at the end of its turn. */
  'picks.label': 'Three design templates for your site',
  'picks.seeAll': 'See all design templates',
  /**
   * The site browser toolbar's Design system button and the tab it opens (plan
   * tasks/ke-hoach-nut-design-system.md). "Design system" is the settled word for the button (11/10/2026);
   * the library inside keeps the customer's word, Design templates.
   */
  'ds.tab.title': 'Design system',
  'ds.loading': 'Reading the site…',
  'ds.noSite': 'Open a site to choose its design system.',
  'ds.retry': 'Try again',
  'ds.setup.required': 'Finish building your site before choosing a design system.',
  'ds.setup.open': 'Open Build',
  'ds.worn.label': 'Wearing now',
  // The Template default popup's way back (13/10/2026; 15/10/2026): the worn system taken off, an apply of its own.
  'ds.worn.back': 'Back to template default',
  // The synthetic card beside the worn one (13/10/2026): the template's own look, and its one line.
  'ds.default.title': 'Template default',
  'ds.default.line': 'The look your template came with.',
  // The Template default popup when nothing is worn.
  'ds.default.inUse': 'Your site uses this look',
  'ds.undo': 'Undo',
  'ds.undoing': 'Undoing…',
  'ds.undone': 'Back to {name}.',
  'ds.undone.none': 'Back to the template’s own look.',
  'ds.library': 'Design templates',
  // The library door did not answer: the Add site card's own sentence (tracy-add-site ds_failed), word for word.
  'ds.library.failed': 'The design systems could not load.',
  'ds.search': 'Search',
  'ds.empty': 'No design template matches.',
  'ds.pick': 'Pick one to preview it.',
  /** Whose words the cards and the preview wear (the site's home page, its Build file, or each system's own). */
  'ds.words.reading': 'Reading your site’s words for the cards…',
  'ds.words.page': 'The cards show your site’s own words, read from its home page.',
  'ds.words.file': 'The cards show your site’s own words.',
  'ds.words.sample':
    'The cards show each design system’s sample text: Tracy couldn’t read your site’s words.',
  'ds.apply': 'Apply to this site',
  'ds.applying': 'Applying…',
  'ds.applied': '{name} is on your site now.',
  'ds.applied.notSeen': '{name} was applied, but the page does not show it yet. Reload the preview.',
  'ds.alreadyWorn': 'Your site already wears this one.',
  'ds.note': 'Changes colours, fonts and shapes. Your pages and words stay as they are.',
  'ds.viewer': 'Viewers can’t change the site’s look.',
  'ds.unsupported.TEMPLATE_HAS_NO_SLOT': 'This site’s template can’t wear a design system yet.',
  'ds.unsupported.TEMPLATE_NOT_READY': 'This site’s template isn’t ready to wear a design system yet.',
  'ds.unsupported.NO_TEMPLATE':
    'Tracy doesn’t know which template this site runs, so it can’t apply a design system.',
  'ds.unsupported.PLATFORM_HAS_NO_SLOT': 'Design systems work on WordPress, Joomla and EmDash sites.',
  'ds.unsupported.SITE_IMPORTED':
    'Design systems work on sites created from a Tracy template, not on imported sites.',
  'ds.error.read': 'Couldn’t read the site’s design system.',
  'ds.error.SITE_BUSY': 'Tracy is changing this site right now. Try again when it has finished.',
  'ds.error.DS_CHANGED_SINCE':
    'The look changed after this design system was applied, so Undo would overwrite that change. Nothing was changed.',
  'ds.error.DS_NOT_LATEST': 'Only the latest change can be undone.',
  'ds.error.DS_UNDO_USED': 'This change was already undone.',
  'ds.error.DS_TEMPLATE_CANNOT_WEAR': 'This site’s template can’t wear a design system yet.',
  'ds.error.DS_REFUSED': 'This design template can’t be applied: its text would be hard to read.',
  'ds.error.TOOLSET_NOT_GRANTED': 'Viewers can’t change the site’s look.',
  'ds.error.DS_READ_FAILED': 'Couldn’t read the site. Try again.',
  'ds.error.DS_WRITE_FAILED':
    'The site didn’t answer, so the change may or may not have landed. Check the preview before trying again.',
  'ds.error.NETWORK': 'No connection. Try again.',
  'ds.error.other': 'That didn’t work ({code}).',
  // Try on, then Keep or Undo (12/10/2026, U3 A).
  'ds.tryOn': 'Try on your site',
  'ds.tryingOn': 'Putting it on…',
  'ds.try.title': '{name} is on your site now',
  'ds.try.back': 'Keep it, or undo to go back to {name}.',
  'ds.try.back.none': 'Keep it, or undo to go back to the template’s own look.',
  'ds.keep': 'Keep',
  'ds.kept': '{name} stays on your site.',
  'ds.live.title': 'Your site, wearing {name}',
  // The try-on popup (12/10/2026: "open a popup, like pressing Open preview").
  'ds.try.trying': 'Trying on your site',
  'ds.try.loading': 'Putting {name} on your site…',
  'ds.try.noAddress': 'This site has no address to show yet, so this is the system’s own picture.',
  /** A card's preview popup (`SystemPreviewDialog.tsx`): the site's own home page wearing the system, nothing written. */
  'ds.preview.on': 'On your site',
  'ds.preview.prev': 'Previous design system',
  'ds.preview.next': 'Next design system',
  'ds.preview.frame': '{name} on your site',
  'ds.preview.loading': 'Loading the preview',
  'ds.preview.failed': 'The preview could not load.',
  /** Under a shown preview: the page is shown without its scripts (sandboxed), so some effects are missing. */
  'ds.preview.staticNote': 'The preview may not show every effect on the page.',
  'ds.preview.unavailable': 'A preview is not available for your site yet.',
  'ds.fonts': 'Fonts: {list}',
  'ds.font.swap': '{use} stands in for {original}',
  'ds.font.same': '{use}',
  /** The swatch a library card draws in the system's own font when the library has no picture. */
  'ds.swatch': 'Aa',
  'ds.count': '{count} design systems',
  /** The tab's toolbar (`DesignSystemFilter.tsx`), the gallery's bar: its count line, empty line and search name. */
  'ds.filter.countAll': 'Showing all {total} design systems',
  'ds.filter.count': 'Showing {shown} of {total} design systems',
  'ds.filter.empty': 'No design systems match',
  'ds.filter.searchPlain': 'Search design systems',
  /** The Theme menu beside Categories: the Refero catalogue's look of each system (`design-system-filter.mjs`). */
  'ds.filter.theme': 'Theme',
  'ds.theme.light': 'Light',
  'ds.theme.dark': 'Dark',
  'ds.theme.mixed': 'Mixed',
  /**
   * The Categories list: the Refero catalogue's industries (`design-system-filter.mjs`). An underscore,
   * not a dot, before the id: `ds.industry.ai` reads as a domain name to the language gate.
   */
  'ds.industry_saas': 'SaaS',
  'ds.industry_agency': 'Agency',
  'ds.industry_ecommerce': 'E-commerce',
  'ds.industry_ai': 'AI',
  'ds.industry_design': 'Design',
  'ds.industry_devtools': 'Dev tools',
  'ds.industry_fintech': 'Fintech',
  'ds.industry_productivity': 'Productivity',
  'ds.industry_media': 'Media',
  'ds.industry_crypto': 'Crypto',
  'ds.industry_other': 'Other'
} as const

export type Key = keyof typeof en
export type Translate = (key: Key, params?: Record<string, string | number>) => string
