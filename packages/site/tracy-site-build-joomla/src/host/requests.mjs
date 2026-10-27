/** Registered commands select fixed build stages; catalog data never executes arbitrary code. */

import { packFor, supportedLocales } from '@tracy/seeder/language-catalog'
import {
  AmbiguousLocaleError,
  normaliseLocale,
  normaliseLocales,
  primaryOf,
  SOURCE_LOCALE,
  sourceVariant
} from '@tracy/seeder/locales'

/** @type {NonNullable<import('@tracy/site-build-core/host').CmsSpec['requests']>} */
export const requests = {
  'content.revise': {
    recipe: 'content.contract',
    hint: '{answers:{...}} — updated brief fields; regenerates copy in the existing slots.',
    change(input) {
      const answers = input.answers
      if (!answers || typeof answers !== 'object' || Array.isArray(answers))
        throw new Error('content.revise needs answers containing the customer brief changes')
      return { answers: /** @type {Record<string, unknown>} */ (answers), stage: 'copy' }
    }
  },
  /**
   * "Add Chinese to the website" — the whole language version, not a package install.
   *
   * 🔒 WHAT THIS REFUSES, AND WHY EACH REFUSAL IS DIFFERENT. A code that names no written form is
   * a QUESTION for the customer: choosing between Simplified and Traditional on their behalf ships
   * a finished site in the wrong Chinese, and nobody on the team can see that it is wrong. A locale
   * with no verified package is a fact about what Tracy can install, and the message names what it
   * can. Neither is "unsupported"; telling them apart is the difference between asking one question
   * and promising something that will not arrive.
   */
  'language.add': {
    recipe: 'language.add',
    change(input, job) {
      let locale
      try {
        locale = normaliseLocale(input.language)
      } catch (error) {
        if (error instanceof AmbiguousLocaleError)
          throw new Error(`${error.message}. Ask the customer, then call language.add again with the tag.`)
        throw error
      }
      // The catalog, not a branch: adding a language later is a reviewed data change, and this
      // refusal is generated from the same file the Claude Cowork plugin installs from.
      packFor(locale, 6)
      // 🔒 A DESIGN WITH NO SECOND EDITION HAS ONE LANGUAGE, SO "ADD" MEANS "SWITCH". Appending made
      // `['vi-VN']` into `['en-GB', 'vi-VN']` and the one-language build published en-GB (j-cr4l1l,
      // 23/09/2026). The site's language becomes this one, and the copy is written again in it.
      if (job.designPlan?.multilingual === false) return { answers: { languages: [locale] }, stage: 'copy' }
      // Lee, 23/09/2026: another spelling of English is not a second language. It RENAMES the
      // English edition (the `language` stage relabels the source), so the answer carries the
      // variant in the source's place; any other language keeps the variant already chosen.
      const current = job.answers?.languages ?? []
      const english =
        primaryOf(locale) === primaryOf(SOURCE_LOCALE) ? locale : (sourceVariant(current) ?? SOURCE_LOCALE)
      const others = normaliseLocales([...current, locale]).slice(1)
      return { answers: { languages: [english, ...others] }, stage: 'language' }
    },
    /** What the tool description can honestly offer, straight from the reviewed catalog. */
    locales: supportedLocales(6),
    hint:
      `{language:"zh-CN"} — adds a COMPLETE language version: the pack, the translated content, ` +
      `menus and URLs, translation links, the language switcher and per-language SEO, with the ` +
      `original language left working. Verified languages: ${supportedLocales(6)
        .filter((tag) => primaryOf(tag) !== primaryOf(SOURCE_LOCALE))
        .join(', ')}. Another English (${supportedLocales(6)
        .filter((tag) => primaryOf(tag) === primaryOf(SOURCE_LOCALE) && tag !== SOURCE_LOCALE)
        .join(
          ', '
        )}) is not a second language: it renames the English edition to that tag, same pages and menus. ` +
      `A bare "zh" or "pt" is refused with the choices to ask the customer about. ` +
      `It does NOT translate category names, words inside images, or menu items outside the ` +
      `published contract — say so rather than promising them. On a quickstart with no second ` +
      `edition (its build says one language) it SWITCHES the site's one language instead: the pack ` +
      `becomes the default and the customer's copy is written again in it.`
  },
  // Still registered, still blocked, and deliberately so. A NEW site is built with the design its
  // customer picked, at provision, before the contract binds — this command is the other thing:
  // changing the design of a site that already carries content and a binding. That needs a
  // migration that can move the content across profiles, and until one exists the capability stays
  // pending so the refusal names a reason instead of the command simply not being there.
  'design.apply.airbnb': {
    recipe: 'design.apply',
    hint: '{} — re-dresses the site in the Airbnb design.',
    change() {
      return { answers: {}, stage: 'template', inspiration: 'airbnb' }
    }
  }
}
