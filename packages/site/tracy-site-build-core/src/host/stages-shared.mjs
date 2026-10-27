/**
 * The stages every Build shares, whatever the CMS — and the helpers a CMS's own stages lean on.
 *
 * A build dresses a NEW site (Lee, 09/09), so everything that touches the site goes through ONE
 * door: `apply`, the seat-book call `tracy-site-tools` makes in the name of the person who
 * pressed. No `wp`, no `php`, no reading a webroot on this machine — the lane holds neither that
 * site's files nor a credential for it. What still runs HERE is the seeder (it holds the plan,
 * the model keys and the section library) and the browser that takes the picture.
 *
 * Shared, by name:
 *   checkStage  the inspiration is known, the look is released, and the site the fleet made says
 *               it runs the platform this build is for.
 *   copyStage   the customer's answers become `site` in design-preview.json, the inspiration is
 *               recorded as chosen, and one take per language is written through `copyHome`.
 *               Nothing to write from → `waiting:form:name,about`, and the Build tab asks.
 *   seedStage   the required seeder, with the three files and `--target-site`; absent → `failed`.
 *   shotStage   one screenshot of the home page next to the job; no browser → skipped.
 *
 * What a CMS adds between `check` and `copy` is its own: WordPress installs a theme and applies a
 * style through `theme.style`; Joomla installs a template and writes a template-style row. Those
 * live in `@tracy/dsh-site-build-<cms>/src/host/stages.mjs`, built on the helpers below.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { judge, paletteOf, REPORT_FILE } from './design-check.mjs'
import { parseStyles, PROBE_SCRIPT } from './design-probe.mjs'
import { readDesign } from './design-record.mjs'
import { detailOf, HOST_MESSAGES } from '../host-messages.mjs'

/**
 * Where the look is released, and where each CMS reads which version is current. Raw content of
 * the distribution repository's main branch: the same two files an installed site polls, so a
 * build and an update can never install different versions.
 */
/** @type {Record<string, string>} */
export const THEME_MANIFEST = {
  wordpress: 'https://raw.githubusercontent.com/TracyHQ/claude-cowork/main/wordpress/theme/update.json',
  joomla: 'https://raw.githubusercontent.com/TracyHQ/claude-cowork/main/joomla/template/update.xml'
}

/**
 * The package URL the manifest announces, or null when it cannot be read. Never throws: a lane
 * without a road out still builds on the zip in its image.
 * @param {string} platform
 * @param {typeof fetch} [get]
 * @returns {Promise<string | null>}
 */
export async function releasedPackage(platform, get = fetch) {
  const url = THEME_MANIFEST[platform]
  if (!url) return null
  try {
    const response = await get(url, { signal: AbortSignal.timeout(8000) })
    if (!response.ok) return null
    const body = await response.text()
    if (platform === 'wordpress') {
      const parsed = JSON.parse(body)
      const at = typeof parsed?.package === 'string' ? parsed.package.trim() : ''
      return at.startsWith('https://') ? at : null
    }
    // The Joomla update server lists every release, newest first, so the first download is the
    // current one — the same rule Joomla itself applies when it picks an update.
    const at = body.match(/<downloadurl[^>]*>([^<]+)<\/downloadurl>/)?.[1]?.trim() ?? ''
    return at.startsWith('https://') ? at : null
  } catch {
    return null
  }
}
/**
 * The seat book answers `{ ok: false, ... }` on a refusal; anything else object-shaped is a yes.
 * @param {unknown} answer
 */
export function ok(answer) {
  return Boolean(answer) && typeof answer === 'object' && /** @type {any} */ (answer).ok !== false
}

/** @type {Record<string, string>} */
export const CMS_NAME = { wordpress: 'WordPress', joomla: 'Joomla', emdash: 'EmDash' }
const PREVIEW = path.join('docs', 'agents', 'design-preview.json')
export const SHOT = path.join('docs', 'agents', 'build', 'home.png')

/** Each build owns its picture; a later build must never replace another tab's image.
 * @param {{ job: string, ownerSessionId?: string }} job
 */
export function shotFileFor(job) {
  return job.ownerSessionId
    ? path.join('docs', 'agents', 'build', 'artifacts', encodeURIComponent(job.job), 'home.png')
    : SHOT
}

export const DESIGN_CHECK = path.join(...REPORT_FILE.split('/'))

/** The adherence report sits beside the picture it was measured on (ADR 0023). @param {{ job: string, ownerSessionId?: string }} job */
export function designCheckFileFor(job) {
  return job.ownerSessionId
    ? path.join('docs', 'agents', 'build', 'artifacts', encodeURIComponent(job.job), 'design-check.json')
    : DESIGN_CHECK
}

/** Private inputs keep parallel builds and subsequent revisions from sharing seeder files.
 * @param {string} root @param {{ job: string, ownerSessionId?: string }} job
 */
export function inputRootFor(root, job) {
  return job.ownerSessionId
    ? path.join(root, 'docs', 'agents', 'build', 'artifacts', encodeURIComponent(job.job))
    : root
}

/**
 * The build's own copy of a take, where `seed` opens it.
 *
 * 🔒 THE FILE NAME IS THE COPY DOOR'S (`copyFileName` in tracy-design-inspiration): `:` becomes
 * `--`, dots stay — `brand--acme.com.json`. `seedStage` passes that name as `--copy` and the seeder
 * finds extra languages beside it by the same rule. Until 29/09/2026 this wrote
 * `brand-acme-com.json`, a file nobody reads: a `brand:` build of a session passed `copy` and would
 * have stopped at `seed`. The id reached this stage through the door, which refuses one it does not
 * know; a name that still carries anything but a host's characters is refused here too.
 * @param {string} root @param {string} inspiration @param {string} lang @param {string} chip @param {{ id: string, title: string }} version
 */
function snapshotCopy(root, inspiration, lang, chip, version) {
  if (lang && !/^[a-z]{2,3}(?:-[a-zA-Z]{2,4})?$/.test(lang))
    throw new Error(`Invalid content language: ${lang}`)
  const id = inspiration.replace(/:/g, '--')
  if (!/^[a-z0-9][a-z0-9.-]*$/i.test(id) || id.includes('..'))
    throw new Error(`Invalid inspiration id: ${inspiration}`)
  const file = path.join(root, 'docs', 'agents', 'design-copy', `${id}${lang ? `.${lang}` : ''}.json`)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(
    file,
    JSON.stringify({
      schemaVersion: 'tracy-design-copy/v1',
      system: inspiration,
      lang,
      writtenAt: new Date().toISOString(),
      brief: null,
      pages: { [chip]: { versions: [version], selected: version.id, nextPrompt: null } }
    }),
    { mode: 0o600 }
  )
}

/**
 * First non-empty line of a command's stderr, else stdout, else a generic word.
 * @param {{ stdout?: string, stderr?: string } | null | undefined} result
 * @param {string} fallback
 */
export function firstLine(result, fallback) {
  const text = `${result?.stderr ?? ''}\n${result?.stdout ?? ''}`
  const line = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l !== '')
  return line ?? fallback
}

/** @param {string} root @returns {Record<string, any> | null} */
export function readPreview(root) {
  try {
    const parsed = JSON.parse(readFileSync(path.join(root, PREVIEW), 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

/** @param {string} root @param {Record<string, unknown>} preview */
export function writePreview(root, preview) {
  const file = path.join(root, PREVIEW)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(preview, null, 2)}\n`)
}

/**
 * The chip the first take is written onto.
 *
 * A chip is one of the site's REAL pages — read off it by the agent in step 1 of
 * `tracy-design-system` — or one of the design system's own sample products (`landing`, `deck`,
 * `poster`, …), which every inspiration carries whether or not a site has been read. See
 * `chipsOf` in design-inspiration's PreviewDialog: before a site is read there are no real pages,
 * and only the sample products remain.
 *
 * So a site built from nothing gets `landing` — the design system's own home page. Asking for `/`
 * there is asking for a page nobody has read yet, and the door answers `404 NO_SUCH_CHIP`
 * correctly (measured 08/09 on a fresh WordPress build).
 * @param {{ path?: unknown }[] | undefined} pages - `pages` of design-preview.json.
 * @returns {string} the chip to write the first take onto.
 */
export function firstChip(pages) {
  const rows = Array.isArray(pages) ? pages : []
  return rows.some((p) => p && typeof p.path === 'string' && p.path === '/') ? '/' : 'landing'
}

/**
 * The customer's answers folded into the `site` block the preview and the seeder read. Only the
 * fields the form has; the words of the page (headline, sub, cta) are the copy stage's to write.
 * @param {Record<string, unknown> | undefined} site
 * @param {Record<string, unknown>} answers
 */
export function siteFromAnswers(site, answers) {
  const out = { ...site }
  if (typeof answers.name === 'string' && answers.name.trim()) out.name = answers.name.trim()
  if (typeof answers.about === 'string' && answers.about.trim()) out.about = answers.about.trim()
  if (typeof answers.contact === 'string' && answers.contact.trim()) out.contact = answers.contact.trim()
  if (typeof answers.tone === 'string' && answers.tone.trim()) out.tone = answers.tone.trim()
  if (Array.isArray(answers.languages) && answers.languages.length > 0) out.languages = answers.languages
  if (Array.isArray(answers.pages) && answers.pages.length > 0) out.wanted = answers.pages
  // Whatever else the agent asked travels as `notes`, one line per answer, for the copy prompt.
  const known = new Set(['name', 'about', 'contact', 'tone', 'languages', 'pages'])
  const notes = Object.entries(answers)
    .filter(
      ([k, v]) =>
        !known.has(k) && (typeof v === 'string' ? v.trim() !== '' : Array.isArray(v) && v.length > 0)
    )
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v).trim()}`)
  if (notes.length > 0) out.notes = notes
  return out
}

/**
 * The one-paragraph brief the home take is written from: the customer's words first, the site's
 * own words as a fallback when they exist.
 * @param {Record<string, any>} site
 */
export function briefOf(site) {
  const parts = []
  if (site.name) parts.push(`The business is "${site.name}".`)
  if (site.about) parts.push(String(site.about))
  if (site.tone) parts.push(`Tone: ${site.tone}.`)
  if (site.contact) parts.push(`Contact: ${site.contact}.`)
  if (Array.isArray(site.languages) && site.languages.length > 0)
    parts.push(`Language: ${site.languages.join(', ')}.`)
  if (Array.isArray(site.notes)) for (const n of site.notes) parts.push(`${String(n)}.`)
  return parts.join(' ')
}

/**
 * The door's own words, MESSAGE first. Measured 08/09 on a real site: the component answers
 * `{ error: 'install_failed', message: '…' }`, and reading the code first threw away the only
 * sentence that said what went wrong — the build reported a code nobody could act on.
 * @param {unknown} answer @param {string} fallback
 */
export function say(answer, fallback) {
  const a = /** @type {Record<string, unknown>} */ (answer && typeof answer === 'object' ? answer : {})
  const words = [a.message, a.error, a.code].find((w) => typeof w === 'string' && w !== '')
  return typeof words === 'string' ? words : fallback
}

/**
 * `say` as the fields of a stage result: the door's own words when it gave any (they travel as
 * written: a site's diagnosis is not Tracy's to translate), else Tracy's own sentence with its code,
 * so the Build tab can show it in the reader's language (`host-messages.mjs`).
 * @param {unknown} answer @param {string} code @param {Record<string, string | number>} [params]
 * @param {Readonly<Record<string, string>>} [table] - the plugin's own sentences, for a plugin's code.
 * @returns {{ detail: string, detailCode?: string, detailParams?: Record<string, string | number> }}
 */
export function sayDetail(answer, code, params = {}, table = HOST_MESSAGES) {
  const a = /** @type {Record<string, unknown>} */ (answer && typeof answer === 'object' ? answer : {})
  const words = [a.message, a.error, a.code].find((w) => typeof w === 'string' && w !== '')
  return typeof words === 'string' ? { detail: words } : detailOf(code, params, table)
}

/**
 * The refusals that mean "not yet", not "no": nobody to act as in this lane yet, or the door not
 * reached at all. Asked again a bounded number of times before a stage gives up; a refusal that
 * names a decision (a seat that may not, a site that is not connected) is failed at once.
 *
 * `NOT_SIGNED_IN` is in the list on purpose: the relay acts as the PROMPTER stamped on the
 * session's last message, and the stamp lands a beat after the brief is sent — between the two it
 * falls back to a viewer cookie that never carries `tracy_sess` (HttpOnly, stripped by the proxy)
 * and Tracy answers 401. Measured 13/09 as the very next request after a handoff's brief.
 *
 * ⚠ `ACTOR_NOT_ACCEPTED` IS NOT IN IT, and that is the whole point of having a second word for it:
 * a secret that does not pair does not start pairing because we asked six more times. Retrying it
 * only spends twelve seconds arriving at the same sentence.
 */
export const TRANSIENT_REFUSALS = Object.freeze(
  new Set(['NO_VIEWER', 'NOT_SIGNED_IN', 'UNREACHABLE', 'HOST_UNAVAILABLE', 'WORKSPACE_UNREACHABLE'])
)

/**
 * The refusals that are about WHO the call acts as rather than about the site. A stage that stops
 * on one of these must not offer "run it again": the same call, made the same way, is refused the
 * same way, and a person pressing Retry three times learns nothing from three identical failures.
 */
export const AUTH_REFUSALS = Object.freeze(
  new Set(['NOT_SIGNED_IN', 'NO_VIEWER', 'ACTOR_NOT_ACCEPTED', 'SEAT_NOT_AUTHORIZED', 'NOT_SITE_OWNER'])
)

const PATIENT_TRIES = 6
const PATIENT_WAIT_MS = 2000

/**
 * One `apply`, patient with a lane that is not ready to be asked yet.
 *
 * WHY IT WRAPS THE DOOR RATHER THAN SITTING IN ONE STAGE. It used to be a local helper two Joomla
 * stages remembered to call, and the stages that forgot were exactly the ones that broke: measured
 * 17/09 on `build-mu5p44ic-00y2`, `check` came back in 3.9s having really reached the site, and
 * `template` — the same call, four seconds later, through the unpatient path — was refused in
 * 107 ms and failed the build. Patience that each caller opts into is patience that some caller
 * does not have.
 *
 * @param {Apply} apply - the door to be patient with.
 * @param {{ tries?: number, waitMs?: number, wait?: (ms: number) => Promise<void> }} [opts]
 * @returns {Apply}
 */
export function patient(apply, opts = {}) {
  const tries = opts.tries ?? PATIENT_TRIES
  const waitMs = opts.waitMs ?? PATIENT_WAIT_MS
  const wait = opts.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  return async (call) => {
    let last = null
    for (let i = 0; i < tries; i += 1) {
      last = await apply(call)
      if (ok(last)) return last
      const code = /** @type {{code?: unknown}} */ (last ?? {}).code
      if (typeof code !== 'string' || !TRANSIENT_REFUSALS.has(code)) return last
      if (i < tries - 1) await wait(waitMs)
    }
    return last
  }
}

/**
 * What a person reads when a stage stops on a refusal — never the bare code.
 *
 * `say` answers the door's own words and falls through to `code` when there are none, which is
 * right for a component that explains itself and wrong for Tracy's own doors: they answer
 * `{code: 'NOT_SIGNED_IN'}` and nothing else, so what reached the customer was the identifier.
 * Measured 17/09 on the dev machine: the Build tab asked *'"Install the template" failed at step 2
 * of 7'* over the single word `NOT_SIGNED_IN`, and the one true thing about that word — that it is
 * not about anything the person can do — was nowhere on the screen.
 *
 * ⚠ THIS IS NOT A SECOND COPY OF `refusalNext`. That one tells an AGENT what to do instead, and it
 * is gated against the door's own list of codes. This one is a sentence for a PERSON, about a build
 * that has stopped. Two audiences, two texts; a code with no line here still gets `say`'s answer.
 *
 * @param {unknown} answer - what the door answered.
 * @param {string} fallback - what to say when the answer carries neither words nor a known code.
 * @returns {string}
 */
export function refusalWords(answer, fallback) {
  const a = /** @type {Record<string, unknown>} */ (answer && typeof answer === 'object' ? answer : {})
  const words = [a.message, a.error].find((w) => typeof w === 'string' && w !== '')
  if (typeof words === 'string') return words
  const known = refusalCode(a.code)
  return known === null ? say(answer, fallback) : HOST_MESSAGES[known]
}

/**
 * The shared sentence a refusal code has, or null. `NO_VIEWER` reads as `NOT_SIGNED_IN`: to the
 * person it is the same fact.
 * @param {unknown} code
 * @returns {'NOT_SIGNED_IN' | 'ACTOR_NOT_ACCEPTED' | 'SEAT_NOT_AUTHORIZED' | 'NOT_SITE_OWNER' | 'COMPONENT_NOT_REGISTERED' | 'COMPONENT_UNAUTHORIZED' | null}
 */
function refusalCode(code) {
  switch (code) {
    case 'NO_VIEWER':
      return 'NOT_SIGNED_IN'
    case 'NOT_SIGNED_IN':
    case 'ACTOR_NOT_ACCEPTED':
    case 'SEAT_NOT_AUTHORIZED':
    case 'NOT_SITE_OWNER':
    case 'COMPONENT_NOT_REGISTERED':
    case 'COMPONENT_UNAUTHORIZED':
      return code
    default:
      return null
  }
}

/**
 * `refusalWords` as the fields of a stage result: the door's words as written, a known refusal by
 * its shared sentence and code, otherwise `sayDetail` with the caller's own sentence.
 * @param {unknown} answer
 * @param {string} code - the caller's sentence, for a refusal that brings none.
 * @param {Record<string, string | number>} [params] @param {Readonly<Record<string, string>>} [table]
 * @returns {{ detail: string, detailCode?: string, detailParams?: Record<string, string | number> }}
 */
export function refusalDetail(answer, code, params = {}, table = HOST_MESSAGES) {
  const a = /** @type {Record<string, unknown>} */ (answer && typeof answer === 'object' ? answer : {})
  const words = [a.message, a.error].find((w) => typeof w === 'string' && w !== '')
  if (typeof words === 'string') return { detail: words }
  const known = refusalCode(a.code)
  return known === null ? sayDetail(answer, code, params, table) : detailOf(known)
}

/**
 * The token a write files its undo under. The Joomla component refuses `extension.enable` and
 * every `content.update` without one, and that refusal is the point: a change nobody can replay
 * backwards is a change the site never promised to take back.
 */
export const applyId = () => `build-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

/** The sentence every stage gives when this lane has no site tools to knock with. */
export const NO_DOOR = HOST_MESSAGES.NO_DOOR

/** The same, as the fields of a failed stage: the sentence and its code. */
export const NO_DOOR_DETAIL = Object.freeze(detailOf('NO_DOOR'))

/**
 * @typedef {(call: { siteKey: string, action: string, params?: Record<string, unknown> }) => Promise<unknown>} Apply
 * @typedef {(cmd: string, args: string[]) => Promise<{ code: number, stdout: string, stderr: string }>} Run
 * @typedef {import('./build.mjs').StageFn} StageFn
 * @typedef {import('./build.mjs').StageResult} StageResult
 */

/**
 * The site a job dresses — always the one the fleet made for it. A job with none is refused
 * here, once, with a sentence, instead of by every stage with a different one.
 * @param {{ targetSiteKey?: string }} job
 * @returns {string | null}
 */
export function siteKeyOf(job) {
  return typeof job.targetSiteKey === 'string' && job.targetSiteKey !== '' ? job.targetSiteKey : null
}

/**
 * What the NEW site says it is, before anything is installed on it.
 * @param {object} deps
 * @param {Set<string>} deps.ids - the catalog's inspiration ids
 * @param {Apply | null} deps.apply
 * @param {string} deps.platform - the platform this plugin builds
 * @param {typeof fetch} [deps.get]
 * @returns {StageFn}
 */
export function checkStage({ ids, apply, platform, get = fetch }) {
  return async (job) => {
    const siteKey = siteKeyOf(job)
    if (siteKey === null) return { status: 'failed', ...detailOf('SITE_UNNAMED_START') }
    if (apply === null) return { status: 'failed', ...NO_DOOR_DETAIL }
    // A brand (`brand:<host>`) is not in the catalogue and needs no entry there: its look is made
    // at build time from the site's own `Brand/<host>/tokens.css` (ADR 0023) — the WordPress `style`
    // stage turns it into a variation; other platforms still stop at their own `style`.
    if (!job.inspiration.startsWith('brand:') && !ids.has(job.inspiration))
      return { status: 'failed', ...detailOf('NOT_AN_INSPIRATION', { id: job.inspiration }) }
    const released = await releasedPackage(platform, get)
    if (released === null) return { status: 'failed', ...detailOf('LOOK_UNREACHABLE') }
    const manifest = await apply({ siteKey, action: 'core.manifest', params: {} })
    if (!ok(manifest)) return { status: 'failed', ...sayDetail(manifest, 'SITE_SILENT', { site: siteKey }) }
    const cms = /** @type {Record<string, unknown>} */ (manifest).platform
    if (typeof cms === 'string' && cms !== '' && cms !== platform)
      return {
        status: 'failed',
        ...detailOf('WRONG_PLATFORM', {
          site: siteKey,
          cms: CMS_NAME[cms] ?? cms,
          platform: CMS_NAME[platform] ?? platform
        })
      }
    return { status: 'done', detail: `${siteKey} · ${released.split('/').pop()}` }
  }
}

/**
 * What a copy door's refusal reads as: its sentence with its code when the door's client knew one
 * (`copyHomeVia`), else its message as written.
 * @param {{ message: string, messageCode?: string, messageParams?: Record<string, string | number> }} refused
 */
function copyFailure(refused) {
  if (refused.messageCode && Object.hasOwn(HOST_MESSAGES, refused.messageCode))
    return detailOf(refused.messageCode, refused.messageParams ?? {})
  return { detail: refused.message }
}

/**
 * @param {object} deps
 * @param {string} deps.root - the folder the job's files live in
 * @param {((req: { id: string, prompt: string, lang?: string, chip?: string }) => Promise<{ ok: true, version: { id: string, title: string } } | { ok: false, message: string, messageCode?: string, messageParams?: Record<string, string | number> }>) | undefined} deps.copyHome
 * @returns {StageFn}
 */
export function copyStage({ root, copyHome }) {
  return async (job) => {
    const inputs = inputRootFor(root, job)
    const preview = (job.ownerSessionId ? null : readPreview(root)) ?? {
      schemaVersion: 'tracy-design-preview/v1',
      pages: []
    }
    const site = siteFromAnswers(preview.site, job.answers ?? {})
    const hasWords = Boolean(site.about) || Boolean(site.headline) || Boolean(site.sub)
    if (!site.name || !hasWords) {
      const missing = [!site.name ? 'name' : null, !hasWords ? 'about' : null].filter(Boolean)
      return { status: 'waiting', detail: `form:${missing.join(',')}` }
    }
    preview.site = site
    preview.chosen = { id: job.inspiration, at: new Date().toISOString() }
    writePreview(inputs, preview)
    if (!copyHome) return { status: 'failed', ...detailOf('NO_COPY') }
    /**
     * One take per language the customer asked for (Lee, 08/09). The FIRST is the site's own and
     * writes `design-copy/<id>.json`; every other writes `<id>.<lang>.json` — `copyFileName`.
     *
     * Every requested language is required. A missing translation leaves a failed stage to retry.
     */
    const langs = Array.isArray(site.languages) && site.languages.length > 0 ? site.languages : ['en']
    const prompt = briefOf(site)
    // The design system's own landing when the site has no pages read off it yet.
    const chip = firstChip(preview.pages)
    const first = await copyHome({ id: job.inspiration, prompt, lang: '', chip })
    if (!first.ok) return { status: 'failed', ...copyFailure(first) }
    if (job.ownerSessionId) snapshotCopy(inputs, job.inspiration, '', chip, first.version)
    const titles = [`${chip === '/' ? 'home' : chip} · ${first.version.title}`]
    for (const lang of langs.slice(1)) {
      const also = await copyHome({ id: job.inspiration, prompt, lang, chip })
      if (!also.ok)
        return { status: 'failed', ...detailOf('COPY_LANG_FAILED', { lang, reason: also.message }) }
      if (job.ownerSessionId) snapshotCopy(inputs, job.inspiration, lang, chip, also.version)
      titles.push(`${lang} · ${also.version.title}`)
    }
    return { status: 'done', detail: titles.join(' | ') }
  }
}

/**
 * @param {object} deps
 * @param {string} deps.root
 * @param {Run} deps.run - runs on THIS machine: the seeder lives here
 * @param {{ command: string, args: string[] } | null} deps.seeder
 * @param {string} deps.doorOrigin - where the seeder reaches this lane's site-tools door
 * @returns {StageFn}
 */
/**
 * @param {object} deps
 * @param {string[]} [deps.extra] flags only one platform's seed run needs, passed through verbatim.
 *   Joomla's quickstart path uses it for `--surface pages` and `--keep-demo`; WordPress passes none.
 */
export function seedStage({ root, run, seeder, doorOrigin, extra = [] }) {
  return async (job) => {
    if (!seeder) return { status: 'failed', ...detailOf('NO_SEEDER') }
    const siteKey = siteKeyOf(job)
    if (siteKey === null) return { status: 'failed', ...detailOf('SITE_UNNAMED') }
    const pages = job.rerun?.stage === 'seed' && job.rerun.pages?.length ? job.rerun.pages : ['all']
    const inputs = inputRootFor(root, job)
    // The seeder runs HERE (it holds the plan, the model keys and the section library) and every
    // write leaves through that site's seat door — `--target-site` plus the lane's own loopback
    // address for the door.
    const r = await run(seeder.command, [
      ...seeder.args,
      '--preview',
      path.join(inputs, PREVIEW),
      '--copy',
      path.join(inputs, 'docs', 'agents', 'design-copy', `${job.inspiration.replace(/:/g, '--')}.json`),
      '--target-site',
      siteKey,
      '--door',
      doorOrigin,
      ...(job.ownerSessionId ? ['--session', job.ownerSessionId] : []),
      // 🔒 A BRIEF REVISION IS AN ADDITION, NOT A REWRITE. This used to pass `--fresh` whenever the
      // rerun started at `copy` — i.e. on every answer the customer gave — and `--fresh` is the one
      // flag that discards the cached plan, and with it the layers that let an answer accumulate.
      // Measured 13/09/2026 through the product's own answers route: one added paragraph took the
      // required list from 388 to 539, with 404 keys that had never been pending. The seeder now
      // carries the previous plan forward on its own (kept slots, retracted evidence, the site's
      // words) and asks only about what is still missing. Nothing in the product asks for a
      // from-scratch rewrite yet; when something does, it passes `--fresh` on purpose.
      '--pages',
      ...pages,
      ...extra
    ])
    if (r.code !== 0) {
      // Progress precedes the terminal error on stderr. Showing its first line tells
      // the customer "13 sections written" instead of why their build stopped.
      const error = r.stderr.trim().split(/\r?\n/).filter(Boolean).at(-1)
      if (error?.includes('CONTENT_REQUIRED:'))
        return { status: 'waiting', detail: error.slice(error.indexOf('CONTENT_REQUIRED:')) }
      // The seeder's own words when it said any; Tracy's sentence, with its code, when it said none.
      const said = error || firstLine(r, '')
      return { status: 'failed', ...(said ? { detail: said } : detailOf('SEEDER_STOPPED')) }
    }
    const record = path.join(inputs, 'docs', 'agents', 'seed', 'apply.json')
    let contentRevision
    let lastApplyId
    if (existsSync(record)) {
      const receipt = JSON.parse(readFileSync(record, 'utf8'))
      if (typeof receipt.applied?.revision === 'string') contentRevision = receipt.applied.revision
      if (typeof receipt.applyId === 'string') lastApplyId = receipt.applyId
    }
    // A slot nobody could back keeps the archive's demo words, and the one place that is visible is
    // here: a build that says only "all" would have the customer believe every line is theirs.
    const mapping = path.join(inputs, 'docs', 'agents', 'seed', 'contract-mapping.json')
    let kept = 0
    // ...and a fact the model made up to fit the customer (Lee, 23/09/2026) is said too: it reads as
    // real, so this line is what tells the customer — and the agent — which ones to replace.
    let invented = 0
    if (existsSync(mapping)) {
      const planned = JSON.parse(readFileSync(mapping, 'utf8'))
      if (Array.isArray(planned.kept)) kept = planned.kept.length
      if (Array.isArray(planned.invented))
        invented = planned.invented.filter((key) => Object.hasOwn(planned.changes ?? {}, key)).length
    }
    // Whether the quickstart's own demo rows were hidden, in the seeder's words: a customer who
    // finds 240 posts about someone else's company deserves to have been told why they are there.
    const trimFile = path.join(inputs, 'docs', 'agents', 'seed', 'demo-trim.json')
    let trimmed = ''
    if (existsSync(trimFile)) {
      const trim = JSON.parse(readFileSync(trimFile, 'utf8'))
      if (trim.status === 'hidden')
        trimmed = trim.hidden > 0 ? `${trim.hidden} demo row(s) hidden` : 'demo rows already hidden'
      else if (trim.status === 'skipped' && typeof trim.reason === 'string')
        trimmed = `demo left in place: ${trim.reason}`
    }
    const notes = [
      kept ? `${kept} slot(s) still hold demo words` : '',
      invented ? `${invented} invented fact(s) for the customer to replace` : '',
      trimmed
    ].filter(Boolean)
    return {
      status: 'done',
      detail: [pages.join(', '), ...notes].join('; '),
      ...(contentRevision ? { contentRevision } : {}),
      ...(lastApplyId ? { lastApplyId } : {})
    }
  }
}

/**
 * @param {object} deps
 * @param {string} deps.root
 * @param {Run} deps.run
 * @param {string | null} deps.chrome
 * @param {typeof fetch} [deps.get]
 * @returns {StageFn}
 */
export function shotStage({ root, run, chrome, get = fetch }) {
  return async (job) => {
    const out = path.join(root, shotFileFor(job))
    rmSync(out, { force: true })
    if (!chrome) return { status: 'skipped', detail: 'no-browser' }
    // Photographed at the site's public address — the one the fleet gave when the site was
    // created, carried on the build job. Never assembled from the label: a guessed address looks
    // right until the fleet puts a site somewhere else, and the customer would get a picture of a
    // 404 (or, worse, of the site they were standing in).
    const address = job.targetUrl
    if (typeof address !== 'string' || address === '')
      return { status: 'skipped', detail: 'the new site has no address yet' }
    // The headless browser has no customer cookie. A protected draft must remain private;
    // a picture of its sign-in page is not a picture of the website.
    //
    // A REDIRECT ON THE SAME SITE IS THE HOME PAGE. A multilingual Joomla site answers `/` with
    // 301 → `/en/`, and this stage used to skip every such site — no picture, no design score
    // (measured 29/09/2026 on dfsjbiz1). Up to three hops are followed while they stay on the
    // site's own origin, and the picture and the probe take the page they end on. A hop to another
    // origin is still refused: that would be a picture of someone else's page.
    let url = address
    try {
      for (let hop = 0; ; hop += 1) {
        const response = await get(url, { redirect: 'manual', signal: AbortSignal.timeout(10000) })
        await response.body?.cancel()
        const location = response.headers?.get?.('location')
        if (response.status >= 300 && response.status < 400 && location) {
          const next = new URL(location, url)
          if (next.origin !== new URL(address).origin)
            return {
              status: 'skipped',
              detail: 'The site sends its home page to another address; open Live site to inspect it.'
            }
          if (hop >= 3)
            return {
              status: 'skipped',
              detail: 'The home page redirects in a loop; open Live site to inspect it.'
            }
          url = next.href
          continue
        }
        if (response.status !== 200)
          return {
            status: 'skipped',
            detail:
              response.status === 401 || response.status === 403
                ? 'This draft needs sign-in; view it in the Live site tab.'
                : `The screenshot address answered HTTP ${response.status}; open Live site to inspect it.`
          }
        break
      }
    } catch {
      return { status: 'skipped', detail: 'The screenshot browser cannot reach this site; open Live site.' }
    }
    mkdirSync(path.dirname(out), { recursive: true })
    const r = await run(chrome, [
      '--headless=new',
      '--disable-features=MacAppCodeSignClone',
      `--screenshot=${out}`,
      '--window-size=1280,800',
      '--hide-scrollbars',
      '--virtual-time-budget=5000',
      url
    ])
    if (r.code !== 0 || !existsSync(out)) return { status: 'skipped', detail: firstLine(r, 'no screenshot') }
    // ADR 0023: the same page, measured against the design system the site wears. The picture is
    // done whatever happens here; the check adds facts (scalars) and a report file, never a failure.
    const design = readDesign(root)
    if (!design?.tokens)
      return {
        status: 'done',
        detail: 'home.png',
        facts: { designCheck: design ? 'no-tokens' : 'no-design' }
      }
    const probed = await run(process.execPath, ['-e', PROBE_SCRIPT, chrome, url])
    const parsed = parseStyles(probed.stdout)
    if (!parsed.ok)
      return {
        status: 'done',
        detail: 'home.png',
        facts: { designCheck: 'skipped', designCheckWhy: parsed.error.slice(0, 120) }
      }
    const report = judge(parsed.probe, paletteOf(design.tokens), {
      allow: Array.isArray(design.allow) ? design.allow : [],
      design: { id: design.id, source: design.source }
    })
    const file = path.join(root, designCheckFileFor(job))
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`)
    const score = report.score === null ? 'n/a' : `${report.score}/100`
    const fonts = report.fonts.off > 0 ? `, ${report.fonts.off} fonts off` : ''
    return {
      status: 'done',
      detail: `home.png · design ${score}, ${report.colors.off} colours off${fonts}`,
      facts: {
        designId: design.id ?? '',
        score: report.score ?? -1,
        offColors: report.colors.off,
        nearColors: report.colors.near,
        offFonts: report.fonts.off,
        judged: report.elements.judged
      }
    }
  }
}
