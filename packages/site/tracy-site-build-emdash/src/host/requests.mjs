/**
 * What the agent in the chat may ask this build to do again, and with what.
 *
 * A capability is a FIXED recipe: the agent names an operation and gives it an input, and the
 * engine reruns a stage of the build with the customer's answers changed. It never runs a command
 * the chat wrote (`host.ts`, `action: 'request'`), which is why "redraw the home picture as bread"
 * is a registered operation rather than a prompt.
 */

import {
  containerAddress,
  containerName,
  dockerCommand,
  personalizeCommand,
  siteFileReader,
  siteHomeReader,
  templateOf
} from './stages.mjs'
import { sendDesign } from '@tracy/site-build-core/design-record'
import { parsePinsRead, pinsNext, slotPins, slotPinsArgv } from './slot-pins.mjs'
import { recordTemplateLook } from './template-design.mjs'

const wait = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms))
/** How long a restarted site gets to answer again, in 5-second looks. */
const RESTART_LOOKS = 24
/** How long the warm-up render after a restart may take before the restart answers anyway. */
export const WARM_MS = 30_000

/**
 * 🔒 A RESTARTED SITE IS WARMED BEFORE THE RESTART ANSWERS. The first renders of a freshly started
 * server are its slowest: on the stand (dswalkem02, 11/10/2026) a rebuild restarted the site, nothing
 * loaded a page for seven minutes, and the customer's next two Design system presses waited 8.4 s and
 * 5.5 s on renders that take ~0.1 s warm — the page kept its old look on screen for as long. The look
 * that tells the restart the site answers only reads the headers; its render is finished here, and the
 * home page is rendered once more, so the agent's own wait pays for the cold start, not the customer's
 * first view. A warm-up that fails or runs past {@link WARM_MS} changes nothing: the site answered.
 * @param {string} url
 * @param {{ text?: () => Promise<unknown> }} first the answer that said the site is up
 */
async function warmUp(url, first) {
  try {
    await first.text?.()
  } catch {}
  try {
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(WARM_MS) })
    await res.text?.()
  } catch {}
}

/**
 * The site's own container, restarted, and waited for. The process is PID 1 in there, so this is
 * the one thing the owner's agent cannot do from inside; the docker proxy allows exactly
 * `POST /containers/<label>-web-1/restart` for it.
 * @param {string | undefined} siteKey
 * @param {{ run: (cmd: string, args: string[]) => Promise<{ code: number, stdout: string, stderr: string }>, env: Record<string, string | undefined> }} deps
 */
async function restartSite(siteKey, deps) {
  const container = containerName(siteKey)
  const url = containerAddress(siteKey)
  if (container === null || url === null) return { ok: false, detail: 'This build names no site.' }
  const r = await deps.run(...dockerCommand(deps.env, ['restart', '-t', '10', container]))
  if (r.code !== 0)
    return { ok: false, detail: `${container} did not restart: ${(r.stderr || r.stdout).trim().slice(-300)}` }
  let last = ''
  for (let look = 0; look < RESTART_LOOKS; look += 1) {
    try {
      const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(5000) })
      // 403 is the draft site asking for sign-in: up, and answering.
      if (res.status < 500) {
        await warmUp(url, res)
        return {
          ok: true,
          detail: `${container} restarted; the site answers again (HTTP ${String(res.status)}).`
        }
      }
      last = `HTTP ${String(res.status)}`
    } catch (error) {
      last = error instanceof Error ? error.message : String(error)
    }
    await wait(5000)
  }
  return {
    ok: false,
    detail: `${container} restarted, but the site did not answer within two minutes (${last}).`
  }
}

/**
 * The template's own `tools/personalize.mjs` run INSIDE the site's container with a flag other than
 * a personalize pass — `--inspect`, `--revert` — through the same token picker the personalize
 * stage uses (`personalizeCommand`: the protected mount first, the legacy `data/` file after). No
 * model key travels: neither flag writes copy. The tool answers one JSON document on its last
 * stdout line; anything else is the tool failing, and its stderr is the reason.
 * @param {string | undefined} siteKey
 * @param {string[]} flags
 * @param {{ run: (cmd: string, args: string[]) => Promise<{ code: number, stdout: string, stderr: string }>, env: Record<string, string | undefined> }} deps
 * @returns {Promise<{ ok: true, code: number, result: Record<string, unknown> } | { ok: false, detail: string }>}
 */
async function personalizeTool(siteKey, flags, deps) {
  const container = containerName(siteKey)
  if (container === null) return { ok: false, detail: 'This build names no site.' }
  const r = await deps.run(
    ...dockerCommand(deps.env, ['exec', '-i', container, ...personalizeCommand(), ...flags, '--json'])
  )
  let result = null
  try {
    result = JSON.parse(r.stdout.trim().split('\n').pop() ?? '')
  } catch {
    // no document: the exit code and stderr say what happened
  }
  if (result === null || typeof result !== 'object')
    return {
      ok: false,
      detail: `personalize.mjs ${flags[0]} answered no report (exit ${String(r.code)}): ${(r.stderr || r.stdout).trim().slice(-300)}`
    }
  return { ok: true, code: r.code, result: /** @type {Record<string, unknown>} */ (result) }
}

/**
 * What `site.inspect` hands the agent: the fields worth reading, not the whole journal.
 *
 * 🔒 A BUILD IN TWO LANGUAGES JOURNALS ~3000 ROWS — two thousand of them the other 38 locales being
 * unpublished — and the whole document is over a megabyte, which dsh spills out of the agent's
 * reach. Counted instead: every row by kind, origin and live state; listed: the words and
 * pictures a customer would ask about (not `unpublish`, not rows a later write superseded), each
 * value cut to what a sentence needs, at most `LIMIT`.
 * @param {Record<string, any>} result
 */
export function inspectSummary(result, LIMIT = 150) {
  const fields = Array.isArray(result.fields) ? result.fields : []
  /** @type {Record<string, Record<string, number>>} */
  const counts = { kind: {}, origin: {}, live: {} }
  for (const f of fields) {
    const k = String(f?.target?.kind ?? '?')
    counts.kind[k] = (counts.kind[k] ?? 0) + 1
    const o = String(f?.origin ?? 'none')
    counts.origin[o] = (counts.origin[o] ?? 0) + 1
    const l = String(f?.live ?? '?')
    counts.live[l] = (counts.live[l] ?? 0) + 1
  }
  const cut = (/** @type {unknown} */ v) => {
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof (/** @type {any} */ (v).id) === 'string')
      return { media: /** @type {any} */ (v).id }
    const s = typeof v === 'string' ? v : JSON.stringify(v ?? null)
    return s.length > 160 ? `${s.slice(0, 160)}…` : s
  }
  // 🔒 `before` IS WHAT THE SITE HELD BEFORE THE PASS, not before the last write of it. One pass
  // writes `site.brand_name` several times (brand swapped, then the whole chrome again), and the
  // last write's `before` is the tool's own earlier value — measured 25/09 on hb0355: "before:
  // HANOI BAKEHOUSE, after: HANOI BAKEHOUSE". The first write of the field in the pass says what
  // a revert would put back.
  const keyOf = (/** @type {any} */ f) =>
    `${String(f?.applyId)}|${JSON.stringify([f?.target?.kind, f?.target?.collection, f?.target?.slug, f?.target?.locale, f?.target?.field, f?.target?.menu, f?.target?.id])}`
  /** @type {Map<string, unknown>} */
  const firstBefore = new Map()
  for (const f of fields) if (!firstBefore.has(keyOf(f))) firstBefore.set(keyOf(f), f?.before)
  const shown = fields.filter(
    (/** @type {any} */ f) =>
      f?.live !== 'superseded' && f?.target?.kind !== 'unpublish' && f?.target?.kind !== 'publish'
  )
  return {
    applyIds: result.applyIds ?? [],
    latest: result.latest ?? null,
    counts,
    fields: shown.slice(0, LIMIT).map((/** @type {any} */ f) => ({
      applyId: f.applyId,
      target: f.target,
      origin: f.origin ?? null,
      ...(f.evidence ? { evidence: f.evidence } : {}),
      before: cut(firstBefore.has(keyOf(f)) ? firstBefore.get(keyOf(f)) : f.before),
      after: cut(f.after),
      live: f.live
    })),
    ...(shown.length > LIMIT ? { more: shown.length - LIMIT } : {})
  }
}

/** An apply id as the tool mints one (`pers-<n>`); refused before it can reach a command line. */
const APPLY_ID = /^[a-z0-9][a-z0-9-]{0,63}$/

/**
 * The site's application built again from its own code — `astro build` inside the site's
 * container, as the site user, then a restart.
 *
 * Every EmDash site, a quickstart one included (Lee, 26/09/2026; ADR 0022 replaces ADR 0020's
 * refusal): changing a quickstart's look is an edit under /app and this rebuild.
 * @param {import('@tracy/site-build-core/build').Job} job
 * @param {{ run: (cmd: string, args: string[]) => Promise<{ code: number, stdout: string, stderr: string }>, env: Record<string, string | undefined>, root?: string, putDesign?: (siteKey: string, record: Record<string, unknown>) => Promise<unknown>, warn?: (line: string) => void }} deps
 */
export async function rebuildSite(job, deps) {
  const container = containerName(job.targetSiteKey)
  if (container === null) return { ok: false, detail: 'This build names no site.' }
  // On a site wearing a design-system slot: the classes written since the last build that pin a value
  // the slot owns (`slot-pins.mjs`). Read BEFORE the build, while /app/dist is still the last build's
  // output; a read that does not answer says nothing, and the build goes on either way.
  const pinsRead = parsePinsRead((await deps.run(...dockerCommand(deps.env, slotPinsArgv(container)))).stdout)
  // Astro's own shim, not `pnpm build`: pnpm goes through corepack, and corepack wants a
  // cache under HOME — /var/www, root's — so the site user's build died at `mkdir
  // /var/www/.cache/node/corepack` (measured 15/09). HOME goes to /tmp for the same reason.
  //
  // 🔒 THE IMAGE'S CONTENT API SWITCH GOES INTO THE BUILD TOO. Business 1.4.x turns the
  // `/content.json` reader on at image build time (`TRACY_CONTENT_API_SCALARS`, read by
  // astro.config.mjs) and records it only as a label, so a rebuild in the container without it
  // dropped the route: measured 26/09 on the stand and on dev, `/content.json` 401 → 404 after the
  // first in-place rebuild. Read off the running container's label, the one fact every image has.
  const flag = await deps.run(
    ...dockerCommand(deps.env, [
      'inspect',
      '--format',
      '{{ index .Config.Labels "io.tracy.content-api.scalars" }}',
      container
    ])
  )
  const scalars = flag.code === 0 && flag.stdout.trim() === '1' ? ['-e', 'TRACY_CONTENT_API_SCALARS=1'] : []
  const r = await deps.run(
    ...dockerCommand(deps.env, [
      'exec',
      '-u',
      'www-data',
      '-w',
      '/app',
      '-e',
      'HOME=/tmp',
      ...scalars,
      container,
      'node_modules/.bin/astro',
      'build'
    ])
  )
  if (r.code !== 0)
    return {
      ok: false,
      detail: `the build failed (exit ${String(r.code)}): ${(r.stderr || r.stdout).trim().slice(-600)}`
    }
  const restarted = await restartSite(job.targetSiteKey, deps)
  // A rebuild is how an edited token reaches the page, so the record follows it (ADR 0023): the
  // ruler `tracy_design_check` measures by must be the look the site now wears. tracy-web's record
  // too — the folder's copy is refreshed FROM it before every check, so a folder-only update would
  // be undone at the next pull.
  if (restarted.ok && typeof deps.root === 'string') {
    let record = null
    try {
      record = await recordTemplateLook(deps.root, {
        template: await templateOf(deps.root, siteFileReader(job.targetSiteKey, deps)),
        read: siteFileReader(job.targetSiteKey, deps),
        home: siteHomeReader(job.targetSiteKey, deps),
        wroteBy: 'site.rebuild'
      })
    } catch (error) {
      // The record is a convenience and the rebuild already happened; `recordTemplateLook` catches
      // its own I/O, so what lands here is a wiring fault — logged, never swallowed.
      ;(deps.warn ?? console.warn)(
        `[site-design] template look not recorded after rebuild: ${error instanceof Error ? error.message : String(error)}`
      )
    }
    await sendDesign(deps.putDesign, job.targetSiteKey, record, deps.warn)
  }
  // 🔒 BUILT ANYWAY, AND THE ANSWER SAYS WHAT TO FIX FIRST: a customer's edit is never held back, but a
  // class that pins a value the slot owns is named with its place and its replacement, and the `next`
  // puts the fix and one more rebuild before the reply to the customer.
  const pins = restarted.ok ? slotPins(/** @type {any} */ (pinsRead)) : []
  return {
    ok: restarted.ok,
    detail: `built; ${restarted.detail}${pins.length > 0 ? ` ${pins.length} class${pins.length === 1 ? '' : 'es'} to change before the reply: see findings.` : ''}`,
    // a site wearing no system is judged against its template's roles (`slotPins`): the `next` says so
    ...(pins.length > 0 ? { findings: pins, next: pinsNext(pins, typeof pinsRead?.slot === 'string') } : {})
  }
}

/** Where a picture lives, as a person says it: `home.hero_image`, or `projects/<slug>.image`. */
const SPOT = /^[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9-]*)?\.[a-z][a-z0-9_]*$/

/** @type {NonNullable<import('@tracy/site-build-core/host').CmsSpec['requests']>} */
export const requests = {
  'picture.redraw': {
    recipe: 'personalize',
    hint:
      '{pictures:{"home.hero_image":"loaves fresh from the oven"}} — draws THOSE pictures again, ' +
      'each from one sentence saying what it should show; every other picture and all the words ' +
      'are left as they are. Names: home.hero_image · home.about_image · about.hero_image · ' +
      'about.safety_image · careers.hero_image · projects.featured_image, or one entry, e.g. ' +
      '"projects/<slug>.image". Needs a picture model on this deployment; without one the build ' +
      'says so and changes nothing.',
    change(input) {
      const pictures = input.pictures
      if (!pictures || typeof pictures !== 'object' || Array.isArray(pictures))
        throw new Error('picture.redraw needs pictures: { "<page>.<field>": "what it should show" }')
      const asked = Object.entries(/** @type {Record<string, unknown>} */ (pictures))
      if (asked.length === 0) throw new Error('picture.redraw needs at least one picture to draw')
      for (const [where, what] of asked) {
        if (!SPOT.test(where))
          throw new Error(
            `"${where}" does not name a picture. Use <page>.<field>, e.g. home.hero_image, or <collection>/<slug>.<field>.`
          )
        if (typeof what !== 'string' || what.trim() === '')
          throw new Error(`say in one sentence what ${where} should show`)
      }
      return { answers: { pictures: Object.fromEntries(asked) }, stage: 'personalize' }
    }
  },
  'content.revise': {
    recipe: 'personalize',
    hint:
      "{answers:{name?,sector?,contact?}} — the customer's own details changed; the site's words " +
      'are written again from them. It does not redraw pictures (picture.redraw does that).',
    change(input) {
      const answers = input.answers
      if (!answers || typeof answers !== 'object' || Array.isArray(answers))
        throw new Error('content.revise needs answers containing the customer brief changes')
      // A picture.redraw before this left `pictures` in the job's answers; cleared here, or every
      // revise after a redraw would only draw.
      return {
        answers: { .../** @type {Record<string, unknown>} */ (answers), pictures: null },
        stage: 'personalize'
      }
    }
  },
  'site.restart': {
    recipe: 'container',
    hint:
      "{} — restarts this site's own web container and waits until it answers again (under two " +
      'minutes). For after a change to the site that the running process has not picked up.',
    perform(_input, job, deps) {
      return restartSite(job.targetSiteKey, deps)
    }
  },
  'site.rebuild': {
    recipe: 'container',
    hint:
      "{} — builds the site's application from its own code (`astro build` inside the site's " +
      'container, as the site user, one to three minutes), then restarts it. For after editing ' +
      'files under /app — views, components, config, styles (a colour is a token in ' +
      "src/styles/tokens.css, unless the site's design-system slot sets it: then the context's " +
      "Design system line says how, the element's leftover literals included). Content in the admin " +
      'needs no rebuild.',
    perform(_input, job, deps) {
      return rebuildSite(job, deps)
    }
  },
  'site.inspect': {
    recipe: 'container',
    hint:
      '{} — what Tracy wrote into this site and where it stands now: every personalize pass ' +
      '(applyIds, latest) and each field with its origin (customer · derived · generated · ' +
      'empty), the value before and after, and whether the site still holds it (live: same · ' +
      'edited · gone). Read it before promising a revert; it writes nothing.',
    async perform(_input, job, deps) {
      const r = await personalizeTool(job.targetSiteKey, ['--inspect'], deps)
      if (!r.ok) return r
      const fields = Array.isArray(r.result.fields) ? r.result.fields : []
      const edited = fields.filter((/** @type {{live?: unknown}} */ f) => f?.live === 'edited').length
      return {
        ok: true,
        result: inspectSummary(r.result),
        detail: `${String(fields.length)} field(s) across ${String(Array.isArray(r.result.applyIds) ? r.result.applyIds.length : 0)} pass(es); latest ${String(r.result.latest ?? 'none')}${edited > 0 ? `; ${String(edited)} edited by hand since` : ''}`
      }
    }
  },
  'site.revert': {
    recipe: 'container',
    hint:
      '{applyId:"pers-3"} — puts back the values a personalize pass replaced, in reverse order, ' +
      'only when that pass is the latest and no field it wrote was edited by hand since ' +
      '(site.inspect shows both). Refused otherwise, with the field that stands in the way.',
    async perform(input, job, deps) {
      const applyId = typeof input.applyId === 'string' ? input.applyId.trim() : ''
      if (!APPLY_ID.test(applyId))
        return {
          ok: false,
          detail:
            'site.revert needs applyId: the id of a personalize pass, as site.inspect lists them (e.g. pers-3)'
        }
      const r = await personalizeTool(job.targetSiteKey, ['--revert', applyId], deps)
      if (!r.ok) return r
      // The tool's own refusal (exit 4, `ok: false, why`) passes through as it is: the reason is the
      // tool's, and it names the field.
      if (r.result.ok !== true)
        return {
          ok: false,
          result: r.result,
          detail:
            typeof r.result.why === 'string'
              ? r.result.why
              : `revert of ${applyId} refused (exit ${String(r.code)})`
        }
      // The tool answers a COUNT (`reverted: 2149`) beside the steps (`done: [...]`); an older
      // answer listed them. Read either — and hand the agent the count, not two thousand steps.
      const reverted =
        typeof r.result.reverted === 'number'
          ? r.result.reverted
          : Array.isArray(r.result.reverted)
            ? r.result.reverted.length
            : 0
      const { done: _steps, ...rest } = /** @type {Record<string, unknown>} */ (r.result)
      return {
        ok: true,
        result: rest,
        detail: `${applyId} reverted: ${String(reverted)} change(s) put back`
      }
    }
  }
}
