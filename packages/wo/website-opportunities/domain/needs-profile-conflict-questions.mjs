// Questions that ask the customer to confirm a fact about their own business where the sources disagree (ticket #592,
// product decision of 13/11). Pure rules, no model. Only important facts are asked; every other conflict stays in
// `conflicts` with its trust order default and the reason it was not asked.
import { QUESTION_SCHEMA } from './build-contract-questions.mjs'
import { primaryRoleOf } from './needs-profile-merge.mjs'

/**
 * The facts worth a question when sources disagree, in the order they are asked, with the group that places them
 * among the other questions and the longest free text answer. `contact` conflicts come before every other question:
 * a wrong phone, email, address, opening hours, booking link or business name sends a visitor to the wrong place or
 * to no one. `price` conflicts come last: a wrong price misleads but does not lose the visitor. Any other conflict
 * (a description, a role, a rating, a social link) is shown on the plan with its default and never asked.
 */
export const IMPORTANT_CONFLICTS = Object.freeze({
  'contact.phone': { group: 'contact', maxLength: 40, what: 'phone number' },
  'contact.email': { group: 'contact', maxLength: 120, what: 'email address' },
  'contact.address': { group: 'contact', maxLength: 200, what: 'address' },
  'contact.hours': { group: 'contact', maxLength: 200, what: 'opening hours' },
  'contact.cta_url': { group: 'contact', maxLength: 300, what: 'booking or contact link' },
  'business.name': { group: 'contact', maxLength: 120, what: 'business name' },
  'offering.price': { group: 'price', maxLength: 60, what: 'price' },
  'package.price': { group: 'price', maxLength: 60, what: 'price' }
})
export const NOT_IMPORTANT =
  'not an important fact: shown on the plan with its trust order default, never asked'
const ROLES = Object.keys(IMPORTANT_CONFLICTS)
const rankOf = (role) => (ROLES.includes(role) ? ROLES.indexOf(role) : ROLES.length)

/** Where a source came from, in the customer's words. */
function whereFrom(source) {
  if (source?.origin === 'website') return 'your website'
  if (source?.origin === 'google') return 'your Google listing'
  const ref = String(source?.ref ?? '').toLowerCase()
  if (ref.includes('instagram.')) return 'your Instagram'
  if (ref.includes('facebook.')) return 'your Facebook page'
  if (ref.includes('tiktok.')) return 'your TikTok'
  return 'your social profile'
}
const listOf = (words) =>
  words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`

/** The name of the item a field conflict is about (`items.<kind>.<id>.<role>`), or null for a business fact. */
function itemNameOf(conflict, items) {
  const [scope, kind] = conflict.at.split('.')
  if (scope !== 'items') return null
  const item = (items?.[kind] ?? []).find((i) => conflict.at.startsWith(`items.${kind}.${i.id}.`))
  return item?.fields[primaryRoleOf(kind)]?.value ?? null
}

/** One Contract B `fact-conflict` question for `conflict`; its id follows the conflict's place, so it is stable. */
function conflictQuestion(conflict, { items, sources }) {
  const rule = IMPORTANT_CONFLICTS[conflict.kind]
  const byId = new Map(sources.map((s) => [s.id, s]))
  const item = itemNameOf(conflict, items)
  const about = item ? `the ${rule.what} of ${item}` : `your ${rule.what}`
  return {
    schema: QUESTION_SCHEMA,
    id: `fact-conflict.${conflict.at}`,
    topic: 'fact-conflict',
    fact: conflict.kind,
    prompt: `Your public pages give different values for ${about}. Which one is right?`,
    choices: conflict.values.map((v, n) => ({
      id: `value-${n + 1}`,
      label: v.value,
      detail: `From ${listOf([...new Set(v.sources.map((id) => whereFrom(byId.get(id))))])}`,
      ...(v.value === conflict.default ? { recommended: true } : {})
    })),
    freeText: { maxLength: rule.maxLength, placeholder: 'Type the right value' }
  }
}

/**
 * The conflicts worth asking, as questions grouped `contact` and `price` (each in `IMPORTANT_CONFLICTS` order, then
 * in conflict order), and for every conflict whether it was asked: `{conflict, question}` or `{conflict, reason}`.
 */
export function conflictQuestionsOf({ conflicts = [], items = {}, sources = [] }) {
  const asked = { contact: [], price: [] }
  const accounting = []
  const ordered = [...conflicts].sort((a, b) => rankOf(a.kind) - rankOf(b.kind))
  for (const conflict of ordered) {
    const rule = IMPORTANT_CONFLICTS[conflict.kind]
    if (!rule) {
      accounting.push({ conflict: conflict.id, reason: NOT_IMPORTANT })
      continue
    }
    const q = conflictQuestion(conflict, { items, sources })
    asked[rule.group].push(q)
    accounting.push({ conflict: conflict.id, question: q.id })
  }
  return { contact: asked.contact, price: asked.price, accounting }
}
