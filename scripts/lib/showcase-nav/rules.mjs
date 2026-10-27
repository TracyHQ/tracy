/**
 * The showcase-navigation rule: which entries of a sealed quickstart's navigation are the template's
 * showcase (typography, "Joomla Pages", Home colour/layout variants, sample sites…) and leave the menus,
 * and which stay. Pure: the generators feed it a tree and the per-design decisions, and it returns
 * `{ operations, kept, unresolved }`, each entry with a rule id and a reason.
 *
 * 🔒 THE RULE NEVER UNPUBLISHES. A showcase page keeps its URL: Joomla items only get `menu_show` "0",
 * WordPress pages stay published and only their link leaves a navigation. Article, category and
 * `post_status` are not fields this rule can name.
 *
 * 🔒 WHEN UNSURE, KEEP AND SAY SO. A shape alone (same link as Home, a `com_tags` view, a level-2 Login)
 * is a signal, never an order: JA Diner's Offers opens the same featured view as Home, JA Voyara's tour
 * categories are tag views, JA Social II's Login sits under "Joomla Pages". What the signals cannot settle
 * goes to `unresolved` (nothing is written for it) or to the design's `showcase-decisions.json` entry,
 * which names entities, never template names in code.
 *
 * Functional entries (users, smart search, tags, search, login/registration) are KEPT unless the
 * decisions name them: hiding a working feature by mistake costs the customer the feature, leaving a
 * showcase entry by mistake only costs looks. A branch or menu decision never takes one along: only an
 * entry naming the item itself, with its own reason, hides it.
 *
 * 🔒 MISSING DATA NEVER HIDES. A menu item that opens a category or article the contract does not carry
 * is kept and listed unresolved; a contract with no content records at all is not covered.
 */
import { ancestors, renderedBy, shownToday, subtree } from './joomla-tree.mjs'
import { megaSubOperations } from './t3-megamenu.mjs'

/**
 * The template's own screens — typography, error, offline — under any heading. The same words as
 * `KIT_ALONE` of `apps/tracy-web/src/sites/brief-engines/joomla-kit.js`, which does not export it.
 */
export const KIT_ALONE =
  /^(typography|style ?guide|offline(?: pages?)?|error(?: pages?)?|404(?: pages?)?|page not found)$/i
/** Whether a label or alias reads as a kit screen: `offline-pages` reads as "offline pages". */
export const isKitLabel = (text) =>
  KIT_ALONE.test(
    String(text ?? '')
      .trim()
      .replace(/[-_]+/g, ' ')
  )
/** Labels of another demo of the home page or of a colour scheme (`page-rule.js` VARIANT_LABEL). */
export const VARIANT_LABEL = /^home\b|\bcolou?rs?$/i
/** Words that name a showcase branch; a signal that sends an undecided entry to `unresolved`. */
export const SHOWCASE_WORDS =
  /(^|[^a-z0-9])(joomla|sample|samples|layouts?|demos?|colou?rs?|variants?|styles?|showcase|shortcodes?|wordpress pages|wp pages)([^a-z0-9]|$)|(^|[^a-z0-9])j ?! ?(pages?|content)\b|^j ?pages\b/i
/**
 * The heading JoomlArt files its Joomla sample pages under: "J!Pages", "J! Content", "J! Page", "Joomla Content",
 * "Joomla! pages". Unlike a showcase word anywhere in a label (`SHOWCASE_WORDS`, a signal only), a heading that IS one of
 * these names holds nothing but the template's demo of what Joomla can show, so its entries leave by rule; its working
 * screens still stay unless decided, and the cascade guard still keeps the only route to real content.
 */
export const KIT_BRANCH = /^\s*(?:j\s*!\s*|joomla\s*!?\s*)(?:pages?|content)\s*$/i
/** Components that serve a working feature; kept unless the decisions hide them. */
export const FUNCTIONAL_OPTIONS = new Set([
  'com_users',
  'com_finder',
  'com_search',
  'com_tags',
  'com_contact'
])

/** Rule ids, so a report and a test can name the rule rather than its sentence. */
export const RULES = {
  home: 'keep.homepage',
  decisionKeep: 'keep.decision',
  functional: 'keep.functional-default',
  holdsKept: 'keep.holds-kept-entry',
  anchor: 'keep.anchor-of-home',
  defaultKeep: 'keep.default',
  decisionHide: 'hide.decision',
  homeVariant: 'hide.home-branch-variant',
  variantSample: 'hide.variant-opens-sample',
  kit: 'hide.kit-screen',
  kitBranch: 'hide.kit-branch',
  aliasOfHidden: 'hide.alias-of-hidden',
  insideHidden: 'hide.inside-hidden-branch',
  emptyHeading: 'hide.empty-heading',
  moduleEmpty: 'hide.module-renders-nothing',
  conflict: 'unresolved.decision-conflict',
  variantLabel: 'unresolved.variant-label',
  showcaseWord: 'unresolved.showcase-word',
  stockBranch: 'unresolved.stock-screens-branch',
  drawerMenu: 'unresolved.drawer-menu',
  pageDependent: 'unresolved.module-depends-on-page',
  offcanvas: 'unresolved.offcanvas-toggle',
  menuShowValue: 'unresolved.menu-show-value',
  onlyRoute: 'keep.only-route-to-content',
  functionalInBranch: 'unresolved.functional-in-hidden-branch',
  missingContent: 'unresolved.missing-content',
  sampleListing: 'hide.sample-listing',
  linkToHidden: 'unresolved.link-to-hidden'
}

/**
 * The listing screens every JoomlArt quickstart ships as samples of what Joomla can list: all categories,
 * featured articles, a tag or the tag index. Not a single category: that is how a real blog or news list
 * is linked.
 */
export function isSampleListing(item) {
  if (item?.type !== 'component') return false
  const { option, view } = item.query
  return (
    (option === 'com_content' && (view === 'categories' || view === 'featured')) ||
    (option === 'com_tags' && (view === 'tag' || view === 'tags'))
  )
}

/** A heading-like item: it opens nothing of its own, so with no child left it is an empty label. */
const isContainer = (item) =>
  item.type === 'heading' ||
  item.type === 'separator' ||
  (item.type === 'url' && (item.link === '' || item.link === '#')) ||
  (item.type === 'alias' && !item.aliasTarget)

const where = (item) => `${item.menutype}/${item.path}`

/** Components whose views carry nothing a visitor would miss from a menu (sharing, AJAX, settings). */
const SYSTEM_OPTIONS = new Set(['com_privacy', 'com_config', 'com_mailto', 'com_ajax'])

/**
 * What a menu item gives a visitor, as tokens: `article:<id>`, `category:<id>`, `featured`, a working
 * screen `screen:<option>:<view>` (login, search, tags), or the component/URL it opens. A heading opens
 * nothing; an alias or an `Itemid` URL opens what its target opens.
 */
export function exposuresOf(tree, key, seen = new Set()) {
  const out = new Set()
  const item = tree.items.get(key)
  if (!item || seen.has(key)) return out
  seen.add(key)
  const target = item.aliasTarget ?? item.urlTarget
  if (target) return exposuresOf(tree, target, seen)
  if (item.type === 'url') {
    if (item.link && !item.link.startsWith('#') && item.link !== '') out.add(`url:${item.link}`)
    return out
  }
  if (item.type !== 'component') return out
  const { option, view, id } = item.query
  if (SYSTEM_OPTIONS.has(option)) return out
  if (FUNCTIONAL_OPTIONS.has(option)) {
    out.add(`screen:${option}:${view ?? ''}`)
    return out
  }
  if (option === 'com_content') {
    if (view === 'article' && id) out.add(`article:${id}`)
    else if (view === 'category' && id) {
      out.add(`category:${id}`)
      // A blog that lists the articles of its subcategories reaches them, as deep as it says.
      const under = (parent, depth) => {
        if (depth < 1) return
        for (const [cid, c] of tree.categories)
          if (c.parent === parent && c.published && !out.has(`category:${cid}`)) {
            out.add(`category:${cid}`)
            under(cid, depth - 1)
          }
      }
      under(String(id), item.subcategoryDepth ?? 0)
    } else if (view === 'featured') {
      out.add('featured')
      for (const [aid, a] of tree.articles) if (a.featured && a.published) out.add(`article:${aid}`)
    } else if (view === 'categories') {
      // An index of categories: it reaches every category under the one it names.
      const under = (parent) => {
        for (const [cid, c] of tree.categories)
          if (c.parent === parent && c.published) {
            out.add(`category:${cid}`)
            under(cid)
          }
      }
      under(String(id || '1'))
    }
    return out
  }
  out.add(`${option}:${view ?? ''}:${id ?? ''}`)
  return out
}

const SAMPLE_TITLE = (text) =>
  isKitLabel(text) ||
  SHOWCASE_WORDS.test(String(text ?? '')) ||
  /^uncategori[sz]ed$/i.test(String(text ?? '').trim())

/** Whether a token names a category or an article the contract does not carry. */
export function isMissingToken(tree, token) {
  const [kind, id] = token.split(':')
  if (kind === 'article') return !tree.articles.has(id)
  if (kind === 'category') return !tree.categories.has(id)
  return false
}

/**
 * Whether losing a token loses nothing the business owns: a kit or sample article, a sample
 * category, or a category whose every published article is such (an empty one included). A record
 * the contract lacks is never sample: what is unknown is not known to be expendable.
 */
export function isSampleToken(tree, token) {
  const [kind, id] = token.split(':')
  if (isMissingToken(tree, token)) return false
  if (kind === 'article') {
    const a = tree.articles.get(id)
    return (
      !a.published ||
      SAMPLE_TITLE(a.title) ||
      SAMPLE_TITLE(a.alias) ||
      SAMPLE_TITLE(tree.categories.get(a.catid)?.title)
    )
  }
  if (kind === 'category') {
    const c = tree.categories.get(id)
    if (SAMPLE_TITLE(c.title)) return true
    return [...tree.articles.entries()]
      .filter(([, a]) => a.catid === id && a.published)
      .every(([aid]) => isSampleToken(tree, `article:${aid}`))
  }
  // `featured` is covered by the articles it lists; every other screen, component or link is the business's.
  if (kind === 'featured') return true
  return false
}

/**
 * Why the rule cannot judge this contract's content routes, or null: a live menu item opens articles or
 * categories, but the contract carries no category or no article record to say what they hold.
 */
export function contentGap(tree) {
  if (tree.categories.size && tree.articles.size) return null
  const opensContent = [...tree.items.values()].some(
    (i) => shownToday(i) && i.type === 'component' && i.query.option === 'com_content'
  )
  return opensContent
    ? `menu items open com_content, but the contract carries ${tree.categories.size} category and ${tree.articles.size} article record(s): what they open cannot be checked`
    : null
}

/**
 * The Joomla rule over one contract.
 * @param {ReturnType<import('./joomla-tree.mjs').buildJoomlaTree>} tree
 * @param {{ hide?: any[], keep?: any[] } | undefined} decisions this contract's entry of showcase-decisions.json
 * @returns {{ operations: any[], kept: any[], unresolved: any[], problems: string[] }}
 */
export function classifyJoomla(tree, decisions = {}) {
  const problems = []
  const { items, modules, styles } = tree
  /** Shown today, with every ancestor shown: the only items a menu can still offer. */
  const live = new Set(
    [...items.values()]
      .filter((i) => shownToday(i) && ancestors(tree, i.key).every((a) => shownToday(items.get(a))))
      .map((i) => i.key)
  )

  // ── decisions: resolve every entry to entities, or say it is stale ─────────────────────────────
  /** @type {Map<string, {rule: string, reason: string}>} */
  const decidedHide = new Map()
  /** @type {Map<string, {rule: string, reason: string}>} */
  const decidedKeep = new Map()
  /** @type {Map<string, {rule: string, reason: string}>} entries that stay visible, nothing written */
  const unresolved = new Map()
  const resolve = (entry, side) => {
    if (!entry || typeof entry !== 'object')
      return problems.push(`decisions.${side}: an entry is not an object`)
    if (typeof entry.reason !== 'string' || !entry.reason.trim())
      return problems.push(`decisions.${side}: ${JSON.stringify(entry)} has no reason`)
    let keys = []
    if (entry.key) {
      const item = items.get(entry.key)
      if (!item)
        return problems.push(`decisions.${side}: ${entry.key} is not a site menu item of this contract`)
      if (entry.path !== undefined && entry.path !== item.path)
        return problems.push(`decisions.${side}: ${entry.key} has path ${item.path}, not ${entry.path}`)
      if (entry.menutype !== undefined && entry.menutype !== item.menutype)
        return problems.push(`decisions.${side}: ${entry.key} is in ${item.menutype}, not ${entry.menutype}`)
      keys = entry.subtree ? subtree(tree, entry.key) : [entry.key]
    } else if (entry.menutype) {
      keys = [...items.values()].filter((i) => i.menutype === entry.menutype).map((i) => i.key)
      if (!keys.length) return problems.push(`decisions.${side}: menutype ${entry.menutype} has no item`)
    } else return problems.push(`decisions.${side}: ${JSON.stringify(entry)} names neither key nor menutype`)
    const target = side === 'hide' ? decidedHide : decidedKeep
    for (const k of keys) {
      if (!live.has(k)) continue
      const swept = k !== entry.key
      // An entry naming the item itself outranks a branch or menu entry that also reaches it.
      if (swept && target.get(k)?.swept === false) continue
      target.set(k, { reason: entry.reason.trim(), swept })
    }
  }
  for (const e of decisions.hide ?? []) resolve(e, 'hide')
  for (const e of decisions.keep ?? []) resolve(e, 'keep')
  // A keep holds an entry a branch or menu hide swept along; naming the same entry on both sides is a mistake.
  for (const [k, d] of decidedHide)
    if (decidedKeep.has(k)) {
      if (d.swept) decidedHide.delete(k)
      else problems.push(`decisions: ${k} is both hidden and kept`)
    }

  // ── protection: what no automatic rule may hide ────────────────────────────────────────────────
  /** @type {Map<string, {rule: string, reason: string}>} */
  const kept = new Map()
  const homes = [...items.values()].filter((i) => i.home && live.has(i.key))
  for (const h of homes) {
    kept.set(h.key, { rule: RULES.home, reason: `home page${h.language === '*' ? '' : ` (${h.language})`}` })
    for (const a of ancestors(tree, h.key))
      if (live.has(a)) kept.set(a, { rule: RULES.holdsKept, reason: `holds the home page ${h.key}` })
  }
  for (const [k, d] of decidedKeep)
    if (!kept.has(k)) kept.set(k, { rule: RULES.decisionKeep, reason: d.reason })
  const homeMenus = new Set(homes.map((h) => h.menutype))
  const drawerMenus = new Map()
  const shownMenus = [...modules.values()].filter(
    (m) => m.module === 'mod_menu' && m.published === '1' && m.assignment !== 'none'
  )
  // A menu only a drawer renders; one the header renders too (a head-action CTA) is not a drawer menu.
  for (const m of shownMenus)
    if (
      /off-?canvas/i.test(m.position) &&
      !homeMenus.has(m.menutype) &&
      shownMenus.every((o) => o.menutype !== m.menutype || /off-?canvas/i.test(o.position))
    )
      drawerMenus.set(m.menutype, m.key)
  const functional = (item) => {
    const target = item.aliasTarget ? items.get(item.aliasTarget) : item
    const option = target?.query?.option
    if (FUNCTIONAL_OPTIONS.has(option)) return `opens ${option} (view=${target.query.view ?? '-'})`
    return null
  }

  // ── automatic hides ────────────────────────────────────────────────────────────────────────────
  /** @type {Map<string, {rule: string, reason: string}>} */
  const hidden = new Map()
  const homeKeys = new Set(homes.map((h) => h.key))
  const pointsHome = (item) =>
    (item.aliasTarget && homeKeys.has(item.aliasTarget)) || (item.urlTarget && homeKeys.has(item.urlTarget))
  /**
   * A heading whose live entries are mostly Joomla's stock screens (login, registration, profile, smart
   * search, tags, the sample listings, kit screens) is the Joomla sample-pages branch whatever it is
   * called: JA templates name it "J! Pages" / "J! Content", JA Kinetic and JA Voyara just "Pages". It
   * gets less than a showcase word: its content sample listings (featured, all categories) leave, its
   * working screens (tags included) stay, everything else is listed for a decision.
   */
  const isStockScreen = (key) => {
    const item = items.get(key)
    const target = item.aliasTarget ? items.get(item.aliasTarget) : item
    return (
      Boolean(functional(item)) ||
      SYSTEM_OPTIONS.has(target?.query?.option) ||
      // A listing drawn by a template layout (`layout=ja_podcast:podcast-1`) is the template's own screen.
      (isSampleListing(target) && !String(target.query.layout ?? '').includes(':')) ||
      isKitLabel(item.title) ||
      isKitLabel(item.alias) ||
      (target !== item && (isKitLabel(target.title) || isKitLabel(target.alias)))
    )
  }
  const stockBranches = new Set(
    [...live].filter((k) => {
      const item = items.get(k)
      if (!isContainer(item)) return false
      const kids = item.children.filter((c) => live.has(c))
      return kids.filter(isStockScreen).length * 2 > kids.length
    })
  )
  /**
   * Where a sample listing is showcase, not the business's: in a branch or menu decided hidden, under an
   * entry that leaves, in a drawer-only menu, or under a heading that names a showcase or holds mostly
   * stock screens.
   */
  const inShowcase = (key) => {
    const item = items.get(key)
    const up = ancestors(tree, key)
    return (
      decidedHide.has(key) ||
      up.some((a) => hidden.has(a) || decidedHide.has(a)) ||
      drawerMenus.has(item.menutype) ||
      up.some((a) => SHOWCASE_WORDS.test(items.get(a).title)) ||
      // Read from its entries alone, such a branch takes no working screen along (JA Voyara's tag index).
      (!functional(item) && up.some((a) => stockBranches.has(a)))
    )
  }
  const sampleListingHere = (key) => isSampleListing(items.get(key)) && inShowcase(key)
  const propose = (key, rule, reason) => {
    if (!live.has(key) || hidden.has(key) || kept.has(key)) return false
    const item = items.get(key)
    if (rule !== RULES.decisionHide) {
      const f = sampleListingHere(key) ? null : functional(item)
      if (f) {
        kept.set(key, { rule: RULES.functional, reason: `${f}: a working feature stays unless decided` })
        return false
      }
      if (item.fragment && pointsHome(item)) {
        kept.set(key, { rule: RULES.anchor, reason: `anchor #${item.fragment} of the home page` })
        return false
      }
    }
    hidden.set(key, { rule, reason })
    return true
  }
  // A branch or menu decision never takes a working screen along: it stays, listed for a decision that
  // names it by its own identity and reason.
  for (const [k, d] of decidedHide) {
    if (d.swept && isSampleListing(items.get(k))) {
      propose(k, RULES.sampleListing, `a sample listing inside a branch or menu decided hidden (${d.reason})`)
      continue
    }
    const f = d.swept ? functional(items.get(k)) : null
    if (f && !kept.has(k))
      unresolved.set(k, {
        rule: RULES.functionalInBranch,
        reason: `${f} inside a branch or menu decided hidden: a working screen leaves only when a decision names it`
      })
    else propose(k, RULES.decisionHide, d.reason)
  }
  // The level-1 branch that holds a home page holds the other demos of the home page.
  for (const h of homes) {
    const up = ancestors(tree, h.key)
    const root = up.length ? up[up.length - 1] : h.key
    const holders = new Set([h.key, ...up])
    for (const k of subtree(tree, root))
      if (!holders.has(k) && !homeKeys.has(k))
        propose(k, RULES.homeVariant, `another demo of the home page: under ${where(items.get(root))}`)
  }
  for (const k of live) {
    const item = items.get(k)
    const target = item.aliasTarget ? items.get(item.aliasTarget) : null
    if (
      isKitLabel(item.title) ||
      isKitLabel(item.alias) ||
      (target && (isKitLabel(target.title) || isKitLabel(target.alias)))
    )
      propose(k, RULES.kit, `the template's own "${item.title.trim()}" screen`)
  }
  // Outside the home branch a home or colour label is only a signal (a real "Home Services" page exists);
  // with a second one, everything the entry opens being sample content (a kit article in Uncategorised)
  // or what a home page already opens (the featured view again), it is a demo like those of the home
  // branch and leaves the same way.
  const homeOpens = new Set(homes.flatMap((h) => [...exposuresOf(tree, h.key)]))
  for (const k of live) {
    const item = items.get(k)
    const label = item.title.trim()
    if (!VARIANT_LABEL.test(label) || /^home$/i.test(label) || homeKeys.has(k) || pointsHome(item)) continue
    const opens = [...exposuresOf(tree, k)]
    if (opens.length && opens.every((t) => isSampleToken(tree, t) || homeOpens.has(t)))
      propose(
        k,
        RULES.variantSample,
        `"${label}" reads as a home or colour demo and opens only sample content or what the home page opens (${opens.slice(0, 3).join(', ')}${opens.length > 3 ? ` (+${opens.length - 3})` : ''})`
      )
  }
  // The sample listings (all categories, featured, tags) leave wherever they sit as showcase; the
  // cascade guard below still keeps one that is the only route to real content.
  for (const k of live)
    if (sampleListingHere(k)) {
      const item = items.get(k)
      propose(
        k,
        RULES.sampleListing,
        `a sample listing (${item.query.option} view=${item.query.view}) in ${drawerMenus.has(item.menutype) ? `${item.menutype}, the drawer menu of ${drawerMenus.get(item.menutype)}` : 'a showcase branch'}`
      )
    }
  // After the more specific rules (a sample listing keeps its own rule and its guard), everything under a JoomlArt sample-pages heading is the template's demo; `propose` keeps its working screens.
  for (const k of live) {
    const head = ancestors(tree, k)
      .map((a) => items.get(a))
      .find((a) => isContainer(a) && KIT_BRANCH.test(a.title))
    if (head)
      propose(k, RULES.kitBranch, `inside "${head.title.trim()}", the template's Joomla sample-pages branch`)
  }
  // Aliases follow what they lead to, children their parent, headings their children, until stable.
  for (let grew = true; grew; ) {
    grew = false
    for (const k of live) {
      if (hidden.has(k) || kept.has(k)) continue
      const item = items.get(k)
      const target = item.aliasTarget ?? item.urlTarget
      // Only a target that IS a showcase (a kit screen, a home demo) takes its aliases along; one hidden
      // for where it sits (a drawer menu) may still be the page another menu offers (JA Morgan "News & Update").
      const what = target ? hidden.get(target)?.rule : null
      if (target && (what === RULES.kit || what === RULES.homeVariant || what === RULES.aliasOfHidden))
        grew = propose(k, RULES.aliasOfHidden, `leads to ${target}, which leaves the navigation`) || grew
      else if (item.parent && hidden.has(item.parent))
        grew = propose(k, RULES.insideHidden, `under ${item.parent}, which leaves the navigation`) || grew
      else if (isContainer(item)) {
        const kids = item.children.filter((c) => live.has(c))
        if (kids.length && kids.every((c) => hidden.has(c)))
          grew = propose(k, RULES.emptyHeading, `a heading whose every entry leaves the navigation`) || grew
      }
    }
  }
  // ── cascade guard: no showcase rule may take the only route to real content ─────────────────
  // A decision that names a branch or a whole menu, the home branch's demos and the children of a
  // hidden item are hidden for WHERE they sit. Each such entry stays hidden only when everything it
  // opens is sample content or still reachable from a menu entry that stays; otherwise it is kept, and
  // the step below keeps its ancestors visible. An entry recognised as a showcase (a kit screen, a home
  // demo) is held to the articles and categories it opens: its own screen or link may go, real content
  // may not. Only a decision that names the entry itself outranks the guard.
  const cascaded = (k) => {
    const h = hidden.get(k)
    if (!h) return false
    if (h.rule === RULES.decisionHide) return decidedHide.get(k)?.swept === true
    return (
      h.rule === RULES.homeVariant ||
      h.rule === RULES.insideHidden ||
      h.rule === RULES.sampleListing ||
      h.rule === RULES.kitBranch
    )
  }
  const exposes = (k, seen = new Set()) => exposuresOf(tree, k, seen)
  const recognised = (item) => {
    const target = item.aliasTarget ? items.get(item.aliasTarget) : null
    return (
      isKitLabel(item.title) ||
      isKitLabel(item.alias) ||
      (target && (isKitLabel(target.title) || isKitLabel(target.alias))) ||
      pointsHome(item) ||
      (VARIANT_LABEL.test(item.title.trim()) && !/^home$/i.test(item.title.trim()))
    )
  }
  const reachedBy = (keys) => {
    const out = new Set()
    for (const k of keys) for (const t of exposes(k)) out.add(t)
    // A category page lists its articles, the featured view the featured ones.
    for (const [id, a] of tree.articles) {
      if (out.has(`category:${a.catid}`) || (a.featured && out.has('featured'))) out.add(`article:${id}`)
    }
    return out
  }
  const visibleNow = () =>
    [...live].filter((k) => !hidden.has(k) && !ancestors(tree, k).some((a) => hidden.has(a)))
  const candidates = [...hidden.keys()]
    .filter((k) =>
      recognised(items.get(k))
        ? hidden.get(k).rule !== RULES.decisionHide || decidedHide.get(k)?.swept === true
        : cascaded(k)
    )
    // Broad routes first: restoring a category page may make its article pages redundant.
    .sort((a, b) => exposes(b).size - exposes(a).size || items.get(a).sourceId - items.get(b).sourceId)
  for (const k of candidates) {
    const reached = reachedBy(visibleNow())
    // A tag view's own screen is part of the sample: the articles it lists are judged by their categories.
    const listing = hidden.get(k).rule === RULES.sampleListing
    const showcase = recognised(items.get(k))
    const lost = [...exposes(k)].filter(
      (t) =>
        !reached.has(t) &&
        !isSampleToken(tree, t) &&
        !(listing && t.startsWith('screen:com_tags:')) &&
        !(showcase && !/^(article|category):/.test(t))
    )
    if (!lost.length) continue
    // A sample listing whose hide came only from this rule (no ancestor hidden but empty headings) goes
    // back to how it stood before the rule: its emptied headings return, and the signals judge it.
    const heads = ancestors(tree, k).filter((a) => hidden.has(a))
    if (listing && heads.every((a) => hidden.get(a).rule === RULES.emptyHeading)) {
      hidden.delete(k)
      for (const a of heads) hidden.delete(a)
      continue
    }
    hidden.delete(k)
    const missing = lost.filter((t) => isMissingToken(tree, t))
    if (missing.length) {
      unresolved.set(k, {
        rule: RULES.missingContent,
        reason: `opens ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ` (+${missing.length - 3})` : ''}, which the contract does not carry: missing data never hides an entry`
      })
      continue
    }
    kept.set(k, {
      rule: RULES.onlyRoute,
      reason: `the only menu route to ${lost.slice(0, 3).join(', ')}${lost.length > 3 ? ` (+${lost.length - 3})` : ''}: ${showcase ? 'a showcase rule' : 'a branch hide'} may not take real content along`
    })
  }

  // A sample listing that an entry staying in a menu leads to (an alias, an `Itemid` URL) is that
  // entry's page: this rule lets it be, and the signals below judge it as before.
  const stays = (k) => !hidden.has(k) && !ancestors(tree, k).some((a) => hidden.has(a))
  for (const [k, h] of hidden)
    if (
      h.rule === RULES.sampleListing &&
      [...live].some(
        (j) => j !== k && (items.get(j).aliasTarget === k || items.get(j).urlTarget === k) && stays(j)
      )
    )
      hidden.delete(k)

  // Joomla drops the children of a hidden item: an item that holds one that stays may not be hidden.
  for (const k of [...kept.keys(), ...unresolved.keys()])
    for (const a of ancestors(tree, k)) {
      const h = hidden.get(a)
      if (!h) continue
      hidden.delete(a)
      if (h.rule === RULES.decisionHide)
        unresolved.set(a, { rule: RULES.conflict, reason: `decided hidden, but it holds ${k}, which stays` })
      else kept.set(a, { rule: RULES.holdsKept, reason: `holds ${k}, which stays` })
    }
  // Removing a hidden ancestor may leave children marked "inside" that now have a visible parent.
  for (const [k, h] of hidden)
    if (h.rule === RULES.insideHidden && !hidden.has(items.get(k).parent)) hidden.delete(k)

  // ── signals: what stays visible but the data cannot clear ──────────────────────────────────────
  for (const k of live) {
    if (hidden.has(k) || kept.has(k) || unresolved.has(k)) continue
    const item = items.get(k)
    const labels = [item, ...ancestors(tree, k).map((a) => items.get(a))]
    const word = labels.find((i) => SHOWCASE_WORDS.test(i.title))
    const f = functional(item)
    const stays = item.children.filter((c) => live.has(c) && !hidden.has(c))
    if (f) kept.set(k, { rule: RULES.functional, reason: `${f}: a working feature stays unless decided` })
    else if (isContainer(item) && KIT_BRANCH.test(item.title) && stays.length)
      // A sample-pages heading still holding a working screen or the only route to content: it stays for that entry.
      kept.set(k, {
        rule: RULES.holdsKept,
        reason: `a sample-pages heading that holds ${stays[0]}, which stays`
      })
    else if (
      VARIANT_LABEL.test(item.title.trim()) &&
      !/^home$/i.test(item.title.trim()) &&
      !homeKeys.has(k) &&
      !pointsHome(item)
    )
      unresolved.set(k, {
        rule: RULES.variantLabel,
        reason: `"${item.title.trim()}" reads as a home or colour demo`
      })
    else if (word)
      unresolved.set(k, {
        rule: RULES.showcaseWord,
        reason: `"${word.title.trim()}" names a showcase branch`
      })
    else if (!isStockScreen(k) && ancestors(tree, k).some((a) => stockBranches.has(a))) {
      const branch = items.get(ancestors(tree, k).find((a) => stockBranches.has(a)))
      unresolved.set(k, {
        rule: RULES.stockBranch,
        reason: `under "${branch.title.trim()}", whose entries are mostly Joomla's stock screens (users, search, tags, sample listings)`
      })
    } else if (drawerMenus.has(item.menutype))
      unresolved.set(k, {
        rule: RULES.drawerMenu,
        reason: `in ${item.menutype}, the drawer menu of ${drawerMenus.get(item.menutype)}`
      })
    else kept.set(k, { rule: RULES.defaultKeep, reason: 'no rule hides it' })
  }

  // ── operations ─────────────────────────────────────────────────────────────────────────────────
  const operations = []
  for (const [k, h] of [...hidden].sort(([a], [b]) => items.get(a).sourceId - items.get(b).sourceId)) {
    const item = items.get(k)
    if (item.menuShow !== null && item.menuShow !== '1') {
      hidden.delete(k)
      unresolved.set(k, {
        rule: RULES.menuShowValue,
        reason: `menu_show is ${JSON.stringify(item.menuShow)}`
      })
      continue
    }
    operations.push({
      op: 'menuItem.param',
      key: k,
      identity: { path: item.path, menutype: item.menutype, language: item.language },
      label: item.title.trim(),
      path: 'menu_show',
      from: item.menuShow,
      to: '0',
      rule: h.rule,
      reason: h.reason
    })
  }
  const offCanvasLeft = new Map()
  for (const m of [...modules.values()].sort((a, b) => a.sourceId - b.sourceId)) {
    if (m.published !== '1' || m.assignment === 'none') continue
    let goes = false
    if (m.module === 'mod_menu') {
      const shown = renderedBy(tree, m)
      if (shown === null) {
        const touches = [...hidden.keys()].some((k) => items.get(k).menutype === m.menutype)
        if (touches)
          unresolved.set(m.key, {
            rule: RULES.pageDependent,
            reason: `renders ${m.menutype} from base/start level ${m.base || m.startLevel}: what it shows depends on the page`
          })
      } else if (shown.length && shown.every((k) => hidden.has(k))) {
        goes = true
        operations.push({
          op: 'module.published',
          key: m.key,
          identity: { title: m.title, module: m.module, position: m.position },
          label: m.title,
          field: 'published',
          from: '1',
          to: '0',
          rule: RULES.moduleEmpty,
          reason: `renders ${m.menutype}, whose ${shown.length} entr${shown.length === 1 ? 'y' : 'ies'} all leave the navigation`
        })
      } else if (shown.length) {
        kept.set(m.key, {
          rule: RULES.defaultKeep,
          reason: `renders ${m.menutype}: ${shown.filter((k) => !hidden.has(k)).length} entr${shown.filter((k) => !hidden.has(k)).length === 1 ? 'y stays' : 'ies stay'}${m.moduleclassSfx ? ` (class "${m.moduleclassSfx}")` : ''}`
        })
      }
    }
    if (/off-?canvas/i.test(m.position)) {
      const list = offCanvasLeft.get(m.position) ?? []
      if (!goes) list.push(m.key)
      offCanvasLeft.set(m.position, list)
    }
  }
  // A drawer whose every module goes would open empty; turning its toggle off is a style param this
  // slice never writes (T3's renderer is not in the repo to prove what the toggle does).
  const goneModules = new Set(operations.filter((o) => o.op === 'module.published').map((o) => o.key))
  for (const [position, left] of offCanvasLeft)
    if (!left.length && [...goneModules].some((k) => modules.get(k).position === position))
      for (const s of [...styles.values()].sort((a, b) =>
        a.key.localeCompare(b.key, 'en', { numeric: true })
      ))
        if (s.offcanvas === '1')
          unresolved.set(s.key, {
            rule: RULES.offcanvas,
            reason: `addon_offcanvas_enable is "1" but every module at ${position} leaves: the toggle would open an empty drawer`
          })

  // A level item whose children all leave keeps its T3 dropdown while a style holds a `sub` for it.
  const mega = megaSubOperations(tree, new Set(hidden.keys()))
  operations.push(...mega.operations)

  const entry = (k, v) => {
    const item = items.get(k)
    const mod = modules.get(k)
    const style = styles.get(k)
    return {
      key: k,
      label: item ? item.title.trim() : mod ? mod.title : style ? style.title : k,
      where: item ? where(item) : mod ? `${mod.module}@${mod.position}` : style ? style.template : '',
      rule: v.rule,
      reason: v.reason
    }
  }
  const order = (a, b) => a.key.localeCompare(b.key, 'en', { numeric: true })
  return {
    operations,
    kept: [...kept].map(([k, v]) => entry(k, v)).sort(order),
    unresolved: [...[...unresolved].map(([k, v]) => entry(k, v)), ...mega.unresolved].sort(order),
    problems
  }
}
