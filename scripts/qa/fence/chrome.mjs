// Start and stop the headless Chrome of one QA lane inside its sandbox-exec profile (plan §3.2, §4.3).
// Chrome needs --no-sandbox inside sandbox-exec (its own sandbox cannot nest) and a SHORT
// MAC_CHROMIUM_TMPDIR (socket paths over ~104 characters fail); both measured, appendix §1.3.
//
// Exports:
//   CHROME_BIN
//   chromeArgs({ cdpPort, chromeDir, domain? }) -> string[]
//   startChrome({ lane, profileFile, cdpPort, chromeDir, domain?, procsLog?, runId?, chromeBin?, fenced?, readyMs? })
//     -> Promise<{ pid, pgid, cdpPort, lstart, logFile, stop(): Promise<void> }>
//   stopChrome(handle) -> Promise<void>   kills the whole process group, TERM then KILL
import { spawn, execFileSync } from 'node:child_process'
import { appendFileSync, closeSync, fsyncSync, mkdirSync, openSync } from 'node:fs'
import { join } from 'node:path'

export const CHROME_BIN = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

export function chromeArgs({ cdpPort, chromeDir, domain = 'qa.tracy.test' }) {
  return [
    '--headless=new',
    '--no-sandbox',
    `--remote-debugging-port=${Number(cdpPort)}`,
    '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${join(chromeDir, 'profile')}`,
    `--host-resolver-rules=MAP *.${domain} 127.0.0.1, MAP ${domain} 127.0.0.1`,
    '--disable-breakpad',
    '--disable-crash-reporter',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-sync',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1280,800',
    'about:blank'
  ]
}

/** One JSON line, fsync'd: the run's process ledger (procs.jsonl, plan §4.1). */
function ledger(file, entry) {
  if (!file) return
  const fd = openSync(file, 'a')
  try {
    appendFileSync(fd, `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}

function lstartOf(pid) {
  try {
    return execFileSync('/bin/ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

const alive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export async function stopChrome(handle) {
  const { pgid } = handle
  for (const [sig, waitMs] of [
    ['SIGTERM', 3000],
    ['SIGKILL', 2000]
  ]) {
    try {
      process.kill(-pgid, sig)
    } catch {
      return
    }
    const until = Date.now() + waitMs
    while (Date.now() < until) {
      if (!alive(-pgid)) return
      await new Promise((r) => setTimeout(r, 100))
    }
  }
}

export async function startChrome({
  lane,
  profileFile,
  cdpPort,
  chromeDir,
  domain = 'qa.tracy.test',
  procsLog,
  runId,
  chromeBin = CHROME_BIN,
  fenced = true,
  readyMs = 60_000
}) {
  for (const d of ['profile', 'tmp', 'home', 'dl']) mkdirSync(join(chromeDir, d), { recursive: true })
  const logFile = join(chromeDir, 'chrome.log')
  const log = openSync(logFile, 'a')
  const args = chromeArgs({ cdpPort, chromeDir, domain })
  const [cmd, argv] = fenced
    ? ['/usr/bin/sandbox-exec', ['-f', profileFile, chromeBin, ...args]]
    : [chromeBin, args]
  ledger(procsLog, { type: 'intent', what: 'chrome', lane, runId, cdpPort, fenced })
  const child = spawn(cmd, argv, {
    detached: true,
    stdio: ['ignore', log, log],
    env: {
      HOME: join(chromeDir, 'home'),
      PATH: '/usr/bin:/bin',
      TMPDIR: join(chromeDir, 'tmp'),
      MAC_CHROMIUM_TMPDIR: join(chromeDir, 'tmp'),
      ...(runId ? { QA_RUN_ID: runId } : {})
    }
  })
  closeSync(log)
  child.unref()
  const handle = { pid: child.pid, pgid: child.pid, cdpPort, logFile, lstart: lstartOf(child.pid) }
  handle.stop = () => stopChrome(handle)
  ledger(procsLog, {
    type: 'spawn',
    what: 'chrome',
    lane,
    runId,
    pid: handle.pid,
    pgid: handle.pgid,
    lstart: handle.lstart
  })

  let exited = null
  child.once('exit', (code, signal) => {
    exited = { code, signal }
  })
  const until = Date.now() + readyMs
  while (Date.now() < until) {
    if (exited)
      throw new Error(
        `chrome (${lane}) exited before CDP answered: ${JSON.stringify(exited)}; see ${logFile}`
      )
    try {
      const r = await fetch(`http://127.0.0.1:${cdpPort}/json/version`, { signal: AbortSignal.timeout(1000) })
      if (r.ok) {
        handle.version = await r.json()
        return handle
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 200))
  }
  await stopChrome(handle)
  throw new Error(`chrome (${lane}) CDP did not answer on ${cdpPort} within ${readyMs} ms; see ${logFile}`)
}
