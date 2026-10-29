/**
 * The packing check of a quickstart content map's declarations (spec TracyHQ/tracy#189): a wrong or missing slot
 * declaration is caught when the template is PACKED, not discovered when a customer site is built.
 *
 * Every rule reads the map by slot role, group and markup shape, never by template, and reuses the brief engine's own
 * detector for the same question, so the check and the engine agree:
 *   hero        `heroSlotsOf` (the engine's first screen reader)
 *   gallery     `galleryUnit` (the fill plan's real-gallery test)
 *   inline      `demoMarkupOf` + `inlineStylePattern` (the engine's style pattern of a slot)
 *   social      `collectionOfGroupId` (the repeatable lists of ADR 0040)
 * The item icon ground rule needs the demo pictures and lives apart (`content-map-lint-icons.js`).
 *
 * Severity: `error` when the brief engine would write the site wrong with this declaration; `warning` when the engine
 * guesses right today but the declaration does not say so. Each finding carries the rule's fix hint; how to fix each
 * rule is in `.agents/skills/quickstart-contract/references/declaration-rules.md`.
 *
 * Only maps that declare slot roles (ADR 0038) are read: a map released before that has nothing to check.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import {
  collectionOfGroupId,
  contentMapDeclaresRoles,
  heroSlotsOf,
  keepDecisionOf
} from 'website-opportunities/domain'
import { galleryUnit } from 'website-opportunities/domain/fill-plan.mjs'
import { inlineStylePattern } from 'website-opportunities/domain/inline-style.mjs'
import { demoMarkupOf, isUnitPath } from '../sites/brief-engines/inline-styles.js'

const list = (v) => (Array.isArray(v) ? v : [])
const nonEmpty = (v) => typeof v === 'string' && v.trim() !== ''
/** Markup in a sample: an HTML tag or a JA ACM marker. */
const MARKUP = /<\/?[a-z][^>]*>|\(\(\/?[a-z][^()]*\)\)/i
const SOCIAL_ROLES = new Set(['contact.social_url', 'contact.social_label'])
/** The field names of a block's layout settings (JA ACM and kin): how many columns, gaps, items shown, alignment. */
const LAYOUT_FIELD =
  /^(?:show-on|gutter|columns?|cols?|col-\w+|spacing|align(?:ment)?|layout|style|width|height|speed|autoplay|interval|delay|limit|per-row|items?-per-\w+|bg-color|text-color|animation)$/i
/** A value a layout reads: a number with an optional unit, a side, a switch, a colour scheme. */
const LAYOUT_VALUE =
  /^(?:-?\d+(?:\.\d+)?(?:px|em|rem|%|s|ms)?|left|right|center|true|false|yes|no|dark|light)$/i
/** The field a slot holds, from the last part of its label (`Boxing Studio / gutter` is `gutter`). */
const fieldOfLabel = (s) =>
  String(s.label ?? '')
    .split('/')
    .at(-1)
    ?.trim() ?? ''

/**
 * @typedef {{ map: any, slots: any[], kindOf: Map<string, string>, rows: Record<string, any> | null,
 *   groups: Map<string, any[]> }} LintContext
 * @typedef {{ key: string, note: string }} Hit
 * @typedef {{ id: string, severity: 'error' | 'warning', checks: string, fix: string,
 *   find: (ctx: LintContext) => Hit[] }} LintRule
 */

/** @type {LintRule[]} */
export const LINT_RULES = [
  {
    id: 'hero-subline-ungrouped',
    severity: 'warning',
    checks: "the home page hero's subline sits in the same group as its headline",
    fix: 'Give the subline the group of the hero headline (same group id, item and kind) and keep its role, so the hero card names its own subline instead of the engine guessing it by position.',
    find: ({ map }) => {
      const hero = heroSlotsOf(map)
      if (!hero?.subline) return []
      const headGroup = hero.headline?.group?.id
      if (headGroup && hero.subline.group?.id === headGroup) return []
      return [
        {
          key: String(hero.subline.key),
          note: headGroup
            ? `subline is not in the headline's group "${headGroup}"`
            : `the hero headline${hero.headline ? ` "${hero.headline.key}"` : ''} has no group to share`
        }
      ]
    }
  },
  {
    id: 'hero-button-no-link',
    severity: 'error',
    checks: "the hero's main button label has a link slot the engine can write",
    fix: "Declare the button's link as a url slot with the role of its label's pair (contact.cta_url for contact.cta_label) in the label's group; capture with --link-fields-by-role.",
    find: ({ map }) => {
      const hero = heroSlotsOf(map)
      if (!hero?.cta || hero.cta.href) return []
      return [{ key: String(hero.cta.label.key), note: 'the hero button has no url slot at all' }]
    }
  },
  {
    id: 'hero-button-unpaired',
    severity: 'warning',
    checks: "the hero's main button label and its link share one group",
    fix: 'Put the button label and its url in one group (same group id); the engine otherwise takes the next url after the label.',
    find: ({ map }) => {
      const hero = heroSlotsOf(map)
      const cta = hero?.cta
      if (!cta?.href) return []
      const id = cta.label.group?.id
      if (id && cta.href.group?.id === id) return []
      return [
        { key: String(cta.label.key), note: `link "${cta.href.key}" is taken by position, not by group` }
      ]
    }
  },
  {
    id: 'gallery-in-article',
    severity: 'warning',
    checks:
      'a gallery picture does not sit inside an article (a row of card thumbnails there is a card, not a gallery)',
    fix: 'Declare the picture as the picture of its card: offering.image or event.image in the card group, or editorial.illustration with no group. A video card is blocked on a video group kind (see the references).',
    find: ({ slots, kindOf }) =>
      slots
        .filter(
          (s) =>
            s.role === 'business.gallery_image' &&
            (s.group?.kind ?? 'gallery') === 'gallery' &&
            !galleryUnit({ slots: [s] }, kindOf)
        )
        .map((s) => ({
          key: String(s.key),
          note: `gallery picture inside ${kindOf.get(s.entity)} "${s.entity}"`
        }))
  },
  {
    id: 'gallery-group-is-a-card',
    severity: 'warning',
    checks: 'a gallery group holds pictures only, no title, text or video (that is a card list)',
    fix: 'A group with words or a video beside its picture is a card: give it the card kind it shows (service, event, post). Video cards are blocked on a video group kind (see the references); leave them until it exists.',
    find: ({ groups, kindOf }) => {
      const out = []
      for (const [id, members] of groups) {
        if (members[0].group.kind !== 'gallery') continue
        if (members.every((s) => kindOf.get(s.entity) === 'article')) continue
        // A picture's own words (an empty alt or caption field) keep it a gallery tile; a title or a video makes a card.
        const extra = members.filter(
          (s) => s.role === 'business.video' || (s.type === 'text' && nonEmpty(s.sample))
        )
        if (extra.length === 0) continue
        const roles = [...new Set(extra.map((s) => s.role))].join(', ')
        out.push({
          key: String(members.find((s) => s.type === 'image')?.key ?? members[0].key),
          note: `group "${id}" also holds ${roles}`
        })
      }
      return out
    }
  },
  {
    id: 'styled-unit-plain-sample',
    severity: 'warning',
    checks: "a whole-unit HTML slot whose demo mixes inline styles keeps that style in the release's rows",
    fix: 'Nothing to edit in the map: the engine reads the style from presentation-lock.json. Keep the module or article row in the lock; a capture that writes the marker form into the sample would make the map say it.',
    find: ({ slots, rows }) =>
      slots
        .filter((s) => s.type === 'text' && isUnitPath(s.xpath) && !MARKUP.test(String(s.sample ?? '')))
        .filter((s) => {
          const demo = demoMarkupOf(s, rows)
          return demo !== null && inlineStylePattern(demo) !== null
        })
        .map((s) => ({
          key: String(s.key),
          note: `demo "${demoMarkupOf(s, rows)?.slice(0, 60)}" vs sample "${String(s.sample).slice(0, 40)}"`
        }))
  },
  {
    id: 'unit-markup-not-inline',
    severity: 'error',
    checks:
      'a whole-unit HTML slot the build rewrites holds only inline markup (no link, picture or block inside)',
    fix: 'Bind the words, not the unit: capture the text nodes inside the unit as their own slots (or the link as a url slot), or give the slot a keep role. Writing words over the unit wipes the links and blocks inside it.',
    find: ({ slots, rows, map }) =>
      slots
        .filter((s) => s.type === 'text' && isUnitPath(s.xpath) && keepDecisionOf(s, map) !== 'keep')
        .filter((s) => {
          const demo = demoMarkupOf(s, rows)
          return demo !== null && inlineStylePattern(demo) === null
        })
        .map((s) => ({ key: String(s.key), note: `demo "${demoMarkupOf(s, rows)?.slice(0, 80)}"` }))
  },
  {
    id: 'layout-setting-as-text',
    severity: 'warning',
    checks:
      'a layout setting of a block (columns, gutter, items shown, alignment) is not declared as page copy',
    fix: 'A setting is presentation, not words: leave it out of the content map (it belongs in presentation-lock.json), or give it a keep role. As page copy a writer may put a sentence where the layout reads a number.',
    find: ({ slots, map }) =>
      slots
        .filter((s) => s.type === 'text' && keepDecisionOf(s, map) !== 'keep')
        .filter((s) => LAYOUT_FIELD.test(fieldOfLabel(s)) && LAYOUT_VALUE.test(String(s.sample ?? '').trim()))
        .map((s) => ({ key: String(s.key), note: `field "${fieldOfLabel(s)}" holds "${s.sample}"` }))
  },
  {
    id: 'social-list-fixed-length',
    severity: 'warning',
    checks:
      'a list of social links bound item by item is declared as a repeatable list, so it may shrink to the real networks',
    fix: 'Declare the collection in repeatableLists: {"<collection>": {"itemTemplate": "<first group id>", "min": 0, "max": <demo item count>}}. Without it the engine keeps every item and empties the extra ones in place.',
    find: ({ map, groups }) => {
      const declared =
        map?.repeatableLists && typeof map.repeatableLists === 'object' ? map.repeatableLists : {}
      /** @type {Map<string, string[]>} */
      const collections = new Map()
      for (const [id, members] of groups) {
        if (!members.some((s) => SOCIAL_ROLES.has(s.role))) continue
        if (!members.some((s) => Number.isInteger(list(s.jsonPath).at(-1)))) continue
        const collection = collectionOfGroupId(id)
        if (collection) collections.set(collection, [...(collections.get(collection) ?? []), id])
      }
      return [...collections]
        .filter(([collection, ids]) => ids.length > 1 && !Object.hasOwn(declared, collection))
        .map(([collection, ids]) => ({
          key: String(groups.get(ids[0])?.[0]?.key),
          note: `collection "${collection}" (${ids.length} items) is not a repeatable list`
        }))
    }
  },
  {
    id: 'social-in-person-card',
    severity: 'error',
    checks: "the social links of a person's card are the person's (person.social_url), not the business's",
    fix: "Give each link of the person's block the role person.social_url in the person's group (same group id as person.name). As contact.social_url the build fills the business's own accounts into the person's card.",
    find: ({ slots }) => {
      const personEntities = new Set(slots.filter((s) => s.group?.kind === 'person').map((s) => s.entity))
      return slots
        .filter((s) => s.role === 'contact.social_url' && personEntities.has(s.entity))
        .map((s) => ({ key: String(s.key), note: `business social link in the person block "${s.entity}"` }))
    }
  },
  {
    id: 'social-icon-kept',
    severity: 'warning',
    checks: "a social link's own icon picture follows its network, not kept as the demo's",
    fix: 'An icon that names a network must move with its link. Until the vocabulary has a network icon role, keep the network in an icon font class field of the same list (the engine moves it) rather than a kept picture.',
    find: ({ slots, groups, map }) =>
      slots
        .filter((s) => s.type === 'image' && s.group?.id && keepDecisionOf(s, map) === 'keep')
        .filter((s) => list(groups.get(s.group.id)).some((m) => m.role === 'contact.social_url'))
        .map((s) => ({ key: String(s.key), note: `kept icon in social group "${s.group.id}"` }))
  }
]

/**
 * The declaration findings of one content map.
 * @param {any} contentMap
 * @param {{ rows?: Record<string, any> | null, all?: boolean }} [about] - `rows`: the release's rows
 *   (`presentation-lock.json` entities); `all`: read a map that declares no roles too (a survey; the role rules find nothing)
 * @returns {{ declared: boolean, findings: Array<{ rule: string, severity: string, key: string, note: string, fix: string }>,
 *   errors: number, warnings: number }}
 */
export function lintContentMap(contentMap, { rows = null, all = false } = {}) {
  if (!all && !contentMapDeclaresRoles(contentMap))
    return { declared: false, findings: [], errors: 0, warnings: 0 }
  const slots = list(contentMap?.slots)
  /** @type {Map<string, any[]>} */
  const groups = new Map()
  for (const s of slots) {
    if (!nonEmpty(s?.group?.id)) continue
    groups.set(s.group.id, [...(groups.get(s.group.id) ?? []), s])
  }
  const ctx = {
    map: contentMap,
    slots,
    kindOf: new Map(list(contentMap?.entities).map((e) => [e.key, e.kind])),
    rows,
    groups
  }
  const findings = []
  for (const rule of LINT_RULES) {
    for (const hit of rule.find(ctx))
      findings.push({ rule: rule.id, severity: rule.severity, key: hit.key, note: hit.note, fix: rule.fix })
  }
  const errors = findings.filter((f) => f.severity === 'error').length
  return { declared: true, findings, errors, warnings: findings.length - errors }
}

/**
 * The declaration findings of a contract folder: its content map, read with the rows of its presentation lock.
 * @param {string} dir
 */
export function lintContractDir(dir, { all = false } = {}) {
  const read = (name) => {
    const file = path.join(dir, name)
    if (!existsSync(file)) return null
    try {
      return JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      return null
    }
  }
  const map = read('content-map.json')
  if (!map) return { declared: false, findings: [], errors: 0, warnings: 0 }
  return lintContentMap(map, { rows: read('presentation-lock.json')?.entities ?? null, all })
}

/** One line per rule: how many findings, of which severity. */
export function lintSummary(findings) {
  /** @type {Map<string, { rule: string, severity: string, count: number }>} */
  const by = new Map()
  for (const f of findings) {
    const row = by.get(f.rule) ?? { rule: f.rule, severity: f.severity, count: 0 }
    row.count += 1
    by.set(f.rule, row)
  }
  return [...by.values()]
}
