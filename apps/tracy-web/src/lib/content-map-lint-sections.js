/**
 * The packing rules of a content map's sections, card links, offering rows, list items and text boxes (spec
 * TracyHQ/tracy#189, round 9): each one a declaration the brief engine otherwise guesses, measured wrong on a real build.
 *
 *   section body    a section that lists records it does not hold (a Joomla article list) says what it lists
 *                   (`entity.lists`), so its heading is written for its body, not for a figure in its intro
 *   card link       the link of a card that wraps its title declares where it goes (`action`), so the build does not
 *                   guess it from the card's other words (a phone line made an offering's title a call link)
 *   offering rows   a row group of offerings holds as many rows as the template has offerings, or is declared a
 *                   repeatable list with its own capacity
 *   outline items   a list item worded as the demo trade's session rhythm (rounds, rest, repeat) is declared as a step
 *                   of an outline, so the writer writes the business's own outline instead of mirroring the demo's
 *   text capacity   a box whose capacity is exactly its demo words was measured shrunk to them, not at the room it has
 *
 * Rules read slot roles, groups and entity declarations only, never a template's name or module id. They join
 * `LINT_RULES` (`content-map-lint.js`); how to fix each is in the quickstart-contract skill's declaration rules.
 */
import { collectionOfGroupId, isGroupKind } from 'website-opportunities/domain'

const list = (v) => (Array.isArray(v) ? v : [])
const nonEmpty = (v) => typeof v === 'string' && v.trim() !== ''

/** A Joomla module that renders records it does not hold (an article list): its body is read from other entities. */
const LISTING_MODULE = /^mod_articles/
/** The section words a heading writer is told about: a heading or intro of the section, in no group. */
const SECTION_WORDS = new Set(['editorial.heading', 'editorial.paragraph'])
/** The roles that name a card: the words a card's title link wraps. */
const CARD_NAMES = new Set(['offering.name', 'person.name', 'package.name', 'event.title', 'step.title'])
/** Group kinds that are no card with a title of its own. */
const NOT_A_CARD = new Set(['business', 'contact', 'gallery'])
/** The group kinds whose rows show offerings. */
const OFFERING_KINDS = new Set(['service', 'menu_item'])
/** Prices on a card: a priced card stands for the offering its own name says (a gift card), not a row of every offering. */
const PRICE_ROLES = new Set(['offering.price', 'offering.price_note', 'package.price'])
/**
 * The words of a workout's rhythm: rounds, rest, repeats, sets, reps, laps, intervals, "5X". A list item made of them is
 * the demo trade's session structure, not words the business gave.
 */
const RHYTHM = /\b(?:rest|repeat|rounds?|reps?|sets?|laps?|intervals?|breather)\b|\b\d+\s*x\b|\bx\s*\d+\b/i
/** List items are short; a paragraph is not one. */
const ITEM_MAX = 60
/** A box whose demo words are longer than this is a paragraph, where a shrunk box is a different defect. */
const LABEL_MAX = 80

/** The collections of a map's groups: collection id to its groups, each `{id, kind, presentation, members}`. */
function collectionsOf(groups) {
  /** @type {Map<string, Array<{id: string, kind: string, presentation: string | undefined, members: any[]}>>} */
  const out = new Map()
  for (const [id, members] of groups) {
    const collection = collectionOfGroupId(id)
    if (!collection) continue
    const g = members[0].group
    out.set(collection, [...(out.get(collection) ?? []), { id, kind: g.kind, presentation: g.presentation, members }])
  }
  return out
}

/** How many offerings the template itself shows: its largest offering row group, or its offering pages. */
function templateOfferingCount(slots, collections) {
  const pages = new Set(
    slots
      .filter((s) => s.role === 'offering.name' && s.group?.id === `${s.entity}.offering`)
      .map((s) => s.entity)
  )
  let most = pages.size
  for (const groups of collections.values())
    if (groups.some((g) => OFFERING_KINDS.has(g.kind))) most = Math.max(most, groups.length)
  return most
}

/** @type {import('./content-map-lint.js').LintRule[]} */
export const SECTION_RULES = [
  {
    id: 'section-body-undeclared',
    severity: 'error',
    checks: 'a section that lists records it does not hold says what it lists, so its heading matches its body',
    fix: 'Declare on the entity what its body lists, as a group kind: "lists": "service" for a list of offerings, "post" for posts, "person" for people. Without it the heading is written for the groups of its intro (a figure beside the intro made a class list read "Our figures").',
    find: ({ map, slots }) => {
      const out = []
      for (const entity of list(map?.entities)) {
        const declared = entity?.lists
        const heading = slots.find((s) => s.entity === entity?.key && !s.group && SECTION_WORDS.has(s.role))
        if (declared !== undefined && !isGroupKind(declared, map?.roleVocabularyVersion)) {
          out.push({ key: String(entity.key), note: `lists ${JSON.stringify(declared)} is not a group kind` })
          continue
        }
        if (declared !== undefined || !heading) continue
        if (!LISTING_MODULE.test(String(entity?.identity?.module ?? ''))) continue
        out.push({
          key: String(heading.key),
          note: `"${entity.key}" (${entity.identity.module}) lists records but does not say what it lists`
        })
      }
      return out
    }
  },
  {
    id: 'card-title-link-undeclared',
    severity: 'error',
    checks: "the link of a card that wraps the card's title declares where it goes",
    fix: 'Give the url slot an action: {"kind": "go-to-item"} for a link to the item\'s own page (or "navigation" for another page of the site). Undeclared, the build guesses the target from every word of the card, and a phone line beside the title made the title a call link.',
    find: ({ slots, groups }) =>
      slots
        .filter(
          (s) =>
            s.type === 'url' &&
            s.role === 'editorial.navigation_url' &&
            !s.action &&
            nonEmpty(s.group?.id) &&
            !NOT_A_CARD.has(s.group.kind) &&
            list(groups.get(s.group.id)).some((m) => CARD_NAMES.has(m.role))
        )
        .map((s) => ({ key: String(s.key), note: `card "${s.group.id}" has a title link with no action` }))
  },
  {
    id: 'offering-rows-short',
    severity: 'error',
    checks: 'a row group of offerings holds as many rows as the template has offerings, or is a repeatable list',
    fix: 'Declare the collection in repeatableLists with its real capacity: {"<collection>": {"itemTemplate": "<first group id>", "min": 0, "max": <rows it holds>}}. The build then shows the first offerings it has room for and leaves the rest to the offering list, instead of a block that silently drops some of them.',
    find: ({ map, slots, groups }) => {
      const declared = map?.repeatableLists && typeof map.repeatableLists === 'object' ? map.repeatableLists : {}
      const collections = collectionsOf(groups)
      const needed = templateOfferingCount(slots, collections)
      const out = []
      for (const [collection, items] of collections) {
        const rows =
          items.every((g) => OFFERING_KINDS.has(g.kind)) ||
          items.every((g) => g.kind === 'step' && g.presentation === 'offering-tabs')
        const priced = items.some((g) => g.members.some((m) => PRICE_ROLES.has(m.role)))
        if (!rows || priced || items.length >= needed || Object.hasOwn(declared, collection)) continue
        out.push({
          key: String(items[0].members[0].key),
          note: `"${collection}" holds ${items.length} of the template's ${needed} offerings`
        })
      }
      return out
    }
  },
  {
    id: 'outline-item-unroled',
    severity: 'error',
    checks: "a list item worded as the demo trade's session rhythm (rounds, rest, repeat) is declared as an outline step",
    fix: 'Group the card as an outline: its heading step.title and each list item step.description in one group of kind "step" with "presentation": "session-outline". As a free paragraph the writer copies the demo\'s rhythm ("one focused round, take a breather, repeat") into a trade that has none.',
    find: ({ slots }) =>
      slots
        .filter(
          (s) =>
            s.type === 'text' &&
            s.role === 'editorial.paragraph' &&
            !s.group &&
            String(s.sample ?? '').trim().length <= ITEM_MAX &&
            RHYTHM.test(String(s.sample ?? ''))
        )
        .map((s) => ({ key: String(s.key), note: `list item "${String(s.sample).trim()}" is not roled` }))
  },
  {
    id: 'text-box-at-demo-length',
    severity: 'warning',
    checks: 'a text box holds more than its demo words when the room around it is wider (capacity not measured at them)',
    fix: 'Measure again with the capture that reads the room a shrunk box can grow into (content-coverage --fit). The map keeps only the box, so it cannot say whether the room is wider: a capacity equal to the demo words on every viewport means the box was measured shrunk to them, and every brief is forced into names as short as the demo\'s.',
    find: ({ slots }) =>
      slots
        .filter((s) => {
          const fit = s.fit
          if (s.type !== 'text' || fit?.measured !== true || !fit.maxChars) return false
          const length = String(s.sample ?? '').length
          const counts = Object.values(fit.maxChars)
          const lines = Object.values(fit.lines ?? {})
          return (
            length > 0 &&
            length <= LABEL_MAX &&
            counts.length > 0 &&
            counts.every((c) => c === length) &&
            lines.every((l) => l === 1)
          )
        })
        .map((s) => ({
          key: String(s.key),
          note: `capacity ${s.fit.maxCharacters} is the demo's "${String(s.sample).slice(0, 30)}"`
        }))
  }
]
