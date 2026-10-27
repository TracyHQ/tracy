/**
 * PAGE-5: every button leads to the page its words name (spec
 * `tasks/spec-template-customization-question-readiness.md`, PAGE-5).
 *
 * Static signals, all "a button of the demo leads nowhere" (`#`, empty, `javascript:`):
 * - WordPress: in published pages and template parts of the source edition, a button link
 *   (`wp-block-button__link`, a class with `btn`) or a block `url` attribute that is `#` or empty
 *   (social and navigation links aside); the theme's own `templates/*.html` and `parts/*.html`
 *   the database does not override, the same way, and every theme pattern (`patterns/*.php`) one of
 *   those, or a pattern they pull in, includes (`<!-- wp:pattern {"slug":...} /-->`, followed
 *   transitively; JA Essence 1.0.10's `tracy/section-cta-final` in `templates/pricing.html`). A
 *   pattern nothing pulls in is not on the site and does not count. A block that is not a button (a `group` or
 *   `cover` card of a partner, integration or client logo grid, JA Kinetic's 24 integration cards)
 *   whose `url` leads nowhere is decorative and accepted, only noted (K4 09/10/2026); a
 *   `button` block, or any block or link classed as a button, still fails. A social network button
 *   or icon (its words, link or classes name a network, or it sits in a block classed `social`: JA
 *   Essence's Follow me card and "@Grazia on instagram") keeps the demo's empty link as the template
 *   has it, only noted (K6 10/10/2026): the seven questions ask for no social link, and a
 *   network's home page would be a fake destination. Every other button with an empty link fails.
 * - Joomla: a `type: url` contract slot whose sample is `#` or empty and whose label or path names
 *   a button (`btn`, `cta`, `button`); social, follow and typography slots aside, and so is a slot
 *   whose button the ACM layout does not print in the demo (`readers/joomla-acm-buttons.js`).
 * - EmDash: a `trim` rule of `seed/personalize.json` that sends links of cut items elsewhere
 *   (`leadsTo`), or `tools/personalize.mjs` defaulting one (`LEADS_TO`): 08/10, a link to cut
 *   content is removed, never pointed at another page.
 * Since the g59 builds (10/10/2026), `page-5-social-and-targets.js` adds: every EmDash social
 * list has a `from: "social"` rule and no view drops an item with an empty link (K6), and every rule
 * or slot that rewrites a button's words carries the button's destination.
 * A link to a file of the demo company (a PDF profile) is a wrong destination (10/10, DEMO
 * FILE LINKS): Tracy points it at Contact; the Template Customization Question Readiness built-site check measures it.
 * Whether a button's words match where it leads is judged on a built site: a release with no
 * static signal is `live-only`.
 */
import { contractSlots, releaseContract } from '../readers/contract-profile-of-release.js'
import { unrenderedButton } from '../readers/joomla-acm-buttons.js'
import { findings, listed } from '../readers/rule-findings.js'
import { templateSourceFiles } from '../readers/template-source-tree.js'
import { wordpressDemo } from '../readers/wordpress-demo.js'
import { emdashSocialLists, labelTargets } from './page-5-social-and-targets.js'

const DEAD = /^\s*(#|javascript:[^"]*)?\s*$/i
const BUTTON_ANCHOR = /<a\b[^>]*\bclass="[^"]*(wp-block-button__link|\bbtn\b)[^"]*"[^>]*>/g
// Social and navigation links aside; the `url` of an image or cover block is its picture, not a link.
const SKIPPED_BLOCK =
  /^(core\/)?(social-link|navigation-link|navigation-submenu|navigation|image|cover|media-text)$/
const BUTTON_BLOCK = /^(core\/)?buttons?$/
const BUTTON_CLASS = /"className":"[^"]*\b(btn|button|cta)/i
const NOT_A_BUTTON = /social|follow|typography|facebook|instagram|linkedin|tiktok|youtube|twitter/i
// K6: a button whose words, link or classes name a social network, or that sits in a social block.
const SOCIAL_NETWORK =
  /\b(facebook|instagram|twitter|linkedin|tiktok|youtube|pinterest|threads|telegram|whatsapp|discord|snapchat|tumblr|vimeo|dribbble|behance|mastodon|bluesky)\b/i
const SOCIAL_CLASS = /\bclass(Name)?"?[=:]"[^"]*social/i
const PATTERN_REF = /<!-- wp:pattern \{[^}]*"slug":"([^"]+)"[^}]*\} \/-->/g
const PATTERN_SLUG = /^\s*\*\s*Slug:\s*(\S+)\s*$/m

/**
 * The theme patterns (`patterns/*.php`, keyed by their file) that the `roots` texts include, and
 * the patterns those include, transitively. A slug the theme does not ship (core, remote) is skipped.
 * @param {Map<string, string>} files the theme files
 * @param {string[]} roots
 */
function patternsPulledIn(files, roots) {
  const bySlug = new Map()
  for (const [file, text] of files) {
    const slug = /^patterns\/[^/]+\.php$/.test(file) ? PATTERN_SLUG.exec(text)?.[1] : null
    if (slug) bySlug.set(slug, file)
  }
  /** @type {Map<string, string>} */
  const pulled = new Map()
  const queue = [...roots]
  while (queue.length) {
    for (const m of String(queue.pop()).matchAll(PATTERN_REF)) {
      const file = bySlug.get(m[1])
      if (!file || pulled.has(file)) continue
      pulled.set(file, /** @type {string} */ (files.get(file)))
      queue.push(/** @type {string} */ (files.get(file)))
    }
  }
  return pulled
}

/** The open `wp:buttons` group around `index`, as its comment, or ''. */
function openButtonsGroup(/** @type {string} */ content, /** @type {number} */ index) {
  const start = content.lastIndexOf('<!-- wp:buttons', index)
  if (start === -1 || content.lastIndexOf('<!-- /wp:buttons -->', index) > start) return ''
  return content.slice(start, content.indexOf('-->', start) + 3)
}

/** True when the button at `index` (its markup `markup`) is a social network button or icon. */
function isSocial(/** @type {string} */ content, /** @type {number} */ index, /** @type {string} */ markup) {
  const words = content.slice(index + markup.length, content.indexOf('</a>', index))
  const before = content.slice(Math.max(0, index - 600), index)
  const block = [...before.matchAll(/<!-- wp:[a-z0-9/-]+ (\{.*?\}) -->/g)].pop()?.[1] ?? ''
  const wrapper = /<div class="([^"]*)"[^>]*>\s*$/.exec(before)?.[1] ?? ''
  if (SOCIAL_NETWORK.test(`${markup} ${words} ${block} ${wrapper}`)) return true
  return SOCIAL_CLASS.test(`${markup} ${block} class="${wrapper}" ${openButtonsGroup(content, index)}`)
}

/** Dead buttons, social buttons and decorative cards that lead nowhere, in one block-markup text. */
function deadIn(/** @type {string} */ content) {
  let n = 0
  let cards = 0
  let social = 0
  for (const m of content.matchAll(BUTTON_ANCHOR)) {
    const href = /\bhref="([^"]*)"/.exec(m[0])
    if (href && !DEAD.test(href[1])) continue
    if (isSocial(content, m.index, m[0])) social += 1
    else n += 1
  }
  for (const m of content.matchAll(/<!-- wp:([a-z0-9/-]+) (\{.*?\}) \/?-->/g)) {
    if (SKIPPED_BLOCK.test(m[1])) continue
    const dead = [...m[2].matchAll(/"url":"(#?|javascript:[^"]*)"/g)].length
    if (!dead) continue
    if (SOCIAL_NETWORK.test(m[2]) || /"className":"[^"]*social/i.test(m[2])) social += dead
    else if (BUTTON_BLOCK.test(m[1]) || BUTTON_CLASS.test(m[2])) n += dead
    else cards += dead
  }
  return { n, cards, social }
}

/**
 * @param {import('../index.js').RuleContext} context @param {ReturnType<typeof findings>} f
 * @returns {Promise<boolean>} true when some empty link was accepted (a decorative card, a social button)
 */
async function wordpress(context, f) {
  const wp = await wordpressDemo(context)
  const found = []
  const decorative = []
  const social = []
  /** Count one text's dead buttons under the name `where`. */
  const scan = (/** @type {string} */ where, /** @type {string} */ text) => {
    const { n, cards, social: s } = deadIn(text)
    if (n) found.push(`${where} (${n})`)
    if (cards) decorative.push(`${where} (${cards})`)
    if (s) social.push(`${where} (${s})`)
  }
  /** The texts that can include a theme pattern: the database's posts, the theme's templates and parts. */
  const roots = []
  for (const p of wp.posts) {
    if (
      p.post_status !== 'publish' ||
      !['page', 'wp_template_part', 'wp_template', 'wp_block'].includes(p.post_type)
    )
      continue
    if (!wp.isSource(p)) continue
    const text = String(p.post_content ?? '')
    roots.push(text)
    scan(p.post_type === 'page' ? `/${wp.pathOf(p)}` : `${p.post_type} ${p.post_name}`, text)
  }
  await f.part('the theme files', async () => {
    const files = await templateSourceFiles(context)
    for (const [file, text] of files) {
      if (!/^(templates|parts)\/[^/]+\.html$/.test(file) || wp.overridden.has(file)) continue
      roots.push(text)
      scan(file, text)
    }
    // A pattern is PHP: a link printed by code (`href="<?php echo esc_url( home_url( '/' ) ); ?>"`)
    // is a real destination, so each PHP block becomes its code without the characters that end a tag.
    for (const [file, text] of patternsPulledIn(files, roots))
      scan(
        file,
        text.replace(/<\?php([\s\S]*?)\?>/g, (_, code) => code.replace(/[<>"]/g, ' '))
      )
  })
  if (decorative.length)
    f.note(`accepted: decorative cards (logo, partner, integration) that lead nowhere: ${listed(decorative)}`)
  if (social.length)
    f.note(
      `accepted: social network buttons and icons kept with the demo's empty link (K6): ${listed(social)}`
    )
  if (found.length) f.problem(`buttons that lead nowhere (#, empty or javascript:): ${listed(found)}`)
  return decorative.length + social.length > 0
}

/** @param {import('../index.js').RuleContext} context @param {ReturnType<typeof findings>} f */
async function joomla(context, f) {
  const contract = releaseContract(context)
  const candidates = contractSlots(contract)
    .filter((s) => s.type === 'url' && DEAD.test(String(s.sample ?? '')))
    .filter((s) => {
      const words = `${s.label ?? ''} ${(s.jsonPath ?? []).join(' ')}`
      return /btn|cta|button/i.test(words) && !NOT_A_BUTTON.test(words)
    })
  if (!candidates.length) return
  // A button its layout does not print has no link to follow (JA Impact hero `if button-2`).
  const lock = contract?.json('presentation-lock.json')
  /** @type {Map<string, string> | null} */
  let files = null
  try {
    files = await templateSourceFiles(context)
  } catch {
    files = null
  }
  const dead = []
  const unrendered = []
  for (const s of candidates) {
    const why = unrenderedButton(s, lock, files)
    if (why) unrendered.push(`${s.key} (${why})`)
    else dead.push(`${s.key} "${s.label ?? ''}"`)
  }
  if (unrendered.length)
    f.note(`button slots with an empty demo link whose button is not on the page: ${listed(unrendered, 6)}`)
  if (dead.length) f.problem(`button slots whose demo link is # or empty: ${listed(dead, 6)}`)
}

/** @param {import('../index.js').RuleContext} context @param {ReturnType<typeof findings>} f */
async function emdash(context, f) {
  const files = await templateSourceFiles(context)
  const personalize = files.get('seed/personalize.json')
  const rules = personalize ? JSON.parse(personalize) : {}
  const leads = (rules.trim ?? []).filter((/** @type {any} */ r) => r.leadsTo)
  if (leads.length)
    f.problem(
      `seed/personalize.json trim rules send links of cut items to another page: ${listed(leads.map((/** @type {any} */ r) => `${r.collection} → ${r.leadsTo}`))}`
    )
  const tool = files.get('tools/personalize.mjs') ?? ''
  const fallback = /\bconst LEADS_TO\s*=\s*['"]([^'"]+)['"]/.exec(tool)
  if (fallback)
    f.problem(`tools/personalize.mjs points every cut item's links at ${fallback[1]} by default (LEADS_TO)`)
  const model = files.get('seed/site-model.json')
  const hashes = model ? [...model.matchAll(/"[a-z_]*(?:url|href|link)"\s*:\s*"#"/gi)].length : 0
  if (hashes) f.problem(`seed/site-model.json has ${hashes} link fields that are #`)
}

export const page5ButtonsLeadSomewhere = {
  id: 'PAGE-5',
  title: 'Every button leads to the page its words name',
  platforms: ['joomla', 'wordpress', 'emdash'],
  owner: /** @type {const} */ ('template'),

  /** @param {import('../index.js').RuleContext} context */
  async run(context) {
    const f = findings(context, 'PAGE-5')
    let accepted = false
    await f.part('the demo content', async () => {
      const { platform } = context.release
      if (platform === 'wordpress') accepted = await wordpress(context, f)
      if (platform === 'joomla') await joomla(context, f)
      if (platform === 'emdash') await emdash(context, f)
    })
    await f.part('the label rules', () => labelTargets(context, f))
    if (context.release.platform === 'emdash')
      await f.part('the social lists', () => emdashSocialLists(context, f))
    return f.outcome({
      pass: accepted
        ? 'no action button of the demo leads to #, an empty link or javascript: (the social buttons and decorative cards that do are accepted, listed in details)'
        : 'no button of the demo leads to #, an empty link or javascript:',
      liveOnly: "whether each button's words match where it leads is only known on a built site",
      fix:
        context.release.platform === 'emdash'
          ? 'Give every link field of seed/site-model.json a real destination (not #), remove the links to cut items instead of pointing them elsewhere (drop leadsTo and LEADS_TO), then cut a new release.'
          : 'Give every button of the demo a real destination, or remove the button.'
    })
  }
}
