import { siteAccentOf, siteWhatsAppOf } from './brand-on-site.js'
import { pageGroundsOfRevision } from './brand-on-site-grounds.js'
import { AGENT_DEMO, isAgentDemo, checkedResearch, agentDemoInventoryPolicy } from './agent-demo.js'
import { withBuildChoice } from './build-choice.js'
import { checkedFactText, demoFactEvidence } from './demo-fact-evidence.js'
import { neutralWords } from 'website-opportunities/domain/neutral-copy.mjs'
import { forbiddenFillers } from 'website-opportunities/domain/slot-fill-manifest.mjs'
import { liveReadinessOf } from './live-readiness.js'
/**
 * The demo QA gate after "Hand to the agent" (tasks/plan-wo-qa-gate-and-fb-photos.md §3 as amended by
 * the council in §6). tracy-host reads the site in a browser and judges it (`/_host/demo-qa`); this
 * file decides WHEN, keeps the rounds, and talks to the agent.
 *
 *   hand-off   the baseline is read off the site as Tracy built it, before the prompt reaches the agent:
 *              `wo_build.qa = {state: 'pending', baseline, pages, sessionId, since}`. A read that failed (or
 *              came back empty because home never opened) leaves `qa.state = 'baseline'` and NO prompt: the
 *              sweep reads again (`BASELINE_MAX_TRIES`, `BASELINE_RETRY_MS`) and sends the prompt once one
 *              holds; none holds → `qa.state = 'failed'`, `handoff.state = 'needs-review'`.
 *   turn ends  the hand-off chat's turn closed — in the QA's own session, on one of the build's own prompts
 *              (`qa.expectedRequestIds`), after the chat's acceptance is recorded (`handoff.promptSent`) →
 *              one QA round. All pass → `qa.state = 'passed'`,
 *              `handoff.state = 'completed'`. A failure with a repair left → the repair list goes into
 *              the same chat (`session/prompt`), `qa.state = 'retry'`, and the next closed turn is judged.
 *              No repair left → `qa.state = 'failed'`, `handoff.state = 'needs-review'`.
 *
 * 🔒 AT MOST TWO REPAIR ROUNDS, AND A DEMO THAT NEVER PASSED IS NEVER `completed` (council §6e: a third
 * round has the agent guessing and deleting whatever makes the gate pass).
 *
 * 🔒 ONE RUNNER PER BUILD. The hook where a turn closes and the sweep both go through `claimAndRunQa`,
 * which takes ONE row at a time with `for update skip locked` and a lease (`qa_lease_until` plus its token in
 * `qa.lease`); every write is fenced by that token, so a runner whose lease expired writes nothing and sends no
 * prompt. `qa.lease` fences runners; `qa_lease_token` separately identifies an explicit Retry's generation.
 * Nothing waits inside a request for an agent's turn.
 *
 * 🔒 UNKNOWN IS NEVER PASSED. A check the host could not judge (`skipped`: no baseline to hold to) leaves the
 * demo to a person; a round with no baseline at all is `needs-review` without asking the host.
 *
 * Cross-domain needs arrive as functions (module graph): `demoQa(site, payload)` calls the site's host,
 * `prompt(site, email, sessionId, requestId, text)` queues a message in its chat.
 */
import { createHash, randomUUID } from 'node:crypto'
import { canonicalJson } from '../lib/questions-schema.mjs'
import { picturesOfBuild, promptHandoff, withHandoffLock } from './handoff.js'
import { keptPictures } from './agent-demo-slot-fit.js'

/** The brief rows a query answered, each read with this build's choice (`build-choice.js`). */
const seenBy = (build) => (result) => ({
  ...result,
  rows: result.rows.map((r) => withBuildChoice(r, build.choice))
})

export const QA_MAX_REPAIRS = 2
/** Long enough for one host run (its 240 s page budget; ≤ 7 nav pages plus ≤ 8 plan pages) and a prompt. */
export const QA_LEASE_MS = 6 * 60_000
/**
 * A host that has not answered a round for this long, however many sweeps tried, leaves the demo to a person.
 * Time, not a count of sweeps: a 15 s sweep counted three errors through one 45 s tracy-host restart.
 */
export const QA_ERRORS_GIVE_UP_MS = 10 * 60_000
/** The wait after the first failed round, doubled after each next one up to `QA_RETRY_MAX_MS`. */
const QA_RETRY_BASE_MS = 30_000
const QA_RETRY_MAX_MS = 3 * 60_000
/** Reads of the baseline before a hand-off whose site could not be read goes to a person. */
export const BASELINE_MAX_TRIES = 3
/** The sweep reads a failed baseline again no sooner than this after the last try. */
export const BASELINE_RETRY_MS = 60_000
/** Room for the clocks of this process and Postgres before the first turn after a hand-off. */
const SINCE_SLACK_MS = 2_000
/** A repair list sent this long ago with no turn opened on it is sent once more (the agent was asleep). */
export const WAKE_AFTER_MS = 60_000
/** A repair list that opened no turn this long after its wake: a person looks, the gate stops waiting. */
export const STUCK_AFTER_MS = 10 * 60_000

/**
 * Every path Tracy's own build put a picture at — not the template's, so never "demo".
 * @param {any} build
 */
export function placedPaths(build) {
  const out = new Set()
  for (const p of picturesOfBuild(build.pictures)?.placed ?? []) if (p.path) out.add(String(p.path))
  for (const r of Object.values(build.pictures?.receipts ?? {}))
    if (r?.path && ['uploaded', 'applied', 'verified'].includes(r.state)) out.add(String(r.path))
  for (const path of Object.values(build.handoff?.placed ?? {})) out.add(String(path))
  return [...out].map((p) => p.replace(/^\/+/, '').split('#')[0]).sort()
}

/**
 * What the judge needs from the revision: the brief's words (facts and text are judged against them) and
 * the links it verified (`allowedCta`; since 22/10/2026 no button leaves the demo, even for one of those — `cta-real`).
 * @param {any} revision
 */
export function briefOf(revision) {
  const brief = revision?.brief ?? {}
  const allowedCta = (Array.isArray(brief.integrations) ? brief.integrations : [])
    .filter((i) => i?.verified === true && typeof i.url === 'string')
    .map((i) => i.url)
  const tripadvisor = brief.reviewSources?.tripadvisor?.reviews ?? []
  const maps = (brief.reviewSources?.googleMaps?.reviews ?? []).filter(
    (r) => typeof r?.text === 'string' && typeof r?.author === 'string'
  )
  const { reviewSources: _reviewSources, ...withoutSources } = brief
  const { brief: heldFacts, quoted: googleQuoted } = withoutGoogleReviews(withoutSources)
  const quoted = [...googleQuoted, ...maps.map((r) => r.text), ...tripadvisor.map((r) => r.text)]
  // The research a brief froze is evidence, not a fact the brief states: an older brief's embedded copy and a newer
  // brief's reference to it are both left out of the facts (#1791 V2).
  const { agentDemoSnapshot: _snapshot, agentDemoResearch: _reference, ...facts } = heldFacts
  // A revision stored before reviews left the markdown still prints them there, one line each.
  const md = String(revision?.brief_md ?? '')
    .split('\n')
    .filter((l) => !quoted.some((t) => l.includes(t) || l.includes(JSON.stringify(t).slice(1, -1))))
    .join('\n')
  // Quotes travel separately from facts so testimonials cannot supply business claims. An agent build's evidence
  // is its frozen research too — its profile, sources and posts, never its reviews or ratings: the menu prices and
  // hours a build copies from the business's own pages are facts (pilot 24/10/2026, 31 of 102 read as invented).
  const research = isAgentDemo(revision) ? checkedResearch(revision) : null
  const prose = `${md}\n${JSON.stringify(facts)}`
  return {
    briefText: research ? checkedFactText(prose, demoFactEvidence(research)) : prose,
    // Template text is judged against the brief alone (`no-demo-words`): the research's pages hold most everyday
    // words, and 25 of 30 agency blocks read as the brief's with them (HideOut, 24/10/2026).
    briefProse: prose,
    ...(isAgentDemo(revision)
      ? {
          researchHash: research.hash,
          research,
          workflow: AGENT_DEMO
        }
      : {}),
    allowedCta,
    // What the build may add of the business's brand (#1780, `brand-on-site.js`): the logo's accent on the accent role
    // tokens (look-kept), its link tokens where it reads on the template's page grounds (the same grounds the build's
    // steps were given), and the WhatsApp button beside Call (cta-real). Nothing when the brief has none.
    accentTokens: siteAccentOf(brief, { grounds: pageGroundsOfRevision(revision) })?.tokens ?? {},
    whatsappLinks: [siteWhatsAppOf(brief)?.href].filter(Boolean),
    // 🔒 No filler, in any site language; an empty or neutral slot is no finding (`no-demo-words`, plan §7).
    fillers: forbiddenFillers(),
    neutralWords: neutralWords(),
    withheld: withheldOf(brief),
    googleReviews: quoted,
    googleReviewTestimonials: (brief.googlePlace?.reviews ?? [])
      .filter((r) => typeof r?.text === 'string' && typeof r?.author === 'string')
      .map((r) => ({ text: r.text, author: r.author, url: r.googleMapsUri || r.authorUri || null }))
      .concat(maps.map((r) => ({ text: r.text, author: r.author, url: r.url || r.authorUrl || null })))
      .concat(
        tripadvisor.map((r) => ({
          text: r.text,
          author: r.author,
          url: r.url,
          provider: 'TripAdvisor',
          ...(r.authorUrl ? { authorUrl: r.authorUrl } : {})
        }))
      )
  }
}

/**
 * What the brief says not to show (`withheld-not-shown` on the host): each field its sources disagree on
 * (`missing[].conflicting`) or waits for the owner's check (`missing[].withheld`), with every value any source gave.
 * A field merely not collected is not withheld.
 * @param {any} brief
 * @returns {{field: string, values: string[]}[]}
 */
export function withheldOf(brief) {
  return (Array.isArray(brief?.missing) ? brief.missing : [])
    .filter(
      (m) =>
        typeof m?.field === 'string' &&
        ((Array.isArray(m.conflicting) && m.conflicting.length) ||
          (Array.isArray(m.withheld) && m.withheld.length))
    )
    .map((m) => ({
      field: m.field,
      values: (m.conflicting ?? m.withheld).flatMap((c) =>
        Object.entries(c ?? {})
          .filter(([key]) => key !== 'source')
          .flatMap(([, v]) => (Array.isArray(v) ? v : [v]))
          .filter((v) => typeof v === 'string' && v.trim())
      )
    }))
}

const HOME_IDS = new Set(['', 'home', 'homepage', 'index', 'index.php'])
const segments = (p) => String(p).toLowerCase().split('?')[0].split('/').filter(Boolean)

/** The rows of a page plan the build kept, home left out (always read). */
function keptPlanRows(plan) {
  const rows = Array.isArray(plan) ? plan : Array.isArray(plan?.pages) ? plan.pages : []
  return rows.filter((r) => r && r.keep !== false && r.role !== 'home' && r.home !== true)
}

/**
 * The on-site paths of the pages a build kept, for the host to read beside what nav discovery finds: a page
 * nav cannot reach (a Joomla alias parent) is still judged (ds-7f, 19/10/2026).
 * @param {any} plan - `build.receipt.pagePlan`
 * @returns {string[]}
 */
export function planPaths(plan) {
  const out = []
  for (const r of keptPlanRows(plan)) {
    const p = typeof r.path === 'string' ? r.path : typeof r.url === 'string' ? r.url : null
    if (!p || HOME_IDS.has(segments(p).join('/'))) continue
    // Same grammar the host accepts: absolute, on-site, no backslash or whitespace.
    if (/^\/(?![/\\])[^\s\\]*$/.test(p) && p.length <= 400 && !out.includes(p)) out.push(p)
  }
  return out
}

/**
 * The paths of the kept rows the build made the contact page (`role: 'contact'`): the one page a booking
 * button may lead to (`cta-real`, product owner 22/10/2026). The host also takes a page whose slug says contact.
 * @param {any} plan - `build.receipt.pagePlan`
 * @returns {string[]}
 */
export function contactPaths(plan) {
  const rows = keptPlanRows(plan).filter((r) => r.role === 'contact')
  return planPaths(rows)
}

/**
 * The pages the site's build kept (`build.receipt.pagePlan`, PR #1460) that this round's read never reached:
 * one `PAGE_PLAN_MISSING` each. A soft shape — `{pages: [...]}` or a list, each `{path | url, keep,
 * reason | why}` — matched by its last path segment (Joomla SEF may prefix /index.php/ or /en/). A row with
 * no path or url is only listed under `unmatched`: a bare template id is not always a route. Null without a
 * plan, so a build from before plans is judged as before.
 * @param {any} plan @param {string[]} reached the paths the host read
 */
export function pagePlanMissing(plan, reached) {
  const kept = keptPlanRows(plan)
  const routed = kept.filter((r) => typeof r.path === 'string' || typeof r.url === 'string')
  const unmatched = kept.filter((r) => !routed.includes(r)).map((r) => String(r.id ?? r.slug ?? ''))
  const wanted = routed
    .map((r) => ({ path: String(r.path ?? r.url), reason: r.reason ?? r.why ?? null }))
    .filter((r) => !HOME_IDS.has(segments(r.path).join('/')))
  if (!wanted.length && !unmatched.length) return null
  const tails = new Set(reached.map((p) => segments(p).at(-1)).filter(Boolean))
  const detail = wanted
    .filter((r) => !tails.has(segments(r.path).at(-1)))
    .map((r) => ({ code: 'PAGE_PLAN_MISSING', page: r.path, ...(r.reason ? { reason: r.reason } : {}) }))
  return {
    id: 'page-plan-in-nav',
    pass: detail.length === 0,
    measured: `${wanted.length - detail.length}/${wanted.length} kept pages reached`,
    expected: 'every page the build kept is reachable from the menu, footer or sitemap',
    detail,
    ...(unmatched.length ? { unmatched } : {})
  }
}

/**
 * The brief without Google's reviews and its summary of them: what a guest wrote is not a fact about the
 * restaurant (Opal Moon, 19/10/2026: "wood-fired oven" from a review passed facts-from-brief), and the demo
 * shows them separately as attributed testimonials.
 * @param {any} brief
 * @returns {{brief: any, quoted: string[]}} the brief to judge against and the texts taken out
 */
export function withoutGoogleReviews(brief) {
  const g = brief?.googlePlace
  if (!g || typeof g !== 'object') return { brief, quoted: [] }
  const quoted = [
    ...(Array.isArray(g.reviews) ? g.reviews.map((r) => r?.text) : []),
    g.summaries?.reviews
  ].filter((t) => typeof t === 'string' && t.trim() !== '')
  const { reviews: _summary, ...summaries } = g.summaries ?? {}
  const { reviews: _reviews, ...place } = g
  return { brief: { ...brief, googlePlace: { ...place, summaries } }, quoted }
}

/**
 * The repair the agent is told for each failed check: coordinates come from the check's own detail.
 * `css-intact` never says "fix the syntax" (council §6e): the compiled file goes back, changes go in
 * custom.css.
 */
const REPAIR = {
  'pages-load':
    'Make every page load: remove the script or widget that keeps it waiting (a demo booking widget, a script from a demo service).',
  'css-intact':
    'Restore each stylesheet named below to the file the template shipped (the version before your edits, from the site’s history) — do not try to repair its syntax. Put every style change in custom.css only, in plain CSS.',
  'no-demo-pictures':
    'Replace demo pictures with fitting real photographs already supplied for this place; derive fitting crops or resizes when needed. Each picture’s `in` names the record that holds it and, on WordPress, its block by position (content.get {outline:true} numbers them the same). A picture with no `in` is in no record: the theme picks it when the page is drawn — a post’s featured picture (img.wp-post-image) is its _thumbnail_id: content.update {kind:"postmeta", id, key:"_thumbnail_id", fields:{value:<attachment id>}}; any other is a site setting holding its attachment id (on WordPress an option or theme mod: wp option list --search="*image*", or *banner*, *background*): write that setting to the business’s picture, content.update {kind:"option", key, fields:{value:<attachment id>}}, never the theme’s files. Keep every card and section. Never substitute an unrelated person for a chef or avatar. For identity artwork without a real asset, use a verified text or initials fallback while preserving its layout.',
  // Local round 21, 25/10/2026: an EmDash build answered "4 items, was 6" by leaving it, five checks in a row.
  // Local round 26: a WordPress build left a section rewritten as another block through three checks.
  'native-structure':
    'Each line names a record and the path that differs from the template as installed. A list shorter ("now 3 items, was 4"): put its rows back, each with the business’s words, or with its fields empty or neutral where nothing was collected; a field "missing": write it back; a number or flag changed (featured 1 → 0): set it back; a _rowId changed: send the row with its stored _rowId; a markup that differs at a position (`at`, its `was` and `now`): a block there lost or changed its tags — take that block from the record as installed (tracy_demo structure.read lists it by its key, data and all), write it back whole, then change only its words. Words, links and pictures never fail this check.',
  'no-demo-words':
    'Rewrite every passage from verified brief data. Repurpose unsupported demo topics into truthful topics and keep every section and card. Rename each template category or tag named below (where `category` gives its link) to one this business uses, in the CMS’s own taxonomy, keeping the items filed under it — on WordPress a /tag/ link is a post_tag term: content.update {kind:"term", key:"post_tag", id, fields:{name}}; on EmDash, tracy_emdash taxonomy_update_term {taxonomy, termSlug, label}. Replace vendor credits with the real business identity. A filler named below (`filler`) stands where nothing was collected: leave that field empty, or write the approved neutral word of its place ("Menu item" as a dish’s name), never another filler. Words no record holds are printed by the theme: content.replace {path:"<the page named>", changes:[{find, replace}]} changes them where they show — without a path it reads the home page — never the theme’s or a plugin’s files.',
  'look-kept':
    'The site keeps the template’s design system. Remove each colour, background or font override below and put the token’s value back; a `--ds-c-*` token is never set by hand, except the brand accent rule the build steps give, at exactly its values. Do not add another stylesheet, <style> block or inline style to compensate.',
  'collected-used':
    "Put each collected fact, review or photo named below on the site, where the quickstart shows such a thing. Where the business's logo is named, it fills frames meant for something else: put a photo of the place, or the mark of the organisation the strip names, in those frames, or take the entry out of a strip of other organisations' marks, and keep the logo for the header and the footer.",
  'facts-from-brief':
    'Each fact below contradicts what the research collected: show the collected value instead, preserving its section and card. A price the research holds nowhere is made up: leave its field empty. A map link (kind map) searches another street than the business’s: change the address in its link (the href), its words may already be right.',
  'cta-real':
    "Keep each button and change only where it leads. Point every booking button (book, reserve, table, order) at this site's Contact page. Point every other button at a relevant page of this site, or at a tel: or mailto: contact from the brief, or at the WhatsApp link the build steps give. A button never links to the restaurant's live website, its live menu or a booking service.",
  'no-horizontal-scroll':
    'Make each page fit a 390 px wide phone without scrolling sideways: fix the element named as widest (its width, margin or padding, in custom.css). Never set overflow on html or body — that hides the page under the hero on a desktop.',
  'content-reachable':
    'The page stops scrolling before its content ends. Remove every overflow rule you put on html or body (custom.css), then fix the element that overflowed instead.',
  'no-third-party-demo':
    'Disconnect requests to demo services and replace their visible widgets with supported place information or real contact actions, preserving the surrounding layout.',
  'contrast-readable':
    'Make each text readable against what is behind it (contrast at least 3:1), in custom.css, with a rule that selects only the section named (its id or anchor), never a class other sections share. Over a photo (overImage, measured at its viewport), change the photo, never the words: set its row’s tone with tracy_demo {operation:"plan.add", tones:{"<rowIndex>":"dark"}} ("dark" under light words, "light" under dark ones), import that photo again with rowIndex and write the path it returns; Tracy tones the photo itself until the words read (AGENT_DEMO_IMAGE_TONE_UNREACHABLE: put a calmer photo of the place there). Never a filter or style written into the block, an added colour, overlay or background: those fail native-structure or look-kept.',
  'no-text-overlap': 'Move or resize what covers each text so the words are not hidden (custom.css).',
  // Local round 23, 25/10/2026: one white-text rule for every happy-hours band fixed a dark band and
  // turned a light band's words white on grey (contrast 1.11), at the build's last check.
  'looks-finished':
    'Fix each place named below and nothing else: a style rule selects only that section (its id or anchor), never a class other sections share, and never resizes the template’s pictures or moves its badges. Text over a photo is made readable by changing the photo, never the words: set its row’s tone with tracy_demo {operation:"plan.add", tones:{"<rowIndex>":"dark"}} ("dark" under light words, "light" under dark ones), import that photo again with rowIndex and write the path it returns; Tracy tones the photo itself until the words read (AGENT_DEMO_IMAGE_TONE_UNREACHABLE: put a calmer photo of the place there). Never a filter or style written into the block, an added colour, overlay or background: those fail native-structure or look-kept. Darkening a photo under dark words makes them harder to read.',
  'no-broken-assets-and-links':
    'Repair or replace each broken asset or destination, preserving its visible frame and layout.',
  'no-cms-error-leak': 'Find what prints this error and fix it; no PHP or database message may reach a page.',
  'no-raw-placeholders':
    'Replace each raw placeholder with real words from the brief; rewrite the topic when the original claim lacks supporting data.',
  'picture-frames-kept':
    "Each picture below sits in a frame of another shape than the template's, or replaced a picture the template keeps. Cut the photo to the frame's own shape (media.import with its plan row cuts it to the frame), or put the template's picture back: a frame no collected photo fits, an icon, an avatar strip, a signature, a cut-out and a slot marked customize \"keep\" keep the template's picture. Never resize the frame or change its style to make a photo fit.",
  'no-empty-picture-slots':
    'Fill every picture frame with a fitting supplied real photograph or a crop derived from one. Preserve the frame, its section and card count. Report any unresolved frame; never hide, empty or unpublish it to pass the check.',
  // Plan "10/10" §5 (David 26/10/2026): a dead form becomes a real way to reach the business, never an empty band.
  'no-empty-boxes':
    'Each box below was made for a service (a booking or contact form, a feed, a map, a newsletter) and shows nothing. Put one button inside it, in the block that is empty, to the business’s real way to reach it: its booking or ordering link from the research, else its phone (tel:), else its Contact page — the words saying what it does ("Order online", "Call 917…", "Visit us"). Never a form of your own, never hidden, never left empty.',
  // Plan "10/10" P1 (26/10/2026): a selfie behind a section, one photo on two posts side by side.
  'photos-fit':
    'Move each photo named below to where its subject fits: a photo of people, an event, a poster, a menu board or a logo goes in a card, a person’s frame or the gallery, never a section’s background — put a calm photo of the place or of its food there (tracy_demo media.look names what each photo shows). A photo repeated on a page while others are unused gives one of its frames another photo the page does not show yet.',
  'placed-pictures-visible':
    'Each picture below is on the site but sits in a hidden block (closed, collapsed or display:none): show it where a visitor sees it, or move it to a visible place.',
  'no-google-review-quoted':
    'Each review shown is a collected one, quoted word for word as collected with its author’s name beside it; credit the platform and link the review where the area can show them. Put back the collected words of a changed quotation and the author of an unnamed one; never invent, shorten, merge or re-attribute a review.',
  'structure-kept':
    'Each page below lost sections or items of the template. For each named section only, restore its blocks (with the tracy-sec-* class) from that page’s revision at build time, then fill it per its action in the hand-off: the brief’s words, the restaurant’s pictures, or the field left empty where nothing is known. Never restore or rewrite the whole page; edit inside the blocks.',
  'page-plan-in-nav':
    'Each page below was kept when the site was built but a visitor cannot reach it: publish it and add it to the main menu.',
  'withheld-not-shown':
    'The brief withholds each value below until the owner confirms it (opening hours: show none, not even sample hours; Google\'s rating: no score or review count). Remove it from every place it shows, in any wording ("Open 24 hours" is also "24/7"; a 5.0 rating is also "5 Google rating"): hero, header, footer, a sidebar or footer module, a widget, contact block, structured data. A template module that prints the demo\'s hours or rating is emptied or its line taken out; keep the section by writing what the brief does hold.',
  'header-brand':
    'The header must show whose site this is: the business’s collected logo in the template’s logo place, or — with no logo collected — its name in the site-title place. Put back a brand block the header lost; never leave the template’s logo or name there.',
  'no-copied-reviews':
    'Each post below is mostly one review’s words. Rewrite it in the business’s own words from its research (a dish, the story, visiting, what guests say), quoting at most one short line of a review with its author and platform. Never delete or unpublish the post.'
}

const line = (d) =>
  `- ${Object.entries(d)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(
      ([k, v]) =>
        `${k}: ${Array.isArray(v) ? v.slice(0, 5).join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v)}`
    )
    .join('; ')}`

/**
 * The message a failed round sends into the hand-off chat: scope-locked, one block per failed check.
 * @param {{failed: {id: string, expected: string, detail: object[]}[], round: number, maxRounds?: number}} input
 */
export function repairPrompt({ failed, round, maxRounds = QA_MAX_REPAIRS }) {
  const out = [
    `Tracy checked this site after your turn and it is not finished (repair ${round} of ${maxRounds}).`,
    'Fix ONLY the problems listed below. Do not touch anything that is not listed, do not compile LESS or SCSS, and never edit, rewrite or replace the template’s own CSS files — a colour or a font is the template’s design system, which Tracy keeps.',
    // Demo repairs preserve the quickstart layout and rewrite unsupported topics from verified facts.
    'Preserve every existing section, card, image frame and publication state. Never delete, unpublish, hide or empty content to pass a check. Rewrite unsupported demo topics from verified place facts, keep review attribution, and report anything that remains unresolved. Do not invent facts or ask the customer questions during this automatic repair.',
    'For EmDash, inspect the full CMS schema and taxonomy terms rather than only the handoff subset. Where write-capabilities confirms conditionalTermMetadata, read /_emdash/api/taxonomies/<name>/terms?locale=<locale>, then /_emdash/api/taxonomies/<name>/term-metadata/<id>?locale=<locale>. Patch only label/description with mode=patch, the exact _rev and unchanged slug; require _mutationRev and read back the result. Preserve IDs, locale and associations. Use only this site’s existing authorization. Inside the site’s EmDash container, read its bearer token from /run/tracy-agent.token without printing it, and call the CMS on http://127.0.0.1:4321 with Authorization: Bearer and X-EmDash-Request: 1. Check write-capabilities first; refuse unsupported mutations. Native content updates also require revision-aware draft and publish readback. Never edit compiled dist files or rebuild the template to change CMS content.',
    ''
  ]
  for (const check of failed) {
    out.push(`## ${check.id} — expected: ${check.expected}`)
    out.push(REPAIR[check.id] ?? 'Fix each item below.')
    for (const d of (check.detail ?? []).slice(0, 80)) out.push(line(d))
    out.push('')
  }
  out.push('When every item is fixed, end your turn: Tracy checks the site again.')
  return out.join('\n')
}

/**
 * What one round's checks mean for the build. Pure: the caller writes it. A check the host could not judge
 * (`skipped`: it had no baseline to hold to) is unknown, never a pass, and never a repair the agent is sent:
 * with nothing else failing, the demo goes to a person (`unknown` names those checks).
 * @param {any} qa the row's `qa`
 * @param {{id: string, pass: boolean, skipped?: string}[]} checks
 * @returns {{state: 'passed' | 'retry' | 'failed', handoffState: string | null, repair: boolean, unknown?: string[]}}
 */
export function qaOutcome(qa, checks) {
  // A round with no check at all judged nothing: never a pass.
  if (checks.length === 0)
    return { state: 'failed', handoffState: 'needs-review', repair: false, unknown: [] }
  const unknown = checks.filter((c) => c.skipped).map((c) => c.id)
  const failed = checks.filter((c) => !c.pass && !c.skipped)
  if (failed.length === 0 && unknown.length === 0)
    return { state: 'passed', handoffState: 'completed', repair: false }
  if (failed.length === 0) return { state: 'failed', handoffState: 'needs-review', repair: false, unknown }
  if ((qa?.repairs ?? 0) < QA_MAX_REPAIRS) return { state: 'retry', handoffState: null, repair: true }
  return { state: 'failed', handoffState: 'needs-review', repair: false }
}

/** What a round keeps of every check: its id, verdict and measure (the failed ones are kept whole). */
/** The round's live readiness, when its brief measured one. */
function readinessOfRound(revision, checks) {
  const readiness = liveReadinessOf(revision?.brief?.readiness, checks)
  return readiness ? { readiness } : {}
}

export const summary = (checks) => checks.map((c) => ({ id: c.id, pass: c.pass, measured: c.measured }))

/**
 * Whether the host's answer holds a baseline a round can be judged against. "Read, and genuinely empty" is
 * one; "not read" is not: the host failed, home never opened (it then answers 200 with an EMPTY baseline),
 * or a page's read failed (`baseline.unread`). A host from before `read`/`unread` is trusted only when its
 * baseline holds something — no stylesheet, picture or text at all is a home that did not open.
 * @param {{ok: boolean, status: number, body: any}} answer
 * @returns {{ok: true} | {ok: false, why: string}}
 */
/**
 * The baseline as the host judges against it: without each page's words (`pageBlocks`), which only the build's copy
 * tasks read (`demo-copy.js`) — up to ~30 pages of text sent back with every check for nothing.
 * @param {any} baseline
 */
export function baselineForHost(baseline) {
  if (!baseline || typeof baseline !== 'object' || !('pageBlocks' in baseline)) return baseline
  const { pageBlocks: _blocks, ...rest } = baseline
  return rest
}

export function baselineTrust(answer) {
  if (!answer?.ok)
    return {
      ok: false,
      why: answer?.body?.code ?? answer?.body?.why ?? `host answered ${answer?.status ?? 0}`
    }
  const b = answer.body?.baseline
  if (!b || typeof b !== 'object' || !b.cssRules || typeof b.cssRules !== 'object')
    return { ok: false, why: 'the host sent no baseline' }
  if (Array.isArray(b.unread) && b.unread.length)
    return {
      ok: false,
      why: `not read: ${b.unread
        .slice(0, 5)
        .map((u) => `${u?.path} (${u?.why})`)
        .join(', ')}`
    }
  if (Array.isArray(b.read)) return b.read.length ? { ok: true } : { ok: false, why: 'no page was read' }
  const held = Object.keys(b.cssRules).length + (b.pictures?.files?.length ?? 0) + (b.texts?.length ?? 0)
  return held ? { ok: true } : { ok: false, why: 'the baseline is empty' }
}

/** The QA without the lease token a runner put on it. */
const withoutLease = (qa) => {
  if (!qa) return qa
  const { lease: _lease, ...rest } = qa
  return rest
}

/**
 * Lease ONE build that matches `due` (SQL over `b`, its values `params` as $1…): the row as it is now, and
 * the token every write under this lease is fenced by (kept in `qa.lease` beside `qa_lease_until`).
 * @returns {Promise<{build: any, lease: string} | null>}
 */
async function leaseOne(pool, now, due, params) {
  const n = params.length
  const lease = randomUUID()
  const { rows } = await pool.query(
    `with due as (
       select b.id from wo_build b
        where (${due}) and coalesce(b.content#>>'{agentDemo,clientChat,chatMode}','')<>'client-send/1' and (b.qa_lease_until is null or b.qa_lease_until < $${n + 1})
        order by b.updated_at
        limit 1
        for update of b skip locked)
     update wo_build b set qa_lease_until = $${n + 2}, qa = b.qa || jsonb_build_object('lease', $${n + 3}::text)
       from due where b.id = due.id
     returning b.*`,
    [...params, new Date(now()), new Date(now() + QA_LEASE_MS), lease]
  )
  return rows[0] ? { build: rows[0], lease } : null
}

/** Whether `lease` still holds the build, extended so what follows (a prompt) runs under a live lease. */
async function holdLease(pool, id, lease, now) {
  const { rowCount } = await pool.query(
    `update wo_build set qa_lease_until = $3 where id = $1 and qa->>'lease' = $2`,
    [id, lease, new Date(now() + QA_LEASE_MS)]
  )
  return rowCount === 1
}

async function releaseLease(pool, id, lease) {
  await pool
    .query(
      `update wo_build set qa_lease_until = null, qa = qa - 'lease' where id = $1 and qa->>'lease' = $2`,
      [id, lease]
    )
    .catch(() => {})
}

/**
 * At hand-off: read the baseline off the site, before the agent gets its prompt. A build that already has a
 * QA keeps it — a press after the agent's turn must not take a baseline off the site the agent changed —
 * except one still waiting for its baseline (`state: 'baseline'`), which this press reads again.
 * Called under the build's hand-off lock (`withHandoffLock`).
 * @param {{pool: import('pg').Pool, build: any, revision: any, site: any, sessionId: string | null, email: string,
 *   demoQa: (site: any, payload: object) => Promise<{ok: boolean, status: number, body: any}>, now?: () => number}} input
 * @returns {Promise<any>} the build's `qa`; `qa.baseline` unset means the prompt must not go out yet
 */
export async function startDemoQa({ pool, build, revision, site, sessionId, email, demoQa, now = Date.now }) {
  const at = new Date(now()).toISOString()
  const fresh = {
    state: 'baseline',
    ...(isAgentDemo(revision) ? { workflow: AGENT_DEMO, researchHash: checkedResearch(revision).hash } : {}),
    sessionId: sessionId ?? null,
    by: email,
    repairs: 0,
    errors: 0,
    rounds: [],
    baselineTries: 0,
    at
  }
  // A QA held with no baseline and no prompt sent (made before the baseline was required) waits for one too.
  await pool.query(
    `update wo_build set qa = $2::jsonb, updated_at = now()
      where id = $1
        and (qa is null
             or (qa->>'state' = 'pending' and coalesce(jsonb_typeof(qa->'baseline'), 'null') = 'null'
                 and handoff->'promptSent' is null
                 and (qa_lease_until is null or qa_lease_until < $3)))`,
    [build.id, JSON.stringify(fresh), new Date(now())]
  )
  // A QA made before any chat could be made takes this press's.
  if (sessionId)
    await pool.query(
      `update wo_build set qa = jsonb_set(qa, '{sessionId}', to_jsonb($2::text))
        where id = $1 and qa->>'sessionId' is null`,
      [build.id, sessionId]
    )
  const claimed = await leaseOne(pool, now, `b.id = $1 and b.qa->>'state' = 'baseline'`, [build.id])
  if (claimed) return takeBaseline(pool, { demoQa, now }, claimed, { revision, site })
  // Judged already, or the sweep is reading the baseline right now: as it stands.
  const { rows } = await pool.query('select qa from wo_build where id = $1', [build.id])
  return withoutLease(rows[0]?.qa ?? null)
}

/**
 * One read of a leased build's baseline (it re-reads the row: the hand-off that just ran wrote the pictures
 * it placed). Trusted → `pending`, `since` now. Not → another try later, or `needs-review` after
 * `BASELINE_MAX_TRIES`. Never taken off the bare template: Tracy has already written the place's words.
 * @returns {Promise<any>} the QA as written
 */
async function takeBaseline(pool, deps, { build, lease }, { revision, site }) {
  const now = deps.now ?? Date.now
  const qa = withoutLease(build.qa)
  const answer = await deps
    .demoQa(site, {
      pages: ['/'],
      discover: true,
      // The box each template picture is drawn in, so the check after the turn sees a frame that changed shape.
      measureFrames: true,
      plan: planPaths(build.receipt?.pagePlan ?? null),
      contactPaths: contactPaths(build.receipt?.pagePlan ?? null),
      placed: placedPaths(build),
      ...briefOf(revision),
      ...(isAgentDemo(revision)
        ? {
            structure: {
              cms: build.content?.agentDemo?.structure?.cms,
              inventoryHash: build.content?.agentDemo?.structure?.inventory?.hash,
              counts: build.content?.agentDemo?.structure?.inventory?.counts
            },
            structureHash: build.content?.agentDemo?.structureHash
          }
        : {})
    })
    .catch(() => ({ ok: false, status: 0, body: null }))
  const trust = baselineTrust(answer)
  const tries = (qa.baselineTries ?? 0) + 1
  const at = new Date(now()).toISOString()
  const { baselineError: _error, retryAt: _retry, ...rest } = qa
  if (trust.ok) {
    const next = {
      ...rest,
      state: 'pending',
      baselineTries: tries,
      since: at,
      baseline: answer.body.baseline,
      pages: Array.isArray(answer.body.pages) && answer.body.pages.length ? answer.body.pages : ['/'],
      baselineChecks: summary(answer.body.checks ?? [])
    }
    return (await saveQa(pool, build.id, next, { lease })) ? next : withoutLease(await qaOf(pool, build.id))
  }
  if (tries >= BASELINE_MAX_TRIES) {
    const next = {
      ...rest,
      state: 'failed',
      baselineTries: tries,
      baselineError: trust.why,
      reason: `the site could not be read before the hand-off (${trust.why})`
    }
    await saveQa(pool, build.id, next, { lease, handoffState: 'needs-review' })
    return next
  }
  const next = {
    ...rest,
    baselineTries: tries,
    baselineError: trust.why,
    retryAt: new Date(now() + BASELINE_RETRY_MS).toISOString()
  }
  await saveQa(pool, build.id, next, { lease })
  return next
}

async function qaOf(pool, id) {
  const { rows } = await pool.query('select qa from wo_build where id = $1', [id])
  return rows[0]?.qa ?? null
}

/**
 * Write a build's QA (and its hand-off state with it), releasing the lease. 🔒 FENCED: with `lease`, only while
 * that lease still holds the row — a runner whose lease expired and was taken over writes nothing (19/10/2026:
 * a stale runner saved its old snapshot, and repairs went backwards).
 * @returns {Promise<boolean>} whether it was written
 */
async function saveQa(pool, id, qa, { handoffState = null, lease = null } = {}) {
  const { rowCount } = await pool.query(
    `update wo_build set qa = $2::jsonb, qa_lease_until = null,
       handoff = case when $3::text is null or handoff is null then handoff
                      else jsonb_set(handoff, '{state}', to_jsonb($3::text)) end,
       updated_at = now()
     where id = $1 and ($4::text is null or qa->>'lease' = $4)`,
    [id, JSON.stringify(withoutLease(qa)), handoffState, lease]
  )
  return rowCount === 1
}

function acceptedRetryAction(build) {
  const qa = build.qa ?? {}
  const marker = qa.acceptedRetry
  return marker?.schemaVersion === 'tracy-wo-qa-retry/v1' &&
    marker.acceptedActionId === qa.retryActionId &&
    marker.buildId === build.id &&
    /^\d+$/.test(marker.failedQaGeneration ?? '') &&
    /^[a-f0-9]{64}$/.test(marker.failedQaHash ?? '')
    ? qa.retryActionId
    : null
}

function repairRequestId(build, round) {
  const actionId = acceptedRetryAction(build)
  return actionId ? `wo-qa-retry:${actionId}:repair:${round}` : `wo-qa-${build.id}-${round}`
}

// Keep this proof grammar identical to acceptedRetryAction: fallback is never an authorization
// to judge another action's turn, even when two accepted actions share one build and chat.
const ACCEPTED_RETRY_SQL = `(b.qa#>>'{acceptedRetry,schemaVersion}'='tracy-wo-qa-retry/v1'
  and b.qa#>>'{acceptedRetry,acceptedActionId}'=b.qa->>'retryActionId'
  and b.qa#>>'{acceptedRetry,buildId}'=b.id::text
  and b.qa#>>'{acceptedRetry,failedQaGeneration}' ~ '^[0-9]+$'
  and b.qa#>>'{acceptedRetry,failedQaHash}' ~ '^[a-f0-9]{64}$')`
const REPAIR_RPC_SQL = `(case when ${ACCEPTED_RETRY_SQL}
  then 'wo-qa-retry:' || (b.qa->>'retryActionId') || ':repair:' || (b.qa->>'repairs')
  else 'wo-qa-' || b.id::text || '-' || (b.qa->>'repairs') end)`
const INITIAL_RETRY_RPC_SQL = `('wo-qa-retry:' || (b.qa->>'retryActionId'))`

/** A legacy receipt still names the exact prompt; absence of one never means any turn is eligible. */
const EXPECTED_RPC_SQL = `coalesce(
  case when jsonb_typeof(b.qa->'expectedRequestIds')='array' then b.qa->'expectedRequestIds'
       when b.qa ? 'expectedRequestIds' then '[]'::jsonb end,
  case when coalesce(b.qa->>'retryActionId','')<>'' and not coalesce(${ACCEPTED_RETRY_SQL},false)
    then '[]'::jsonb
  when b.qa->>'state' = 'retry' then jsonb_build_array(
    ${REPAIR_RPC_SQL}, ${REPAIR_RPC_SQL} || '-wake')
  when ${ACCEPTED_RETRY_SQL} then jsonb_build_array(
    ${INITIAL_RETRY_RPC_SQL}, ${INITIAL_RETRY_RPC_SQL} || '-wake')
  when b.handoff->'promptSent' is not null then jsonb_build_array(coalesce(
    b.handoff->'promptSent'->>'requestId',
    'wo-handoff:' || b.id::text || ':' || (b.qa->>'sessionId')))
  else '[]'::jsonb end)`
function expectedRequests(build) {
  const qa = build.qa ?? {}
  if (Object.hasOwn(qa, 'expectedRequestIds'))
    return Array.isArray(qa.expectedRequestIds)
      ? qa.expectedRequestIds.filter((id) => typeof id === 'string')
      : []
  if (qa.retryActionId && !acceptedRetryAction(build)) return []
  if (qa.state === 'retry') {
    const id = repairRequestId(build, qa.repairs)
    return [id, `${id}-wake`]
  }
  if (acceptedRetryAction(build)) {
    const id = `wo-qa-retry:${qa.retryActionId}`
    return [id, `${id}-wake`]
  }
  return build.handoff?.promptSent
    ? [build.handoff.promptSent.requestId ?? `wo-handoff:${build.id}:${qa.sessionId}`]
    : []
}

function currentWakeRequestId(build) {
  const qa = build.qa ?? {}
  if (qa.retryActionId && !acceptedRetryAction(build)) return null
  const primary = [...new Set(expectedRequests(build).filter((id) => !id.endsWith('-wake')))]
  if (primary.length !== 1) return null
  return `${primary[0]}-wake`
}

/**
 * The sweep's half of the baseline: every build still waiting for one, due again, is read once more under its
 * hand-off lock (a press of the door never races it), and once it holds, the hand-off prompt goes to the chat.
 * @param {import('pg').Pool} pool
 * @param {Parameters<typeof claimAndRunQa>[1]} deps
 * @returns {Promise<{read: number, ready: number}>}
 */
export async function takeDueBaselines(pool, deps) {
  const now = deps.now ?? Date.now
  const seen = []
  let ready = 0
  for (let i = 0; i < (deps.limit ?? 5); i++) {
    const claimed = await leaseOne(
      pool,
      now,
      `b.qa->>'state' = 'baseline' and b.handoff->>'state' = 'ready' and not (b.id = any($1::uuid[]))
         and (b.qa->>'retryAt' is null or (b.qa->>'retryAt')::timestamptz < $2)`,
      [seen, new Date(now())]
    )
    if (!claimed) break
    const { build, lease } = claimed
    seen.push(build.id)
    try {
      const held = await withHandoffLock(pool, build.id, async () => {
        const [{ rows: sites }, { rows: revisions }] = await Promise.all([
          pool.query('select * from site where site_key = $1', [build.site_key]),
          pool.query('select * from wo_revision where id = $1', [build.revision_id]).then(seenBy(build))
        ])
        if (!sites[0] || !revisions[0]) {
          await saveQa(
            pool,
            build.id,
            { ...withoutLease(build.qa), state: 'failed', reason: 'the site is gone' },
            { lease, handoffState: 'needs-review' }
          )
          return
        }
        if (!(await agentDemoMayPrompt(pool, build))) return
        const qa = await takeBaseline(pool, deps, claimed, { revision: revisions[0], site: sites[0] })
        if (qa?.state !== 'pending' || !qa.baseline || !qa.sessionId || !qa.by) return
        const { rows } = await pool.query('select handoff from wo_build where id = $1', [build.id])
        const handoff = rows[0]?.handoff
        if (handoff?.state !== 'ready' || typeof handoff.prompt !== 'string') return
        if (handoff.promptSent?.sessionId === qa.sessionId) return
        if (!(await agentDemoMayPrompt(pool, { ...build, qa }))) return
        if (
          await promptHandoff({
            pool,
            prompt: deps.prompt,
            site: sites[0],
            email: qa.by,
            buildId: build.id,
            sessionId: qa.sessionId,
            text: handoff.prompt,
            now
          })
        )
          ready++
      })
      if (!held.locked) await releaseLease(pool, build.id, lease)
    } catch (error) {
      deps.log?.warn?.(`[demo-qa] baseline ${build.id}: ${error?.message ?? error}`)
      await releaseLease(pool, build.id, lease)
    }
  }
  return { read: seen.length, ready }
}

/**
 * Take every build whose hand-off chat finished a turn since its last round, and run that round — one build
 * leased at a time, so no lease runs out while an earlier build is judged.
 * `siteKey` / `buildId` narrow it (the hook where a turn closes); none is the sweep.
 * @param {import('pg').Pool} pool
 * @param {{demoQa: Function, prompt: Function, now?: () => number, log?: Pick<Console, 'warn'>, limit?: number}} deps
 * @param {{siteKey?: string | null, buildId?: string | null}} [only]
 * @returns {Promise<{ran: number, results: {id: string, state: string}[]}>}
 */
export async function claimAndRunQa(pool, deps, { siteKey = null, buildId = null } = {}) {
  const now = deps.now ?? Date.now
  // The turn a round judges opened after the last judged turn AND after the prompt it answers (the hand-off's
  // `since`, a repair's `promptedAt`): a turn the person typed between rounds is not the repair's turn.
  const ended = `t.site_key = b.site_key
        and t.session_id = b.qa->>'sessionId'
        and (${EXPECTED_RPC_SQL} ? t.rpc_id)
        and t.opened_at > greatest((b.qa->>'judgedTurnAt')::timestamptz,
                                   coalesce((b.qa->>'promptedAt')::timestamptz, (b.qa->>'since')::timestamptz)
                                     - make_interval(secs => ${SINCE_SLACK_MS / 1000}))`
  // Judged only once the chat's acceptance of the prompt is durable (`handoff.promptSent`), and never while
  // an explicit Retry's prompt is still to go out.
  const due = `b.qa->>'state' in ('pending', 'retry')
          and b.handoff->>'state' = 'ready'
          and jsonb_typeof(b.handoff->'promptSent') = 'object'
          and coalesce((b.qa->>'retryPromptSent')::boolean, true)
          and ($1::text is null or b.site_key = $1)
          and ($2::uuid is null or b.id = $2)
          and not (b.id = any($3::uuid[]))
          and (b.qa->>'retryAt' is null or (b.qa->>'retryAt')::timestamptz < $4)
          and exists (select 1 from site_turn t where ${ended} and t.state in ('closed', 'stale'))
          and not exists (select 1 from site_turn t where ${ended} and t.state = 'open')`
  const seen = []
  const results = []
  for (let i = 0; i < (deps.limit ?? 5); i++) {
    const claimed = await leaseOne(pool, now, due, [siteKey, buildId, seen, new Date(now())])
    if (!claimed) break
    seen.push(claimed.build.id)
    try {
      results.push({ id: claimed.build.id, state: await runRound(pool, deps, claimed) })
    } catch (error) {
      deps.log?.warn?.(`[demo-qa] build ${claimed.build.id}: ${error?.message ?? error}`)
      await releaseLease(pool, claimed.build.id, claimed.lease)
    }
  }
  return { ran: seen.length, results }
}

/** The wait before the next try after `errors` rounds in a row the host could not run. */
const errorBackoff = (errors) => Math.min(QA_RETRY_BASE_MS * 2 ** Math.max(0, errors - 1), QA_RETRY_MAX_MS)

/** One QA round of a leased build; returns the state it left (`lost`: the lease went to another runner). */
async function runRound(pool, deps, { build, lease }) {
  const now = deps.now ?? Date.now
  if (!(await agentDemoMayPrompt(pool, build))) {
    await releaseLease(pool, build.id, lease)
    return 'lost'
  }
  const base = withoutLease(build.qa)
  const qa = { ...base, rounds: [...(base.rounds ?? [])] }
  const fail = async (reason, extra = {}) =>
    (await saveQa(
      pool,
      build.id,
      { ...qa, ...extra, state: 'failed', reason },
      { lease, handoffState: 'needs-review' }
    ))
      ? 'failed'
      : 'lost'
  // Nothing to hold the demo to (a hand-off from before the baseline was required): never passed.
  if (!qa.baseline)
    return fail('the baseline was not read before the hand-off, so the demo could not be judged')
  // The turn this round judges: the next round waits for a turn opened after it (kept as Postgres' own
  // text, so its microseconds survive the round trip).
  const judged = await pool.query(
    `select max(opened_at)::text as at from site_turn
      where site_key = $1 and session_id = $2 and state in ('closed', 'stale')
        and $3::jsonb ? rpc_id`,
    [build.site_key, qa.sessionId ?? null, JSON.stringify(expectedRequests(build))]
  )
  const judgedTurnAt = judged.rows[0]?.at ?? null
  const [{ rows: sites }, { rows: revisions }] = await Promise.all([
    pool.query('select * from site where site_key = $1', [build.site_key]),
    pool.query('select * from wo_revision where id = $1', [build.revision_id]).then(seenBy(build))
  ])
  const site = sites[0]
  if (!site) return fail('the site is gone')
  let nativeCheck = null
  if (isAgentDemo(revisions[0])) {
    try {
      const current = await deps.readNativeInventory?.({
        site,
        email: qa.by,
        structure: build.content?.agentDemo?.structure
      })
      nativeCheck = deps.compareNativeInventory?.(
        build.content?.agentDemo?.structure?.inventory,
        current,
        agentDemoInventoryPolicy(revisions[0], site.platform)
      ) ?? {
        id: 'native-structure',
        pass: false,
        skipped: true,
        detail: 'Native inventory comparison is unavailable.'
      }
    } catch (error) {
      nativeCheck = {
        id: 'native-structure',
        pass: false,
        skipped: true,
        detail: `Native inventory could not be read: ${error.code ?? 'unavailable'}`
      }
    }
  }
  const answer = await deps
    .demoQa(site, {
      // Home's nav as it is now: the agent drafts template pages and publishes its own between rounds (L4).
      pages: ['/'],
      discover: true,
      plan: planPaths(build.receipt?.pagePlan ?? null),
      contactPaths: contactPaths(build.receipt?.pagePlan ?? null),
      baseline: baselineForHost(qa.baseline),
      placed: placedPaths(build),
      ...briefOf(revisions[0]),
      ...(isAgentDemo(revisions[0])
        ? {
            structure: {
              cms: build.content?.agentDemo?.structure?.cms,
              inventoryHash: build.content?.agentDemo?.structure?.inventory?.hash,
              counts: build.content?.agentDemo?.structure?.inventory?.counts
            },
            structureHash: build.content?.agentDemo?.structureHash,
            editorialPlan: build.content?.agentDemo?.plan,
            // The template pictures no photo replaces (an icon, an avatar strip, a cut-out, a kept slot).
            kept: keptPictures(build.content?.agentDemo?.structure, qa.baseline)
          }
        : {})
    })
    .catch(() => ({ ok: false, status: 0, body: null }))
  if (!(await agentDemoMayPrompt(pool, build))) {
    await releaseLease(pool, build.id, lease)
    return 'lost'
  }
  const at = new Date(now()).toISOString()
  if (!answer.ok || !Array.isArray(answer.body?.checks)) {
    const errors = (qa.errors ?? 0) + 1
    const firstErrorAt = qa.firstErrorAt ?? at
    const reason = `the check could not run (${answer.body?.code ?? answer.status})`
    if (now() - Date.parse(firstErrorAt) >= QA_ERRORS_GIVE_UP_MS)
      return fail(reason, { errors, firstErrorAt })
    const kept = await saveQa(
      pool,
      build.id,
      {
        ...qa,
        errors,
        firstErrorAt,
        lastError: reason,
        retryAt: new Date(now() + errorBackoff(errors)).toISOString()
      },
      { lease }
    )
    return kept ? qa.state : 'lost'
  }
  // Only a round that ran consumes its turn: a host that did not answer is asked again at the next sweep.
  if (judgedTurnAt) qa.judgedTurnAt = judgedTurnAt
  delete qa.firstErrorAt
  delete qa.retryAt
  delete qa.lastError
  const reached = [
    ...(Array.isArray(answer.body.pages) ? answer.body.pages : []),
    ...(Array.isArray(answer.body.visited)
      ? answer.body.visited.filter((v) => !v.skipped).map((v) => v.path)
      : [])
  ]
  const planned = pagePlanMissing(build.receipt?.pagePlan ?? null, reached)
  const checks = [...answer.body.checks, ...(planned ? [planned] : []), ...(nativeCheck ? [nativeCheck] : [])]
  const failed = checks.filter((c) => !c.pass && !c.skipped)
  qa.errors = 0
  const read = Array.isArray(answer.body.pages) && answer.body.pages.length ? answer.body.pages : null
  if (read) qa.pages = read
  qa.rounds.push({
    n: qa.rounds.length + 1,
    at,
    durationMs: answer.body.durationMs ?? null,
    pages: read,
    ...(Array.isArray(answer.body.visited) ? { visited: answer.body.visited } : {}),
    checks: summary(checks),
    failed,
    // What the live site shows of the brief: sample text left, collected items shown (#50, `live-readiness.js`).
    ...readinessOfRound(revisions[0], checks)
  })
  const outcome = qaOutcome(qa, checks)
  if (
    outcome.state === 'passed' &&
    qa.workflow === AGENT_DEMO &&
    (!build.content?.agentDemo?.plan || !build.content?.agentDemo?.structureHash)
  )
    return fail('the agent did not persist its plan and live structure')
  if (outcome.state === 'passed' && qa.workflow === AGENT_DEMO)
    return (await saveQa(
      pool,
      build.id,
      { ...qa, state: 'needs-review', machinePassed: true, humanAccepted: false },
      { lease, handoffState: 'needs-review' }
    ))
      ? 'passed'
      : 'lost'
  if (outcome.state === 'passed')
    return (await saveQa(pool, build.id, { ...qa, state: 'passed' }, { lease, handoffState: 'completed' }))
      ? 'passed'
      : 'lost'
  if (outcome.state === 'failed')
    return fail(
      outcome.unknown?.length
        ? `could not judge ${outcome.unknown.join(', ')}`
        : outcome.unknown
          ? 'the check answered no checks, so the demo could not be judged'
          : `still failing after ${QA_MAX_REPAIRS} repairs`
    )
  const round = (qa.repairs ?? 0) + 1
  if (qa.retryActionId && !acceptedRetryAction(build))
    return fail('the QA retry has no accepted action proof')
  const requestId = repairRequestId(build, round)
  const text = repairPrompt({ failed, round })
  // A runner that lost its lease sends nothing: the one holding it now does.
  if (!(await holdLease(pool, build.id, lease, now))) return 'lost'
  const sent =
    (await agentDemoMayPrompt(pool, build)) && qa.sessionId && qa.by
      ? await deps.prompt(site, qa.by, qa.sessionId, requestId, text).catch(() => false)
      : false
  if (!sent) return fail('the repair list could not reach the chat')
  const kept = await saveQa(
    pool,
    build.id,
    {
      ...qa,
      state: 'retry',
      expectedRequestIds: [requestId],
      repairs: round,
      since: at,
      lastPrompt: text,
      promptedAt: at,
      wakes: 0
    },
    { lease }
  )
  return kept ? 'retry' : 'lost'
}

/**
 * The cron sweep: baselines still to read, and whatever the hook missed (a turn closed on another replica, a
 * restart).
 * @param {import('pg').Pool} pool
 * @param {Parameters<typeof claimAndRunQa>[1]} deps
 */
export async function sweepDemoQa(pool, deps) {
  const baselines = await takeDueBaselines(pool, deps)
  const ran = await claimAndRunQa(pool, deps)
  const woken = await wakeStuckRepairs(pool, deps)
  return { ...ran, woken: woken.woken, stuck: woken.stuck, baselines }
}

/**
 * A prompt the agent never started on: the hand-off's (`pending`, counted from `since`) or a repair list
 * (`retry`, from `promptedAt`). `session/prompt` in `queue` mode only wakes an idle agent: sent while its turn
 * was still ending it waits in the next-turn queue, and a turn that ended in a model error claims nothing
 * (Passion, 18/10/2026: 40 minutes at `retry` until a person opened the chat). So a prompt with no turn opened
 * `WAKE_AFTER_MS` after it was sent is sent once more, now that the agent is idle; still no turn
 * `STUCK_AFTER_MS` later (a turn that never ends on dsh's side) is `needs-review` with the reason, never a
 * silent wait.
 * @param {import('pg').Pool} pool
 * @param {Parameters<typeof claimAndRunQa>[1]} deps
 * @returns {Promise<{woken: number, stuck: number}>}
 */
export async function wakeStuckRepairs(pool, deps) {
  const now = deps.now ?? Date.now
  const sent = `coalesce((b.qa->>'promptedAt')::timestamptz, (b.qa->>'since')::timestamptz)`
  // Only a prompt the chat accepted (`handoff.promptSent`; an explicit Retry's once sent) is waited on, and
  // only a turn on one of this build's own prompts in its own chat counts as the agent starting on it.
  const due = `b.qa->>'state' in ('pending', 'retry')
          and b.handoff->>'state' = 'ready'
          and b.handoff->'promptSent' is not null
          and coalesce((b.qa->>'retryPromptSent')::boolean, true)
          and ${sent} < $1
          and not (b.id = any($2::uuid[]))
          and not exists (select 1 from site_turn t
                           where t.site_key = b.site_key
                             and t.session_id = b.qa->>'sessionId'
                             and (${EXPECTED_RPC_SQL} ? t.rpc_id)
                             and t.opened_at > ${sent} - make_interval(secs => ${SINCE_SLACK_MS / 1000}))`
  const seen = []
  let woken = 0
  let stuck = 0
  for (let i = 0; i < (deps.limit ?? 5); i++) {
    const claimed = await leaseOne(pool, now, due, [new Date(now() - WAKE_AFTER_MS), seen])
    if (!claimed) break
    const { build, lease } = claimed
    seen.push(build.id)
    const qa = withoutLease(build.qa)
    const repair = qa.state === 'retry'
    const text = repair ? qa.lastPrompt : (qa.lastPrompt ?? build.handoff?.prompt)
    const at = new Date(now()).toISOString()
    try {
      const requestId = currentWakeRequestId(build)
      if (requestId && (qa.wakes ?? 0) < 1 && typeof text === 'string' && text && qa.sessionId && qa.by) {
        const { rows: sites } = await pool.query('select * from site where site_key = $1', [build.site_key])
        const ok =
          sites[0] && (await agentDemoMayPrompt(pool, build)) && (await holdLease(pool, build.id, lease, now))
            ? await deps.prompt(sites[0], qa.by, qa.sessionId, requestId, text).catch(() => false)
            : false
        if (ok) {
          await saveQa(
            pool,
            build.id,
            {
              ...qa,
              wakes: 1,
              promptedAt: at,
              wokenAt: at,
              expectedRequestIds: [...new Set([...expectedRequests(build), requestId])]
            },
            { lease }
          )
          woken++
          continue
        }
      }
      if (now() - Date.parse(qa.promptedAt ?? qa.since) < STUCK_AFTER_MS) {
        await releaseLease(pool, build.id, lease)
        continue
      }
      const reason = repair
        ? 'the agent did not start on the repair list'
        : 'the agent did not start on the hand-off prompt'
      if (
        await saveQa(
          pool,
          build.id,
          { ...qa, state: 'failed', reason },
          { lease, handoffState: 'needs-review' }
        )
      )
        stuck++
    } catch (error) {
      deps.log?.warn?.(`[demo-qa] wake ${build.id}: ${error?.message ?? error}`)
      await releaseLease(pool, build.id, lease)
    }
  }
  return { woken, stuck }
}

/**
 * The QA as a door answers it: everything but the baseline, which is the host's working data.
 * @param {any} qa
 */
export function qaShape(qa) {
  if (!qa) return null
  const { baseline, by: _by, lease: _lease, acceptedRetry: _acceptedRetry, ...rest } = qa
  return { ...rest, baselineTaken: Boolean(baseline) }
}

/** Acceptance metadata is not part of the failed QA generation it authorizes. */
export function failedQaHash(qa) {
  const { acceptedRetry: _acceptedRetry, ...failed } = qa ?? {}
  return createHash('sha256').update(canonicalJson(failed)).digest('hex')
}

/** Explicit Retry resumes the same site's QA chat; it never provisions another site or retakes its baseline. */
export async function resumeDemoQa(pool, deps, build, actionId) {
  const now = deps.now ?? Date.now
  const qa = build.qa
  const marker = qa?.acceptedRetry
  if (build.content?.agentDemo?.clientChat?.chatMode === 'client-send/1') return false
  if (
    !qa?.sessionId ||
    marker?.schemaVersion !== 'tracy-wo-qa-retry/v1' ||
    marker.acceptedActionId !== actionId ||
    marker.buildId !== build.id ||
    !/^\d+$/.test(marker.failedQaGeneration ?? '') ||
    !/^[a-f0-9]{64}$/.test(marker.failedQaHash ?? '')
  )
    return false
  // An accepted retry may read the initial site again only when no baseline or prompt ever existed.
  if (!qa.baseline) {
    if (
      qa.state !== 'failed' ||
      qa.retryActionId === actionId ||
      qa.endReason ||
      qa.reason === 'AGENT_DEMO_TURN_STOPPED' ||
      !qa.baselineError ||
      !qa.by ||
      qa.promptedAt ||
      qa.lastPrompt ||
      (qa.expectedRequestIds?.length ?? 0) > 0 ||
      build.handoff?.promptSent ||
      build.handoff?.sessionId !== qa.sessionId ||
      typeof build.handoff?.prompt !== 'string' ||
      !build.handoff.prompt ||
      String(build.qa_lease_token) !== marker.failedQaGeneration ||
      failedQaHash(qa) !== marker.failedQaHash
    )
      return false
    const { retryPromptSent: _retryPromptSent, ...initialQa } = withoutLease(qa)
    const originalRequestId = `wo-handoff:${build.id}:${qa.sessionId}`
    const reset = await pool.query(
      `update wo_build set qa=$2::jsonb, qa_lease_token=qa_lease_token+1, qa_lease_until=null,
        handoff=jsonb_set(handoff,'{state}','"ready"'::jsonb)
       where id=$1 and qa=$3::jsonb and qa_lease_token=$4 and qa->'acceptedRetry'=$5::jsonb
        and handoff=$6::jsonb and coalesce(jsonb_typeof(handoff->'promptSent'),'null')='null'
        and (qa_lease_until is null or qa_lease_until<$7)
        and not exists (select 1 from site_turn t where t.site_key=wo_build.site_key and t.session_id=$8)
        and exists (select 1 from wo_demo_action a where a.id=$9 and a.status='queued'
          and a.account_id=wo_build.account_id and a.revision_id=wo_build.revision_id
          and a.build_request_id=wo_build.request_id and a.session_id=$8 and a.retry_of is not null)
       returning id`,
      [
        build.id,
        JSON.stringify({
          ...initialQa,
          state: 'baseline',
          baselineTries: 0,
          baselineError: null,
          reason: null,
          retryAt: null,
          errors: 0,
          rounds: [],
          repairs: 0,
          retryActionId: actionId,
          retryMode: 'initial-baseline',
          expectedRequestIds: [originalRequestId],
          since: new Date(now()).toISOString(),
          wakes: 0
        }),
        JSON.stringify(qa),
        marker.failedQaGeneration,
        JSON.stringify(marker),
        JSON.stringify(build.handoff),
        new Date(now()),
        qa.sessionId,
        actionId
      ]
    )
    return reset.rowCount === 1
  }
  const ownAttempt = qa.retryActionId === actionId
  // Old retryActionId/lastPrompt values could have come from the worker bug. Only the
  // accepted marker authorizes a new prompt, including recovery of an unreceipted one.
  if (ownAttempt && !['pending', 'retry'].includes(qa.state)) return false
  if (
    ownAttempt &&
    !qa.retryPromptSent &&
    String(build.qa_lease_token) !== String(BigInt(marker.failedQaGeneration) + 1n)
  )
    return false
  if (
    !ownAttempt &&
    (qa.state !== 'failed' ||
      String(build.qa_lease_token) !== marker.failedQaGeneration ||
      failedQaHash(qa) !== marker.failedQaHash)
  )
    return false
  const site = (await pool.query('select * from site where site_key = $1', [build.site_key])).rows[0]
  if (!site) return false
  const requestId = `wo-qa-retry:${actionId}`
  const text = ownAttempt
    ? qa.lastPrompt
    : repairPrompt({
        failed: qa.rounds?.at(-1)?.failed ?? [],
        round: 1
      })
  if (!text || (ownAttempt && !qa.expectedRequestIds?.includes(requestId))) return false
  let current = { qa, qa_lease_token: build.qa_lease_token }
  if (!ownAttempt) {
    const reset = await pool.query(
      `update wo_build set qa = $2::jsonb, qa_lease_token = qa_lease_token + 1, qa_lease_until = null,
       handoff = jsonb_set(handoff, '{state}', '"ready"'::jsonb)
       where id = $1 and qa->>'state'='failed' and qa_lease_token=$4 and qa=$5::jsonb
         and qa->'acceptedRetry'=$6::jsonb and (qa_lease_until is null or qa_lease_until < $3)
       returning qa, qa_lease_token`,
      [
        build.id,
        JSON.stringify({
          ...withoutLease(qa),
          state: 'pending',
          repairs: 0,
          errors: 0,
          reason: null,
          firstErrorAt: null,
          retryAt: null,
          lastError: null,
          retryActionId: actionId,
          retryMode: 'repair',
          retryPromptSent: false,
          promptedAt: null,
          lastPrompt: text,
          since: new Date(now()).toISOString(),
          expectedRequestIds: [requestId],
          wakes: 0
        }),
        new Date(now()),
        marker.failedQaGeneration,
        JSON.stringify(qa),
        JSON.stringify(marker)
      ]
    )
    if (!reset.rows[0]) return false
    current = reset.rows[0]
  }
  const held = (
    await pool.query(
      `select qa,qa_lease_token from wo_build where id=$1 and qa=$2::jsonb and qa_lease_token=$3
         and qa->>'state' in ('pending','retry') and qa->>'retryActionId'=$4`,
      [build.id, JSON.stringify(current.qa), current.qa_lease_token, actionId]
    )
  ).rows[0]
  if (!held) return false
  if (held.qa.retryPromptSent) return true
  const sent = await deps
    .prompt(site, held.qa.by, held.qa.sessionId, requestId, held.qa.lastPrompt)
    .catch(() => false)
  if (!sent) return false
  const receipted = await pool.query(
    `update wo_build set qa = qa || jsonb_build_object('retryPromptSent', true, 'promptedAt', $2::text)
     where id = $1 and qa->>'retryActionId' = $3 and qa=$4::jsonb and qa_lease_token=$5
       and qa->>'state' in ('pending','retry') returning id`,
    [build.id, new Date(now()).toISOString(), actionId, JSON.stringify(held.qa), held.qa_lease_token]
  )
  return receipted.rowCount === 1
}

/** Late QA callbacks and wakes cannot reopen a stopped ordinary demo action. */
async function agentDemoMayPrompt(pool, build) {
  if (build.qa?.workflow !== AGENT_DEMO && build.handoff?.workflow !== AGENT_DEMO) return true
  const held = (
    await pool.query(
      `select status from wo_demo_action where account_id=$1 and revision_id=$2
    and build_request_id=$3 and session_id=$4 and not exists
    (select 1 from site_turn t where t.site_key=$5 and t.session_id=$4 and t.opened_at>=wo_demo_action.accepted_at
     and t.end_reason in ('aborted','blocked','error','interrupted','max-tokens') and t.state in ('closed','stale')
     and $6::jsonb ? t.rpc_id) order by accepted_at desc,id desc limit 1`,
      [
        build.account_id,
        build.revision_id,
        build.request_id,
        build.qa?.sessionId ?? build.handoff?.sessionId,
        build.site_key,
        JSON.stringify(build.qa?.expectedRequestIds ?? [])
      ]
    )
  ).rows[0]
  return held?.status === 'queued'
}
