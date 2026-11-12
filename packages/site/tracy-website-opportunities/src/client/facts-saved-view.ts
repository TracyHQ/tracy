/**
 * The Business facts view with the saved profile laid on (#537 R18): once research has made one, the bands read the
 * saved profile's groups (`saved-profile-model.ts savedBandsOf`), so a value the owner edited, a fact kept off and a
 * person or a link the owner added show as they will on the site. Before research there is none, and the view stays
 * what the pasted links gave. Pure.
 */
import type { BusinessFactsView, CardState, ReviewQuoteView } from './business-facts-model.ts'
import type { ReadingItemView } from './profile-reading-model.ts'
import { plainWords } from './facts-value-model.ts'
import { type SavedBands, type SavedFact, savedBandsOf } from './saved-profile-model.ts'

type Rec = Record<string, unknown>
const rec = (v: unknown): Rec => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {})
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
const fold = (v: string): string => v.trim().toLocaleLowerCase()

/** A guest review of the saved profile as its card: its key for the reviews door, else its fact for the facts door. */
function reviewOf(f: SavedFact): ReviewQuoteView {
  const v = rec(f.value)
  const rating = rec(v.attribution).rating
  return {
    key: f.reviewKey,
    ownerHidden: f.ownerHidden,
    factId: f.id,
    onSite: f.onSite,
    author: text(v.author) ?? '',
    text: text(v.text) ?? '',
    rating: typeof rating === 'number' ? rating : null,
    source: f.sourceKind === 'tripadvisor' ? 'tripadvisor' : 'google'
  }
}

/**
 * The team: the people the reading names (they keep the reading's own doors, and the removed ones stay to be put
 * back), then every person of the saved profile the reading does not name, switched through the facts door.
 */
function teamOf(reading: readonly ReadingItemView[], people: readonly SavedFact[]): ReadingItemView[] {
  const out = reading.map((item) => {
    const fact = people.find((f) => f.teamMemberId === item.id)
    return fact === undefined ? item : { ...item, factId: fact.id, factOn: fact.onSite, edited: fact.edited }
  })
  for (const f of people) {
    // A person of no name this page knows reads the plain parts of the fact: nothing research found is dropped.
    const name = text(rec(f.value).name) ?? text(plainWords(f.value))
    if (name === null) continue
    if (out.some((i) => i.id === f.teamMemberId || i.factId === f.id || fold(i.label) === fold(name)))
      continue
    out.push({
      id: f.teamMemberId ?? f.id,
      label: name,
      quote: '',
      from: f.added ? 'owner' : 'post',
      url: null,
      platform: f.sourceKind,
      role: text(rec(f.value).role),
      removed: false,
      reviewsOnly: false,
      onSite: f.onSite,
      owner: f.added,
      photoId: f.photoMediaId,
      researchLabel: f.edited ? text(rec(f.researchValue).name) : null,
      factId: f.id,
      factOn: f.onSite,
      edited: f.edited
    })
  }
  return out
}

const filled = (state: CardState, yes: boolean): CardState =>
  state === 'notCollected' ? state : yes ? 'filled' : 'none'

/** The view with the saved profile's groups laid on; the view itself when there is none. */
export function withSavedProfile(view: BusinessFactsView, savedProfile: unknown): BusinessFactsView {
  const saved: SavedBands | null = view.researched ? savedBandsOf(savedProfile) : null
  if (saved === null) return { ...view, saved: null }
  const one = (key: string) => saved.business.find((f) => f.key === key) ?? null
  const phone = one('phone')
  const address = one('address')
  const team = teamOf(view.team, saved.people)
  const reviews = saved.reviews.map(reviewOf)
  const phoneText = text(phone?.value)
  const has: Record<string, boolean> = {
    hours: saved.hours !== null || saved.amenities !== null || saved.reservable !== null,
    services: saved.offerings.length > 0,
    about: saved.about.length > 0,
    team: team.length > 0,
    reviews: reviews.length > 0,
    social: saved.links.length > 0 || saved.statistics.length > 0 || view.social.length > 0
  }
  return {
    ...view,
    saved,
    team,
    reviews,
    business: {
      ...view.business,
      address: text(address?.value) ?? view.business.address,
      phones:
        phoneText === null
          ? view.business.phones
          : { mainWhatsapp: false, others: [], ...view.business.phones, main: phoneText },
      facts: { phone, address }
    },
    cards: view.cards.map((c) => (c.id in has ? { ...c, state: filled(c.state, has[c.id] === true) } : c))
  }
}
