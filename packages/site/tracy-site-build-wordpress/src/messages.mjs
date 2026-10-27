/**
 * The sentences only the WordPress build says to a customer, keyed by a stable code — the
 * plugin's half of `@tracy/site-build-core/host-messages` (read its header for the rule).
 *
 * The host stages fill them for the English `detail`; `src/client/strings.ts` spreads them into
 * this plugin's namespace as `host.<code>`, where they are translated. Codes are part of the job
 * file: never rename one.
 */
export const WORDPRESS_MESSAGES = Object.freeze({
  WP_NO_THEMES: 'The site did not answer with its themes.',
  WP_LOOK_NOT_INSTALLED: 'The look did not install on the new site.',
  WP_LOOK_NOT_ON: 'The look installed but did not switch on.',
  WP_BRAND_LOOK_NOT_ON: "The brand's look could not be switched on.",
  WP_STYLE_NOT_ON: 'The look was installed but {id} could not be switched on.',
  WP_NO_CONTRACT_SEEDER: "This host's seeder does not ship the {contract} contract.",
  WP_COWORK_UNKNOWN: '{site} did not report its Cowork plugin version; {contract} needs {min} or newer.',
  WP_COWORK_OLD: '{site} runs Cowork {version}; {contract} needs {min} or newer.',
  WP_NOT_INSPECTED: '{site} refused to be inspected.',
  WP_NOT_BOUND:
    '{site} carries the contract door but is not bound to {contract}; provision binds a sealed site before handing it over.',
  WP_BOUND_ELSEWHERE: '{site} is bound to {bound}, not {contract}.',
  WP_THEME_MISSING: 'The restored site does not carry the {theme} theme.',
  WP_THEME_OTHER: 'The restored site runs {active}, not {theme}.',
  WP_BRAND_NO_TOKENS:
    'Brand/{host}/tokens.css is not in the site folder. Run the brand engine (tracy_brand extract) first.',
  WP_BRAND_BAD_TOKENS: 'Brand/{host}/tokens.css cannot become a style: {reason}',
  WP_SEAL_UNREADABLE: "This site's content contract cannot be read ({reason}).",
  WP_SEALED_FOR: 'This site is sealed for {platform}; this build is for WordPress.',
  WP_RESTORED_FROM: 'This site was restored from {quickstart}, not {id}.'
})
