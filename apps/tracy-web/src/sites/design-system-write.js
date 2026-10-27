/**
 * The Design system doors' writes (`design-system.js`): putting a system on a running site and undoing
 * the newest one. The panel's press, the chat route and the end of a new site's build all write through
 * here — same bytes (the slot emitters', `lib/ds-slot.js`), same rows, same undo.
 *
 * ONE RUN IN THE SITE'S CONTAINER PER PRESS (measured 11/10/2026,
 * `tasks/evidence/design-system-button-2026-10-11/timing.md`): an apply used to read the site first
 * (its template picks the slot contract), then write, then the panel read again — three `docker
 * exec`, three WordPress boots. Now the template comes with the press and the write's own run reads
 * the template, the look before and the look after; a template that moved since the panel read it
 * writes nothing and says what runs now (`DS_TEMPLATE_MOVED`), and only then are the bytes made again
 * and written once more.
 *
 * Every write takes the site's write lease (it never lands in the middle of an agent's turn), and a
 * landed write is one `site_write` row (via `ds-slot`) — its own Site changes row: the row's group is
 * the press (`design-system-<applyId>`, the undo `design-system-undo-<applyId>`), never the person,
 * so two applies are two rows — plus its `site_design_system` row.
 */
import { randomBytes } from 'node:crypto'

import { DS_TEMPLATE_LOCKED, LOCKED_REASON } from '../lib/design-system-customer-lock.js'
import { DS_IMPORTED_SITE, IMPORTED_REASON, isImportedSite } from '../lib/design-system-imported-site.js'
import { DOOR_WAIT_MS } from './design-system-fit.js'
import { swapsFor, withSwaps } from './design-system-glyphs.js'
import {
  applySession,
  dsFilesOf,
  libraryIdOf,
  slotIdOf,
  TEMPLATE_DEFAULT_ID,
  TEMPLATE_DEFAULT_NAME,
  undoSession,
  wornOf
} from './design-system-ids.js'

/**
 * How long an apply waits for `seen` — the first page load after the write — before it answers without
 * it (`seen: null`, "the page could not be read in time").
 *
 * 🔒 THE PRESS NEVER WAITS FOR A COLD PAGE. The write itself is a ~0.1 s file write on EmDash, yet the
 * walkthrough's first two applies on `dswalkem02` took 8.4 s and 5.5 s (tasks/evidence/
 * ds-walkthrough-2026-10-11, finding 11): the site's server had been restarted by a rebuild seven
 * minutes before and served nothing since, so the door's one page load was that server's first renders
 * (5–8 s; ~0.1 s once warm). The customer's notice waited on them. A page that takes longer than this
 * is still rendering when the door answers; the write is already confirmed by the host's own read-back.
 * Warm renders measured 0.1–0.3 s on EmDash and ~0.2 s on WordPress (11/10/2026).
 */
export const SEEN_WAIT_MS = 1500
/** How long the read of the site's language and of Google's cuts may hold a write before it goes as the system made it. */
export const GLYPHS_WAIT_MS = 12_000

/**
 * What the agent is told when the operator has closed the chat route (`chat-design-system`): the same
 * words the lane's own refusals carry (`tracy-site-tools`, `tracy-design-inspiration`).
 */
export const CHAT_ROUTE_OFF_MESSAGE =
  'Applying a design system through the chat is turned off. Change nothing; tell the customer in one ' +
  "plain sentence, in their language, to use the Design system row on the site's start screen."

/**
 * `seen`'s answer, or null when it failed or did not come within `ms`. The read itself is left to end on
 * its own (route.js gives it 10 s): a cold render cut off would leave the next visitor the same cold
 * render, while one left to finish warms the site for them.
 * @param {Promise<boolean | null>} read
 * @param {number} ms
 * @returns {Promise<boolean | null>}
 */
export function seenWithin(read, ms) {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer
  const late = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), ms)
  })
  return Promise.race([read.catch(() => null), late]).finally(() => clearTimeout(timer))
}

/** A door's answer before it is sent: the build's write (`applyAs`) reads the same shape the door sends. */
export const answer = (/** @type {any} */ body, status = 200) => ({ status, body })

/**
 * @param {{
 *   ds: any,
 *   lease: { take: (q: any) => Promise<{ ok: boolean, fresh?: boolean, holder?: any }>, release: (q: any) => Promise<void> },
 *   record: (row: any) => Promise<unknown>,
 *   store: {
 *     insert: (row: any) => Promise<void>,
 *     latest: (siteKey: string) => Promise<any | null>,
 *     markUndone: (siteKey: string, undoId: string, by: string) => Promise<void>
 *   },
 *   fit: ReturnType<typeof import('./design-system-fit.js').designSystemFit>,
 *   offered: () => Promise<any[]>,
 *   namesOf: () => Promise<Map<string, string>>,
 *   viewOf: (q: any) => Promise<any>,
 *   forgetPreviews: (siteKey: string) => void,
 *   platforms: Set<string>,
 *   seen?: (site: any, slotId: string) => Promise<boolean | null>,
 *   seenWaitMs?: number,
 *   lockedFor?: (email: string | null | undefined, templateKey: string | null | undefined) => Promise<boolean>
 * }} deps see `mountDesignSystem`
 */
export function designSystemWrites(deps) {
  const { ds, lease, record, store, offered, namesOf, viewOf, forgetPreviews, platforms } = deps
  const { job, fitOf, versionOf, versionPart, rawOf, survey } = deps.fit
  /** One press per site at a time, inside this process (the lease covers the other writers). */
  const running = new Set()

  /**
   * The press guard and the site's write lease every write shares: one write per site at a time in this process, and
   * none in the middle of an agent's turn. `work` answers with {@link answer}'s shape, and so does every refusal here.
   * @param {{ siteKey: string, site: any, actor: string }} w
   * @param {() => Promise<{ status: number, body: any }>} work
   */
  async function guarded({ siteKey, site, actor }, work) {
    if (!platforms.has(String(site.platform))) return answer({ code: 'PLATFORM_HAS_NO_SLOT' }, 409)
    if (running.has(siteKey)) return answer({ code: 'SITE_BUSY' }, 409)
    running.add(siteKey)
    const leaseSession = `design-system:${actor}`
    try {
      const held = await lease.take({ siteKey, sessionId: leaseSession, actor })
      if (!held.ok) return answer({ code: 'SITE_BUSY', holder: held.holder?.holder_actor ?? null }, 409)
      try {
        return await work()
      } finally {
        if (held.fresh) await lease.release({ siteKey, sessionId: leaseSession })
      }
    } finally {
      running.delete(siteKey)
    }
  }

  /**
   * The library entry a request names, or why it may not be worn: only an offered (Refero) system that passed the
   * quality gate. Anything else — an OpenDesign id, a refused or unknown one, not a string — is `DS_UNKNOWN`, or
   * `DS_REFUSED` for an offered row the gate refuses.
   * @param {unknown} raw
   * @returns {Promise<{ ok: true, id: string, entry: any } | { ok: false, code: string }>}
   */
  async function entryOf(raw) {
    const id = typeof raw === 'string' ? libraryIdOf(raw) : ''
    const entry = id ? (await offered()).find((s) => s.id === id) : undefined
    if (!entry) return { ok: false, code: 'DS_UNKNOWN' }
    if (!entry.ok) return { ok: false, code: 'DS_REFUSED' }
    return { ok: true, id, entry }
  }

  /**
   * Put system `id` on a running site: the one write the panel's press, the chat route and the build of a new site
   * share (same bytes, same rows, same undo). Runs under {@link guarded}.
   * @param {{ site: any, siteKey: string, actor: string, id: string, entry: any, hint: string | null,
   *   channel: 'button' | 'chat', at?: string, auth?: any }} p - `at`: where the write came from when it was not a
   *   press (`create`: the end of a new site's build), kept on the Site changes row. `auth`: the seat, for the
   *   panel's next read (`read`); none (the build), no read is answered.
   */
  async function applySystem({ site, siteKey, actor, id, entry, hint, channel, at, auth }) {
    // An imported site takes no new system, staff included (`lib/design-system-imported-site.js`): before any read.
    if (isImportedSite(site)) return answer({ code: DS_IMPORTED_SITE, reason: IMPORTED_REASON }, 403)
    const names = await namesOf()
    const cannotWear = (templateKey, fit) =>
      answer(
        {
          code: 'DS_TEMPLATE_CANNOT_WEAR',
          reason: fit.reason,
          template: templateKey,
          ...versionPart(fit)
        },
        409
      )
    // The customer lock (`lib/design-system-customer-lock.js`): a template customers may not put a new system on is
    // refused for the person this write is made for, before anything is emitted or written; staff pass.
    const locked = async (templateKey) => (deps.lockedFor ? await deps.lockedFor(actor, templateKey) : false)
    const lockedOut = (templateKey) =>
      answer({ code: DS_TEMPLATE_LOCKED, reason: LOCKED_REASON, template: templateKey }, 403)

    // Which template the bytes are for. EmDash: its quickstart tag, no run needed. WordPress /
    // Joomla: the template the panel's read said (checked by the write's own run), else one read.
    /** @type {any} */
    let read = null
    let templateKey
    let fit
    /** @type {string[] | null} */
    let templates = null
    // A hint is judged by its template and, on Joomla, by the site's own release (its row); on
    // WordPress the theme's version is checked by the write's own run (`minTheme`, `maxTheme`).
    const hinted =
      hint && site.platform === 'joomla'
        ? ds.contractFor(hint, versionOf(site, null))
        : hint && site.platform === 'wordpress'
          ? ds.contractFor(hint)
          : null
    if (site.platform === 'emdash') ({ templateKey, fit } = fitOf(site, null))
    else if (hinted && 'contract' in hinted && ds.rawTemplatesOf(hint).length > 0) {
      templateKey = hint
      fit = hinted
      templates = ds.rawTemplatesOf(hint)
    } else {
      const s = await survey(site)
      if (s.failed) return answer({ code: 'DS_READ_FAILED', reason: s.failed }, 502)
      ;({ read, templateKey, fit } = s)
      templates = rawOf(site, read)
    }
    if ('reason' in fit) return cannotWear(templateKey, fit)
    if (await locked(templateKey)) return lockedOut(templateKey)

    /** Make the bytes for one contract and write them once: the host's answer, or a refusal. */
    let fontsSwapped = []
    const put = async (contract, expect) => {
      let out = await ds.emitFor({ platform: site.platform, contract, id, fontFaces: ds.fontFaces })
      if (!out.ok) return { refusal: answer({ code: out.code }, 400) }
      // A family that cannot draw the site's language is replaced whole in these very bytes (`design-system-glyphs.js`);
      // a read that fails or runs long leaves them as the system made them.
      if (deps.glyphReader) {
        let timer
        const found = await Promise.race([
          (async () => swapsFor({ out, reader: await deps.glyphReader(site) }))().catch(() => null),
          new Promise((resolve) => {
            timer = setTimeout(() => resolve(null), deps.glyphsWaitMs ?? GLYPHS_WAIT_MS)
          })
        ]).finally(() => clearTimeout(timer))
        if (found?.swaps?.length) {
          out = await withSwaps(out, found.swaps, { fontFaces: ds.fontFaces })
          fontsSwapped = found.swaps.map(({ from, to, subset }) => ({ from, to, subset }))
        }
      }
      const payload =
        site.platform === 'emdash'
          ? { system: out.id, css: out.css }
          : site.platform === 'wordpress'
            ? { system: out.id, slug: out.slug, name: out.name, variation: out.variation }
            : { system: out.id, html: out.html, module: out.module }
      if (expect) payload.templates = expect
      // WordPress: the theme releases the contract wears (first and last confirmed), checked in the
      // same run, so a theme updated past either bound since the read writes nothing.
      const mins = site.platform === 'wordpress' ? ds.minVersionOf(templateKey) : null
      if (mins) payload.minTheme = mins
      const tops = site.platform === 'wordpress' ? (ds.maxVersionOf?.(templateKey) ?? null) : null
      if (tops) payload.maxTheme = tops
      return { out, answer: await job(site, { mode: 'apply', payload }, DOOR_WAIT_MS.apply) }
    }
    let wrote = await put(fit.contract, templates)
    if (wrote.refusal) return wrote.refusal
    if (wrote.answer.code === 'DS_TEMPLATE_MOVED') {
      // Nothing was written: the site runs another template than the panel read. Its own run said
      // which, so the bytes are made for that one and written once more (no read in between).
      read = wrote.answer
      ;({ templateKey, fit } = fitOf(site, read))
      if ('reason' in fit) return cannotWear(templateKey, fit)
      if (await locked(templateKey)) return lockedOut(templateKey)
      wrote = await put(fit.contract, rawOf(site, read))
      if (wrote.refusal) return wrote.refusal
      if (wrote.answer.code === 'DS_TEMPLATE_MOVED') return answer({ code: 'SITE_BUSY' }, 409)
    }
    const { out, answer: said } = wrote
    // Whatever the write did, the site's kept previews may no longer show what it wears.
    forgetPreviews(siteKey)
    const where = at ? { at } : {}
    if (said.failed) {
      // Silence is not a no: the write may have landed. Recorded as unknown, said as failed.
      const sessionId = applySession(randomBytes(6).toString('hex'))
      await record({
        actor,
        action: 'site.design-system.apply',
        siteKey,
        detail: { system: id, ok: false, reason: said.failed, sessionId, ...where },
        write: {
          sessionId,
          outcome: 'unknown',
          target: { kind: 'design-system', id, title: entry.name, channel, ...where },
          via: 'ds-slot',
          action: 'design-system.apply'
        }
      })
      return answer({ code: 'DS_WRITE_FAILED', reason: said.failed }, 502)
    }
    if (said.ok !== true) return answer({ code: said.code ?? 'DS_WRITE_REFUSED' }, 409)
    // What the site wore just before: read in the write's own run (an older host does not say it;
    // then the read before, when there was one).
    const before = wornOf(said.previous !== undefined ? said.previous : (read?.slot ?? null), names)
    const sessionId = applySession(said.undoId)
    const files = dsFilesOf(said.files)
    const [seen] = await Promise.all([
      // Whether the page the site serves now carries the slot's marker: the first load after the
      // write, while the rows are written.
      deps.seen
        ? seenWithin(deps.seen(site, slotIdOf(id)), deps.seenWaitMs ?? SEEN_WAIT_MS)
        : Promise.resolve(null),
      (async () => {
        await store.insert({
          siteKey,
          undoId: said.undoId,
          platform: site.platform,
          systemId: id,
          systemName: entry.name,
          previousId: before?.id ?? before?.slotId ?? null,
          previousName: before?.name ?? null,
          actor
        })
        await record({
          actor,
          action: 'site.design-system.apply',
          siteKey,
          detail: {
            system: id,
            name: entry.name,
            previous: before?.slotId ?? null,
            applyId: said.undoId,
            ...(fontsSwapped.length > 0 ? { fontsSwapped } : {}),
            sessionId,
            ok: true,
            ...where
          },
          write: {
            sessionId,
            outcome: 'ok',
            target: {
              kind: 'design-system',
              id,
              title: entry.name,
              applyId: said.undoId,
              channel,
              // What the site wore just before (null: the template's own look): the row says
              // "Switched … from" it. The files the job wrote: a later seal of them is this row's.
              from: before ? { id: before.slotId, name: before.name } : null,
              ...(files.length > 0 ? { files } : {}),
              ...where
            },
            via: 'ds-slot',
            action: 'design-system.apply'
          }
        })
      })()
    ])
    return answer({
      ok: true,
      applyId: said.undoId,
      worn: wornOf(said.slot ?? null, names),
      previous: before,
      changed: said.changed !== false,
      seen,
      ...(site.platform === 'wordpress' ? { fontsLoaded: out.fontsLoaded === true } : {}),
      // the system's families the site's language needed replaced, e.g. Bebas Neue → Oswald on a Vietnamese site
      ...(fontsSwapped.length > 0 ? { fontsSwapped } : {}),
      ...(auth
        ? {
            read: await viewOf({
              site,
              siteKey,
              auth,
              lib: await offered(),
              slot: said.slot,
              templateKey,
              fit
            })
          }
        : {})
    })
  }

  /**
   * Take the worn system off: the Template default card's press (15/10/2026), back to the template's own look. One
   * host run (`site-ds-slot` mode `clear`) that keeps an undo entry like an apply's, so this is an apply of its own:
   * its `site_design_system` row (system `template-default`, the system taken off as `previous`), its Site changes
   * row, and its undo puts the system back. No contract is needed and the customer lock does not apply: the lock
   * closes putting a NEW system on, never going back to the template's look. Runs under {@link guarded}.
   * @param {{ site: any, siteKey: string, actor: string, channel: 'button' | 'chat', auth?: any }} p
   */
  async function clearSystem({ site, siteKey, actor, channel, auth }) {
    const said = await job(site, { mode: 'clear' }, DOOR_WAIT_MS.apply)
    forgetPreviews(siteKey)
    const target = { kind: 'design-system', id: TEMPLATE_DEFAULT_ID, title: TEMPLATE_DEFAULT_NAME, channel }
    if (said.failed) {
      // Silence is not a no: the system may have come off. Recorded as unknown, said as failed.
      const sessionId = applySession(randomBytes(6).toString('hex'))
      await record({
        actor,
        action: 'site.design-system.apply',
        siteKey,
        detail: { system: TEMPLATE_DEFAULT_ID, ok: false, reason: said.failed, sessionId },
        write: { sessionId, outcome: 'unknown', target, via: 'ds-slot', action: 'design-system.apply' }
      })
      return answer({ code: 'DS_WRITE_FAILED', reason: said.failed }, 502)
    }
    // `DS_NOTHING_WORN`: already the template's look; `DS_NO_TEMPLATE_LOOK`: a WordPress site whose look from
    // before its first system this host never kept. Neither wrote anything.
    if (said.ok !== true) return answer({ code: said.code ?? 'DS_WRITE_REFUSED' }, 409)
    const names = await namesOf()
    const before = wornOf(said.previous ?? null, names)
    const sessionId = applySession(said.undoId)
    await store.insert({
      siteKey,
      undoId: said.undoId,
      platform: site.platform,
      systemId: TEMPLATE_DEFAULT_ID,
      systemName: TEMPLATE_DEFAULT_NAME,
      previousId: before?.id ?? before?.slotId ?? null,
      previousName: before?.name ?? null,
      actor
    })
    await record({
      actor,
      action: 'site.design-system.apply',
      siteKey,
      detail: {
        system: TEMPLATE_DEFAULT_ID,
        name: TEMPLATE_DEFAULT_NAME,
        previous: before?.slotId ?? null,
        applyId: said.undoId,
        sessionId,
        ok: true
      },
      write: {
        sessionId,
        outcome: 'ok',
        target: {
          ...target,
          applyId: said.undoId,
          from: before ? { id: before.slotId, name: before.name } : null
        },
        via: 'ds-slot',
        action: 'design-system.apply'
      }
    })
    const { templateKey, fit } = fitOf(site, said)
    return answer({
      ok: true,
      applyId: said.undoId,
      worn: wornOf(said.slot ?? null, names),
      previous: before,
      changed: said.changed !== false,
      seen: null,
      ...(auth
        ? {
            read: await viewOf({
              site,
              siteKey,
              auth,
              lib: await offered(),
              slot: said.slot,
              templateKey,
              fit
            })
          }
        : {})
    })
  }

  /**
   * Undo apply `applyId` of site `siteKey` as `auth`: only the site's newest apply, not undone yet, and
   * only while the site still holds what it wrote. Runs under {@link guarded}.
   * @param {{ site: any, siteKey: string, auth: any, applyId: string, channel: 'button' | 'chat' }} p
   */
  async function undoLatest({ site, siteKey, auth, applyId, channel }) {
    const last = await store.latest(siteKey)
    // Only the newest: an older apply's "before" is a look a newer one already replaced.
    if (!last || last.undo_id !== applyId) return answer({ code: 'DS_NOT_LATEST' }, 409)
    if (last.undone_at) return answer({ code: 'DS_UNDO_USED' }, 409)
    const back = await job(site, { mode: 'undo', id: applyId }, DOOR_WAIT_MS.undo)
    forgetPreviews(siteKey)
    if (back.failed) return answer({ code: 'DS_WRITE_FAILED', reason: back.failed }, 502)
    if (back.ok !== true) {
      if (back.code === 'DS_UNDO_USED') await store.markUndone(siteKey, applyId, auth.email)
      return answer({ code: back.code ?? 'DS_UNDO_REFUSED' }, 409)
    }
    await store.markUndone(siteKey, applyId, auth.email)
    const sessionId = undoSession(applyId)
    await record({
      actor: auth.email,
      action: 'site.design-system.undo',
      siteKey,
      detail: { applyId, system: last.system_id, back: last.previous_id ?? null, sessionId, ok: true },
      write: {
        sessionId,
        outcome: 'ok',
        // The row names the system taken off; `back` says what the site wears again.
        target: {
          kind: 'design-system',
          id: last.system_id,
          title: last.system_name,
          applyId,
          back: last.previous_id ?? null,
          // An undo writes no webroot file (WordPress puts back its database rows only; the
          // variation stays on disk, unworn), so it names none.
          channel
        },
        via: 'ds-slot',
        action: 'design-system.undo'
      }
    })
    const lib = await offered()
    const names = await namesOf()
    // The undo's own run said the template (an older host does not: then the panel reads again).
    const said = site.platform === 'emdash' || 'stylesheet' in back || 'template' in back
    const { templateKey, fit } = fitOf(site, back)
    return answer({
      ok: true,
      worn: wornOf(back.slot ?? null, names),
      ...(said ? { read: await viewOf({ site, siteKey, auth, lib, slot: back.slot, templateKey, fit }) } : {})
    })
  }

  return { guarded, entryOf, applySystem, clearSystem, undoLatest }
}
