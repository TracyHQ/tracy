// The looker step of a picture run (#343, ADR 0043 section 3): every finished picture of a checked manifest is looked
// at once, in parallel (LOOK_CONCURRENCY at a time), each in a fresh conversation that sees only the picture at display
// size and the plan's words (looker-call.js). Looked: owner photos, extended owner photos and drawn pictures. Not
// looked: icons and initials (code drew them from a fixed library or letters), hidden frames, and twins, which take
// their source's look.
//
// Each look is written on its manifest entry: `seen` (the sentence the spec names) and `looker: { verdict, faults,
// seen }` (what the reading page reads). A rejection is a failure of rule L01 at the frame, with its fault names, added
// to the round's picture check result; the result is split again (picker-picks.js splitForPicker), so a rejected frame
// the picker placed goes back to the picker in the next fix round, and any other rejection stays in `notForPicker`. A
// look that could not be read (a failed call, an answer out of form) is asked once more; still unreadable (or its file
// gone from the store), it is a fail with the fault "look unreadable", so L01 never passes a picture nobody looked at. The
// manifest's `looker` holds the door's model and snapshot, the prompt hash and one record per picture (frame, file hash,
// time, cost, cached); `cost.looker` and `timing.looker` are their sums, and `paid` (what this save spent, cached looks
// excluded) is added to the run's cost by the caller.
// When the run asks for alts (`altAsk`, alt-ask.js), each look also writes the alt of the picture it saw, cleaned and held to
// the frame's limit, as the entry's `alt` (a twin takes its source's); the export hands it to the write step, which
// writes it over the writer's (ADR 0043 section 3f).
// When the run was given a writer copy file, `altNotes` compares its alts with the seen sentences (alt-notes.js); without
// one, the manifest's `altCheck` says the comparison is deferred to the site check's `alt-matches-picture` (step 11).
//
// The looks run where a checked round is saved (looker-round.js withLooker). Every readable look is kept in the bench's
// file store (runs/<run id>/looks/<key>.json, the key a hash of the picture, its display size, the words, the model and
// the prompt), so a resumed run or a later round pays once per picture.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { cleanAlt } from './alt-ask.js'
import { altNotesFor } from './alt-notes.js'
import { hasTextOver } from './darken.js'
import { fileStore, sha256Hex } from './file-store.js'
import {
  askLooker,
  isAnyReal,
  LOOK_UNREADABLE,
  lookImage,
  lookWords,
  retainedRejectionProblem,
  surfaceFacts
} from './looker-call.js'
import { letteringRejection, negativeLookCache, negativeLookKey } from './looker-negative-cache.js'

/**
 * Looks in flight at once. Each look is one vision call that waits on the provider (35 to 56 s each on the local stand,
 * 12/11/2026), so the pictures step's wall time is the looks divided by this. Once the shortlist kept the business's
 * scene-text photos, a Central Padel build looked at every frame's real photo: 3483 s of looks, 42 minutes of picture
 * step at 4 at once. Eight halves that wait; the provider calls are independent and the step's verdicts do not change.
 */
export const LOOK_CONCURRENCY = 8
/** The sources whose picture the looker checks. */
export const LOOKED_SOURCES = new Set(['owner-photo', 'owner-photo-extended', 'drawn'])
export const LOOKER_RULE = Object.freeze({ id: 'L01', title: 'The looker passes every finished picture' })

const whereOf = (list, frame) => (list === 'siteSettings' ? `siteSettings ${frame}` : frame)

/**
 * What the looker is told about a cut-out (#346): whether the site's text sits over its box (the kit measured text
 * over the picture, or marks it), and how much of the box the template's figure (the kit's clear share) and this one
 * cover.
 */
export function cutoutFacts(frame, entry) {
  const clear = frame?.kindEvidence?.clearShare
  return {
    textOver: frame?.kindEvidence?.overPicture === true || hasTextOver(frame),
    figure: Number.isFinite(entry.cutout?.figure) ? entry.cutout.figure : null,
    demoFigure: Number.isFinite(clear) ? Math.round((1 - clear) * 1000) / 1000 : null
  }
}

/**
 * A bound on work in flight: `run(fn)` starts `fn` once fewer than `n` earlier ones are still running, in the order
 * asked, and settles as it does. `limiter(1)` runs one at a time.
 * @param {number} n
 * @returns {<T>(fn: () => T | Promise<T>) => Promise<T>}
 */
export function limiter(n) {
  const most = Math.max(1, n)
  const queue = []
  let running = 0
  const next = () => {
    while (running < most && queue.length) {
      const { fn, resolve, reject } = queue.shift()
      running++
      Promise.resolve()
        .then(fn)
        .then(resolve, reject)
        .finally(() => {
          running--
          next()
        })
    }
  }
  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject })
      next()
    })
}

/** Run `work` over `items`, at most `n` at a time, keeping the order of the results. */
export async function inParallel(items, n, work) {
  const out = Array.from({ length: items.length })
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await work(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker))
  return out
}

/**
 * The looker of one run.
 * @param {{ door: object, snapshot?: object | null, prompt: { text: string, sha256: string }, storeDir: string,
 *   runId: string, idx: object, alts: Array<{ frame: string, text: string }> | null, fetchImpl?: typeof fetch,
 *   concurrency?: number, altAsk?: { language: string, business: string | null, limit: (frame: string) => number } | null }} input
 *   `idx` the picture check's index of plan and kit; `alts` the writer's alts, or null; `altAsk` asks each look for an alt
 */
export function createLooker({
  door,
  snapshot = null,
  prompt,
  storeDir,
  runId,
  idx,
  alts,
  altAsk = null,
  fetchImpl = fetch,
  concurrency
}) {
  const store = fileStore(storeDir)
  const runDir = path.join(store.dir, 'runs', String(runId))
  const kept = (key) => path.join(runDir, 'looks', `${key}.json`)
  const negative = negativeLookCache({ dir: runDir, model: door.model })
  // The provider calls in flight, for every look of this looker at once: the fallback ladder looks at each frame's
  // picture as soon as it is placed (ladder-step.js), many calls of `look` and `ahead` side by side, so the bound is
  // the looker's, not one call's.
  const asking = limiter(concurrency ?? LOOK_CONCURRENCY)
  // The looks being taken now, by save (`memo`) and question key: a second ask of the same question waits for the
  // first instead of paying again.
  const taking = new WeakMap()
  const takingOf = (memo) => {
    if (!taking.has(memo)) taking.set(memo, new Map())
    return taking.get(memo)
  }

  // What a look at a picture asks, and the key it is kept under: the picture, its display size and the frame's words.
  function questionOf(entry) {
    const frame = idx.frames.get(entry.frame)
    const wish = idx.wishes.get(entry.frame)
    const words = lookWords(wish)
    // An any-real frame takes any real owner photo (spec #336): never failed for its scene.
    const anyReal = isAnyReal(wish)
    const box = { width: frame?.width ?? entry.width, height: frame?.height ?? entry.height }
    const realPart = entry.source === 'owner-photo-extended' ? (entry.realPart ?? null) : null
    const cutout = entry.cutout ? cutoutFacts(frame, entry) : null
    // A cut-out says where the text sits in its own lines; any other picture is told its frame's surface (section 3e).
    const surface = cutout ? null : surfaceFacts(frame)
    const alt = altAsk
      ? { language: altAsk.language, business: altAsk.business, limit: altAsk.limit(entry.frame) }
      : null
    const key = sha256Hex(
      JSON.stringify([
        entry.sha256,
        box,
        words,
        realPart,
        door.model,
        prompt.sha256,
        ...(cutout ? [cutout] : []),
        ...(anyReal ? ['any-real'] : []),
        ...(surface ? [surface] : []),
        ...(alt ? [alt] : [])
      ])
    )
    return { key, words, box, realPart, cutout, anyReal, surface, alt }
  }

  async function lookAt(list, entry, memo) {
    const question = questionOf(entry)
    const { key, alt } = question
    // A look already taken in this save (the fallback ladder looks again after each rung), readable or not.
    const limit = alt?.limit ?? null
    if (memo?.has(key)) return { list, entry, said: memo.get(key), cached: true, limit }
    if (!memo) return { ...(await lookFresh(list, entry, question)), limit }
    // The same look being taken in this save right now (another frame's picture, a look-ahead): the same look, which
    // the first ask records and pays.
    const inFlight = takingOf(memo)
    const pending = inFlight.get(key)
    if (pending) return { list, entry, said: (await pending).said, cached: true, limit }
    const work = lookFresh(list, entry, question)
    inFlight.set(key, work)
    try {
      const looked = await work
      memo.set(key, looked.said)
      return { ...looked, limit }
    } finally {
      inFlight.delete(key)
    }
  }

  async function lookFresh(list, entry, { key, words, box, realPart, cutout, anyReal, surface, alt }) {
    const before = await readFile(kept(key), 'utf8')
      .then(JSON.parse)
      .catch(() => null)
    if (before && !letteringRejection(before)) return { list, entry, said: before, cached: true }
    const bytes = await store.readPicture(path.basename(entry.file))
    const unreadable = (problem, spent = {}) => ({
      verdict: 'fail',
      faults: [LOOK_UNREADABLE],
      seen: null,
      problem,
      model: door.model,
      ms: spent.ms ?? 0,
      costUsd: spent.costUsd ?? null
    })
    if (!bytes) return { list, entry, said: unreadable('the file is not in the store'), cached: false }
    const image = await lookImage(bytes, box, realPart, {
      checks: Boolean(cutout),
      background: cutout?.pageBackground ?? null
    })
    const renderKey = negativeLookKey({
      sourceSha256: entry.sha256,
      renderedSha256: sha256Hex(Buffer.from(image.base64, 'base64')),
      box,
      realPart,
      cutout,
      anyReal,
      surface,
      providerId: door.providerId,
      model: door.model,
      promptSha256: prompt.sha256
    })
    if (before) {
      // Derive a versioned proof from this exact historical question without modifying its paid record or alt.
      await negative.remember(renderKey, key, before)
      return { list, entry, said: before, cached: true }
    }
    const looked = await negative.run(renderKey, key, () => asking(askBoth))
    return { list, entry, ...looked }

    async function askBoth() {
      const ask = () =>
        askLooker({
          door,
          system: prompt.text,
          words,
          image,
          outlined: Boolean(realPart),
          cutout,
          anyReal,
          surface,
          alt,
          fetchImpl
        })
      const first = await ask()
      if (first.verdict) return { list, entry, said: await keep(key, first), cached: false }
      // Asked once more; both calls are counted.
      const second = await ask()
      const spent = {
        ms: first.ms + second.ms,
        costUsd:
          first.costUsd === null && second.costUsd === null
            ? null
            : (first.costUsd ?? 0) + (second.costUsd ?? 0)
      }
      if (second.verdict)
        return { list, entry, said: await keep(key, { ...second, ...spent }), cached: false }
      // An unreadable look is not kept: the next round or a resumed run asks again.
      return {
        list,
        entry,
        said: unreadable(`${first.problem}; asked again: ${second.problem}`, spent),
        cached: false
      }
    }
  }

  async function keep(key, said) {
    await mkdir(path.dirname(kept(key)), { recursive: true })
    await writeFile(kept(key), JSON.stringify(said))
    return said
  }

  /**
   * The manifest with every look written on it, and the looker's rule result. Never modifies `doc`. `memo` (a Map) keeps
   * every look of one save, so a picture looked at again after a rung of the fallback ladder is not asked twice.
   */
  async function look(doc, { memo = null } = {}) {
    const lists = {
      frames: doc.frames.map((e) => ({ ...e })),
      siteSettings: doc.siteSettings.map((e) => ({ ...e }))
    }
    const failures = []
    const notes = []
    const calls = []
    const todo = Object.entries(lists).flatMap(([list, entries]) =>
      entries.filter((e) => LOOKED_SOURCES.has(e.source) && e.file).map((e) => [list, e])
    )
    const looks = await inParallel(todo, concurrency ?? LOOK_CONCURRENCY, ([list, e]) =>
      lookAt(list, e, memo)
    )
    for (const { list, entry, said, cached, limit } of looks) {
      calls.push({
        frame: entry.frame,
        sha256: entry.sha256,
        model: said.model ?? door.model,
        ms: said.ms ?? 0,
        costUsd: said.costUsd ?? null,
        cached: Boolean(cached),
        ...(said.cacheSource ? { cacheSource: said.cacheSource } : {})
      })
      entry.seen = said.seen
      const alt = limit ? cleanAlt(said.alt, limit) : null
      if (alt) entry.alt = alt
      else delete entry.alt
      entry.looker = {
        verdict: said.verdict,
        faults: said.faults,
        seen: said.seen,
        ...(said.problem ? { problem: said.problem } : {})
      }
      if (said.dropped?.length)
        notes.push(`${entry.frame}: fault names outside the list dropped: ${said.dropped.join(', ')}`)
      // Keeping a fallback file does not accept a hard visual rejection. The existing
      // minor-fault tolerance remains explicit; wrong subjects and cut faces still fail L01.
      if (
        said.verdict === 'fail' &&
        entry.filledBy?.rung === 'best-rejected' &&
        !retainedRejectionProblem(entry)
      )
        notes.push(
          `${entry.frame}: kept with minor faults (${said.faults.join(', ')}): no better picture fits`
        )
      else if (said.verdict === 'fail')
        failures.push({
          where: whereOf(list, entry.frame),
          detail: said.problem
            ? `the looker could not look at the picture (${LOOK_UNREADABLE}): ${said.problem}`
            : `the looker rejected the picture (${said.faults.join(', ') || 'no fault named'}); it saw: ${said.seen}`,
          cause: 'looker'
        })
    }
    // Twins take their source's look.
    const bySource = new Map(lists.frames.map((e) => [e.frame, e]))
    for (const e of lists.frames)
      if (e.source === 'twin' && bySource.get(e.twinOf)?.looker) {
        const src = bySource.get(e.twinOf)
        e.seen = src.seen
        e.looker = { ...src.looker }
        if (src.alt) e.alt = src.alt
      }
    const sum = (key, of = calls) => of.reduce((n, c) => n + (Number.isFinite(c[key]) ? c[key] : 0), 0)
    const out = {
      ...doc,
      frames: lists.frames,
      siteSettings: lists.siteSettings,
      altNotes: altNotesFor(alts, [...lists.frames, ...lists.siteSettings]),
      looker: {
        model: door.model,
        door: snapshot,
        promptSha256: prompt.sha256,
        calls
      },
      cost: { ...doc.cost, looker: sum('costUsd') },
      timing: { ...doc.timing, looker: sum('ms') }
    }
    const status = failures.length ? 'fail' : calls.length ? 'pass' : 'skip'
    const rule = {
      ...LOOKER_RULE,
      status,
      cause: failures.length ? 'looker' : null,
      causes: failures.length ? { looker: failures.length } : {},
      failures,
      notes: status === 'skip' && !notes.length ? ['no picture to look at'] : notes
    }
    return {
      doc: out,
      rule,
      paid: sum(
        'costUsd',
        calls.filter((c) => !c.cached)
      )
    }
  }

  /** Whether this save already took, or is taking now, the look a picture would get (`memo` as `look` keeps it). */
  const known = (entry, memo) => {
    if (!memo) return false
    const { key } = questionOf(entry)
    return memo.has(key) || Boolean(taking.get(memo)?.has(key))
  }

  /**
   * Looks at pictures not placed yet, all at once (LOOK_CONCURRENCY at a time): each look is the one `look` would take
   * of the picture once placed, kept in `memo` and in the run's store, so the pass that places it reads it at once
   * (ladder-step.js looksAhead). Returns one call record per look, marked `ahead`, with its time and cost; a picture
   * never placed after all keeps its record, since its look was paid.
   * @param {Array<[string, object]>} pairs [list, entry] as `look` holds them
   */
  async function ahead(pairs, memo) {
    const looks = await inParallel(pairs, concurrency ?? LOOK_CONCURRENCY, ([list, e]) =>
      lookAt(list, e, memo)
    )
    return looks.map(({ entry, said, cached }) => ({
      frame: entry.frame,
      sha256: entry.sha256,
      model: said.model ?? door.model,
      ms: said.ms ?? 0,
      costUsd: said.costUsd ?? null,
      cached: Boolean(cached),
      ahead: true
    }))
  }

  return { look, known, ahead }
}
