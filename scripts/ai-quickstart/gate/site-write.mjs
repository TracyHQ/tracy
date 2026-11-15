// The gate's write on a real site (ticket #585): the marker build's final write plan, the one the memory site carried
// to the end, run by the build team's write step (`runDraftWrite`) through the door client on a throwaway blank site.
// The site is bound to its blank site contract first; the plugin version is read at the start and the end and must be
// the pinned one both times. The write keeps its record and its apply journal in the run folder, so a run that stopped
// resumes where it was (the same apply ids answer their first answers). A refusal is not worked around: the run stops
// and the record says where (`report.status: 'stopped'`).
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { runDraftWrite } from '../../../apps/tracy-web/src/step-chain-draft-write.js'
import { siteDoors } from '../../../packages/wo/website-opportunities/domain/site-doors.mjs'

const readJson = (file, fallback) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback)

/** The key under which a journal names the site it was written on. */
const SITE_KEY = '__site'

/** The parts of a site identity a resume must match: the bind revision moves with every write, so it is kept, not matched. */
const sameSite = (was, now) =>
  Boolean(was) && was.site === now.site && was.siteKey === now.siteKey && was.contract === now.contract

/**
 * A journal of door answers kept in one file, for one site only: it names the site (address, the hash of its key, the
 * contract, and the bind revision the run started on) and a journal that names another one, or none, is refused before
 * any write.
 */
function fileJournal(file, identity) {
  const answers = readJson(file, null)
  if (answers && Object.keys(answers).length) {
    const was = answers[SITE_KEY]
    if (!sameSite(was, identity))
      throw Object.assign(
        new Error(
          `the journal in the run folder was written on another site (${JSON.stringify(was ?? 'unnamed')}): use a new run folder`
        ),
        { code: 'journal_from_another_site' }
      )
  } else writeFileSync(file, JSON.stringify({ [SITE_KEY]: identity }))
  const kept = answers && Object.keys(answers).length ? answers : { [SITE_KEY]: identity }
  return {
    get: async (id) => (id === SITE_KEY ? null : (kept[id] ?? null)),
    set: async (id, entry) => {
      kept[id] = entry
      writeFileSync(file, JSON.stringify(kept))
    }
  }
}

/**
 * @param {{send: Function, base: string, siteKey: string, built: object, out: string, pin: string | null,
 *   log: Function, open: Function, runId?: string, sheets?: Function | null, run?: Function}} input `siteKey`: the
 *   sha256 of the site's token, never the token; `sheets`: the door that reads the stylesheets the site's template
 *   serves, which the app gives the write step beside the door client (the accent module is built from them); `run`:
 *   the write step, given only by a test
 * @returns {Promise<{report: object, record: object, plugin: {expected: string | null, start: string, end: string}}>}
 */
export async function realWrite({
  send,
  base,
  siteKey,
  built,
  out,
  pin,
  log,
  open,
  runId = 'gate-run',
  sheets = null,
  run = runDraftWrite
}) {
  const version = async () => (await send('info', {})).info?.component ?? null
  const start = await version()
  if (pin && start !== pin)
    throw new Error(`the site runs Claude Cowork ${start}, the gate is pinned to ${pin}`)
  const bound = await send('content.contract', { operation: 'bind' })
  log(`plugin ${start}, bound to ${bound.contract}`)
  // The write reads an uploaded picture back from the site's public address (no plugin operation reads a file).
  const publicFile = async (file) => {
    const answer = await fetch(new URL(String(file).replace(/^\/+/, ''), `${base}/`))
    return answer.ok ? new Uint8Array(await answer.arrayBuffer()) : null
  }
  // A write record is only resumed with the journal that names its site.
  if (existsSync(path.join(out, 'write-record.json')) && !existsSync(path.join(out, 'journal.json')))
    throw Object.assign(new Error('the run folder holds a write record with no journal naming its site'), {
      code: 'journal_from_another_site'
    })
  const identity = {
    site: base,
    siteKey: siteKey ?? null,
    contract: bound.contract ?? null,
    revision: bound.revision ?? null
  }
  const doors = {
    ...siteDoors({
      send,
      publicFile,
      journal: fileJournal(path.join(out, 'journal.json'), identity)
    }),
    // As the app gives it (`step-chain-draft-site.js`): beside the door client, never in place of one of its doors.
    ...(typeof sheets === 'function' ? { sheets } : {})
  }
  const recordFile = path.join(out, 'write-record.json')
  const record = readJson(recordFile, {})
  record.save = (state) => writeFileSync(recordFile, JSON.stringify(state))
  let report
  try {
    report = await run({ plan: built.writePlan, doors, record, openStored: open, runId })
  } catch (error) {
    report = {
      status: 'stopped',
      code: error.code ?? null,
      message: String(error.message),
      details: error.details ?? null
    }
  }
  const end = await version()
  log(
    `site write ${report.status}${report.code ? ` ${report.code}: ${report.message}` : ''}; plugin at the end ${end}`
  )
  if (end !== start) throw new Error(`the plugin version moved during the run: ${start} to ${end}`)
  return { report, record: readJson(recordFile, {}), plugin: { expected: pin, start, end } }
}
