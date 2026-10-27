/**
 * The processes of one lane (lane.mjs): each step runs as a child in its own process group, here or on the
 * iMac over ssh, and a lane that is stopped (SIGTERM, SIGINT, SIGHUP) or fails takes all of them down with
 * it — the step's group, the step's Chromes, the iMac command's group — before its stand goes and its slot
 * is given back. Measured 16/10/2026: twelve headless Chromes left alive 5-11 hours by scripts that died.
 *
 *   - here: `spawn(..., { detached: true })` makes the step a group leader; the group gets SIGTERM, then
 *     SIGKILL 10 s later. Its Chromes are detached too (cdp.mjs), in their own groups: cdp.mjs kills them
 *     on SIGTERM, and every Chrome whose profile is under the lane's DS_CHROME_PROFILES folder is killed
 *     after that, so a step killed with no chance to clean up leaves none either.
 *   - on the iMac: sshd makes each command a session, so the command records its process group
 *     (<work>/remote.pgid) and the group is signalled the same way.
 */
import { spawn, spawnSync } from 'node:child_process'
import { appendFileSync, mkdirSync, rmSync } from 'node:fs'

/**
 * @param {{ root: string, log: string, imacTch: string, work: string, profiles: string }} o
 *   work: the lane's folder on the iMac (~/tracy-work/b2/laneN); profiles: the lane's Chrome profiles here
 */
export function laneShell({ root, log, imacTch, work, profiles }) {
  mkdirSync(profiles, { recursive: true })
  /** @type {Set<import('node:child_process').ChildProcess>} */
  const children = new Set()
  let stopping = false

  /**
   * A command whose output goes to the lane log; rejects with its last lines when it fails.
   * okIf: an exit code other than 0 that still did the work (flow.mjs exits 1 when the site fails its own
   * checks, after the measurement file is written)
   */
  const run = (cmd, args, { okIf = null } = {}) =>
    new Promise((ok, no) => {
      if (stopping) return no(new Error('lane stopping'))
      const child = spawn(cmd, args, {
        cwd: root,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, DS_CHROME_PROFILES: profiles }
      })
      children.add(child)
      let out = ''
      let err = ''
      child.stdout.on('data', (d) => (out += d))
      child.stderr.on('data', (d) => (err += d))
      child.on('error', (e) => (err += String(e)))
      child.on('close', (code, signal) => {
        children.delete(child)
        appendFileSync(log, `$ ${cmd} ${args.join(' ').slice(0, 400)}\n${out}${err}\n`)
        if (code === 0 || (code !== null && okIf?.(out))) return ok(out)
        const tail = `${out}\n${err}`.trim().split('\n').slice(-12).join('\n')
        no(new Error(`${cmd} ${args[0]} failed (${code ?? signal}):\n${tail}`))
      })
    })

  /** A shell line on the iMac, in the measuring tch worktree there; its process group recorded. */
  const imac = (line) =>
    run('ssh', [
      'imac',
      `mkdir -p ${work} && ps -o pgid= $$ > ${work}/remote.pgid; export PATH=/opt/homebrew/bin:$PATH DS_STAND_CACHE=$HOME/tracy-work/b2/cache; cd ${imacTch} && ${line}`
    ])

  /** Every child group here and on the iMac, then every Chrome of this lane: TERM, then KILL. */
  const killAll = async () => {
    stopping = true
    // the iMac's group only while an iMac command runs: a finished one's group id may name another process
    const remote = [...children].some((c) => c.spawnargs[0] === 'ssh')
    const signal = (sig) => {
      for (const c of children)
        try {
          process.kill(-c.pid, sig)
        } catch {}
      if (remote)
        spawnSync('ssh', [
          'imac',
          `[ -s ${work}/remote.pgid ] && kill -${sig === 'SIGKILL' ? 9 : 15} -- -$(tr -d ' ' < ${work}/remote.pgid) 2>/dev/null; true`
        ])
    }
    signal('SIGTERM')
    for (let i = 0; i < 20 && children.size; i++) await new Promise((r) => setTimeout(r, 500))
    signal('SIGKILL')
    // a Chrome whose step was SIGKILLed before its own handler ran
    spawnSync('pkill', ['-9', '-f', `user-data-dir=${profiles}/`])
    spawnSync('ssh', ['imac', `rm -f ${work}/remote.pgid`])
  }

  /** Chrome profiles left behind by Chromes that were killed. */
  const cleanProfiles = () => rmSync(profiles, { recursive: true, force: true })

  return { run, imac, killAll, cleanProfiles }
}
