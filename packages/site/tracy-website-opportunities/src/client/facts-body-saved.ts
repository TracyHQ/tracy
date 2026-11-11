/**
 * The facts of the Workspace card body as the saved profile states them (#537 R18): phone, address, hours, the bio,
 * Google's rating and review count and the followers of the Instagram page. A fact the owner or a rule keeps off the
 * site keeps its value and is marked off (the body dims it, as the Business facts page does); N/A is only for a fact
 * research did not find. Pure; `facts-body-model.ts` falls back to the raw research for a fact the saved profile does
 * not hold.
 */
import type { Fact, FactValue } from './facts-body-model.ts'
import { ratingText } from './profile-rating-model.ts'
import { type SavedFact, savedFactsOf } from './saved-profile-model.ts'

type Rec = Record<string, unknown>
const rec = (v: unknown): Rec => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {})
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

/** The body's slots a saved fact can keep off the site. */
export type OffSlot = 'phone' | 'address' | 'hours' | 'about' | 'rating' | 'followers'

/** The followers slot: the count of the Instagram page, under the Followers label. */
export const followersSlot = (count: number, locale: string, off = false): Fact => ({
  id: 'followers',
  labelKey: 'pp.stat.followers',
  value: {
    kind: 'text',
    text: new Intl.NumberFormat(locale).format(count),
    title: new Intl.NumberFormat(locale).format(count)
  },
  off
})

/** The body's facts from the saved profile, or null for the raw research's (before the saved profile). */
export function factsBodyFromSaved(saved: unknown, locale: string) {
  const facts = savedFactsOf(saved)
  if (facts.length === 0) return null
  const biz = (key: string) => facts.find((f) => f.group === 'business' && f.key === key)
  const stat = (label: string, scope?: RegExp) =>
    facts.find(
      (f) =>
        f.key === 'statistics' &&
        rec(f.value).label === label &&
        (scope === undefined || scope.test(String(rec(f.value).scope ?? '')))
    )
  const amount = (f: SavedFact | undefined): number | null =>
    typeof rec(f?.value).amount === 'number' ? (rec(f?.value).amount as number) : null
  const story = facts.find((f) => f.group === 'quotes' && rec(f.value).kind === 'story')
  const hours = biz('hours')
  const ratingFact = stat('rating')
  const reviewFact = stat('reviewCount')
  const followerFact = stat('followers', /instagram\.com/i)
  const rating = amount(ratingFact)
  // A count kept off beside a rating on the site is not said; a rating kept off reads whole, dimmed.
  const reviews = ratingFact?.onSite && reviewFact?.onSite === false ? null : amount(reviewFact)
  const followers = amount(followerFact)
  const off = new Set<OffSlot>()
  const mark = (slot: OffSlot, f: SavedFact | undefined) => {
    if (f !== undefined && !f.onSite) off.add(slot)
  }
  mark('phone', biz('phone'))
  mark('address', biz('address'))
  mark('hours', hours)
  mark('about', story)
  mark('rating', ratingFact)
  mark('followers', followerFact)
  const words = (f: SavedFact | undefined): string | null | undefined =>
    f === undefined ? undefined : text(f.value)
  const say = (key: string, params: Record<string, string | number>): FactValue => ({
    kind: 'say',
    key,
    params,
    title: null
  })
  return {
    off,
    phone: words(biz('phone')),
    address: words(biz('address')),
    hours: hours === undefined ? undefined : Array.isArray(hours.value) ? hours.value.map(String) : null,
    about: story === undefined ? undefined : text(rec(story.value).text),
    rating:
      rating === null
        ? null
        : reviews === null
          ? say('facts.body.ratingNoCount', { rating: ratingText(rating, locale) })
          : say(reviews === 1 ? 'facts.body.ratingOne' : 'facts.body.ratingMany', {
              rating: ratingText(rating, locale),
              count: new Intl.NumberFormat(locale).format(reviews)
            }),
    followers:
      followers === null
        ? ({ id: 'spare', labelKey: null, value: null } as Fact)
        : followersSlot(followers, locale, off.has('followers'))
  }
}
