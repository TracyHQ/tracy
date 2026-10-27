#!/usr/bin/env node
/**
 * The action flow on a RUNNING EmDash site, measured and photographed — the evidence for "the site
 * wears the system it was given". Steps: default → each system → clear. For each step: the same CLI
 * call a build tool makes (timed), the time until the served page carries the new slot, then at 1440
 * and 390 the role probe + a full-page screenshot.
 *
 *   node scripts/flow-emdash.mjs --site http://127.0.0.1:4371 --data <site>/data --out <dir> \
 *        [--baseline <dir>/default.json] <id> <id> ...
 *   node scripts/flow-emdash.mjs --site <url> --out <dir> --snap     the page as it is now →
 *        <dir>/default.json + default-<vw>.png (the "before" a later flow is compared with)
 *
 * Writes <out>/NN-<slug>-<desktop|phone>.png, <out>/flow.json, <out>/report.md. Needs Chrome (Mac path
 * or $CHROME). No dependency: CDP over Node's WebSocket.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { arch, platform, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buttonPair } from '../src/colour.mjs'
import { templateSizes } from '../src/emit.mjs'
import { contractBase, loadContract, loadProfile } from '../src/library.mjs'
import { browser } from './cdp.mjs'
import { gate } from '../src/normalise.mjs'
import {
  paintProbe,
  channels,
  differences,
  expected,
  follows,
  rolesProbe,
  score,
  separation
} from '../src/probe.mjs'
import { tokens56, COLOUR_TOKENS } from '../src/tokens56.mjs'
import { bandColours, wornBands } from '../src/bands.mjs'
import { histogramProbe, leftShare, signature } from '../src/remnant.mjs'
import { identityProbe, identityVerdict, modeMatch, toggleProbe } from '../src/identity.mjs'
import { palette } from '../src/emit.mjs'
import { derive, modeOf } from '../src/derive.mjs'
import { fromFlow, judgeMeasurement } from '../src/measurement.mjs'
import { writeMeasurement } from '../src/measurement-io.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../../../..')
const args = process.argv.slice(2)
const opt = (name) => {
  const i = args.indexOf(name)
  return i === -1 ? null : args.splice(i, 2)[1]
}
const SITE = opt('--site')
// --page: the page measured (default the home page); the contract's measuredPage otherwise
const PAGE_OPT = opt('--page') ?? opt('--path') // --path: batch 3's name for the same
const DATA = opt('--data')
const OUT = opt('--out')
const BASELINE = opt('--baseline')
const CMS = opt('--cms') ?? 'emdash'
const WP = opt('--wp-container')
const JDB = opt('--joomla-db') // the site's database container (the module rows the plugin's door writes)
const JPREFIX = opt('--joomla-prefix') ?? 'tr_'
const JLOGIN = opt('--joomla-login') ?? 'jo' // user = password = database name (stand.mjs: site)
const TEMPLATE =
  opt('--template') ??
  { emdash: 'emdash-base', wordpress: 'wordpress-tracy-base', joomla: 'joomla-tracy-base' }[CMS]
// --door <driver> --label <site>: apply and clear through the product's own door (a driver that runs
// tracy-web's emitter and tracy-host's write path, e.g. the design-system-button evidence's drive.mjs)
// instead of this script's direct writes — the door saves what the site held and undo puts it back,
// where the direct WordPress clear deletes every global-styles post (a quickstart ships one)
const DOOR = opt('--door')
const LABEL = opt('--label')
const DOOR_PRIVATE = opt('--door-private') ?? join(tmpdir(), 'ds-flow-door')
const CDP = Number(opt('--cdp') ?? 9341)
const MEASURE_VERSION = opt('--measure-version')
const MEASURE_TAG = opt('--measure-tag')
const MEASURE_TEMPLATE = opt('--measure-template')
const MEASURE_RELEASE_DIR = opt('--measure-release-dir')
// the machine a measurement file names (`Measured on …, <machine>` on /ops): what was named, else the kind of
// machine — never its hostname, which often carries a person's name (15/10/2026: 81 files said whose Mac it was)
const MACHINE = opt('--machine') ?? `${platform()}-${arch()}`
const SNAP = args.includes('--snap')
const FREEZE = args.includes('--freeze')
const IDS = args.filter((a) => a !== '--snap' && a !== '--freeze')
const gitHead = () => {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}
const CONTRACT = loadContract(TEMPLATE)
const ROLE_PROBE = rolesProbe(CONTRACT.roles, CONTRACT.selectors?.button ?? [])
const BASE = contractBase(ROOT, CONTRACT)
const PAGE = PAGE_OPT ?? CONTRACT.measuredPage ?? '/'
// third-party URLs the measuring browser fails at once (contract `measureBlock`): a parser-blocking
// script whose host hangs stops the page at that line (JA Restaurant's OpenTable form, 11/10/2026)
const BLOCK = (CONTRACT.measureBlock ?? []).filter((x) => typeof x === 'string' && x.length > 0)
// carousels stopped on their first slide before each measure (contract `measureStill`, cdp.mjs)
const STILL = CONTRACT.measureStill === true
if (
  !SITE ||
  !OUT ||
  (DOOR && !LABEL) ||
  (!SNAP && !DOOR && CMS === 'emdash' && !DATA) ||
  (!SNAP && !DOOR && CMS === 'wordpress' && !WP) ||
  (!SNAP && !DOOR && CMS === 'joomla' && !JDB)
) {
  console.error('usage: flow-emdash.mjs --site <url> --data <dir> --out <dir> [--baseline <json>] <id>...')
  process.exit(1)
}
mkdirSync(OUT, { recursive: true })

if (SNAP) {
  const b = await browser(CDP + 1, { block: BLOCK })
  const snap = {}
  try {
    for (const [width, vw] of [
      [1440, 'desktop'],
      [390, 'phone']
    ]) {
      await b.open(`${SITE}${PAGE}`, width, { freeze: FREEZE, still: STILL })
      snap[vw] = await b.evaluate(ROLE_PROBE)
      await b.shot(join(OUT, `default-${vw}.png`))
    }
  } finally {
    b.close()
  }
  writeFileSync(join(OUT, 'default.json'), JSON.stringify(snap, null, 1))
  console.log(`snap: ${Object.keys(snap.desktop.roles).length} roles, slot ${snap.desktop.slot ?? 'none'}`)
  process.exit(0)
}

// The contrast the reader actually gets: text colour vs the first opaque background behind it,
// for each kind of text the template sets (links/eyebrows in accent, muted, meta, card text).
// A text whose ground is a picture (a photo, a gradient, a page-wide light image) is judged against
// what that picture shows behind it: the pass leaves those samples pending, the page is photographed
// with every text made transparent, and groundProbe reads the mean colour of each one's box off that
// photograph. Before 11/10/2026 such a text was skipped, so JA Gamex's light page picture under a
// dark system (light text on it) passed every number while the screenshot showed it gone.
const contrastProbe = (kinds) => `(() => {
  const rgb = ${channels.toString()}
  const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0)
  // the ground: the nearest opaque fill; null when a picture comes first (read off the photograph)
  // (a ::before/::after is no ground when it draws nothing — content none, an empty inline box with no
  // padding — or is an ornament: positioned, sized in px, under a quarter of its element's box. JA
  // Company's menu items carry a 2 x 32 px divider picture on li + li::before, and the white label on
  // the accent bar was read off a blurred photograph instead of the bar: 4.48 for 4.70)
  // (a size the browser reports as a percentage — a pseudo-element's height: 100% is read back as
  // "100%" — is taken against the element's box: JA Resume's 1 px timeline rule, height 100% through
  // the centre of every date and title on the phone, was read as their grey ground)
  // (one made invisible — display none, opacity 0 or visibility hidden, a hover effect waiting: JA Fit's schedule
  // cells carry an accent ::before at opacity 0 that only a hovered cell shows — draws nothing either)
  const drawn = (cs, e) => { if (['none', 'normal'].includes(cs.content) || Number(cs.opacity) === 0 || cs.visibility === 'hidden' || cs.display === 'none' || (cs.display === 'inline' && cs.content === '""' && !parseFloat(cs.paddingLeft) && !parseFloat(cs.paddingRight))) return false; if (['absolute', 'fixed'].includes(cs.position)) { const r = e.getBoundingClientRect(); const len = (v, of) => (/px$/.test(v) ? parseFloat(v) : /%$/.test(v) ? (parseFloat(v) / 100) * of : null); const w = len(cs.width, r.width), h = len(cs.height, r.height); if (w !== null && h !== null && w * h < 0.25 * r.width * r.height) return false } return true }
  // (a ::before/::after picture laid in the flow — static or relative, an inline icon beside the words:
  // JA Titan's flame after "Top News" — sits next to the text, not under it: only a positioned one is
  // a ground; group 5)
  const pictured = (e) => ['', '::before', '::after'].some((p) => { const cs = getComputedStyle(e, p || null); return cs.backgroundImage !== 'none' && (!p || (drawn(cs, e) && ['absolute', 'fixed'].includes(cs.position))) })
  // a picture covering most of the page (a page texture: JA Donate) — used below to tell a layer
  // that is a photo from the page's own backdrop
  const texture = (e) => e.getBoundingClientRect().height > document.documentElement.scrollHeight * 0.5
  // a picture laid under the text by a positioned sibling layer rather than an ancestor (JA Titan's
  // call to action: .cta-bg holds the photo beside .cta-content) is a photo behind the text too; so is
  // a layer holding the photo as an <img> under the text's centre (JA Essence's article cards:
  // .item-image, absolute, its <img> under .item-content's white title — read before 11/10/2026 against
  // the card's own fill behind the photo, 1.07:1 on the default page)
  // (and the other way round: a text layer laid out of the flow over an <img> in the flow beside it — JA Good's
  // news cards: .article-content, absolute, over .item-image; below the first screen its white title was
  // read off the page, 1:1, 11/10/2026)
  const inside = (q, x, y) => x >= q.left && x <= q.right && y >= q.top && y <= q.bottom
  const photo = (s, x, y) => [s, ...s.querySelectorAll('img, video, picture')].some((m) => m.matches('img, video, picture') && inside(m.getBoundingClientRect(), x, y))
  const layered = (e, el) => { const p = e.parentElement; if (!p) return false; const r = el.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; const out = (n) => ['absolute', 'fixed'].includes(getComputedStyle(n).position); return [...p.children].some((s) => { if (s === e || !(out(s) || out(e)) || !(pictured(s) || photo(s, x, y) || replaced(s)) || texture(s)) return false; return inside(s.getBoundingClientRect(), x, y) }) }
  // a page-wide picture with a colour of its own (JA Donate's texture) is read off the photograph too:
  // its colour is not what shows when the picture covers it (JA Gamex's opaque light page image over a
  // fill that a dark system turns black)
  // a ::before/::after painted through a mask is the mask's shape in that colour, not a fill (JA Alpha's
  // section ornament: a 474 x 272 px accent ::before masked to a thin curve, read as the whole section's
  // ground, so the text below it measured 1.96:1 on a colour that is not behind it)
  const masked = (cs) => [cs.maskImage, cs.webkitMaskImage].some((m) => m && m !== 'none')
  // a card painted by its own positioned ::before/::after (JA Alpha's white service cards on its red
  // band: the box itself is transparent) shows that fill behind its text, when it covers most of the box
  const cover = (e) => { const r = e.getBoundingClientRect(); for (const p of ['::before', '::after']) { const cs = getComputedStyle(e, p); if (cs.content === 'none' || Number(cs.opacity) === 0 || cs.visibility === 'hidden' || !['absolute', 'fixed'].includes(cs.position) || masked(cs)) continue; const c = rgb(cs.backgroundColor); if (!(c.length >= 3 && (c[3] === undefined || c[3] === 1))) continue; if (parseFloat(cs.width) >= r.width * 0.8 && parseFloat(cs.height) >= r.height * 0.8) return c } return null }
  // a "picture" that is one opaque colour (a LESS gradient mixin with the same start and end:
  // linear-gradient(rgb(0, 113, 227), rgb(0, 113, 227)) — JA Company's menu bar and active tab) is that
  // colour: read off a quarter-scale photograph, the edges of the box blur into it (white on Apple's
  // #0071e3, 4.68:1, read 4.35)
  const flat = (e) => { const bi = getComputedStyle(e).backgroundImage; if ((bi.match(/gradient\\(/g) || []).length !== 1 || !/^linear-gradient\\(/.test(bi) || /url\\(/.test(bi)) return null; const cols = bi.match(/rgba?\\([^)]*\\)/g) || []; if (cols.length < 2 || new Set(cols).size !== 1) return null; const c = rgb(cols[0]); if (c.length < 3 || (c[3] !== undefined && c[3] !== 1)) return null; return ['::before', '::after'].some((p) => { const ps = getComputedStyle(e, p); return ps.backgroundImage !== 'none' && drawn(ps, e) }) ? null : c }
  // a positioned ::before/::after laid behind the content as the box's fill (JA Resort's testimonial
  // card: .testimonial-item-wrap:before, #1A4444, 2000px wide, top 0 to bottom 0) paints over the
  // element's own background and under its text
  // (a bar that does not reach the middle of the text is an underline, not its ground: JA Fit's 8 px
  // accent bar at bottom -4px under each module title and eyebrow touched the descenders only, and the
  // titles were judged on the bar, 11/10/2026 — measured when the box positions it, top and height in px)
  const reaches = (ps, e, el) => { if (!el || getComputedStyle(e).position === 'static') return true; const h = parseFloat(ps.height), top = parseFloat(ps.top); if (!Number.isFinite(h) || !Number.isFinite(top)) return true; const r = e.getBoundingClientRect(), t = el.getBoundingClientRect(); const cy = t.top + t.height / 2 - r.top; return cy >= top && cy <= top + h }
  const pfill = (e, el) => { for (const p of ['::before', '::after']) { const ps = getComputedStyle(e, p); const c = rgb(ps.backgroundColor); if (c.length >= 3 && (c[3] === undefined || c[3] === 1) && ['absolute', 'fixed'].includes(ps.position) && drawn(ps, e) && !masked(ps) && reaches(ps, e, el)) return c } return null }
  // what is painted under a text by an element outside its own ancestors: a sticky header laid over
  // the hero's photo (JA Symphony: #t4-header over #t4-hero, margin-top -150px) has the page as its
  // nearest fill, while the reader sees the photo. Read off the paint stack at the text's centre, for
  // a text inside the viewport: when the first fill or picture below the text belongs to another
  // subtree, that is the ground; when it is the text's own ancestor, bgOf's answer stands
  // (a text whose own box paints its ground — a filled label, JA Intranet's category chip on a slide whose
  // image carries a dark ::before — reads on that fill: what lies under the box is not its ground; and the
  // walk starts at the text's own element when it is the top of the stack: a button's own fill is its ground —
  // JA Candidate's hero button on the accent was read on the slide layer beneath it, #000)
  // a photo drawn by an element of its own (an <img> laid under a slide's title: JA Rent's owl hero,
  // .slider-img beside .slider-content) is a picture too: before, the stack walked past it to the page
  // and the hero's white title read 1:1 on the page colour
  // (an inline <svg> too — tagName is lower case there: JA Teline V's "In the spotlight" label on a
  // translucent strip over the featured picture read 1.26 against the grey box behind it; group 5)
  const media = (e) => /^(IMG|PICTURE|VIDEO|CANVAS|SVG)$/i.test(e.tagName)
  // A text's own painter with a fill of its own (JA Essence's category badge: #212529 on its #f8f8ff chip,
  // over a cover photo) reads on that fill, before anything the stack holds below it. A photo drawn by an
  // <img> or <video> under the text (the WordPress cover block: img.wp-block-cover__image-background under a
  // half-opacity overlay span) is a picture, read off the photograph; a fill made see-through by its
  // element's opacity is a veil the photograph shows, not the ground (11/10/2026)
  const replaced = (e) => e.tagName === 'IMG' || e.tagName === 'VIDEO' || (e.tagName === 'PICTURE' && e.querySelector('img'))
  const under = (el, g) => { const own0 = rgb(getComputedStyle(el).backgroundColor); if (flat(el) || pfill(el, el) || (own0.length >= 3 && (own0[3] === undefined || own0[3] === 1))) return g; const r = el.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; if (!r.width || !r.height || x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return g; const stack = document.elementsFromPoint(x, y); const at = stack.findIndex((e) => e === el || el.contains(e)); if (at < 0) return g; for (const e of stack.slice(stack[at] === el ? at : at + 1)) { if (e.contains(el)) { const own = rgb(getComputedStyle(e).backgroundColor); if (flat(e) || pictured(e) || pfill(e, el) || (own.length >= 3 && (own[3] === undefined || own[3] === 1))) return g; continue } if (media(e)) return null; if (Number(getComputedStyle(e).opacity) < 1) continue; const f = flat(e); if (f) return f; if (pictured(e)) return null; const pf = pfill(e, el); if (pf) return pf; const c = rgb(getComputedStyle(e).backgroundColor); if (c.length >= 3 && (c[3] === undefined || c[3] === 1)) return c } return g }
  // the order: a flat gradient is its colour; a picture is read off the photograph; a positioned pseudo-element
  // laid behind the content as the box's fill (pfill, r3a) or covering most of a transparent box (cover, r3b)
  // A translucent fill on the way is laid over the ground found below it (veil): iJoomla Guru's feature
  // card, rgba(255, 255, 255, .95) over the section, read as the page itself under a dark system — dark
  // text on black, 1.36:1, while the reader sees it on white (11/10/2026). Over a picture the photograph
  // already shows the veil
  // An <img>/<video> inside the box whose fill would be the ground, under the text's centre and at least
  // the text's size, is what shows there: the photo is the ground (JA Impact WordPress's event cards: a
  // static figure the text is laid over by negative margins, below the first screen, so the paint stack
  // above never saw it — white text read on the card's #fbfbfb, 1.26:1, 11/10/2026)
  const imgUnder = (a, el) => { const r = el.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; return [...a.querySelectorAll('img, video')].some((i) => { if (i.contains(el) || !i.getClientRects().length || (i.checkVisibility && !i.checkVisibility({ opacityProperty: true, visibilityProperty: true }))) return false; const q = i.getBoundingClientRect(); return q.width * q.height >= r.width * r.height && x >= q.left && x <= q.right && y >= q.top && y <= q.bottom }) }
  const bgOf = (el) => { const veil = []; const lay = (b) => veil.reduceRight((u, v) => [0, 1, 2].map((i) => v[i] * v[3] + u[i] * (1 - v[3])), b); const at = (e, c) => (imgUnder(e, el) ? null : lay(c)); for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); const c = rgb(cs.backgroundColor); const opaque = c.length >= 3 && (c[3] === undefined || c[3] === 1); const f = flat(e); if (f) return at(e, f); if (pictured(e)) return null; const pf = pfill(e, el); if (pf) return at(e, pf); if (opaque) return at(e, c); const pc = cover(e); if (pc) return at(e, pc); if (c.length >= 4 && c[3] > 0) veil.push(c); if (layered(e, el)) return null } return at(document.body, [255, 255, 255]) }
  const hx = (c) => '#' + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
  // the element that paints the text a match shows: the parent of its first visible text. A link
  // whose words sit in a span with a colour of its own reads in the span's (JA Helple's topbar: the
  // link #212529 on #1c1c1c, the light span on it is what anyone reads)
  // (words for screen readers alone — .sr-only, .visually-hidden — paint nothing: a link whose only
  // other content is an icon glyph is then not measured. JA Conference's video play button read its
  // 1 px "Watch the video" off the photograph beside it, 11/10/2026; Joomla 3's .element-invisible is the
  // same 1 px box: JA Good's video play button, added by script, read its "Play" off the page, 11/10/2026)
  // words only a screen reader gets (WordPress's .screen-reader-text, Bootstrap's .visually-hidden: a
  // 1 px box clipped away) are nobody's to read: JA Essence's social icons carry their names so, and the
  // icons' link colour was judged on the brand's fill (1.17:1, 12/10/2026)
  // words drawn inside an inline <svg> (a <text> of a picture: JA Kinetic WP's drawn terminal and chart twins,
  // 20/10/2026) are painted by the SVG's fill, not by the CSS colour this probe reads: they belong to the
  // picture, as words inside an <img> do, and are not measured
  const unread = (p) => Boolean(p.closest('.sr-only, .visually-hidden, .element-invisible, .screen-reader-text')) || p.closest('svg') !== null || ((r) => r.width <= 1 && r.height <= 1)(p.getBoundingClientRect())
  const painter = (m) => { const w = document.createTreeWalker(m, NodeFilter.SHOW_TEXT); for (let n = w.nextNode(); n; n = w.nextNode()) { if (!n.textContent.trim()) continue; const p = n.parentElement; if (unread(p)) continue; if (p.getClientRects().length && (!p.checkVisibility || p.checkVisibility({ opacityProperty: true, visibilityProperty: true }))) return p } return m }
  const ratioOf = (t, g) => { const a = lum(t), b = lum(g); return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100 }
  const pending = []
  const out = []
  for (const [name, sel] of Object.entries(${JSON.stringify(kinds)})) {
    // off the page sideways (a closed off-canvas menu) is not seen and not measured;
    // every visible match is measured (up to 400), keyed by its index in document order: the judge
    // compares each text with the same text on the default page. The entry itself stays the first
    // match, as before
    // words painted with a picture (background-clip: text — JA Gamex's gradient game titles) have no
    // single colour to judge: left unmeasured
    const clipped = (el, m) => { for (let e = el; e && e !== m.parentElement; e = e.parentElement) { const cs = getComputedStyle(e); if ((cs.backgroundClip === 'text' || cs.webkitBackgroundClip === 'text') && cs.backgroundImage !== 'none') return true } return false }
    // the band a text sits in: the element that paints its ground, named the way a contract's
    // keepScopes names it — a stable id, or a class every one of whose elements paints an opaque ground
    // (keeping it keeps grounds, never a transparent wrapper whose texts sit on the page); else the
    // nearest ancestor that paints one and is so named. A ground half the page tall is the page (null)
    const opaque = (e) => { const c = rgb(getComputedStyle(e).backgroundColor); return c.length >= 3 && (c[3] === undefined || c[3] === 1) }
    const named = (e) => { if (e.id && /^[a-zA-Z][\\w-]*$/.test(e.id) && !/\\d{3,}/.test(e.id)) return '#' + e.id; const c = [...e.classList].find((x) => { if (!/^[a-zA-Z][\\w-]*$/.test(x)) return false; const all = document.querySelectorAll('.' + CSS.escape(x)); return all.length <= 50 && [...all].every(opaque) }); return c ? '.' + c : null }
    const band = (el) => { let g = el; for (; g && !opaque(g); g = g.parentElement); const tall = (e) => e === document.body || e === document.documentElement || e.getBoundingClientRect().height > document.documentElement.scrollHeight * 0.5; for (let e = g; e && !tall(e); e = e.parentElement) { if (!opaque(e)) continue; const n = named(e); if (n) return n } return null }
    const one = (m) => {
      const el = painter(m)
      // no visible text of its own: its words are <noscript> content a reader with scripts never
      // sees (JA Coach's newsletter cell, whose only shown text is the button's value) — not measured
      if (el === m && ![...m.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return { ratio: null, at: m.tagName.toLowerCase(), text: null, ground: null, unseen: true }
      const t = rgb(getComputedStyle(el).color)
      if (clipped(el, m)) return { ratio: null, at: m.tagName.toLowerCase(), text: hx(t), ground: null, clipped: true }
      const g = under(el, bgOf(el))
      const o = { ratio: g ? ratioOf(t, g) : null, at: m.tagName.toLowerCase() + [...m.classList].slice(0, 2).map((c) => '.' + c).join(''), band: band(el), text: hx(t), ground: g ? hx(g) : null }
      // large text (WCAG 1.4.3: 24px, or 18.66px bold) needs 3:1, not 4.5:1 — a display word of a section title
      { const fcs = getComputedStyle(el); const px = parseFloat(fcs.fontSize); if (px >= 24 || (px >= 18.66 && Number(fcs.fontWeight) >= 700)) o.large = true }
      // a control drawn as a glyph — an arrow, a cross, an icon font's private-use character, no letter or digit —
      // is a graphic, and WCAG 1.4.11 asks 3:1 of it (JA Mood's carousel arrow read 3.2-3.7:1 under MotherDuck,
      // judged as text at 4.5, 15/10/2026)
      { const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim(); if (own !== '' && own.length <= 3 && !/[\\p{L}\\p{N}]/u.test(own)) o.icon = true }
      // a text on a picture outside the page's width (a carousel's waiting slide) is not read by
      // anyone: left unmeasured, as before
      // read under the words themselves (a range over the element's contents), not the element's box: a
      // heading's accent word drawn with an icon beside it in its own padding (JA Nova's span.text-purple
      // and its ::before megaphone) had the icon averaged into its ground — 4.11 read where the words sit
      // on the page's cream at 4.85
      if (!g) { const rg = document.createRange(); rg.selectNodeContents(el); const wq = rg.getBoundingClientRect(); const r = wq.width && wq.height ? wq : el.getBoundingClientRect(); o.onPicture = true; if (r.left >= 0 && r.right <= innerWidth + 1) pending.push([o, t, [r.left + scrollX, r.top + scrollY, r.width, r.height]]) }
      return o
    }
    // a watermark — words drawn at a fifth of their opacity or less (JA Eventcamp's 120 px day number
    // at 8% on its agenda tiles) — is decoration nobody reads: not measured, on the default page either
    const faint = (e) => { let o = 1; for (let x = painter(e); x && x !== document.documentElement; x = x.parentElement) o *= Number(getComputedStyle(x).opacity); return o < 0.2 }
    // words set at no size — Bootstrap's .text-hide (font: 0/0 a) behind a logo drawn as a background
    // (T3's "powered by" link in JA Mason's footer) — are not seen: not measured, on the default page either
    const sizeless = (e) => parseFloat(getComputedStyle(painter(e)).fontSize) < 1
    // words pushed out of a box that clips them (a carousel indicator's label: text-indent -30px in a
    // 14 px dot with overflow hidden, JA Social II) are never seen: under a quarter of their line box
    // inside the clipping box, they are not measured, on the default page either
    const clippedAway = (e) => { const p = painter(e); const rg = document.createRange(); rg.selectNodeContents(p); const t = rg.getBoundingClientRect(); if (!t.width || !t.height) return false; for (let x = p; x && x !== document.body; x = x.parentElement) { if (getComputedStyle(x).overflow === 'visible') continue; const b = x.getBoundingClientRect(); const w = Math.max(0, Math.min(t.right, b.right) - Math.max(t.left, b.left)), h = Math.max(0, Math.min(t.bottom, b.bottom) - Math.max(t.top, b.top)); if (w * h < 0.25 * t.width * t.height) return true } return false }
    // a text whose centre lies outside an ancestor that clips its overflow (a carousel's waiting slide
    // inside the page width: owl-stage-outer) is not seen: not measured. JA Essence's next article card
    // read its white title off the page beside the carousel under Apple, 1:1, 11/10/2026
    const hidden = (e) => { const r = e.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) { const cs = getComputedStyle(a); if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue; const q = a.getBoundingClientRect(); if (q.width > 0 && q.height > 0 && (x < q.left || x > q.right || y < q.top || y > q.bottom)) return true } return false }
    const all = [...document.querySelectorAll(sel)].slice(0, 400).map((e, i) => [e, i]).filter(([e]) => e.getClientRects().length && (!e.checkVisibility || e.checkVisibility({ opacityProperty: true, visibilityProperty: true })) && !faint(e) && !sizeless(e) && !clippedAway(e) && !hidden(e) && ((r) => r.right > 0 && r.left < innerWidth)(e.getBoundingClientRect()) && (e.textContent || '').trim() && !e.closest('.scene, .band-accent, [class*="bg-accent"], .sr-only, .visually-hidden, .element-invisible, .screen-reader-text'))
    if (!all.length) continue
    out.push({ name, samples: all.map(([e, i]) => [i, one(e)]) })
  }
  window.__dsContrast = { out, pending, ratioOf, hx }
  return pending.length
})()`
// The photograph (text made transparent) decoded in the page: each pending sample's ground is the
// mean colour of its box; a box the photograph does not cover is dropped, as a skipped text was
const groundProbe = (png, scale) => `(async () => {
  const { out, pending, ratioOf, hx } = window.__dsContrast
  const png = ${JSON.stringify(png)}
  if (png) {
    const img = new Image()
    img.src = 'data:image/png;base64,' + png
    await img.decode()
    const cv = document.createElement('canvas')
    cv.width = img.naturalWidth
    cv.height = img.naturalHeight
    const cx = cv.getContext('2d', { willReadFrequently: true })
    cx.drawImage(img, 0, 0)
    for (const [o, t, [x, y, w, h]] of pending) {
      const X = Math.max(0, Math.floor(x * ${scale})), Y = Math.max(0, Math.floor(y * ${scale}))
      const W = Math.min(cv.width - X, Math.max(1, Math.round(w * ${scale}))), H = Math.min(cv.height - Y, Math.max(1, Math.round(h * ${scale})))
      if (W < 1 || H < 1) continue
      const d = cx.getImageData(X, Y, W, H).data
      const m = [0, 0, 0]
      for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) m[k] += d[i + k]
      const g = m.map((v) => v / (d.length / 4))
      o.ground = hx(g)
      o.ratio = ratioOf(t, g)
    }
  }
  const res = []
  for (const e of out) {
    const samples = e.samples.filter(([, o]) => o.ratio !== null)
    if (!samples.length) continue
    res.push({ name: e.name, ...samples[0][1], samples })
  }
  return res
})()`
const GROUND_SCALE = 0.25
/** The contrast of each kind of text on the page open in `b`, a picture's ground read off a photograph. */
/**
 * Put the page on one side of a two-mode template (#1315): data-theme on the root, with every
 * transition off while it turns. A theme that fades its colours on the switch (Tracy Business Joomla,
 * the WordPress overlays: `transition: color`) was read mid-fade otherwise, each text still the
 * other side's colour on its new ground (1.0:1 on every derived view, 14/10/2026).
 * @param {any} b
 * @param {'light' | 'dark'} side
 */
// A template that marks its dark side its own way (`modeHook`, sides.mjs: JA's body.dark-active, set by its
// switch's script and kept in a cookie) is turned the way a visitor turns it: its switch is pressed until the
// root matches the hook (twice at most); data-theme otherwise
const MODE_HOOK =
  typeof CONTRACT.modeHook === 'string' && CONTRACT.modeHook.trim() !== '' ? CONTRACT.modeHook.trim() : null
const flip = (/** @type {'light' | 'dark'} */ side) =>
  MODE_HOOK && TOGGLE
    ? `{ const is = () => document.documentElement.matches(${JSON.stringify(`:root${MODE_HOOK}`)}); for (let k = 0; k < 2 && is() !== ${side === 'dark'}; k++) { const t = document.querySelector(${JSON.stringify(TOGGLE)}); if (!t) break; t.click() } }`
    : side === 'dark'
      ? `document.documentElement.setAttribute('data-theme', 'dark')`
      : `document.documentElement.removeAttribute('data-theme')`
// Every element, at a weight above a template's own switch fade: JA Vogue fades on its switch with
// `html.ja-theme-anim body { transition: ... !important }` (0,1,2), which beat a bare `*` and left the
// page read mid-fade, light words on a half-dark page, when its switch was pressed (18/10/2026)
const NO_FADE = ':root:root:root, :root:root:root *, :root:root:root *::before, :root:root:root *::after'
const setSide = (b, side) =>
  b.evaluate(
    `(async () => { const st = document.createElement('style'); st.textContent = ${JSON.stringify(`${NO_FADE}{transition:none!important}`)}; document.head.appendChild(st); ${flip(side)}; await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); st.remove(); return 1 })()`
  )
// what the switch remembered (its cookie) is forgotten after the other side is read, so the next page opens as a
// visitor who never pressed it does: the slot's own side, and the template's default once the system is off
const forgetSide = (b) =>
  MODE_HOOK
    ? b.evaluate(
        `(() => { for (const c of document.cookie.split(';')) { const n = c.split('=')[0].trim(); if (n) document.cookie = n + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/' } return 1 })()`
      )
    : Promise.resolve(1)

const contrastOf = async (b, kinds) => {
  const pending = await b.evaluate(contrastProbe(kinds))
  let png = ''
  if (pending) {
    // a lazy picture far down the page is not fetched before the photograph (JA Impact WordPress's event
    // cards: white text on a photo read on the card's own #fbfbfb, 1.26:1, 11/10/2026): each is
    // fetched now and the photograph waits for it (8 s at most)
    await b.evaluate(
      `(async () => { const imgs = [...document.images].filter((i) => i.loading === 'lazy' || !i.complete); for (const i of imgs) i.loading = 'eager'; await Promise.race([Promise.all(imgs.map((i) => i.decode().catch(() => 0))), new Promise((r) => setTimeout(r, 8000))]); return imgs.length })()`
    )
    await b.evaluate(
      `(async () => { const st = document.createElement('style'); st.id = 'ds-ground'; st.textContent = '*,*::before,*::after,*::placeholder{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important;transition:none!important}'; document.head.appendChild(st); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); return 1 })()`
    )
    png = await b.capture(GROUND_SCALE)
    // the colours come back with transitions still off (a template's `transition: color` would
    // otherwise fade them in under the probes and the screenshot that follow), then the style goes
    await b.evaluate(
      `(async () => { const st = document.getElementById('ds-ground'); st.textContent = '*,*::before,*::after{transition:none!important}'; await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); st.remove(); return 1 })()`
    )
  }
  return b.evaluate(groundProbe(png, GROUND_SCALE))
}

// The bands a contract keeps (`keepScopes`): every visible element inside one, its text, fill and
// line colours — a worn system must leave each exactly as the default paints it. The theme toggle is
// left out: a worn system is one look, so the slot hides it on purpose.
const TOGGLE = CONTRACT.selectors?.themeToggle ?? null
const KEEP_SCOPES = (CONTRACT.keepScopes ?? []).filter((x) => /^[.#][\w-]+$/.test(x))
// the kept bands that wear the system's ground (bands.mjs): changed on purpose, so left out of the
// kept-band comparison and judged by contrast and by what of the template's colours is left
const WORN_BAND_SEL =
  wornBands(CONTRACT)
    .map(([key]) => key)
    .join(', ') || null
// a band that takes the template's page ground back (keepGround) is judged by the ground it SHOWS:
// its own fill, else the first filled ancestor's — transparent over the default white page and
// white over a dark worn page read the same, transparent over that dark page does not
const KEEP_GROUND = (CONTRACT.keepGround ?? []).filter((x) => KEEP_SCOPES.includes(x))
// the calls to action inside a kept band that follow the system on purpose (keptButtons), and those
// on a band painted with a worn colour (bandButtons, EmDash): left out of the kept-band comparison,
// judged instead by their own contrast — text on fill, fill on the band
// and the primary buttons of a kept band that wears the system's ground and names no buttons of its
// own: keptButtonRules gives them the system's pair on that ground, turned over where the accent does
// not stand out (JA Civica's hero under Stripe, 13/10/2026)
const WORN_BUTTONS = Object.fromEntries(
  wornBands(CONTRACT)
    // a fill's buttons wear the system's pair too (keptButtonRules), so they are judged the same way
    .filter(
      ([key, scope, spec]) =>
        (KEEP_SCOPES.includes(scope) ||
          (spec?.fill === true && /^([.#][\w-]+)((?:[.#][\w-]+|:not\([.#][\w-]+\))*)$/.test(key))) &&
        !CONTRACT.keptButtons?.[key]
    )
    .map(([key]) => [
      key,
      {
        // the light buttons too, as keptButtonRules paints them (src/tokens56.mjs): on WordPress .btn-white is
        // the .wp-block-button wrapper round JA Impact's link, which the probe must know for part of the button
        buttons: ((own) => (own.length ? [...own, '.btn-white', '.btn-light'] : own))(
          [CONTRACT.selectors?.buttonPrimary ?? []]
            .flat()
            .map((x) =>
              String(x)
                .replace(/^\.tracy\s+/, '')
                .trim()
            )
            .filter(Boolean)
        )
      }
    ])
)
const KEPT_BUTTONS = Object.entries({
  ...WORN_BUTTONS,
  ...CONTRACT.keptButtons,
  ...CONTRACT.bandButtons
}).flatMap(([band, spec]) => (spec?.buttons ?? []).map((b) => `${band} ${b}`))
const KEPT_BUTTON_SEL = KEPT_BUTTONS.join(', ') || null
const KEPT_BUTTON_BANDS = Object.keys({ ...WORN_BUTTONS, ...CONTRACT.keptButtons, ...CONTRACT.bandButtons })
// the ground the role's button was judged on by the slot: a band laid over a picture (or a see-through band)
// keeps no ground of its own, and keptButtonRules judged its buttons on the band's buttonGround — the first filled
// ancestor the probe finds there is the page behind the photo (JA Rent's slide button, turned over under Stripe
// on its photo, was expected in the page's pair: 6/8, 14/10/2026)
const roleGround = (v, profile) => {
  const spec = v.roleBand?.band ? CONTRACT.bands?.[v.roleBand.band] : null
  if (spec && profile && BASE) {
    const c = bandColours(tokens56(profile, BASE).tokens, spec, { page: BASE['--bg'] })
    if (c?.keptGround) return c.buttonGround
  }
  return v.roleBand?.ground ?? null
}
const keptButtonProbe = `(() => {
  const rgb = ${channels.toString()}
  const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0)
  const ratio = (x, y) => { const a = lum(x), b = lum(y); return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100 }
  const hx = (c) => '#' + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
  const opaque = (c) => c.length >= 3 && (c[3] === undefined || c[3] === 1)
  const sel = ${JSON.stringify(KEPT_BUTTON_SEL)}
  if (!sel) return []
  // a button the page does not show: its middle lies outside a box that clips what overflows it on that
  // axis (a slider's other slides beyond its frame: JA Gamex's owl hero, 15/10/2026). Judged, it was read on
  // whatever lay under the frame's edge, and the list's order turned with the slider between shots; a sliver
  // of the next slide's button inside the frame (a wider system container) is not a button one can read
  const shown = (e) => { const r = e.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2; for (let x = e.parentElement; x && x !== document.body; x = x.parentElement) { const s = getComputedStyle(x); const q = x.getBoundingClientRect(); if (/hidden|clip/.test(s.overflowX) && (cx < q.left || cx >= q.right)) return false; if (/hidden|clip/.test(s.overflowY) && (cy < q.top || cy >= q.bottom)) return false } return true }
  const out = [...document.querySelectorAll(sel)].filter((e) => e.getClientRects().length && (!e.checkVisibility || e.checkVisibility({ opacityProperty: true, visibilityProperty: true })) && shown(e)).slice(0, 40).map((e) => {
    const cs = getComputedStyle(e)
    const fill = rgb(cs.backgroundColor)
    const text = rgb(cs.color)
    let ground = null
    // brought to the middle of the screen so what lies under it can be asked of the page below; every
    // box it scrolled is put back after (a button on a slider's later slide scrolled the slider's
    // overflow:hidden frame sideways, and the page was then shot between two slides: JA Rent, 14/10/2026)
    const scrolled = []
    for (let x = e.parentElement; x; x = x.parentElement) scrolled.push([x, x.scrollLeft, x.scrollTop])
    e.scrollIntoView({ block: 'center', inline: 'nearest' })
    // a card painted by an ancestor's positioned ::before/::after under the button (JA Resort's room
    // card: .container-inner::before, #e1dbd5, on the dark band) is the ground the button shows on
    const r = e.getBoundingClientRect()
    const pfill = (x) => { for (const p of ['::before', '::after']) { const ps = getComputedStyle(x, p); const c = rgb(ps.backgroundColor); if (ps.content !== 'none' && ['absolute', 'fixed'].includes(ps.position) && opaque(c) && parseFloat(ps.width) >= r.width && parseFloat(ps.height) >= r.height) return c } return null }
    // a wrapper the button list names too is the same button, not its ground (WordPress's .wp-block-button.btn-white
    // round JA Impact's link: both painted white, the link read white on white, 15/10/2026)
    for (let x = e.parentElement; x && !ground; x = x.parentElement) { if (x.matches(sel)) continue; const c = rgb(getComputedStyle(x).backgroundColor); if (opaque(c)) ground = c; else ground = pfill(x) }
    ground = ground ?? [255, 255, 255]
    // a button over a photo (an <img> or a background picture laid under it before any opaque fill:
    // JA Impact's event card, a positioned <img> behind the words) has no one colour to stand out
    // from: its fill is not judged against the page colour the ancestors' walk would find
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2
    // what is drawn under the button, not only its ancestors: a transparent header laid over a dark hero
    // put JA Educatsy's turned white button on the page's white by the ancestors' walk (13/10/2026)
    let drawn = null
    // a gradient under the button (a band the system wears as its gradient, JA Gamex's hero box) is a ground: the
    // stop nearest the button's fill, the worst case; read through, it put the turned white button on the page's white
    const filled = opaque(fill)
    const onPicture = (() => { if (cx < 0 || cy < 0 || cx >= innerWidth || cy >= innerHeight) return false; for (const x of document.elementsFromPoint(cx, cy)) { if (x === e || e.contains(x) || (x.contains(e) && x.matches(sel))) continue; if (x.matches('img, video, picture, canvas')) return true; const xs = getComputedStyle(x); if (xs.backgroundImage !== 'none' && !/gradient/.test(xs.backgroundImage)) return true; const stops = /gradient/.test(xs.backgroundImage) && !/url\\(/.test(xs.backgroundImage) ? (xs.backgroundImage.match(/rgba?\\([^)]*\\)/g) || []).map(rgb).filter(opaque) : []; if (stops.length) { drawn = filled ? stops.reduce((a, c) => (ratio(fill, c) < ratio(fill, a) ? c : a)) : stops[0]; return false } const c = rgb(xs.backgroundColor); if (opaque(c)) { drawn = c; return false } } return false })()
    if (drawn) ground = drawn
    for (const [x, left, top] of scrolled) if (x.scrollLeft !== left || x.scrollTop !== top) { x.scrollLeft = left; x.scrollTop = top }
    return { at: (e.textContent || '').trim().slice(0, 40), fill: filled ? hx(fill) : null, text: hx(text), ground: onPicture ? 'picture' : hx(ground), textOnFill: ratio(text, filled ? fill : ground), fillOnGround: filled && !onPicture ? ratio(fill, ground) : null, radius: cs.borderTopLeftRadius, padding: cs.padding, font: cs.fontFamily.split(',')[0] }
  })
  scrollTo(0, 0)
  return out
})()`
// the template's primary-button role, when the element it names is one of those band buttons: the
// ground it sits on. There the system's pair may be turned over on purpose (accent-on fill, accent
// text: EmDash Tracy Business's hero under Stripe, Spotify, Runway), and the role is judged by that
const roleBandProbe = `(() => {
  const rgb = ${channels.toString()}
  const hx = (c) => '#' + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
  const sel = ${JSON.stringify(KEPT_BUTTON_SEL)}
  const role = ${JSON.stringify(CONTRACT.roles?.['button-primary'] ?? null)}
  const el = sel && role ? document.querySelector(role) : null
  if (!el || !el.matches(sel)) return null
  const depth = (x) => { let n = 0; for (; x; x = x.parentElement) n++; return n }
  // the innermost band holding the button; two keys on one box (JA Civica's hero: .acm-hero, a picture band, and
  // .ja-acm.acm-hero…cv-hero--full, a fill) are told apart as the cascade does: the weightier key, then the later
  const weight = (k) => (k.match(/#/g) ?? []).length * 100 + (k.match(/[.[]/g) ?? []).length
  const holders = ${JSON.stringify(KEPT_BUTTON_BANDS)}.map((k, i) => [k, el.closest(k), i]).filter(([, x]) => x)
  const band = holders.sort((a, b) => depth(b[1]) - depth(a[1]) || weight(b[0]) - weight(a[0]) || b[2] - a[2])[0]?.[0] ?? null
  for (let x = el.parentElement; x; x = x.parentElement) { const c = rgb(getComputedStyle(x).backgroundColor); if (c.length >= 3 && (c[3] === undefined || c[3] === 1)) return { ground: hx(c), band } }
  return { ground: '#ffffff', band }
})()`
const keptProbe = `(() => {
  const out = {}
  for (const scope of ${JSON.stringify(KEEP_SCOPES)}) {
    const list = []
    for (const root of document.querySelectorAll(scope))
      for (const e of [root, ...root.querySelectorAll('*')]) {
        if (${JSON.stringify(TOGGLE)} && e.closest(${JSON.stringify(TOGGLE)})) continue
        if (${JSON.stringify(KEPT_BUTTON_SEL)} && e.closest(${JSON.stringify(KEPT_BUTTON_SEL)})) continue
        if (${JSON.stringify(WORN_BAND_SEL)} && e.closest(${JSON.stringify(WORN_BAND_SEL)})) continue
        if (!e.getClientRects().length || e.closest('svg') && e.tagName.toLowerCase() !== 'svg') continue
        // the slot module's own wrapper (a module position inside a kept band, JA Alumni's topbar):
        // it holds the system's sheet and no text, and is there only while a system is worn
        const slot = document.getElementById('tracy-ds-slot')
        if (slot && e.contains(slot) && [...e.querySelectorAll('*')].every((x) => x.contains(slot) || /^(STYLE|LINK|SCRIPT)$/.test(x.tagName))) continue
        const cs = getComputedStyle(e)
        let bg = cs.backgroundColor
        if (e === root && ${JSON.stringify(KEEP_GROUND)}.includes(scope))
          for (let x = e; x && /^rgba\\(.*, 0\\)$/.test(bg); x = x.parentElement) bg = getComputedStyle(x).backgroundColor
        list.push(cs.color + '|' + bg + '|' + cs.borderTopColor)
      }
    out[scope] = list.slice(0, 600)
  }
  return out
})()`
const keptDiff = (a, b) => {
  let n = 0
  const at = []
  for (const scope of KEEP_SCOPES) {
    const x = a?.[scope] ?? []
    const y = b?.[scope] ?? []
    if (x.length !== y.length) {
      n += Math.abs(x.length - y.length)
      at.push(`${scope}: ${x.length} → ${y.length} elements`)
    }
    for (let i = 0; i < Math.min(x.length, y.length); i++)
      if (x[i] !== y[i]) {
        n += 1
        if (at.length < 4) at.push(`${scope}[${i}] ${x[i]} → ${y[i]}`)
      }
  }
  return { n, at }
}

const CLI = join(HERE, 'ds-slot.mjs')
const cli = (...a) => JSON.parse(execFileSync(process.execPath, [CLI, ...a], { encoding: 'utf8' }))

/**
 * How a system reaches each CMS — the same call a build door makes:
 *  - emdash:    `ds-slot.mjs apply|clear --emdash <data dir>` (one file the template reads per request)
 *  - wordpress: `ds-slot.mjs wordpress <id>` → the variation file + its catalogue row under
 *               uploads/tracy, then the theme's own tracy_apply_inspiration(); clear = the site's
 *               user global styles removed, i.e. the template's own look
 */
const docker = (...a) => execFileSync('docker', a, { encoding: 'utf8' })
const wp = (...a) => docker('exec', '-u', 'www-data', WP, 'wp', ...a)
const adapters = {
  emdash: {
    apply: (id) => cli('apply', id, '--emdash', DATA, '--template', TEMPLATE),
    clear: () => cli('clear', '--emdash', DATA)
  },
  wordpress: {
    apply: (id) => {
      const tmp = join(mkdtempSync(join(tmpdir(), 'ds-wp-')), 'v.json')
      const r = cli('wordpress', id, '--template', TEMPLATE, '--out', tmp)
      const up = '/var/www/html/wp-content/uploads/tracy'
      docker('exec', '-u', 'www-data', WP, 'mkdir', '-p', `${up}/styles`)
      docker('cp', tmp, `${WP}:${up}/styles/${r.slug}.json`)
      docker('exec', '-u', '0', WP, 'chown', 'www-data:www-data', `${up}/styles/${r.slug}.json`)
      wp(
        'eval',
        `$f="${up}/inspirations.json"; $d=is_file($f)?json_decode(file_get_contents($f),true):["systems"=>[]]; $d["systems"]["${r.slug}"]=["name"=>${JSON.stringify(r.name)}]; file_put_contents($f, json_encode($d)); echo tracy_apply_inspiration("${r.slug}") ? "ok" : "fail";`
      )
      return r
    },
    clear: () => {
      const ids = wp('post', 'list', '--post_type=wp_global_styles', '--post_status=any', '--format=ids')
        // only the ids: a site whose PHP prints a notice on every wp-cli run (JA Vega WordPress, 12/10/2026:
        // its own warnings) put those words in the list, and `post delete` was asked to delete them
        .split(/\s+/)
        .filter((x) => /^\d+$/.test(x))
      if (ids.length) wp('post', 'delete', ...ids, '--force')
      return { ok: true, cleared: true }
    }
  },
  // joomla: the module rows Claude Cowork's content.update kind `module` + moduleAssignment write —
  // one mod_custom "Tracy design system", first in `header-r`, every page; clear = trashed (-2),
  // which is what the door's delete does.
  joomla: {
    apply: (id) => {
      const tmp = join(mkdtempSync(join(tmpdir(), 'ds-jo-')), 'm.html')
      const r = cli('joomla', id, '--template', TEMPLATE, '--out', tmp)
      const html = readFileSync(tmp, 'utf8')
      const sql = (q) =>
        docker('exec', '-i', JDB, 'mariadb', `-u${JLOGIN}`, `-p${JLOGIN}`, JLOGIN, '-N', '-e', q)
      const esc = (v) => v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
      const m = r.module
      const existing = sql(
        `select id from ${JPREFIX}modules where title='${esc(m.title)}' and module='mod_custom' and client_id=0 order by id limit 1`
      ).trim()
      const params = JSON.stringify({
        prepare_content: '0',
        layout: '_:default',
        moduleclass_sfx: '',
        cache: '0',
        style: m.style
      })
      if (existing)
        sql(
          `update ${JPREFIX}modules set content='${esc(html)}', published=1, position='${m.position}', ordering=${Number(m.ordering ?? 0)}, params='${esc(params)}' where id=${existing}`
        )
      else {
        sql(
          `insert into ${JPREFIX}modules (asset_id,title,note,content,ordering,position,checked_out,publish_up,publish_down,published,module,access,showtitle,params,client_id,language) values (0,'${esc(m.title)}','','${esc(html)}',${Number(m.ordering ?? 0)},'${m.position}',NULL,NULL,NULL,1,'mod_custom',1,0,'${esc(params)}',0,'*')`
        )
        const nid = sql(
          `select id from ${JPREFIX}modules where title='${esc(m.title)}' and module='mod_custom' and client_id=0 order by id desc limit 1`
        ).trim()
        // ignore: a demo dump can carry an orphan every-page row for this id (ja-spark, 11/10/2026)
        sql(`insert ignore into ${JPREFIX}modules_menu (moduleid, menuid) values (${nid}, 0)`)
      }
      return r
    },
    clear: () => {
      docker(
        'exec',
        '-i',
        JDB,
        'mariadb',
        `-u${JLOGIN}`,
        `-p${JLOGIN}`,
        JLOGIN,
        '-e',
        `update ${JPREFIX}modules set published=-2 where title='Tracy design system' and module='mod_custom' and client_id=0`
      )
      return { ok: true, cleared: true }
    }
  }
}
// the door: each apply is one undo entry; clear undoes them newest first, so the site ends holding
// exactly what it held before the flow (its own global styles, its own modules)
const undos = []
const door = (...a) => {
  const out = execFileSync(
    process.execPath,
    [resolve(DOOR), ...a, '--label', LABEL, '--platform', CMS, '--private', DOOR_PRIVATE],
    { encoding: 'utf8', maxBuffer: 1 << 26 }
  )
  return JSON.parse(out.trim().split('\n').at(-1))
}
const doorAdapter = {
  apply: (id) => {
    const r = door('apply', '--id', id.replace(/^od:/, ''))
    if (!r.ok) throw new Error(`the door refused ${id}: ${JSON.stringify(r)}`)
    undos.push(r.undoId)
    return r
  },
  clear: () => {
    const done = []
    while (undos.length) {
      const r = door('undo', '--undo', undos.pop())
      if (!r.ok) throw new Error(`undo failed: ${JSON.stringify(r)}`)
      done.push(r.id)
    }
    return { ok: true, cleared: true, undone: done }
  }
}
const adapter = DOOR ? doorAdapter : adapters[CMS]
if (!SNAP && !adapter) {
  console.error(`no adapter for --cms ${CMS}`)
  process.exit(1)
}
const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 20)

const profiles = IDS.map((id) => loadProfile(ROOT, id))
/**
 * The Google families a system loads for its body and display faces, by profile id. The mono face is
 * left out: a page loads it only where it shows code, and BMW's or Stripe's substituted mono (JetBrains
 * Mono, Source Code Pro) never loads on a brochure page.
 */
const systemFamilies = (id) => [
  ...new Set(
    ['display', 'body'].flatMap((role) =>
      (profiles.find((p) => p.id === id)?.fonts?.[role]?.load ?? []).map((l) => l.family)
    )
  )
]
const offered = profiles.filter((p) => gate(p).ok)
const refused = profiles
  .filter((p) => !gate(p).ok)
  .map((p) => ({ id: p.id, name: p.name, reasons: gate(p).reasons }))
const steps = [
  { label: 'default (no system)', clear: true },
  ...offered.map((p) => ({ label: p.name, profile: p })),
  { label: 'clear → default', clear: true }
]

const b = await browser(CDP, { block: BLOCK })
const rows = []
const paints = {}
// each view's colour histogram off its photograph (remnant.mjs): what of the template's colours is left
const hists = {}
const REMNANT_SCALE = 0.25
// the bands the contract keeps whole stay out of the remnant measure (SCREEN-1 subtracts keepWhole)
const KEEP_WHOLE = Object.keys(CONTRACT.keepWhole ?? {}).filter((k) => /^[.#][\w-]+/.test(k))
// what `follows` (ROLE-1) leaves out of both its counts: what the contract keeps as the template paints it — the
// bands kept whole, the kept bands that do not wear the system's ground, the palette's justified exceptions — but
// not a kept band's calls to action, which follow the system on purpose (council 15/10/2026: 32 of 90 files failed
// the 85% floor on bands their contracts keep, reviewed in pictures)
const WORN_SCOPES = new Set(wornBands(CONTRACT).map(([, scope]) => scope))
const PAINT_PROBE_KEPT = paintProbe({
  within: [
    ...KEEP_WHOLE,
    ...KEEP_SCOPES.filter((x) => !WORN_SCOPES.has(x)),
    ...(CONTRACT.paletteKeep ?? [])
      .map((k) => k?.selector)
      .filter((x) => typeof x === 'string' && /^[^{};]+$/.test(x))
  ],
  scored: Object.values(CONTRACT.keptButtons ?? {}).flatMap((k) =>
    Array.isArray(k?.buttons) ? k.buttons : []
  )
})
try {
  for (const [i, st] of steps.entries()) {
    const t0 = performance.now()
    const call = st.clear ? adapter.clear() : adapter.apply(st.profile.id)
    const callMs = Math.round(performance.now() - t0)
    const want = st.profile?.id ?? null
    let servedMs = null
    let requests = 0
    let renderMs = null
    let unanswered = 0
    // 15 requests: a page that does not carry the slot by then never will (its position is not rendered)
    for (let k = 0; k < 15 && servedMs === null; k++) {
      const r0 = performance.now()
      // a request the site never answered (an overloaded stand: >300 s, 11/10/2026) served no page,
      // so it is asked again and not counted as a request that came back without the slot
      let html = null
      for (let t = 0; html === null; t++)
        try {
          html = await (await fetch(`${SITE}${PAGE}`)).text()
        } catch (e) {
          if (t >= 3) throw e
          unanswered += 1
        }
      requests += 1
      renderMs = Math.round(performance.now() - r0)
      const m = /tracy-ds-slot: ([A-Za-z0-9:-]+)/.exec(html)
      if (want ? m?.[1] === want : !m) servedMs = Math.round(performance.now() - t0)
      else await new Promise((r) => setTimeout(r, 50))
    }
    const row = {
      requests,
      renderMs,
      step: i + 1,
      label: st.label,
      id: want,
      flags: st.profile?.flags ?? [],
      callMs,
      servedMs,
      unanswered,
      call,
      views: {}
    }
    for (const [width, vw] of [
      [1440, 'desktop'],
      [390, 'phone']
    ]) {
      // a page with none of the template's roles is not the template (an overloaded stand answered
      // with its own waiting page at 390px, 11/10/2026): opened again, up to three times; a page that
      // still has none is measured as it is and fails its verdict
      let view = null
      for (let t = 0; t < 3 && !(view && Object.keys(view.roles).length); t++) {
        await b.open(`${SITE}${PAGE}`, width, { still: STILL })
        // a two-mode template opens on the system's own side (the theme does it from the slot's mode
        // line, #1315; a release before that reads the side off the attribute set here)
        if (CONTRACT.modes === true && want) await setSide(b, modeOf(st.profile))
        view = await b.evaluate(ROLE_PROBE)
        if (t) row.reopened = (row.reopened ?? 0) + 1
      }
      view.contrast = await contrastOf(b, CONTRACT.contrast ?? {})
      // IDENT-1 / MODE-2 (#1314): the logo as shown, and whether the template's light/dark switch is still there
      view.identity = await b.evaluate(identityProbe(CONTRACT.selectors?.logo)).catch(() => null)
      view.toggle = await b.evaluate(toggleProbe(CONTRACT.selectors?.themeToggle)).catch(() => null)
      if (KEEP_SCOPES.length) view.kept = await b.evaluate(keptProbe)
      if (KEPT_BUTTON_SEL) view.keptButtons = await b.evaluate(keptButtonProbe)
      if (KEPT_BUTTON_SEL) view.roleBand = await b.evaluate(roleBandProbe)
      paints[`${i}-${vw}`] = await b.evaluate(PAINT_PROBE_KEPT)
      hists[`${i}-${vw}`] = await b
        .evaluate(histogramProbe(await b.capture(REMNANT_SCALE), REMNANT_SCALE, 900, KEEP_WHOLE))
        .catch(() => null)
      const file = `${String(i + 1).padStart(2, '0')}-${slug(st.label)}-${vw}.png`
      await b.shot(join(OUT, file))
      row.views[vw] = { ...view, shot: file }
      // a template with two modes (contract `modes`, #1315): the other side, derived from the system,
      // is measured too: the switch flipped by its attribute, the roles and texts read again
      if (CONTRACT.modes === true && want) {
        const native = modeOf(st.profile)
        const other = native === 'dark' ? 'light' : 'dark'
        await setSide(b, other)
        const dview = await b.evaluate(ROLE_PROBE)
        dview.contrast = await contrastOf(b, CONTRACT.contrast ?? {})
        if (KEPT_BUTTON_SEL) dview.roleBand = await b.evaluate(roleBandProbe)
        const dfile = `${String(i + 1).padStart(2, '0')}-${slug(st.label)}-${vw}-${other}.png`
        await b.shot(join(OUT, dfile))
        row.views[`${vw}-derived`] = { ...dview, shot: dfile, mode: other }
        await forgetSide(b)
      }
    }
    rows.push(row)
    // measured so far, kept when a later step fails (a judged flow.json replaces it at the end)
    writeFileSync(
      join(OUT, 'flow.json'),
      JSON.stringify({ site: SITE, cms: CMS, template: TEMPLATE, partial: true, rows }, null, 1)
    )
    console.log(
      `${String(i + 1).padStart(2, '0')} ${st.label.slice(0, 32).padEnd(32)} call ${callMs} ms · page wears it after ${servedMs} ms`
    )
  }
} finally {
  b.close()
}

// ── judge ──
// WordPress and Joomla wear the 56 tokens in the template's own order of text strength (tokens56);
// EmDash's slot names its roles itself
const exps = Object.fromEntries(
  offered.map((p) => [
    p.id,
    expected(p, CMS === 'emdash' ? null : BASE, {
      ...templateSizes(CONTRACT),
      components: CMS !== 'emdash' || CONTRACT.readsComponents === true
    })
  ])
)
const first = rows[0]
const ref = BASELINE && existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null
const verdicts = []
// a page that already scrolls sideways as the template released it (JA Rights at 390 px, 11/10/2026)
// is the template's own overflow: only a scroll the default page does not have is held against a step
const ownScroll = (vw) => Boolean((ref ? ref[vw] : first.views[vw])?.horizontalScroll)
const ownContrast = (vw, name) => first.views[vw].contrast?.find((c) => c.name === name)?.ratio ?? null
// Each kind of text judged element by element: a text regresses when it reads under 4.5:1 AND worse
// than the same text on the default page (the template's own grey-on-black footer is its own). The
// entry then names the worst such text and says `regressed`; otherwise `regressed: false`.
// every kept button the default page shows is still there (by its label): a count would be broken by a slider that
// shows two slides in one shot and one in the next (JA Gamex's owl hero fading, 3 against 2, 15/10/2026)
const keepsLabels = (now, was) => {
  const here = new Set(now.map((b) => b.at))
  return was.every((b) => here.has(b.at))
}
const judgeContrast = (vw, list) =>
  (list ?? []).map((c) => {
    const own = first.views[vw].contrast?.find((o) => o.name === c.name)
    if (!c.samples || !own?.samples) return c
    const was = new Map(own.samples.map(([i, x]) => [i, x.ratio]))
    // a ground read off a picture is the mean over the text's box: a box the system's face wraps
    // differently covers another stretch of a gradient or photo (JA Gamex's newsletter band, kept
    // whole: 3.26 → 3.18 under Toggl Track's face; a JA Helple photo caption 4.65 → 4.34, its white
    // text and its photo unchanged), so such a text regresses only beyond 10% of its own ratio
    const slack = (x, w) => (x.onPicture ? Math.max(0.05, (w ?? 0) * 0.1) : 0.05)
    // a text-on-ground pair the default page itself paints is the template's own, wherever it lands
    // (a module that orders its items at random puts JA Comics' white-on-red label at another index)
    const ownPairs = new Set(own.samples.map(([, x]) => `${x.text}|${x.ground}`))
    // the same holds for a text on a picture: the default page's own text of that colour on a picture
    // in the same band, read off its photograph, is the template's pair (JA Comics' white category label
    // on a photo card, 11/10/2026: the card's place in the sample list moved with the items each system
    // shows, so its 4.33 was judged against another text's 19.2)
    const ownPicture = new Map()
    for (const [, x] of own.samples)
      if (x.onPicture) {
        const k = `${x.band}|${x.text}`
        ownPicture.set(k, Math.min(ownPicture.get(k) ?? 99, x.ratio))
      }
    // and the very same text (same index, element, colour) on a picture in both looks is the template's
    // text on the template's picture: the slot paints neither, only the face differs, so the box read
    // off the photograph covers another stretch of it (JA Eventcamp's pink kicker on its hero photo,
    // 3.86 → 3.38 under MotherDuck's wider mono face, 11/10/2026)
    const ownAt = new Map(own.samples.map(([i, x]) => [i, x]))
    const pictureOwn = (i, x) => {
      if (!x.onPicture) return false
      const same = ownAt.get(i)
      if (same?.onPicture && same.at === x.at && same.text === x.text) return true
      // the same text at another place in the list: a module ahead of it holds another number of elements
      // under the system (JA Good's news-3 photo byline, #999999, was sample 387 on the default page, 381
      // under Notion and 375 under Voiceflow, read on another stretch of the same photo: 1.43 → 1.17, 15/10/2026)
      if (own.samples.some(([, y]) => y.onPicture && y.at === x.at && y.text === x.text && y.band === x.band))
        return true
      const r = ownPicture.get(`${x.band}|${x.text}`)
      return r !== undefined && x.ratio >= r - slack(x, r)
    }
    // the slot's own module can add an element of the kind ahead of the template's (Tracy Base's slot
    // module is one more leaf div), so every index after it shifts by one: when the default page's text
    // at that index is another element, the default text of the same element nearest that index is the
    // template's own (the hero's star line, #eab308 at 1.92:1 on the template, 3.34:1 under MotherDuck,
    // was held against the next div instead, 12/10/2026)
    const ownOf = (i, x) => {
      const same = ownAt.get(i)
      if (same?.at === x.at) return was.get(i)
      let near = null
      for (const [j, y] of own.samples)
        if (y.at === x.at && (near === null || Math.abs(j - i) < Math.abs(near[0] - i))) near = [j, y]
      return near ? near[1].ratio : was.get(i)
    }
    // large text reads at 3:1 (WCAG 1.4.3), and regresses only under it: JA Boxing's about-page title word
    // ("Story", Bebas Neue at 44px+) on its photo under the page-coloured veil read 4.20:1 under Stripe
    // (desktop; 4.93 on a phone), the template's own red 4.80:1 on its dark veil (15/10/2026)
    const floor = (x) => (x.large || x.icon ? 3 : 4.5)
    const worse = c.samples
      .filter(([i, x]) => x.ratio < floor(x) && x.ratio < (ownOf(i, x) ?? 99) - slack(x, ownOf(i, x)))
      .filter(([i, x]) => !ownPairs.has(`${x.text}|${x.ground}`) && !pictureOwn(i, x))
      .map(([, x]) => x)
    const { samples, ...rest } = c
    if (!worse.length) return { ...rest, measured: samples.length, regressed: false }
    const w = worse.reduce((a, x) => (x.ratio < a.ratio ? x : a))
    return {
      ...rest,
      ...w,
      measured: samples.length,
      regressed: true,
      regressions: worse.length,
      bands: [...new Set(worse.map((x) => x.band ?? 'page'))]
    }
  })
for (const r of rows) {
  for (const vw of ['desktop', 'phone']) {
    const v = r.views[vw]
    const base = {
      step: r.step,
      label: r.label,
      vw,
      servedMs: r.servedMs,
      requests: r.requests,
      renderMs: r.renderMs,
      horizontalScroll: v.horizontalScroll,
      overflow: v.overflow ?? null,
      shot: v.shot
    }
    if (!r.id) {
      const against = ref ? ref[vw] : first.views[vw]
      const diff = differences(against, v)
      verdicts.push({
        ...base,
        kind: 'control',
        against: ref ? 'develop baseline' : 'step 1',
        differences: diff.length,
        sample: diff.slice(0, 5),
        pass: diff.length === 0 && (!v.horizontalScroll || ownScroll(vw)) && r.requests === 1
      })
      continue
    }
    // a primary-button role that is a band button whose pair is turned over there (roleBandProbe) is
    // judged by the turned pair: the system's two colours, swapped because the accent does not stand
    // out on that band (colour.mjs buttonPair)
    const want = exps[r.id]
    const ground = roleGround(
      v,
      profiles.find((p) => p.id === r.id)
    )
    const turned =
      ground &&
      want['button-primary.backgroundColor'] &&
      buttonPair(want['button-primary.backgroundColor'][1], want['button-primary.color']?.[1], null, ground)
        ?.turned
    const own = score(
      v,
      turned
        ? {
            ...want,
            'button-primary.backgroundColor': ['colour', want['button-primary.color'][1]],
            'button-primary.color': ['colour', want['button-primary.backgroundColor'][1]]
          }
        : want,
      vw,
      undefined,
      first.views[vw]
    )
    // a band the contract keeps looks exactly as the default paints it
    const kept = KEEP_SCOPES.length ? keptDiff(first.views[vw].kept, v.kept) : null
    const vsDefault = score(first.views[vw], exps[r.id], vw).match ?? 0
    const others = offered.filter((p) => p.id !== r.id)
    const vsOthers = others.map((p) => score(v, exps[p.id], vw).match ?? 0)
    // Discrimination is against the OTHER systems: a page that wears X must match X and not any
    // system. Against the default it is reported, not judged — a template whose own look IS the
    // system (EmDash base is built from OpenDesign `apple`) rightly changes little when it wears it.
    const margin = own.match - Math.max(...vsOthers)
    // … by as much as the two systems differ on what this page measures (separation): two systems
    // that want the same page here can only look the same, and need no margin; otherwise 0.25
    // a page that holds none of the contract's role elements (an inner page of a contract whose roles name the
    // home's blocks: JA Impact's body.home, #acm-features-133) has nothing to match or tell apart: judged on its
    // words, its kept bands and buttons only (0/0 failed it, 15/10/2026)
    const noRoles = own.total === 0
    const apart =
      noRoles ||
      others.every(
        (p, i) => own.match - vsOthers[i] >= Math.min(0.25, separation(v, exps[r.id], exps[p.id], vw)) - 1e-9
      )
    // the kept bands' calls to action (keptButtons): each reads (text on fill 4.5:1) and stands out
    // (fill on the band 3:1), or is no worse than the same button on the default page; `followed`
    // counts the buttons whose fill is no longer the default's
    const keptButtons = KEPT_BUTTON_SEL
      ? (() => {
          const was = first.views[vw].keptButtons ?? []
          const list = v.keptButtons ?? []
          const worse = list.filter((x, k) => {
            const d = was[k] ?? {}
            const textOk = x.textOnFill >= 4.5 || x.textOnFill >= (d.textOnFill ?? 99) - 0.05
            const fillOk =
              x.fillOnGround === null ||
              x.fillOnGround >= 3 ||
              x.fillOnGround >= (d.fillOnGround ?? 99) - 0.05
            return !textOk || !fillOk
          })
          return {
            n: list.length,
            followed: list.filter((x, k) => x.fill !== (was[k]?.fill ?? null)).length,
            worse,
            buttons: list
          }
        })()
      : null
    const readable = judgeContrast(vw, v.contrast)
    const worn = tokens56(
      profiles.find((p) => p.id === r.id),
      BASE
    ).tokens
    const follow = follows(
      paints[`0-${vw}`],
      paints[`${r.step - 1}-${vw}`],
      COLOUR_TOKENS.map((n) => worn[`--${n}`])
    )
    // what of the template's own colours a visitor still sees, by area, first screen and whole page:
    // the system's colours are its tokens, its readable text pairs and every band's worn colours
    const wornText = tokens56(
      profiles.find((p) => p.id === r.id),
      BASE
    ).text.colours
    const bandsWorn = wornBands(CONTRACT)
      .map(([, , spec]) => bandColours(worn, spec, { page: BASE?.['--bg'] }))
      .filter(Boolean)
      .flatMap((c) => [c.ground, c.accent, c.accentFill, c.text, c.text2])
    // a token the system does not state keeps the template's own value (tokens56 starts from the base):
    // only what differs from the base, or is one of the page's own roles, is the system's
    const stated = COLOUR_TOKENS.filter(
      (n) => !['success', 'warn', 'danger'].includes(n) || worn[`--${n}`] !== BASE[`--${n}`]
    ).map((n) => worn[`--${n}`])
    const sysColours = [...stated, ...Object.values(wornText), ...bandsWorn]
    const def = hists[`0-${vw}`]
    const now = hists[`${r.step - 1}-${vw}`]
    const left =
      def && now
        ? {
            first: leftShare(now.first, now.firstPx, signature(def.first, def.firstPx), sysColours),
            page: leftShare(now.page, now.pagePx, signature(def.page, def.pagePx), sysColours)
          }
        : null
    verdicts.push({
      follows: follow,
      left,
      ...base,
      kind: 'system',
      kept,
      keptButtons,
      match: own.match,
      checks: `${own.ok}/${own.total}`,
      vsDefault,
      bestOther: Math.max(...vsOthers),
      margin: Math.round(margin * 100) / 100,
      // the margin judged as this flow judges it (by how far each other system is from the worn one here), for /ops
      apart,
      fontsLoaded: v.fonts.length,
      // IDENT-1: the mark kept against the default page; MODE-1: the page on the system's side of light;
      // MODE-2 (half): the template's own switch still shown
      ident: identityVerdict(v.identity ?? null, first.views[vw].identity ?? null),
      modeMatch: modeMatch(
        v.roles.page?.backgroundColor,
        palette(profiles.find((p) => p.id === r.id)).dark === true
      ),
      toggleVisible: v.toggle ?? null,
      // the web families the system loads (fonts[role].load, Google Fonts): what FONT-1 expects to see
      // loaded; a system of proprietary faces (BMW, Stripe, Spotify) loads none and FONT-1 asks nothing
      fontsDeclared: systemFamilies(r.id).length,
      systemFontsLoaded: systemFamilies(r.id).filter((fam) =>
        v.fonts.some((f) => f.toLowerCase().startsWith(`${fam.toLowerCase()} `))
      ).length,
      misses: own.misses,
      contrast: readable,
      // what reaches past the viewport when the page scrolls sideways (none on a page that does not)
      overflow: v.horizontalScroll ? (v.overflow ?? null) : null,
      pass:
        (noRoles || own.match >= 0.95) &&
        apart &&
        readable.length > 0 &&
        // readable, or no worse than the template's own default (a footer the template itself
        // paints grey on near-black is the template's, not a regression the slot made)
        readable.every((c) =>
          c.regressed === undefined
            ? c.ratio >= 4.5 || c.ratio >= (ownContrast(vw, c.name) ?? 99) - 0.05
            : !c.regressed
        ) &&
        (kept === null || kept.n === 0) &&
        (keptButtons === null ||
          (keptButtons.worse.length === 0 &&
            keepsLabels(keptButtons.buttons, first.views[vw].keptButtons ?? []))) &&
        (!v.horizontalScroll || ownScroll(vw)) &&
        // "immediately": the very first page requested after the call already wears the system —
        // no cache to wait out, no rebuild. How long that one render takes is the site's own speed,
        // reported (renderMs), not judged.
        r.requests === 1
    })
  }
}
// the derived side of a two-mode template (#1315): the roles match the derived profile and every text
// reads (judged against the default page as the native side is); MODE-2's second half
for (const r of rows) {
  if (!r.id) continue
  const profile = profiles.find((p) => p.id === r.id)
  if (!profile) continue
  for (const vw of ['desktop', 'phone']) {
    const v = r.views[`${vw}-derived`]
    if (!v) continue
    const other = modeOf(profile) === 'dark' ? 'light' : 'dark'
    // the same reading as the native side: the template's order of text strength and its own sizes (the slot
    // writes both sides with them)
    const want = expected(
      derive(profile, other).profile,
      CMS === 'emdash' ? null : BASE,
      templateSizes(CONTRACT)
    )
    // the primary button on a band whose pair is turned over (the accent does not stand out on that
    // band) is judged by the turned pair, as on the native side
    const ground = roleGround(v, derive(profile, other).profile)
    const turned =
      ground &&
      want['button-primary.backgroundColor'] &&
      buttonPair(want['button-primary.backgroundColor'][1], want['button-primary.color']?.[1], null, ground)
        ?.turned
    const own = score(
      v,
      turned
        ? {
            ...want,
            'button-primary.backgroundColor': ['colour', want['button-primary.color'][1]],
            'button-primary.color': ['colour', want['button-primary.backgroundColor'][1]]
          }
        : want,
      vw,
      undefined,
      first.views[vw]
    )
    const readable = judgeContrast(vw, v.contrast)
    verdicts.push({
      step: r.step,
      label: `${r.label} (${other} side, derived)`,
      vw,
      kind: 'system',
      mode: 'derived',
      match: own.match,
      checks: `${own.ok}/${own.total}`,
      misses: own.misses,
      contrast: readable,
      fontsLoaded: v.fonts.length,
      modeMatch: modeMatch(v.roles.page?.backgroundColor, other === 'dark'),
      shot: v.shot,
      pass:
        (own.total === 0 || own.match >= 0.95) &&
        readable.length > 0 &&
        readable.every((c) =>
          c.regressed === undefined
            ? c.ratio >= 4.5 || c.ratio >= (ownContrast(vw, c.name) ?? 99) - 0.05
            : !c.regressed
        )
    })
  }
}
writeFileSync(
  join(OUT, 'flow.json'),
  JSON.stringify({ site: SITE, cms: CMS, template: TEMPLATE, refused, rows, verdicts }, null, 1)
)
// --measure-version <v> --measure-tag <tag> --measure-template <slug> [--measure-release-dir <dir>]:
// the numbers also go into a tdsr-measurement/v1 file (measurement.mjs): the contract folder of that
// version, or the release folder's VERIFICATION.json. /ops scores the eight built-site rules from it.
if (MEASURE_VERSION) {
  const doc = fromFlow(
    { rows, verdicts },
    {
      template: MEASURE_TEMPLATE,
      cms: CMS,
      tag: MEASURE_TAG,
      version: MEASURE_VERSION,
      machine: MACHINE,
      measuredBy: `tdsr flow.mjs --cms ${CMS} --template ${TEMPLATE}`,
      flowVersion: gitHead(),
      systems: IDS,
      // a folder inside the tree is a path /ops can link; one outside it is nobody's to read
      evidence: OUT.startsWith(`${ROOT}/`) ? OUT.slice(ROOT.length + 1) : null,
      // whether the template has a light/dark switch at all: the default page showed the contract's
      // selector (the family bases name one for every template; the page says if it is there), so a
      // template without one gets MODE-2 "not applicable", never "not measured" (#1319)
      themeToggle: TOGGLE
        ? Object.values(first?.views ?? {}).some((v) => v && v.toggle !== null && v.toggle !== undefined)
        : null
    }
  )
  const file = writeMeasurement(doc, { root: ROOT, releaseDir: MEASURE_RELEASE_DIR })
  console.log(`measurement: ${file}`)
  console.log(
    Object.entries(judgeMeasurement(doc))
      .map(([id, r]) => `  ${id} ${r.status}: ${r.note}`)
      .join('\n')
  )
}
const pct = (x) => `${Math.round(x * 100)}%`
const lines = [
  '| # | Step | Viewport | Verdict | Matches system | Page follows | Template colours left (first screen · page) | Default matches | Best other system | Margin | Lowest text contrast | Kept bands changed | Wears it on | Screenshot |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ...verdicts.map((v) =>
    v.kind === 'control'
      ? `| ${v.step} | ${v.label} | ${v.vw} | ${v.pass ? 'PASS' : 'FAIL'} | — | — | — | ${v.differences} differences vs ${v.against} | — | — | — | — | ${v.requests === 1 ? '1st request' : `request ${v.requests}`} (${v.renderMs} ms render) | ${v.shot} |`
      : v.mode === 'derived'
        ? `| ${v.step} | ${v.label} | ${v.vw} | ${v.pass ? 'PASS' : 'FAIL'} | ${v.checks} (${pct(v.match)}) | — | — | — | — | — | ${v.contrast.length ? Math.min(...v.contrast.map((c) => c.ratio)).toFixed(2) + ' (' + v.contrast.reduce((a, c) => (c.ratio < a.ratio ? c : a)).name + ')' : '—'} | — | — | ${v.shot} |`
        : `| ${v.step} | ${v.label} | ${v.vw} | ${v.pass ? 'PASS' : 'FAIL'} | ${v.checks} (${pct(v.match)}) | ${v.follows.rate === null ? '—' : pct(v.follows.rate)} | ${v.left?.first.share == null ? '—' : `${pct(v.left.first.share)} · ${pct(v.left.page.share)}`} | ${pct(v.vsDefault)} | ${pct(v.bestOther)} | ${v.margin} | ${v.contrast.length ? Math.min(...v.contrast.map((c) => c.ratio)).toFixed(2) + ' (' + v.contrast.reduce((a, c) => (c.ratio < a.ratio ? c : a)).name + ')' : '—'} | ${v.kept === null ? '—' : v.kept.n}${v.keptButtons ? ` · buttons ${v.keptButtons.followed}/${v.keptButtons.n} follow${v.keptButtons.worse.length ? `, ${v.keptButtons.worse.length} unreadable` : ''}` : ''} | ${v.requests === 1 ? '1st request' : `request ${v.requests}`} (${v.renderMs} ms render) | ${v.shot} |`
  )
]
if (refused.length)
  lines.push(
    '',
    'Refused by the quality gate (never applied to a site):',
    ...refused.map((r) => `- ${r.name} (${r.id}): ${r.reasons.join(', ')}`)
  )
writeFileSync(join(OUT, 'report.md'), `${lines.join('\n')}\n`)
const failed = verdicts.filter((v) => !v.pass)
console.log(
  `${verdicts.length - failed.length}/${verdicts.length} PASS${failed.length ? ` — FAIL: ${failed.map((f) => `${f.step}/${f.vw}`).join(' ')}` : ''}`
)
for (const f of failed)
  console.log(' ', f.label, f.vw, (f.misses ?? f.sample).join('; '), JSON.stringify(f.contrast ?? ''))
process.exitCode = failed.length ? 1 : 0
