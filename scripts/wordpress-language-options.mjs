/**
 * The language options a WordPress questionnaire offers, derived from the WordPress locale catalogue.
 *
 * One function for two callers so they cannot disagree: `sync-questions.mjs` WRITES this list into
 * `tracy-site-build-wordpress/questions.json`, and `check-questions.ts` refuses the file when it
 * says anything else. The spelling is the questionnaire's (an option must match `^[a-z][a-z0-9-]*$`
 * and is the same lowercase tag Joomla offers), and the seeder's `wpLocaleFor` turns `zh-cn` into
 * `zh_CN` at the one edge that hands a locale to WordPress.
 */
import { supportedWordpressLocales } from '../packages/cms/tracy-seeder/src/wordpress-language-catalog.mjs'
import { DROPPED_LANGUAGE_OPTIONS } from '../packages/site/tracy-site-build-core/src/questions.mjs'

/**
 * Every locale a WordPress 7 site can be built in, source first, lowercased for the questionnaire —
 * less the obsolete and duplicate regional tags the default set no longer offers
 * (`DROPPED_LANGUAGE_OPTIONS`, 07/10/2026).
 */
export function wordpressLanguageOptions() {
  return supportedWordpressLocales().filter((tag) => !DROPPED_LANGUAGE_OPTIONS.includes(tag))
}

/**
 * The language options of the EmDash DEFAULT set: the same cleaned list WordPress offers (O5,
 * 07/10/2026), so the three CMS ask one list. Spelled as WordPress spells it (`vi-vn`); the EmDash
 * engine folds a tag to the template's own locale (`vi`) at its edge. Joomla's list holds one more
 * (`ga-ie`), which no WordPress or EmDash template can serve.
 */
export function emdashStandardLanguageOptions() {
  return wordpressLanguageOptions()
}
