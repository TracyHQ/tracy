// A real throwaway site as the release gate uses it (tickets #585 and #586): the plugin's doors reached with the site's
// Claude Cowork token, every write of a build through the write step with its own record and journal, the pages of a
// written build with the record each stands on, plain page reads, the doors that take a copy off its pages and put it
// back (write safety's block bisection) and that hide a page and publish it again (the hidden structure variant), the
// reset hook (`site-reset.mjs`) and the site check's page groups read by the host's browser (template quality). The
// framework's own parts come from the adapters; nothing here names a template. `release-gate.mjs` takes the session
// as its `site`, its `reset` and its `quality`.
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { siteDoors } from '../../../packages/wo/website-opportunities/domain/site-doors.mjs'
import { localHost } from '../../../apps/tracy-web/scripts/demo-measures.mjs'
import { directSend } from '../site-doors-send.mjs'
import { shownFields, withRecord } from './adapters/joomla-pages.mjs'
import { joomlaSheetsDoor } from './adapters/joomla-sheets.mjs'
import { sitePages } from './adapters/joomla-t4.mjs'
import { openMarkerPicture } from './memory-write.mjs'
import { measureQuality } from './quality.mjs'
import { freshProblems, siteReset, slotSnapshot } from './site-reset.mjs'
import { realWrite } from './site-write.mjs'

/** Read one page as a visitor gets it; a page that does not answer is status 0. */
export async function readPage(url, timeout = 45000) {
  try {
    const answer = await fetch(url, { signal: AbortSignal.timeout(timeout) })
    return { status: answer.status, html: await answer.text() }
  } catch {
    return { status: 0, html: '' }
  }
}

/**
 * The site check's page groups on some pages of a site, read by the host's own browser code run on this machine.
 * @param {{base: string, platform: string, pages: string[], names?: string[], hostOf?: Function}} input `hostOf`: the
 *   host's reader (`localHost`), given only by a test that keeps the host's own request checks but no browser
 */
export async function qualityOn({ base, platform, pages, names, hostOf = localHost }) {
  const reader = await hostOf(base, platform)
  try {
    return await measureQuality({ host: reader.host, pages, names })
  } finally {
    await reader.close?.()
  }
}

/**
 * @param {{base: string, token: string, out: string, pin: string | null, kit: object, platform: string,
 *   resetCommand?: string | null, contract?: string | null, firstMarks?: string[], log?: (line: string) => void}} input
 *   `firstMarks`: the marks of records the build makes, which a fresh site must not hold
 */
export function siteSession({
  base,
  token,
  out,
  pin,
  kit,
  platform,
  resetCommand,
  contract,
  firstMarks = [],
  hostOf,
  log,
  writeStep = realWrite
}) {
  const send = directSend({
    base,
    token,
    log: (e) => appendFileSync(path.join(out, 'calls.jsonl'), JSON.stringify(e).slice(0, 4000) + '\n')
  })
  const doors = siteDoors({ send })
  // The site's key by its hash only: a journal names the site it was written on, never the token.
  const siteKey = createHash('sha256').update(token).digest('hex')
  const offMenus = new Map()
  let writes = 0
  // Each process writes into a run folder of its own (writes/run-<k>/<n>), so a resumed gate never takes another
  // process's write record for its own: on a site reset since, that record would say every op is done and nothing
  // would be written. What a resume carries over is write safety's own state (its ledger, findings and passes).
  let run = 1
  while (existsSync(path.join(out, 'writes', 'run-' + run))) run += 1
  const runDir = path.join(out, 'writes', 'run-' + run)
  mkdirSync(runDir, { recursive: true })
  const sheets = joomlaSheetsDoor({ base, send })
  // The contract slots as the blank site holds them before the first write, read once: each reset is held to it.
  let snapshot = null
  let applies = 0
  const applyId = (what) => 'gate-' + what + '-' + ++applies
  return {
    origin: new URL(base).origin,
    doors,
    send,
    reset: siteReset({
      command: resetCommand ?? null,
      log,
      check: () =>
        freshProblems({
          send,
          pin,
          contract,
          contentMap: kit.blankContract,
          find: (mark) => doors.find({ kind: 'menuItem', mark }),
          marks: firstMarks,
          snapshot
        })
    }),
    async write(built) {
      snapshot ??= await slotSnapshot(send).catch(() => null)
      writes += 1
      const dir = path.join(runDir, String(writes))
      mkdirSync(dir, { recursive: true })
      const began = Date.now()
      const real = await writeStep({
        send,
        base,
        siteKey,
        built,
        out: dir,
        pin,
        log,
        open: openMarkerPicture(built.registry),
        sheets
      })
      log(
        'write ' + writes + ' ' + real.report.status + ' in ' + Math.round((Date.now() - began) / 1000) + ' s'
      )
      return { report: real.report, record: real.record, plugin: real.plugin }
    },
    pages: async (built, record) =>
      (await sitePages({ base, record, doors, order: built.order, mapping: kit.mapping })).map((p) =>
        withRecord(p, record)
      ),
    fetch: (url) => readPage(url),
    // The account the plugin writes as, printed as the author of an article: a value of the site's own records.
    async siteValues(real) {
      const values = new Map()
      for (const [key, id] of Object.entries(real.record?.ids ?? {}))
        if (key.startsWith('article:')) {
          const name = (await doors.get({ kind: 'article', id }))?.author?.name
          if (name)
            values.set(name, { table: 'users', column: 'name', why: 'the account the plugin writes as' })
        }
      return values
    },
    async off(ops, record) {
      for (const op of ops) {
        const id = record.ids?.[op]
        if (!id || !op.startsWith('copy:')) continue
        offMenus.set(op, (await doors.get({ kind: 'moduleAssignment', id }))?.menuids ?? '[]')
        await doors.unassign({ applyId: applyId('off'), id })
      }
    },
    async back(ops, record) {
      for (const op of ops)
        if (offMenus.has(op))
          await doors.update({
            applyId: applyId('back'),
            kind: 'moduleAssignment',
            id: record.ids[op],
            fields: { menuids: offMenus.get(op) }
          })
    },
    hide: (record) => doors.hide({ applyId: applyId('hide'), kind: record.kind, id: record.id }),
    show: (record) =>
      doors.update({
        applyId: applyId('show'),
        kind: record.kind,
        id: record.id,
        fields: shownFields(record.kind)
      }),
    quality: (pages) => qualityOn({ base, platform, pages, hostOf })
  }
}
