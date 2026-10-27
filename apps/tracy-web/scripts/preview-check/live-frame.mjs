/**
 * The preview measured as BOTH popups frame it since 0bcabb641f / 87242c0d96 (probe 10, 18/10/2026): the demo's
 * page at its own address with its scripts running, each document of its origin answered as the site proxy
 * answers it (`designSystemLivePages().pageOf`: the slot's bytes laid in by `liveWornHtmlOf`, the Template
 * default's page with any worn slot taken off), the frame's own helper script included. Try on runs the page's
 * scripts too, so the static frame (`asTheFrameRuns`, no script) judged a page no customer sees: JA Resume's
 * variant homes, whose header colour class (`style-white` / `style-dark`) T3's script sets, read a menu on a
 * photo in the wrong colour; Owl carousels stayed unbuilt.
 *
 * The page settles deterministically before any probe (cdp.mjs `open` with `still`): load and stylesheets in,
 * one walk down for reveals, lazy pictures decoded, every finite animation played out, each carousel stopped
 * on its first slide; then every scroll reveal shown and played out (`REVEAL_ALL`) and `settle` commits them.
 */
import { emitFor, googleFontFaces, modeHookOf, modesOf, quickstartContractOf } from '../../src/lib/ds-slot.js'
import { TEMPLATE_DEFAULT_ID } from '../../src/sites/design-system-ids.js'
import { designSystemLivePages, frameSidesOf } from '../../src/sites/design-system-live-page.js'
import { slotOf } from '../../src/sites/design-system-preview-page.js'
import { slotStatusColours } from '../preview-detectors/lib/system-palette.mjs'
import { markShowingEmbeds } from './embed-frames.mjs'

/** The probe version the live frame belongs to: the static frame stays the measure until the flip. */
export const LIVE_FRAME_SINCE = 10

const livePages = designSystemLivePages()

/**
 * Every scroll reveal shown, as a visitor scrolling past has it, then played out (bounded at 5 s). The walk
 * down the page (cdp.mjs) passes in 40 ms steps and AOS handles scroll at most every 99 ms: JA Seven's
 * portfolio LOAD MORE (data-aos="fade-up") was shown on one take and left at opacity 0 on the next, of the
 * same page (18/10/2026). AOS (`aos-animate`) and WOW.js (`visibility` it hides until in view).
 */
export const REVEAL_ALL = `(async () => { let n = 0
  for (const e of document.querySelectorAll('[data-aos]:not(.aos-animate)')) { e.classList.add('aos-animate'); n++ }
  for (const e of document.querySelectorAll('.wow')) if (e.style.visibility === 'hidden') { e.style.visibility = 'visible'; e.classList.add('animated'); n++ }
  for (let t = 0; t < 50; t++) { const a = document.getAnimations ? document.getAnimations().filter((x) => x.playState === 'running' && x.effect?.getComputedTiming?.().endTime !== Infinity) : []; if (!a.length) break; await new Promise((r) => setTimeout(r, 100)) }
  return n })()`

/**
 * The popup's Light | Dark press, as the frame's script takes it (`put` in `frameScriptOf`): the contract's
 * hook marks on (dark) or off (light), `data-theme` on the root by default.
 * @param {ReturnType<typeof frameSidesOf>} sides
 * @param {string} side
 */
export const pressSideExpression = (sides, side) =>
  `(async () => { const W = ${JSON.stringify(sides.set)}, m = ${JSON.stringify(side === 'dark' ? 'dark' : 'light')}, r = document.documentElement;
  if (!W) r.setAttribute('data-theme', m); else { const el = W.on === 'body' ? document.body : r, on = m === 'dark'; if (el) { (W.cls || []).forEach((c) => el.classList.toggle(c, on)); (W.attr || []).forEach((a) => on ? el.setAttribute(a[0], a[1]) : el.removeAttribute(a[0])) } }
  await new Promise((r) => setTimeout(r, 400)); return 1 })()`

/**
 * Opens one page of a demo in the live frame, wearing `id` (null: the Template default card).
 * @param {any} chrome a cdp.mjs browser
 * @param {{ d: { platform: string, tag: string, version?: string | null, address: string }, id: string | null,
 *   path: string, scheme: string, parentOrigin: string, fetchImpl: typeof fetch, draws?: Map<string, string> }} q
 *   `draws`: the server's first answer for each document, shared by every view of one page. A page can list its
 *   items in a random order, a new draw on each request (JA Vogue 1.0.7's editorial carousel, 18/10/2026): the
 *   template's page and the worn one must hold the same draw, or a box is judged against another item.
 * @returns {Promise<{ miss: string } | { html: string, template: string, modes: boolean, status: string[],
 *   sides: ReturnType<typeof frameSidesOf> }>}
 *   `html` the top document as the frame got it (the detectors read the slot's fonts off it)
 */
export async function openLiveFrame(chrome, { d, id, path, scheme, parentOrigin, fetchImpl, draws }) {
  const fit = quickstartContractOf({ platform: d.platform, tag: d.tag, version: d.version ?? null })
  if (!('contract' in fit)) return { miss: `NO_SLOT (${fit.reason})` }
  /** @type {string[]} */
  let status = []
  if (id) {
    // the slot as the proxy emits it (fonts included), for the status colours it writes itself
    const out = await emitFor({
      platform: /** @type {any} */ (d.platform),
      contract: fit.contract,
      id,
      fontFaces: googleFontFaces
    })
    const s = out.ok ? slotOf(out) : null
    if (!s) return { miss: 'NO_SLOT (emit)' }
    status = slotStatusColours(`${s.bytes ?? ''}\n${JSON.stringify(s.globalCss ?? '')}`)
  }
  const pub = new URL(d.address)
  const href = new URL(path, pub).href
  const claims = {
    site: 'preview-check',
    id: id ?? TEMPLATE_DEFAULT_ID,
    contract: fit.contract,
    template: fit.template,
    exp: 0
  }
  /** @type {{ url: string, html: string, worn: boolean }[]} */
  const docs = []
  await chrome.rewriteDocuments(async (/** @type {string} */ url, /** @type {string} */ fresh) => {
    if (new URL(url).origin !== pub.origin) return null
    // the draw an earlier view of this page got, else this answer, kept for the next view
    const html = draws?.get(url) ?? fresh
    if (draws && !draws.has(url)) draws.set(url, fresh)
    const out = await livePages.pageOf({
      html,
      claims,
      ticket: 'preview-check',
      site: { platform: d.platform },
      inner: pub,
      pub,
      parentOrigin,
      fetchImpl
    })
    docs.push({ url, html: out ?? html, worn: typeof out === 'string' })
    return out ?? (html === fresh ? null : html)
  })
  try {
    await chrome.open(href, 1440, { scheme, still: true })
  } finally {
    await chrome.rewriteDocuments(null)
  }
  await chrome.evaluate(REVEAL_ALL)
  await chrome.settle()
  // a provider's frame that plays here is no embed error: the page's scripts run (embed-frames.mjs)
  await markShowingEmbeds(chrome)
  // the top document: the one the page landed on (a redirect followed), not a frame inside it
  const at = String((await chrome.evaluate('location.href').catch(() => '')) ?? '').replace(/#.*$/, '')
  const top = docs.findLast((x) => x.url.replace(/#.*$/, '') === at) ?? docs[0]
  if (!top) return { miss: 'LIVE (no document of the demo loaded)' }
  // a system the proxy could not lay in (a WordPress page off the judged theme): the popup shows the page as it is
  if (id && !top.worn) return { miss: 'NOT_WORN (live)' }
  return {
    html: top.html,
    template: fit.template,
    // the contract wears both sides: the popup shows its Light | Dark switch
    modes: modesOf(fit.contract) === true,
    status,
    sides: frameSidesOf(modeHookOf(fit.contract))
  }
}
