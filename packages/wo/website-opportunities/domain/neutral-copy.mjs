import { readFileSync } from 'node:fs'
import { DEFAULT_NEUTRAL_BY_ROLE } from './place-content-roles.mjs'
import { forbiddenFillerText } from './slot-fill-manifest.mjs'

const locales = new Set(['en', 'vi', 'de', 'it', 'fr', 'nl', 'zh', 'es', 'ja', 'ar'])
const catalogues = new Map()
const empty = () => ({ state: 'empty', text: '' })
const valueOf = (fact) => (fact && typeof fact === 'object' ? fact.value : fact)
const hasText = (value) => typeof value === 'string' && Boolean(value.trim())
const own = (object, key) => (object && Object.hasOwn(object, key) ? object[key] : undefined)

function wordsFor(locale) {
  const language = typeof locale === 'string' ? locale.trim().toLowerCase().split('-')[0] : ''
  const key = locales.has(language) ? language : 'en'
  if (!catalogues.has(key)) {
    catalogues.set(
      key,
      JSON.parse(readFileSync(new URL(`./neutral-copy/${key}.json`, import.meta.url), 'utf8'))
    )
  }
  return catalogues.get(key)
}

/**
 * One neutral line of a site language by its key, `{placeholder}`s filled from `vars` (en when the language has none).
 * @param {string} key @param {string} [locale] @param {Record<string, string>} [vars]
 * @returns {string | null}
 */
export function neutralText(key, locale, vars = {}) {
  const line = own(wordsFor(locale), key) ?? own(wordsFor('en'), key)
  return typeof line === 'string' ? line.replace(/\{(\w+)\}/g, (whole, name) => vars[name] ?? whole) : null
}

/**
 * The approved neutral words of a site language, or of every language when none is given: what the demo QA accepts in a
 * slot with no source.
 * @param {string} [locale]
 */
export function neutralWords(locale) {
  const all = locale === undefined ? [...locales] : [locale]
  return [...new Set(all.flatMap((l) => Object.values(wordsFor(l))))]
}

function hasContactPage(business) {
  const page = valueOf(business?.contactPage)
  if (!hasText(page)) return false
  const value = page.trim()
  if (/^\/(?!\/)/.test(value)) return true
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function meetsRequirement(requires, business) {
  const phone = hasText(valueOf(business?.phone))
  if (requires === 'phone') return phone
  if (requires === 'contact-target')
    return phone || hasText(valueOf(business?.email)) || hasContactPage(business)
  return requires === undefined
}

function keyFitsRole(role, key, kind) {
  if (role === 'editorial.heading')
    return key === 'neutral.heading.team' || key === 'neutral.heading.overview'
  const rule = own(DEFAULT_NEUTRAL_BY_ROLE, role)
  if (rule?.requires === 'contact-target') return key === 'neutral.cta.contact' || key === 'neutral.cta.call'
  if (rule?.policy === 'neutral_by_kind') return key === own(rule.keysByKind, kind)
  return rule?.policy === 'neutral_key' && key === rule.key
}

/**
 * Resolve a sidecar policy (or the role default) using the site's language.
 * index is zero-based. business contains accepted phone/email/contactPage values,
 * either strings or Fact objects; the caller supplies any built contact-page path.
 * Block headings use editorial.heading. Literal policies accept { value: 'N/A' }.
 */
export function neutralFor({ role, policy, kind, index, locale, business } = {}) {
  const rule = policy === undefined ? own(DEFAULT_NEUTRAL_BY_ROLE, role) : policy
  if (!rule || typeof rule !== 'object' || Array.isArray(rule)) return empty()
  if (!meetsRequirement(rule.requires, business)) return empty()
  if (rule.policy === 'empty') return empty()
  if (rule.policy === 'index_padded') {
    return role === 'step.index' &&
      Number.isSafeInteger(index) &&
      index >= 0 &&
      Number.isSafeInteger(index + 1)
      ? { state: 'neutral', text: String(index + 1).padStart(2, '0') }
      : empty()
  }
  if (rule.policy === 'literal') {
    return role === 'stat.value' && rule.value === 'N/A' ? { state: 'neutral', text: 'N/A' } : empty()
  }
  const key =
    rule.policy === 'neutral_key'
      ? rule.key
      : rule.policy === 'neutral_by_kind'
        ? own(rule.keysByKind, kind)
        : undefined
  if (!hasText(key) || !keyFitsRole(role, key, kind)) return empty()
  // A sidecar cannot turn a contact label into a promise of an unavailable action.
  const requires =
    key === 'neutral.cta.call' ? 'phone' : key === 'neutral.cta.contact' ? 'contact-target' : undefined
  if (!meetsRequirement(requires, business)) return empty()
  const text = own(wordsFor(locale), key)
  if (!hasText(text) || forbiddenFillerText(text)) return empty()
  return { state: 'neutral', text, neutralKey: key }
}
