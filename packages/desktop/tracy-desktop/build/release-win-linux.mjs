/**
 * The Windows + Linux half of a release, for `build/release.mjs prepare` (tasks/todo-desktop-windows.md
 * rule R: one release = Mac + Windows + Linux, one sha, one version). The Mac apps are built on the iMac;
 * the Windows installers and the Linux AppImage/.deb are built by `.github/workflows/desktop-win-linux.yml`
 * on our self-hosted build runner. This module is how prepare gets them:
 *
 *   dispatch(candidate)  `gh workflow run` with the candidate's sha, variant, version, build id, release
 *                        date and feed — on `main` for stable (the production lane's runner) and `develop`
 *                        for dev — then finds THAT run by its build id (the run name carries it), waits
 *                        for it and downloads its installers and its build record (`build-info.json`).
 *   fromRun(id)          the same from a run that already finished — the way in while the workflow is not
 *                        on the default branch yet (GitHub dispatches only workflows it finds there), or
 *                        to reuse a run. `readInfo(id)` reads only its record, so prepare can take the run's
 *                        build id and release date before it builds the Mac half.
 *   discard(run)         deletes the run's draft release once the files are on a real store (publish).
 *
 * 🔒 THE TRANSPORT IS A DRAFT RELEASE, NOT AN ACTIONS ARTIFACT. The run uploads its six installers and
 * its record as assets of a draft release `desktop-win-linux-<run id>` (no git tag: a draft has none).
 * Actions artifacts share the org's pooled 500 MB storage on GitHub Free, recalculated every 6-12 h — one
 * release's ~650 MB filled it and blocked 0.6.0 (12/10/2026). Release assets are not in that pool
 * ("no limit on the total size of a release, nor bandwidth usage", docs.github.com, about releases).
 *
 * A draft can be edited by anyone with push access, which an artifact could not. So the run also reports
 * the sha256 of its record as a check annotation (`::notice title=build-info.json::sha256 <hex>`, which
 * only the run's own log can write), and the record names the run id and attempt: a draft whose record
 * is not the one the run built, or not this run's, is refused. The record lists every installer's
 * sha512, which prepare checks (release.mjs `winLinuxFiles`). This guards against a draft changed after
 * the build; it is not a defence against a build runner that is itself compromised.
 *
 * `localWinLinux(dir)` is the fallback when GitHub cannot build: installers packed by hand in the same
 * pinned builder image (runbook docs/references/phat-hanh-app-desktop.md §4 ②c) and their record.
 *
 * Nothing here decides whether the run is the right candidate: prepare compares the record and every
 * file with what it is preparing. `gh` is passed in (tests fake it); it runs with the caller's `gh` login.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

export const WORKFLOW = 'desktop-win-linux.yml'
/** The draft release's name prefix; the workflow's sweep deletes old drafts by it too. */
export const RELEASE_PREFIX = 'desktop-win-linux-'
const RECORD_FILE = 'build-info.json'
/** The ref a candidate is dispatched on — which also picks the runner lane (the workflow's `runs-on`). */
const REF = Object.freeze({ stable: 'main', dev: 'develop' })
const VIEW_FIELDS = 'databaseId,attempt,status,conclusion,url,headSha,event,headBranch,displayTitle,jobs'
const LIST_FIELDS = 'databaseId,status,conclusion,url,headSha,event,headBranch,displayTitle'

/** The draft release a run leaves its installers in. */
export function releaseTagOf(runId) {
  const id = String(runId)
  if (!/^\d+$/.test(id)) throw new Error(`a run id is digits only, got: ${id}`)
  return `${RELEASE_PREFIX}${id}`
}

/** Every file under `dir`. */
function filesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? filesUnder(path.join(dir, e.name)) : [path.join(dir, e.name)]
  )
}

/**
 * Installers packed by hand (no GitHub run) and their record, from a folder: `build-info.json` at its
 * top, the six installers anywhere under it. The run it reports says `manual`; prepare takes it for a
 * real store only with a stated reason (`--allow-manual-win-linux`).
 * @param {string} dir
 */
export function localWinLinux(dir) {
  const root = path.resolve(dir)
  const recordPath = path.join(root, RECORD_FILE)
  const readInfo = () => {
    if (!existsSync(recordPath))
      throw new Error(`${root} has no ${RECORD_FILE} (package-win-linux.mjs info writes it)`)
    return JSON.parse(readFileSync(recordPath, 'utf8'))
  }
  return {
    readInfo,
    collect() {
      const info = readInfo()
      return {
        run: { id: `manual-${info.buildId}`, url: null, event: 'manual', dir: root },
        info,
        artifacts: filesUnder(root).filter((f) => f !== recordPath)
      }
    }
  }
}

/**
 * @param {{
 *   gh: (args: string[]) => Promise<string>, - runs `gh` with these arguments, resolves its stdout
 *   repo: string, - owner/name
 *   workDir: string, - where downloads go (a folder of its own per download)
 *   sleep?: (ms: number) => Promise<void>,
 *   log?: (line: string) => void,
 *   pollMs?: number, findTimeoutMs?: number, runTimeoutMs?: number
 * }} options
 */
export function githubWinLinux({
  gh,
  repo,
  workDir,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  log = () => {},
  pollMs = 20_000,
  findTimeoutMs = 3 * 60_000,
  runTimeoutMs = 90 * 60_000
}) {
  const json = async (args) => JSON.parse(await gh(args))
  const view = (id) => json(['run', 'view', String(id), '--repo', repo, '--json', VIEW_FIELDS])
  const describe = (run) => ({
    id: String(run.databaseId),
    url: run.url,
    event: run.event,
    headSha: run.headSha,
    headBranch: run.headBranch ?? null,
    release: releaseTagOf(run.databaseId)
  })

  /** The run's verdict: it must have finished, and succeeded. */
  function mustHaveSucceeded(run) {
    if (run.status !== 'completed')
      throw new Error(`run ${run.databaseId} is ${run.status}, not finished: ${run.url}`)
    if (run.conclusion !== 'success')
      throw new Error(`the Windows/Linux build ended ${run.conclusion}: ${run.url}`)
  }

  /** The run's draft release assets (all, or only the record) into a folder of their own. */
  async function download(id, onlyRecord) {
    const tag = releaseTagOf(id)
    const dir = mkdtempSync(path.join(workDir, `win-linux-${id}-`))
    try {
      await gh([
        'release',
        'download',
        tag,
        '--repo',
        repo,
        '--dir',
        dir,
        ...(onlyRecord ? ['-p', RECORD_FILE] : [])
      ])
    } catch (error) {
      throw new Error(
        `cannot download the draft release ${tag} of run ${id} (deleted after a publish, or swept after ` +
          `14 days — run it again): ${String(error.stderr ?? error.message).trim()}`
      )
    }
    return dir
  }

  async function readInfo(id) {
    const dir = await download(id, true)
    const record = path.join(dir, RECORD_FILE)
    if (!existsSync(record)) throw new Error(`the draft release of run ${id} has no ${RECORD_FILE}`)
    return JSON.parse(readFileSync(record, 'utf8'))
  }

  /**
   * The draft is this run's: its record names this run and attempt, and hashes to what the run itself
   * reported in a check annotation (written from the run's log, not editable afterwards).
   */
  async function mustBeThisRunsRecord(run, bytes, info) {
    const id = String(run.databaseId)
    if (String(info?.run?.id) !== id)
      throw new Error(
        `the draft release of run ${id} holds a record that names run ${info?.run?.id}, not ${id}`
      )
    if (String(info.run.attempt) !== String(run.attempt))
      throw new Error(
        `the record of run ${id} is from attempt ${info.run.attempt}; the run's last is attempt ${run.attempt}`
      )
    const want = createHash('sha256').update(bytes).digest('hex')
    const reported = []
    for (const job of run.jobs ?? []) {
      const notes = await json(['api', `repos/${repo}/check-runs/${job.databaseId}/annotations`])
      for (const n of notes) {
        const m = n.title === RECORD_FILE && /^sha256 ([0-9a-f]{64})$/.exec(String(n.message ?? '').trim())
        if (m) reported.push(m[1])
      }
    }
    if (!reported.includes(want))
      throw new Error(
        `the ${RECORD_FILE} in the draft of run ${id} has sha256 ${want}; the run reported ` +
          `${reported.length > 0 ? reported.join(', ') : 'none'} — the draft changed after the build: ${run.url}`
      )
  }

  async function collect(run) {
    mustHaveSucceeded(run)
    const dir = await download(run.databaseId, false)
    const record = path.join(dir, RECORD_FILE)
    if (!existsSync(record))
      throw new Error(`the draft release of run ${run.databaseId} has no ${RECORD_FILE}`)
    const bytes = readFileSync(record)
    const info = JSON.parse(bytes.toString('utf8'))
    await mustBeThisRunsRecord(run, bytes, info)
    return {
      run: describe(run),
      info,
      artifacts: filesUnder(dir).filter((f) => f !== record)
    }
  }

  async function wait(id) {
    const started = Date.now()
    for (;;) {
      const run = await view(id)
      if (run.status === 'completed') return run
      if (Date.now() - started > runTimeoutMs)
        throw new Error(
          `run ${id} still ${run.status} after ${Math.round(runTimeoutMs / 60_000)} min: ${run.url}`
        )
      log(`prepare: windows/linux run ${id} ${run.status}`)
      await sleep(pollMs)
    }
  }

  return {
    readInfo,

    /** @param {string} id */
    async fromRun(id) {
      const run = await view(id)
      log(
        `prepare: windows/linux from run ${id} (${run.event} at ${String(run.headSha).slice(0, 10)}): ${run.url}`
      )
      return collect(run)
    },

    /**
     * @param {{ sha: string, variant: 'stable' | 'dev', version: string, buildId: string, releaseDate: string, feed: string }} c
     */
    async dispatch(c) {
      const ref = REF[c.variant]
      if (!ref) throw new Error(`no Windows/Linux release build for variant ${c.variant}`)
      const fields = {
        sha: c.sha,
        variant: c.variant,
        version: c.version,
        build_id: c.buildId,
        release_date: c.releaseDate,
        feed: c.feed
      }
      try {
        await gh([
          'workflow',
          'run',
          WORKFLOW,
          '--repo',
          repo,
          '--ref',
          ref,
          ...Object.entries(fields).flatMap(([k, v]) => ['-f', `${k}=${v}`])
        ])
      } catch (error) {
        throw new Error(
          `GitHub refused to start ${WORKFLOW} on ${ref} (${String(error.stderr ?? error.message).trim()}). ` +
            'A dispatch needs the workflow on the default branch; until it is there, build the Windows/Linux half ' +
            'by a push to a feat/desktop-windows* branch and pass that finished run with --win-linux-run <run id>.'
        )
      }
      log(`prepare: started ${WORKFLOW} on ${ref} for ${c.sha.slice(0, 10)}, build ${c.buildId}`)
      // The run name carries the build id (`run-name` in the workflow): THAT run, never the newest one.
      const started = Date.now()
      let found
      while (!found) {
        const runs = await json([
          'run',
          'list',
          '--repo',
          repo,
          '--workflow',
          WORKFLOW,
          '--event',
          'workflow_dispatch',
          '--limit',
          '30',
          '--json',
          LIST_FIELDS
        ])
        found = runs.find((r) =>
          String(r.displayTitle ?? '')
            .split(/\s+/)
            .includes(c.buildId)
        )
        if (found) break
        if (Date.now() - started > findTimeoutMs)
          throw new Error(
            `no run of ${WORKFLOW} named build ${c.buildId} appeared within ${Math.round(findTimeoutMs / 1000)} s`
          )
        await sleep(Math.min(pollMs, 5_000))
      }
      log(`prepare: windows/linux run ${found.databaseId}: ${found.url}`)
      return collect(await wait(found.databaseId))
    },

    /**
     * Delete a run's draft release — its files are on the store now. Never a published release (a
     * draft is all the workflow makes; anything else under that name is someone's, left alone).
     * @param {{ id: string, release?: string }} run - the manifest's `platforms.win.run`
     */
    async discard(run) {
      if (!run?.release) return
      const tag = releaseTagOf(run.id)
      if (run.release !== tag) throw new Error(`run ${run.id} names release ${run.release}, not ${tag}`)
      const { isDraft } = await json(['release', 'view', tag, '--repo', repo, '--json', 'isDraft'])
      if (isDraft !== true) throw new Error(`${tag} is not a draft — left as it is`)
      await gh(['release', 'delete', tag, '--repo', repo, '--yes'])
      log(`publish: deleted the draft release ${tag}`)
    }
  }
}
