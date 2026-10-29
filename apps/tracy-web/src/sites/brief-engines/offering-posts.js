/**
 * The owner's own posts about each offering, for the copy writer of that offering's card and page (spec TracyHQ/tracy#189,
 * round 9 class F). CMS-neutral: the Joomla planner reads it now (`ownPosts`), a WordPress or EmDash writer can hand the
 * same map to its own planner.
 *
 * Measured 30/10/2026 on a local brief build: an offering page said "skills, strength and gentle conditioning" while the
 * owner had posted about that offering (personalised plans, strength, weight loss, flexible scheduling, DM to book); the
 * writer was told the offering's name and nothing it had said about it.
 *
 * A post is about an offering when it names it: every distinctive word of the name (an activity word such as "lessons"
 * only counts when the name has nothing else) appears in the post, spelling variants alike. Only the page's own posts
 * count (`authorship: 'page'`), never a review or a mention. Bounded for a large catalogue: at most `PER_OFFERING` posts
 * an offering, each cut to `POST_CHARS`.
 */

export const PER_OFFERING = 3
export const POST_CHARS = 600

/** Words that say what kind of thing an offering is rather than which one. */
const GENERIC = new Set([
  'lesson',
  'lessons',
  'class',
  'classes',
  'session',
  'sessions',
  'course',
  'courses',
  'training',
  'coaching',
  'service',
  'services',
  'package',
  'packages',
  'and',
  'for',
  'the',
  'with'
])

const wordsOf = (text) =>
  String(text ?? '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3)

/** Two spellings of one word (personalised, personalized; class, classes). */
const sameWord = (a, b) => a === b || (a.length >= 5 && b.length >= 5 && a.slice(0, 5) === b.slice(0, 5))

/**
 * @param {unknown} items - the build's content items (`woContent.forSite(...).items`)
 * @param {unknown} names - the offering names the site plan gives its cards
 * @returns {Record<string, string[]> | null} posts by offering name, or null when none names one
 */
export function offeringPostsOf(items, names) {
  if (!Array.isArray(items) || !Array.isArray(names)) return null
  const own = items.filter((item) => item?.authorship === 'page' && String(item?.body ?? '').trim() !== '')
  /** @type {Record<string, string[]>} */
  const out = {}
  for (const name of new Set(names.filter((n) => typeof n === 'string' && n.trim() !== ''))) {
    const all = wordsOf(name)
    const distinctive = all.filter((w) => !GENERIC.has(w))
    const needed = distinctive.length ? distinctive : all
    if (!needed.length) continue
    const posts = own
      .filter((item) => {
        const words = wordsOf(`${item.title ?? ''} ${item.body ?? ''}`)
        return needed.every((w) => words.some((x) => sameWord(x, w)))
      })
      .slice(0, PER_OFFERING)
      .map((item) =>
        [item.title, item.body]
          .filter(Boolean)
          .join('\n')
          .replace(/#[\p{L}\p{N}_]+/gu, '')
          .replace(/\s+\n/g, '\n')
          .trim()
          .slice(0, POST_CHARS)
      )
    if (posts.length) out[name] = posts
  }
  return Object.keys(out).length ? out : null
}
