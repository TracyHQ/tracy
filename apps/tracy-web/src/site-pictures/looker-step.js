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
// When the run was given a writer copy file, `altNotes` compares its alts with the seen sentences (alt-notes.js); without
// one, the manifest's `altCheck` says the comparison is deferred to the site check's `alt-matches-picture` (step 11).
//
// The looks run where a checked round is saved (looker-round.js withLooker). Every readable look is kept in the bench's
// file store (runs/<run id>/looks/<key>.json, the key a hash of the picture, its display size, the words, the model and
// the prompt), so a resumed run or a later round pays once per picture.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { altNotesFor } from './alt-notes.js'
import { hasTextOver } from './darken.js'
import { fileStore, sha256Hex } from './file-store.js'
import {
  askLooker,
  isAnyReal,
  LOOK_UNREADABLE,
  lookImage,
  lookWords,
  onlyMinorFaults,
  surfaceFacts
} from './looker-call.js'

export const LOOK_CONCURRENCY = 4
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
 *   concurrency?: number }} input `idx` the picture check's index of plan and kit; `alts` the writer's alts, or null
 */
export function createLooker({
  door,
  snapshot = null,
  prompt,
  storeDir,
  runId,
  idx,
  alts,
  fetchImpl = fetch,
  concurrency
}) {
  const store = fileStore(storeDir)
  const kept = (key) => path.join(store.dir, 'runs', String(runId), 'looks', `${key}.json`)

  async function lookAt(list, entry, memo) {
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
        ...(surface ? [surface] : [])
      ])
    )
    // A look already taken in this save (the fallback ladder looks again after each rung), readable or not.
    if (memo?.has(key)) return { list, entry, said: memo.get(key), cached: true }
    const looked = await lookFresh(list, entry, { key, words, box, realPart, cutout, anyReal, surface })
    memo?.set(key, looked.said)
    return looked
  }

  async function lookFresh(list, entry, { key, words, box, realPart, cutout, anyReal, surface }) {
    const before = await readFile(kept(key), 'utf8')
      .then(JSON.parse)
      .catch(() => null)
    if (before) return { list, entry, said: before, cached: true }
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
    if (second.verdict) return { list, entry, said: await keep(key, { ...second, ...spent }), cached: false }
    // An unreadable look is not kept: the next round or a resumed run asks again.
    return {
      list,
      entry,
      said: unreadable(`${first.problem}; asked again: ${second.problem}`, spent),
      cached: false
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
    for (const { list, entry, said, cached } of looks) {
      calls.push({
        frame: entry.frame,
        sha256: entry.sha256,
        model: said.model ?? door.model,
        ms: said.ms ?? 0,
        costUsd: said.costUsd ?? null,
        cached: Boolean(cached)
      })
      entry.seen = said.seen
      entry.looker = {
        verdict: said.verdict,
        faults: said.faults,
        seen: said.seen,
        ...(said.problem ? { problem: said.problem } : {})
      }
      if (said.dropped?.length)
        notes.push(`${entry.frame}: fault names outside the list dropped: ${said.dropped.join(', ')}`)
      // A rejected picture the ladder kept because its only faults are minor (rung best-rejected) is noted, not failed.
      if (said.verdict === 'fail' && entry.filledBy?.rung === 'best-rejected' && onlyMinorFaults(said.faults))
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

  return { look }
}
