/**
 * Every word the public Templates pages show, in ONE place (issue #1762).
 *
 * The sentences live in Tracy's interface-language dictionaries (`lib/i18n/strings.js` and
 * `locales/*.json`, keys `tpl.*`, the same mechanism as the sign-in pages); `wordsFor(lang)` hands
 * the pages the same shape they always read. Template names, blurbs, categories and industry names
 * are NOT here: they are published data and stay as published (English).
 *
 * Visible copy carries no em or en dash (Akemi's rule for anything a customer reads).
 */

/** How a platform is named on the page. A platform not listed shows its own id. */
export const PLATFORM_NAMES = Object.freeze({ wordpress: 'WordPress', joomla: 'Joomla', emdash: 'EmDash' })

/** Platform names reserved under `/templates/`: a template id can never take one (the gallery filter chips use them, and old platform addresses redirect). */
export const RESERVED_SEGMENTS = Object.freeze(Object.keys(PLATFORM_NAMES))

/** Pages on the landing site and elsewhere that the header and footer link to (`lib/public-links.js`). */
export { LINKS }

/** The languages the landing site has its own pages for, under `/<lang>/`; every other language reads the English root pages. */
const LANDING_LANGUAGES = Object.freeze(['de', 'fr', 'es', 'it', 'nl'])

/** Address of a landing page (`help`, `privacy`, `terms`) in the visitor's language, falling back to English. */
export function landingPage(lang, page) {
  const prefix = LANDING_LANGUAGES.includes(lang) ? `${lang}/` : ''
  return `${DEFAULT_LANDING_ORIGIN}/${prefix}${page}/`
}

import { translator } from '../lib/i18n/index.js'
import { DEFAULT_LANDING_ORIGIN, LINKS } from '../lib/public-links.js'

/** Joins names the way a sentence does: "A", "A and B", "A, B and C" (the "and" follows the language). */
export function joinNames(names, t = translator('en')) {
  if (names.length <= 1) return names.join('')
  return t('tpl.and', { rest: names.slice(0, -1).join(', '), last: names[names.length - 1] })
}

const CACHE = new Map()

/** Every visible word of the Templates pages in one language (`lang` is one of `WEB_LANGUAGES`). */
export function wordsFor(lang = 'en') {
  const t = translator(lang)
  if (CACHE.has(t.lang)) return CACHE.get(t.lang)
  const words = Object.freeze({
    lang: t.lang,
    htmlLang: t.htmlLang,
    siteName: 'Tracy',
    nav: {
      label: t('tpl.nav.label'),
      templates: t('tpl.nav.templates'),
      help: t('tpl.nav.help'),
      downloadApp: t('tpl.nav.downloadApp'),
      getStarted: t('tpl.nav.getStarted'),
      openMenu: t('tpl.nav.openMenu'),
      closeMenu: t('tpl.nav.closeMenu')
    },
    breadcrumb: t('tpl.breadcrumb'),
    templates: t('tpl.templates'),
    /** `<title>` of one template's page. */
    detailTitle: (name, cms) => t('tpl.detailTitle', { name, cms: joinNames(cms, t) }),
    detailDescriptionFallback: (name, cms) =>
      t('tpl.detailDescriptionFallback', { name, cms: joinNames(cms, t) }),
    useTemplate: t('tpl.useTemplate'),
    useTemplateLabel: t('tpl.useTemplateLabel'),
    viewDemo: t('tpl.viewDemo'),
    facts: {
      label: t('tpl.facts.label'),
      industry: t('tpl.facts.industry'),
      style: t('tpl.facts.style'),
      provider: t('tpl.facts.provider'),
      supportedCms: t('tpl.facts.supportedCms')
    },
    heroAlt: (name) => t('tpl.heroAlt', { name }),
    layoutsHeading: t('tpl.layoutsHeading'),
    layoutsSub: (count, name) =>
      count === 1 ? t('tpl.layoutsSub.one', { name }) : t('tpl.layoutsSub.many', { count, name }),
    layoutAlt: (name, layout, device) => t('tpl.layoutAlt', { name, layout, device }),
    desktop: t('tpl.desktop'),
    /** The live preview of the template's demo (`templates-preview-html.js`). */
    preview: {
      label: (name) => t('tpl.preview.label', { name }),
      frameTitle: (name) => t('tpl.preview.frameTitle', { name }),
      device: t('tpl.preview.device'),
      desktop: t('tpl.preview.desktop'),
      phone: t('tpl.preview.phone'),
      theme: t('tpl.preview.theme'),
      light: t('tpl.preview.light'),
      dark: t('tpl.preview.dark'),
      start: t('tpl.preview.start'),
      loading: t('tpl.preview.loading'),
      blocked: t('tpl.preview.blocked')
    },
    noPreview: t('tpl.noPreview'),
    /** The industry of the page when other templates share it, else the plain heading. */
    moreHeading: (industry) => (industry ? t('tpl.moreHeading', { industry }) : t('tpl.moreHeadingPlain')),
    gallery: {
      filterLabel: t('tpl.gallery.filterLabel'),
      all: t('tpl.gallery.all'),
      allIndustries: t('tpl.gallery.allIndustries'),
      industryLabel: t('tpl.gallery.industryLabel'),
      noMatch: t('tpl.gallery.noMatch'),
      reset: t('tpl.gallery.reset'),
      title: t('tpl.gallery.title'),
      description: t('tpl.gallery.description'),
      heading: t('tpl.gallery.heading'),
      intro: t('tpl.gallery.intro'),
      empty: t('tpl.gallery.empty')
    },
    cardAlt: (name) => t('tpl.cardAlt', { name }),
    seeAll: t('tpl.seeAll'),
    seeAllCount: (count) => (count > 1 ? t('tpl.seeAllCount', { count }) : t('tpl.seeAll')),
    unavailable: t('tpl.unavailable'),
    notFoundTitle: t('tpl.notFoundTitle'),
    notFoundHeading: t('tpl.notFoundHeading'),
    notFoundText: t('tpl.notFoundText'),
    footer: {
      blurb: t('tpl.footer.blurb'),
      product: t('tpl.footer.product'),
      community: t('tpl.footer.community'),
      webApp: t('tpl.footer.webApp'),
      freeTemplates: t('tpl.nav.templates'),
      legal: t('tpl.footer.legal'),
      helpCenter: t('tpl.footer.helpCenter'),
      download: t('tpl.footer.download'),
      language: t('tpl.footer.language'),
      theme: {
        toDark: t('tpl.footer.theme.toDark'),
        toLight: t('tpl.footer.theme.toLight'),
        titleDark: t('tpl.footer.theme.titleDark'),
        titleLight: t('tpl.footer.theme.titleLight')
      },
      privacy: t('tpl.footer.privacy'),
      terms: t('tpl.footer.terms'),
      copyright: (year) => t('tpl.footer.copyright', { year })
    }
  })
  CACHE.set(t.lang, words)
  return words
}

/** The English words: the default, and what a crawler with no cookie reads. */
export const WORDS = wordsFor('en')
