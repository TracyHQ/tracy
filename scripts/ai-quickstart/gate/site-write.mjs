// The gate's write on a real site (ticket #585): the marker build's final write plan, the one the memory site carried
// to the end, run by the build team's write step (`runDraftWrite`) through the door client on a throwaway blank site.
// The site is bound to its blank site contract first; the plugin version is read at the start and the end and must be
// the pinned one both times. The write keeps its record and its apply journal in the run folder, so a run that stopped
// resumes where it was (the same apply ids answer their first answers). A refusal is not worked around: the run stops
// and the record says where (`report.status: 'stopped'`).
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { runDraftWrite } from '../../../apps/tracy-web/src/step-chain-draft-write.js'
import { siteDoors } from '../site-doors.mjs'

const readJson = (file, fallback) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback)

/** A journal of door answers kept in one file. */
function fileJournal(file) {
  const answers = readJson(file, {})
  return {
    get: async (id) => answers[id] ?? null,
    set: async (id, entry) => {
      answers[id] = entry
      writeFileSync(file, JSON.stringify(answers))
    }
  }
}

/**
 * @param {{send: Function, base: string, built: object, out: string, pin: string | null, log: Function, open: Function,
 *   runId?: string}} input
 * @returns {Promise<{report: object, record: object, plugin: {expected: string | null, start: string, end: string}}>}
 */
export async function realWrite({ send, base, built, out, pin, log, open, runId = 'gate-run' }) {
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
  const doors = siteDoors({ send, publicFile, journal: fileJournal(path.join(out, 'journal.json')) })
  const recordFile = path.join(out, 'write-record.json')
  const record = readJson(recordFile, {})
  record.save = (state) => writeFileSync(recordFile, JSON.stringify(state))
  let report
  try {
    report = await runDraftWrite({ plan: built.writePlan, doors, record, openStored: open, runId })
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
