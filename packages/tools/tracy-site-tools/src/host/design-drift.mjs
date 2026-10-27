/**
 * THE WRITE DOOR ANSWERS WITH DESIGN DRIFT (ADR 0023, "Addendum 30/09"; decided 30/09/2026).
 *
 * Until now the agent was only TOLD, in one context line (`site-context.mjs` `designLine`), to call
 * `tracy_design_check` before calling a look change done — and DeepSeek can skip a line. Claude
 * Design does not leave it to the model: its `ready_for_verification` answers with the findings the
 * model must read. Here the write itself does: after a write that can change the site's look went
 * through, the page it touched is measured with `tracy_design_check`'s own engine (`measurePage`,
 * `judge`, `checkNext` — `index.ts` wires them into `measure`) and the findings ride on the `ok: true`
 * answer as `warnings` + `next`, the LENGTH_RATIO shape (ADR 0022).
 *
 * 🔒 NEVER A REFUSAL. The write already happened; nothing here turns an answer into `ok: false`, adds
 * a refusal code, or holds the write back. `refusalNext` and the call memo read only `ok: false`, so
 * a drift warning never reaches either. A measure that cannot run — no design bound, no browser, the
 * page not answering, the time budget spent — is a FACT on the answer (`designCheck: "skipped"` and
 * `designWhy`), and the write's answer is otherwise untouched.
 */
import { driftFindings, judge, paletteOf } from '@tracy/site-build-core/design-check'

import { shellLookWrite } from './shell-look-write.mjs'
import { WRITE_RECEIPT_NEXT } from './site-call.mjs'

/**
 * The longest a write waits for its measure. One page in the host browser costs ~6.6 s on a T4
 * Joomla home page (measured 29/09 on `dfinj1`, `tracy_design_check` host mode); the site's own
 * browser on WordPress is of the same order. 15 s covers a slow page without making every look
 * write a minute; past it the answer says so and the agent can call `tracy_design_check` itself.
 */
export const DRIFT_BUDGET_MS = 15_000

/**
 * 🔒 THE ONLY WAY A PAGE CAN LEAVE ITS SYSTEM IS A LITERAL. A preset — WordPress's
 * `"backgroundColor":"primary"`, `var:preset|color|x`, a T4 token class — IS the theme's palette,
 * and the theme's palette is the system (the 154 variations and `tpl_tracy` token files are generated
 * from it), so a write made only of presets cannot drift. What can is a colour or a font written out:
 * a hex, an `rgb()`/`hsl()`/`oklch()`…, or a `font-family:` declaration. A write carrying none of them
 * — the words of a heading, a title, an option, a picture — is not measured, and costs nothing.
 *
 * An anchor (`href="#add"`) and an entity (`&#123;`) are not colours: addresses and entities are
 * stripped before the hex test. A literal left in a whole body by an earlier hand (the seeder's
 * `#ddd`) still triggers a measure — the price of not diffing bodies; `driftFindings` then warns
 * only what is new on the page.
 */
const HEX = /(?<![\w&#-])#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})(?![\w-])/i
const COLOR_FN = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/i
const FONT = /font-family\s*:/i
const ADDRESS = /\b(?:href|src|srcset|action|poster)\s*=\s*(?:"[^"]*"|'[^']*')/gi
const ENTITY = /&#x?[0-9a-f]+;/gi

/** @param {string} s */
const carriesLiteral = (s) => {
  const t = s.replace(ADDRESS, '').replace(ENTITY, '')
  return HEX.test(t) || COLOR_FN.test(t) || FONT.test(t)
}

/** Every string a value holds, keys excluded. @param {unknown} v @param {string[]} [out] */
function strings(v, out = []) {
  if (typeof v === 'string') out.push(v)
  else if (Array.isArray(v)) for (const x of v) strings(x, out)
  else if (v && typeof v === 'object') for (const x of Object.values(v)) strings(x, out)
  return out
}

/**
 * WordPress post types that ARE the look: user global styles (theme.json), block templates and
 * parts stored as posts, and the Customizer's Additional CSS. Any write to one is measured.
 */
const WP_LOOK_TYPES = new Set(['wp_global_styles', 'wp_template', 'wp_template_part', 'custom_css'])
/** Joomla kinds that ARE the look: a template style's params hold T4's colours and fonts. */
const JOOMLA_LOOK_KINDS = new Set(['templateStyle'])

/**
 * Whether a relayed write can change the site's look, and which page shows it.
 *
 * The list is explicit and tested (`test/design-drift.test.mjs`):
 * - `theme.style` — the whole look changes; the home page.
 * - `content.update` / `content.batch` of a look surface (above) — always; the home page.
 * - `content.update` / `content.batch` of any other record whose fields or blocks carry a literal
 *   colour or font — the record's own page where its address is known without a read (a WordPress
 *   post `/?p=<id>`, a Joomla article's `index.php?option=com_content&view=article&id=<id>`), else
 *   the home page (a template part, a module: shown site-wide or somewhere unknown).
 *
 * NOT measured, with why: `content.contract` apply and `content.replace` (words and pictures into
 * slots — no style rides on them); `media.*` (the library); `content.delete`/`content.language`;
 * `apply.revert` (it restores what was there before); `theme.activate`/`theme.install` and every
 * install (another theme is not the system the record names — the record is not refreshed for it, so
 * every element would read as drift). EmDash's look is edited under `/app` and served by
 * `site.rebuild`, which is not a `tracy_site` call (`tracy-site-build-emdash` `requests.mjs`).
 * @param {string} action
 * @param {Record<string, unknown>} params - the call as the model sent it (blocks and all).
 * @param {string} platform
 * @param {{ postType?: string | null }} [known] - the post type this conversation read for the id.
 * @returns {{ page: string, why: string } | null}
 */
export function lookWrite(action, params, platform, known = {}) {
  if (action === 'theme.style') return { page: '/', why: 'theme.style' }
  if (action === 'content.batch') {
    const items = Array.isArray(params?.items) ? params.items : []
    for (const item of items) {
      const one = item && typeof item === 'object' ? lookWrite('content.update', item, platform) : null
      if (one !== null) return { page: '/', why: one.why }
    }
    return null
  }
  if (action !== 'content.update' || !params || typeof params !== 'object') return null
  const kind = typeof params.kind === 'string' ? params.kind : ''
  /** @type {Record<string, unknown>} */
  const fields =
    params.fields && typeof params.fields === 'object'
      ? /** @type {Record<string, unknown>} */ (params.fields)
      : {}
  const postType = known.postType ?? (typeof fields.post_type === 'string' ? fields.post_type : null) ?? null
  const sent = strings([fields, params.blocks])
  if (platform !== 'joomla' && kind === 'post') {
    if (
      (postType !== null && WP_LOOK_TYPES.has(postType)) ||
      sent.some((s) => s.includes('"isGlobalStylesUserThemeJSON"'))
    )
      return { page: '/', why: `a ${postType ?? 'wp_global_styles'} post` }
  }
  if (JOOMLA_LOOK_KINDS.has(kind)) return { page: '/', why: `a ${kind}` }
  if (!sent.some(carriesLiteral)) return null
  const why = 'a literal colour or font'
  const id = Number(params.id)
  const known_id = Number.isInteger(id) && id > 0
  if (platform !== 'joomla' && kind === 'post' && known_id)
    return { page: postType === 'page' ? `/?page_id=${id}` : `/?p=${id}`, why }
  if (platform === 'joomla' && kind === 'article' && known_id)
    return { page: `/index.php?option=com_content&view=article&id=${id}`, why }
  return { page: '/', why }
}

/**
 * @typedef {{ baseline: boolean, warnings: Record<string, unknown>[], more?: number, existing: number, next: string | null }} Findings
 * @typedef {{ checked: true, score: number | null, page: string, browser?: 'site' | 'host', findings: Findings } | { checked: false, why: string }} Measured
 */

/** The part of the receipt's next that still holds when drift takes the lead. */
const RECEIPT_TAIL = WRITE_RECEIPT_NEXT.slice(WRITE_RECEIPT_NEXT.indexOf('Keep the apply_id'))

/**
 * One measure, bounded: its result, or a `checked: false` fact when it throws or runs past the budget
 * (the measure is not waited on after that; its own exec timeouts end it).
 * @param {(page: string) => Promise<Measured>} measure
 * @param {string} page
 * @param {number} [budgetMs]
 * @returns {Promise<Measured>}
 */
export async function measureWithin(measure, page, budgetMs = DRIFT_BUDGET_MS) {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer
  try {
    return await Promise.race([
      measure(page),
      new Promise((resolve) => {
        timer = setTimeout(
          () =>
            resolve({ checked: false, why: `the page was not measured within the ${budgetMs} ms budget` }),
          budgetMs
        )
      })
    ])
  } catch (error) {
    return {
      checked: false,
      why: `the measure failed: ${error instanceof Error ? error.message : String(error)}`.slice(0, 160)
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * The write's answer, with what one measure of the page it touched found.
 * @param {object} input
 * @param {unknown} input.answer - the write's answer as the model would read it.
 * @param {{ page: string, why: string } | null} input.write - `lookWrite` of the call.
 * @param {(page: string) => Promise<Measured>} input.measure
 * @param {number} [input.budgetMs]
 * @param {() => number} [input.now]
 * @returns {Promise<unknown>}
 */
export async function withDesignDrift({
  answer,
  write,
  measure,
  budgetMs = DRIFT_BUDGET_MS,
  now = Date.now
}) {
  if (write === null || !answer || typeof answer !== 'object') return answer
  const a = /** @type {Record<string, unknown>} */ (answer)
  if (a.ok !== true) return answer
  const started = now()
  const got = await measureWithin(measure, write.page, budgetMs)
  const ms = Math.max(0, now() - started)
  if (!got.checked) return { ...a, designCheck: 'skipped', designWhy: got.why }
  const f = got.findings
  const shown = {
    ...a,
    designCheck: 'measured',
    designPage: got.page,
    designScore: got.score,
    designMs: ms,
    ...(got.browser === 'host' ? { designBrowser: 'host' } : {}),
    ...(f.existing > 0 ? { designExisting: f.existing } : {}),
    ...(f.more ? { designMore: f.more } : {})
  }
  if (f.warnings.length === 0 || f.next === null) return shown
  const had = typeof a.next === 'string' && a.next !== '' && a.next !== WRITE_RECEIPT_NEXT ? a.next : null
  return {
    ...shown,
    warnings: [...(Array.isArray(a.warnings) ? a.warnings : []), ...f.warnings],
    // A next of the write's own (LENGTH_RATIO's) stays first; the generic receipt gives way, keeping
    // only its undo clause, since "nothing to read back … tell the customer" would contradict it.
    next: had !== null ? `${had} ${f.next}` : `Written. ${f.next} ${RECEIPT_TAIL}`
  }
}

/** Path and query of an address, or null. @param {unknown} url */
function pageOf(url) {
  try {
    const u = new URL(String(url))
    return `${u.pathname}${u.search}`
  } catch {
    return null
  }
}

/**
 * One measured page, judged against the design the site wears and reduced to drift.
 *
 * The baseline is the last report written for the site (`REPORT_FILE`, by the build's `shot` stage,
 * `tracy_design_check` or an earlier write) — counted only when it measured the SAME page (path and
 * query; the host differs between the build's public address and the container's loopback). The
 * report returned is written back there by the caller, so the next write compares with this one.
 * The page's first report (`origin`, `pageOrigins`) is a second baseline, same-page only as well.
 * @param {object} input
 * @param {{ id: string, source: string, tokens: Record<string, string>, allow?: { prop: string, value: string }[] }} input.design
 * @param {string} input.page
 * @param {{ href: string, seen: number, samples: any[] }} input.probe
 * @param {'site' | 'host'} [input.browser]
 * @param {any} [input.before]
 * @param {any} [input.origin] - the page's first report, before any write (`pageOrigins`).
 * @returns {{ measured: Measured, report: ReturnType<typeof judge> }}
 */
export function driftOfProbe({ design, page, probe, browser, before = null, origin = null }) {
  const report = judge(probe, paletteOf(design.tokens), {
    allow: Array.isArray(design.allow) ? design.allow : [],
    design: { id: design.id, source: design.source }
  })
  const here = pageOf(report.url)
  const ofHere = (/** @type {any} */ r) =>
    r && typeof r === 'object' && here !== null && pageOf(r.url) === here ? r : null
  return {
    measured: {
      checked: true,
      score: report.score,
      page,
      ...(browser ? { browser } : {}),
      findings: driftFindings(report, ofHere(before), ofHere(origin))
    },
    report
  }
}

/**
 * The first report of each page, before any write: the baseline a revert is judged against
 * (`driftFindings` `origin`). Measured 30/09 on df2jbiz1: judged only against the last measure, a
 * heading put back to the template's own #F0865A read as new drift. The first time a page is measured
 * for a key (conversation and site), the report on disk is kept when it is of that page — the build's
 * `shot`, `tracy_design_check` or an earlier session wrote it before this conversation wrote
 * anything; when there is none, nothing is kept and the last measure alone decides. In memory, for
 * the life of the dsh process, at most `max` pages (the oldest go first).
 * @param {number} [max]
 */
export function pageOrigins(max = 500) {
  /** @type {Map<string, any>} */
  const kept = new Map()
  return {
    /**
     * @param {string} key - the conversation and site.
     * @param {string} href - the page just measured.
     * @param {any} before - the report on disk before this measure, or null.
     */
    origin(key, href, before) {
      const at = `${key}|${pageOf(href)}`
      if (kept.has(at)) return kept.get(at)
      const same = before && typeof before === 'object' && pageOf(before.url) === pageOf(href) ? before : null
      kept.set(at, same)
      if (kept.size > max) kept.delete(/** @type {string} */ (kept.keys().next().value))
      return same
    }
  }
}

// ── The second road: a look edited outside `tracy_site` ─────────────────────────────────────────────

/**
 * 🔒 MOST LOOK EDITS DO NOT PASS THE WRITE DOOR. The site context sends a colour, a size or a font to
 * the stylesheet that paints it (`page.look` names the rule and its file), so the agent edits CSS with
 * the file tools or bash — and on EmDash edits `/app` and calls `site.rebuild`. Measured 30/09 on the
 * stand (`dfinwp1`, "make the hero button #ff00ff"): the block-attribute write through `tracy_site`
 * painted nothing (the button block skips serialising colours), was undone, and the change landed with
 * the `edit` tool in `sections.css`. So such an edit is noticed as it ends (`tools/result`) and the
 * page is measured before the agent's NEXT step, the findings arriving as a notice (`driftNotice`) —
 * the same engine, the same budget, and still never a refusal: an observer cannot refuse anything.
 */
const LOOK_FILE =
  /(?:[\w./-]*\.(?:css|scss|sass|less)|[\w./-]*theme\.json|[\w./-]*\/styles\/[\w-]+\.json)(?![\w.])/i
/** The dsh file tools that write, by name. */
const FILE_WRITERS = new Set(['edit', 'write', 'multi_edit', 'multiedit', 'apply_patch'])

/**
 * The file (or step) of a finished tool call that may have changed the site's look, or null.
 * @param {string} name - the tool.
 * @param {unknown} args - its arguments.
 * @param {{ isError?: boolean, value?: unknown }} result
 * @returns {string | null}
 */
export function lookEdit(name, args, result) {
  if (!result || result.isError === true) return null
  let parsed = args
  if (typeof args === 'string')
    try {
      parsed = JSON.parse(args)
    } catch {
      return null
    }
  if (!parsed || typeof parsed !== 'object') return null
  const a = /** @type {Record<string, unknown>} */ (parsed)
  if (name === 'tracy_site_build_emdash') {
    const v = /** @type {{ ok?: unknown } | null} */ (
      result.value && typeof result.value === 'object' ? result.value : null
    )
    return a.operation === 'site.rebuild' && v?.ok === true ? 'site.rebuild' : null
  }
  if (FILE_WRITERS.has(name)) {
    for (const s of strings([a.file_path, a.path, a.patch, a.input])) {
      const hit = s.match(LOOK_FILE)
      if (hit) return hit[0]
    }
    return null
  }
  // Only a real write form counts, never a quoted `>` or a compiler that is only read (30/09).
  if (name === 'bash' && typeof a.command === 'string') return shellLookWrite(a.command)
  return null
}

/**
 * The notice the agent reads after such an edit: what drifted and the next step, one line when
 * nothing new did, or why it was not measured (then the agent's own `tracy_design_check` is the road).
 * @param {Measured} got
 * @param {string} what - the file or step that changed the look.
 * @returns {{ text: string, summary: string }}
 */
export function driftNotice(got, what) {
  const name = what.split('/').at(-1) ?? what
  if (!got.checked)
    return {
      text: `Design check after your look edit (${name}): not measured (${got.why}): run tracy_design_check before calling the change done.`,
      summary: `design check skipped: ${got.why}`.slice(0, 120)
    }
  const f = got.findings
  const head = `Design check after your look edit (${name}), page ${got.page}: score ${got.score ?? 'n/a'}.`
  if (f.warnings.length === 0 || f.next === null)
    return {
      text: `${head} ${f.baseline ? 'no new drift' : 'nothing off the system'}${f.existing > 0 ? `; ${f.existing} older finding(s) on the page are not from this edit` : ''}. No need to run tracy_design_check for it.`,
      summary: `design check: score ${got.score ?? 'n/a'}, no new drift`
    }
  const lines = f.warnings.map((w) =>
    w.code === 'OFF_SYSTEM_FONT'
      ? `OFF_SYSTEM_FONT ${w.family} ×${w.count}${Array.isArray(w.where) && w.where.length > 0 ? ` on ${w.where[0]}` : ''}`
      : `OFF_PALETTE_COLOR ${w.prop} ${w.value} ×${w.count}${Array.isArray(w.where) && w.where.length > 0 ? ` on ${w.where[0]}` : ''} (nearest ${/** @type {{ token?: string }} */ (w.nearest)?.token ?? '?'})`
  )
  return {
    text: `${head} ${lines.join('; ')}${f.more ? `; and ${f.more} more` : ''}. ${f.next} A colour or font the customer named on purpose may stay: say so to them.`,
    summary: `design check: score ${got.score ?? 'n/a'}, ${f.warnings.length} new`
  }
}
