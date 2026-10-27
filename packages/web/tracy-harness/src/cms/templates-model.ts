/**
 * The Templates screen's rows: one per TEMPLATE, built in the browser from the two live doors the
 * screen replaced — `GET /api/ops/quickstarts` (every release, its install file and its Design
 * inspiration cell) and `GET /api/ops/inspiration` (the cards customers are offered, with their
 * warnings). No third door: a row says exactly what those two say, folded by template.
 *
 * 🔒 ACTIVE MEANS A CUSTOMER CAN PICK IT, AND NOTHING ELSE. A template is Active when the server's
 * `shown` list carries it (`shownOnInspiration`, the rule `/api/templates` uses); every other
 * template is Disabled. The list therefore cannot call a card off while customers choose it.
 */
import { tr } from '../i18n'
import type { Inspiration, InspirationRelease } from './api'
import {
  type GuideContext,
  guideOf,
  polishItemText,
  type RoadStep,
  STEP_TAB,
  STEP_TITLE,
  type StepName
} from './problem-guides'
import type { ReleaseRow } from './Quickstarts'
import { CMS, CMS_LABEL, type Cms } from './route'

export interface TemplateRow {
  id: string
  label: string
  /**
   * "Design pack" only when every release of it is one; most templates are quickstarts. A design
   * pack has no road, no issues and no Publish/Unpublish (`templateRows`).
   */
  designPack: boolean
  active: boolean
  image: string | null
  category: string | null
  /** Its releases, one per CMS in the rail's CMS order. */
  releases: ReleaseRow[]
  /** Whether any release of it has a listing saved: the list draws "No card" otherwise. */
  hasListing: boolean
  /**
   * What is left to do on the road to live, one line per step a person has to act on (`todo`),
   * named by CMS when the template has several: the list's Issues count.
   */
  issues: string[]
  /** The steps done with something worth fixing (`warn`), one line per polish item: the Warnings count. */
  warnings: string[]
  /** The same issues and warnings counted by the detail page tab they are fixed on, for the tab badges. */
  problems: Record<'card' | 'settings' | 'questions', { issues: number; warnings: number }>
}

/** The listing state of a template or release with no listing saved (an id; its words are `listingWord`). */
export const NO_LISTING = 'No listing yet'

/**
 * A release's tag family: the template part of its tag, `local/` and `quickstart/` left off
 * (`tracy-apple/j6` → `tracy-apple`, `quickstart/ja-essence/j6` → `ja-essence`, `local/<tag>` as
 * its published tag), in card-id spelling (lower case, dashes).
 */
export function tagFamilyOf(tag: string): string {
  const parts = tag.split('/').filter((p) => p !== 'local' && p !== 'quickstart')
  return (parts[0] ?? tag).toLowerCase().replaceAll('_', '-')
}

const cmsRank = (p: Cms | null) => (p ? CMS.indexOf(p) : CMS.length)

/** The flag a Joomla or WordPress release carries while it has no content contract (an id, never shown). */
export const NO_CONTRACT = 'No content contract'

/** One release's road as the server sent it; empty for a design pack or a server older than it. */
export const roadOfRelease = (r: ReleaseRow): RoadStep[] => r.road ?? []

const stepOf = (r: ReleaseRow, step: StepName) => roadOfRelease(r).find((s) => s.step === step)

/** What one CMS chip on the Design Inspiration tab says about its release's own listing. */
export interface ChipStatus {
  /** The release's own listing: none saved, saved but off Design inspiration, or listed. */
  card: typeof NO_LISTING | 'Hidden' | 'Listed'
  /** "No content contract" when the road says this release has none, else null. */
  contract: typeof NO_CONTRACT | null
  /**
   * This release's listing is the card source: its pages and pictures are the card customers see. Read from the server
   * (`cardSource`, the rule `templateCards` follows), never worked out here; false when no
   * release of the template is shown.
   */
  onInspiration: boolean
}

/**
 * The status one CMS chip wears, from the server's Design inspiration cell (`on` shown, `card`
 * saved but not shown, `none`/`n/a` none saved) and the road's own contract step.
 */
export function chipStatusOf(r: ReleaseRow): ChipStatus {
  const state = r.inspiration?.state
  return {
    card: state === 'on' ? 'Listed' : state === 'card' ? 'Hidden' : NO_LISTING,
    contract: stepOf(r, 'contract')?.code === 'no-contract' ? NO_CONTRACT : null,
    onInspiration: r.cardSource === true
  }
}

/**
 * The Listing status strip, SHORT (Akemi, 11/10/2026): the state word, then at most one short
 * phrase. `listingWord` is how the strip says the state ("Not listed yet" for no listing);
 * `listingNextStep` is the phrase after it, empty when the word says it all.
 */
export function listingWord(card: ChipStatus['card']): string {
  if (card === 'Listed') return tr('cms-templates.listing.listed')
  if (card === 'Hidden') return tr('cms-templates.listing.hidden')
  return tr('cms-templates.listing.notListed')
}

export function listingNextStep(card: ChipStatus['card']): string {
  if (card === 'Listed') return tr('cms-templates.listing.listedNext')
  if (card === 'Hidden') return tr('cms-templates.listing.hiddenNext')
  return ''
}

/** The strip's second line while the road says this release has no content contract; it links to step 3. */
export const noContractLine = () => tr('cms-templates.listing.noContract')

/** The context the guide table words a release's steps with. */
function contextOf(r: ReleaseRow, names: Map<string, string>): GuideContext {
  return {
    tag: r.tag,
    cms: names.get(r.tag) ?? (r.platform ? CMS_LABEL[r.platform] : r.tag),
    platform: r.platform,
    version: r.version,
    label: r.label,
    cmsVersion: r.cms,
    template: r.template
  }
}

/**
 * One thing Publish still needs: the step on one release's road that is not done, worded as its
 * step name (with the CMS when the template has several releases). Clicking it goes to that step.
 */
export interface PublishNeed {
  tag: string
  step: StepName
  label: string
}

/**
 * EVERY step Publish still needs for ONE release, read off its road: the server's
 * `params.waiting` on the Published step (all of them, never only the first), else `blockedBy`
 * from an older server, or the Published step itself when the listing would stay hidden.
 */
export function releasePublishNeeds(r: ReleaseRow, cms?: string): PublishNeed[] {
  const published = stepOf(r, 'published')
  if (!published || published.state === 'done') return []
  const named = (step: StepName, title: string): PublishNeed => ({
    tag: r.tag,
    step,
    label: cms ? tr('cms-templates.needs.withCms', { title, cms }) : title
  })
  if (published.state === 'blocked') {
    const waiting = (Array.isArray(published.params.waiting) ? published.params.waiting : []).filter(
      (n): n is StepName => typeof n === 'string' && n in STEP_TITLE
    )
    const steps = waiting.length > 0 ? waiting : published.blockedBy ? [published.blockedBy] : []
    return steps.map((n) => named(n, STEP_TITLE[n]))
  }
  if (published.code === 'not-showable') return [named('published', tr('cms-templates.needs.staysHidden'))]
  return []
}

/** The words of a list of needs: the line under a disabled Publish and its hover title. */
export const needsText = (needs: PublishNeed[]) =>
  needs.length === 0 ? '' : tr('cms-templates.needs.text', { list: needs.map((n) => n.label).join(', ') })

/** `releasePublishNeeds` as words, one per need. Empty when it can be published or already is. */
export function releasePublishBlockers(r: ReleaseRow): string[] {
  return releasePublishNeeds(r).map((n) => n.label)
}

/** A release the header Publish presses: one that can carry a listing and is not shown yet. */
const pressable = (r: ReleaseRow) => r.inspiration?.state === 'card' || r.inspiration?.state === 'none'

/**
 * What the header Publish (every release of the template) still needs: each step of each release
 * it would press, named by CMS when there are several. The door refuses the same releases for the
 * same steps (`publishRefusalOf` on the server).
 */
export function templatePublishNeeds(releases: ReleaseRow[]): PublishNeed[] {
  const names = releaseNames(releases)
  const many = releases.length > 1
  return releases
    .filter(pressable)
    .flatMap((r) => releasePublishNeeds(r, many ? (names.get(r.tag) ?? r.tag) : undefined))
}

export function templatePublishBlockers(releases: ReleaseRow[]): string[] {
  return templatePublishNeeds(releases).map((n) => n.label)
}

/** What is left on a template's road, as the list and the tab badges count it. */
function problemsOfRoad(releases: ReleaseRow[]) {
  const names = releaseNames(releases)
  const many = releases.length > 1
  const issues: { text: string; tab: 'card' | 'settings' }[] = []
  const warnings: { text: string; tab: 'card' | 'settings' }[] = []
  for (const r of releases) {
    const ctx = contextOf(r, names)
    const say = (text: string) => (many ? `${ctx.cms}: ${text}` : text)
    // A release customers already see has nothing holding it: what is left on it only warns.
    const live = stepOf(r, 'published')?.state === 'done'
    for (const s of roadOfRelease(r)) {
      const tab = STEP_TAB[s.step]
      // Ready to publish is the next press, not a problem.
      if (s.state === 'todo' && s.code !== 'ready-to-publish')
        (live ? warnings : issues).push({ text: say(guideOf(s, ctx).title), tab })
      if (s.state === 'warn') {
        const items = Array.isArray(s.params.items)
          ? (s.params.items as { code: string; params: Record<string, unknown> }[])
          : null
        if (items)
          for (const i of items) warnings.push({ text: say(polishItemText(i.code, i.params ?? {})), tab })
        else warnings.push({ text: say(guideOf(s, ctx).title), tab })
      }
    }
  }
  return { issues, warnings }
}

/**
 * The release a template page opens on when its address names none: the one whose listing feeds
 * the customer card (`cardSource`), else the first with a listing (Listed, then Hidden), else the
 * first. `asked` (the address's `release`, a tag or a CMS id) wins whenever it names a release.
 */
export function defaultReleaseTag(releases: ReleaseRow[], asked?: string | null): string {
  const pick = (list: ReleaseRow[]) =>
    list.find((r) => r.cardSource === true) ??
    list.find((r) => r.inspiration?.state === 'on') ??
    list.find((r) => r.inspiration?.state === 'card') ??
    list[0]
  if (asked) {
    const exact = releases.find((r) => r.tag === asked)
    if (exact) return exact.tag
    const ofCms = releases.filter((r) => r.platform === asked)
    if (ofCms.length > 0) return pick(ofCms)?.tag ?? ''
  }
  return pick(releases)?.tag ?? ''
}

/**
 * What each release is called on a template page: its CMS, plus its tag when another release of
 * the same template is on the same CMS ("Joomla · tracy-apple/j6"), so two chips never read alike.
 */
export function releaseNames(releases: ReleaseRow[]): Map<string, string> {
  const perCms = new Map<Cms | null, number>()
  for (const r of releases) perCms.set(r.platform, (perCms.get(r.platform) ?? 0) + 1)
  return new Map(
    releases.map((r) => {
      if (!r.platform) return [r.tag, r.tag]
      const cms = CMS_LABEL[r.platform]
      return [r.tag, (perCms.get(r.platform) ?? 0) > 1 ? `${cms} · ${r.tag}` : cms]
    })
  )
}

export function templateRows(releases: ReleaseRow[], inspiration: Inspiration): TemplateRow[] {
  // 🔒 A RELEASE ON A CUSTOMER CARD BELONGS TO THAT CARD'S TEMPLATE. The server files a card under
  // the card's own `template` before the install file's (`cardTemplateOf`): `tracy-base/wp7` says
  // "tracy-base" in its install file while its card is the `tracy` one. A release on no card joins
  // the card a release of its tag family is on, else its tag family alone is its template — never
  // the install file's `template`: `tracy-apple/j6` says "tracy" there and is its own template
  // (Akemi, 10/10/2026).
  const cardOfTag = new Map(inspiration.shown.flatMap((t) => t.platforms.map((p) => [p.tag, t.id] as const)))
  const cardOfFamily = new Map<string, string>()
  for (const [tag, id] of cardOfTag)
    if (!cardOfFamily.has(tagFamilyOf(tag))) cardOfFamily.set(tagFamilyOf(tag), id)
  const byKey = new Map<string, ReleaseRow[]>()
  for (const r of releases) {
    const family = tagFamilyOf(r.tag)
    const key = cardOfTag.get(r.tag) ?? cardOfFamily.get(family) ?? family
    byKey.set(key, [...(byKey.get(key) ?? []), r])
  }
  const shown = new Map(inspiration.shown.map((t) => [t.id, t]))
  const heldBack = new Map<string, InspirationRelease>(inspiration.notShown.map((r) => [r.tag, r]))
  const rows: TemplateRow[] = []
  for (const [id, list] of byKey) {
    const sorted = [...list].sort(
      (a, b) => cmsRank(a.platform) - cmsRank(b.platform) || a.tag.localeCompare(b.tag)
    )
    const card = shown.get(id)
    const held = sorted.map((r) => heldBack.get(r.tag)).find((r) => r !== undefined)
    const hasListing = sorted.some((r) => r.inspiration?.state === 'on' || r.inspiration?.state === 'card')
    const active = card !== undefined
    // A design pack is applied on top of a site built from a quickstart: it needs no install file
    // and is never offered on Design inspiration (`cardRefusal` on the server), so it has no road.
    const designPack = sorted.every((r) => r.kind === 'design-pack')
    const { issues, warnings } = designPack ? { issues: [], warnings: [] } : problemsOfRoad(sorted)
    rows.push({
      id,
      label: card?.label ?? sorted.find((r) => r.label)?.label ?? held?.label ?? sorted[0]?.name ?? id,
      designPack,
      active,
      image: card?.card.image ?? held?.image ?? null,
      category: card?.card.category ?? held?.category ?? null,
      releases: sorted,
      hasListing,
      issues: issues.map((i) => i.text),
      warnings: warnings.map((w) => w.text),
      problems: {
        card: {
          issues: issues.filter((i) => i.tab === 'card').length,
          warnings: warnings.filter((w) => w.tab === 'card').length
        },
        settings: {
          issues: issues.filter((i) => i.tab === 'settings').length,
          warnings: warnings.filter((w) => w.tab === 'settings').length
        },
        questions: { issues: 0, warnings: 0 }
      }
    })
  }
  return rows.sort((a, b) => a.label.localeCompare(b.label))
}
