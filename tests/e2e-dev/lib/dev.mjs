// The only door from the suite into the dev host. It is deliberately NOT a shell: each operation
// below is a fixed command whose arguments are validated against a narrow shape before anything
// is sent over ssh. What the suite may do on the dev host is exactly this list (plan §2 D9):
// list containers, read logs, read a non-secret env var, read a plugin version, run one read-only
// SELECT, mint a session cookie for a run account, run the read-only health script, and — for the
// regression runner's dev profile — count a fixed string in a dsh plugin file, test that such a
// file exists, and run one read-only SELECT on the SQLite file of an EmDash site the run created.

import { spawn } from 'node:child_process'
import { ENV, RUN_ID } from './env.mjs'

const CONTAINERS = new Set(Object.values(ENV.containers))
const LABEL = /^[a-z0-9][a-z0-9-]{3,40}$/
const SINCE = /^\d{1,4}[smh]$/
const PUBLIC_ENV = new Set(['APP_IMAGE_TAG', 'DSH_IMAGE_TAG', 'TRACY_SOURCE_COMMIT', 'HOST_NAME'])
// A run account and nothing else may be minted: `e2e-<runId>-<role>@example.test` (or the profile's
// fixed `e2e-<profile>-<role>@example.test`, which has the same shape).
const RUN_EMAIL = new RegExp(`^e2e-[a-z0-9]{4,16}-[a-z]{2,12}@${ENV.emailDomain.replace('.', '\\.')}$`)
const PSQL_VALUE = /^[a-z0-9@._:/-]{1,200}$/i
// Files a regression case may read in the dsh container: plugin trees of a profile, nothing else.
const DSH_FILE = /^\/desk-home\/profiles\/[A-Za-z0-9@._/-]{1,200}$/

/**
 * Run one command on the dev host. Not exported: every caller goes through a named operation.
 * @param {string} command - the remote command line, built only from validated pieces
 * @param {{ input?: string, timeoutMs?: number }} [opts]
 * @returns {Promise<{ code: number, stdout: string, stderr: string, ms: number }>}
 */
function ssh(command, { input, timeoutMs = 60_000 } = {}) {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const child = spawn(
      'ssh',
      [
        '-o',
        'BatchMode=yes',
        '-o',
        `ConnectTimeout=${ENV.ssh.connectTimeoutS}`,
        '-o',
        'ServerAliveInterval=15',
        ENV.ssh.target,
        command
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] }
    )
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => {
      stdout += d
    })
    child.stderr.on('data', (d) => {
      stderr += d
    })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(
        new Error(`dev host: "${command.split(' ').slice(0, 4).join(' ')}…" timed out after ${timeoutMs} ms`)
      )
    }, timeoutMs)
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? -1, stdout, stderr, ms: Date.now() - started })
    })
    child.stdin.end(input ?? '')
  })
}

function must(ok, what) {
  if (!ok) throw new Error(`devExec refused: ${what}`)
}

/**
 * The fixed operations. Each returns the raw ssh result; callers parse.
 */
export const devExec = {
  /**
   * `docker ps -a` as JSON lines, optionally only the containers of one site: its compose project, which provisioning names
   * after the label (`$ROOT/<label>`). Not a name prefix: labels hold hyphens, so `^foo-` also matches `foo-bar-web-1`.
   * @param {{ label?: string }} [opts]
   */
  async ps({ label } = {}) {
    if (label !== undefined) must(LABEL.test(label), `label "${label}"`)
    const filter = label ? ` --filter label=com.docker.compose.project=${label}` : ''
    const res = await ssh(`sudo docker ps -a${filter} --format '{{json .}}'`)
    if (res.code !== 0) throw new Error(`docker ps failed: ${res.stderr.trim()}`)
    return res.stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
  },

  /**
   * `docker logs --since <since> <container>` for one of the stack's own containers.
   * @param {string} container
   * @param {string} since - `90s`, `10m`, `2h`
   */
  async logs(container, since) {
    must(CONTAINERS.has(container), `container "${container}"`)
    must(SINCE.test(since), `since "${since}"`)
    const res = await ssh(`sudo docker logs --since ${since} ${container} 2>&1`, { timeoutMs: 90_000 })
    return res.stdout
  },

  /**
   * One non-secret environment variable of a stack container (image tags, source commit).
   * @param {string} container
   * @param {string} name
   */
  async env(container, name) {
    must(CONTAINERS.has(container), `container "${container}"`)
    must(PUBLIC_ENV.has(name), `env "${name}" is not on the public list`)
    const res = await ssh(`sudo docker exec ${container} printenv ${name}`)
    return res.code === 0 ? res.stdout.trim() : null
  },

  /** `docker inspect` image reference of each stack container: `{ name: image }`. */
  async images() {
    const names = [...CONTAINERS].join(' ')
    const res = await ssh(`sudo docker inspect --format '{{.Name}} {{.Config.Image}}' ${names}`)
    if (res.code !== 0) throw new Error(`docker inspect failed: ${res.stderr.trim()}`)
    return Object.fromEntries(
      res.stdout
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const [name, image] = line.trim().split(' ')
          return [name.replace(/^\//, ''), image]
        })
    )
  },

  /**
   * The `version` of a plugin installed in the dsh profile (names listed in `ENV.dshPlugins`).
   * @param {string} name
   */
  async dshPluginVersion(name) {
    const file = ENV.dshPlugins[name]
    must(typeof file === 'string', `plugin "${name}"`)
    const res = await ssh(`sudo docker exec ${ENV.containers.dsh} cat ${file}`)
    if (res.code !== 0) return null
    try {
      return JSON.parse(res.stdout).version ?? null
    } catch {
      return null
    }
  },

  /**
   * One SELECT inside `begin read only; … rollback;`. Values are passed as psql variables
   * (`:'name'` in the query), and at least one of them must carry the run id, or be one of the
   * profile's fixed accounts (`e2e-<profile>-<role>@…`, see `ENV.accounts`): a query that is not
   * about the suite's own resources is refused.
   * @param {string} runId
   * @param {string} select - a single SELECT/WITH statement, no `;`
   * @param {Record<string, string>} vars
   * @returns {Promise<string[][]>} rows, columns split on `|`
   */
  async psqlReadOnly(runId, select, vars) {
    must(RUN_ID.test(runId), `run id "${runId}"`)
    const sql = select.trim()
    must(/^(select|with)\s/i.test(sql), 'not a SELECT')
    must(!sql.includes(';'), 'more than one statement')
    must(!/\\/.test(sql), 'psql meta-command')
    const entries = Object.entries(vars ?? {})
    for (const [k, v] of entries) {
      must(/^[a-z_]{1,30}$/.test(k), `variable name "${k}"`)
      must(PSQL_VALUE.test(v), `variable "${k}"`)
    }
    const fixedAccount = (v) =>
      ENV.accounts === 'fixed' && RUN_EMAIL.test(v) && v.startsWith(`e2e-${ENV.name}-`)
    must(
      entries.some(([, v]) => v.includes(runId) || fixedAccount(v)),
      'no variable names this run'
    )
    const flags = entries.map(([k, v]) => `-v ${k}=${v}`).join(' ')
    const res = await ssh(
      `sudo docker exec -i ${ENV.containers.postgres} psql -U ${ENV.db.user} -d ${ENV.db.name} -At -q -v ON_ERROR_STOP=1 ${flags}`,
      { input: `begin read only;\n${sql};\nrollback;\n` }
    )
    if (res.code !== 0) throw new Error(`psql failed: ${res.stderr.trim()}`)
    return res.stdout
      .split('\n')
      .filter((l) => l && l !== 'BEGIN' && l !== 'ROLLBACK')
      .map((l) => l.split('|'))
  },

  /**
   * Mint a `tracy_sess` token for a run account inside tracy-web, with the server's own secret.
   * The secret never leaves the container; the token comes back on stdout and is kept in memory
   * by the caller, never written to disk.
   * @param {string} email - must be a run account (`e2e-<runId>-<role>@example.test`)
   * @param {{ ageS?: number }} [opts] - mint as if `ageS` seconds ago (to make `/auth/me` renew)
   * @returns {Promise<string>}
   */
  async mint(email, { ageS = 0 } = {}) {
    must(RUN_EMAIL.test(email), `email "${email}" is not a run account`)
    must(Number.isInteger(ageS) && ageS >= 0 && ageS < 48 * 3600, `age ${ageS}`)
    const script = [
      `const m = await import(${JSON.stringify(ENV.webSessionModule)})`,
      'const secret = String(process.env.SESSION_SECRET ?? "").split(",")[0]',
      'if (!secret) { process.stderr.write("no SESSION_SECRET"); process.exit(2) }',
      `const token = await m.mintSession(${JSON.stringify(email)}, secret, Date.now() - ${ageS * 1000})`,
      'process.stdout.write(token)'
    ].join('\n')
    const res = await ssh(`sudo docker exec -i ${ENV.containers.web} node --input-type=module -`, {
      input: script
    })
    const token = res.stdout.trim()
    if (res.code !== 0 || !token.startsWith('v1.'))
      throw new Error(`mint failed: ${res.stderr.trim().slice(0, 200)}`)
    return token
  },

  /**
   * A read-only SELECT whose text names this run (a regression case's `pq`): the literal run id
   * must appear in it, so a query about somebody else's site or seat is refused before ssh.
   * @param {string} runId
   * @param {string} select
   */
  async psqlAboutRun(runId, select) {
    must(RUN_ID.test(runId), `run id "${runId}"`)
    must(select.includes(runId), 'the query does not name this run (its labels or emails)')
    return devExec.psqlReadOnly(runId, select, { run: runId })
  },

  /**
   * How many lines of a file in the dsh profile contain `text` (fixed string, not a pattern):
   * what a regression case's "check the build" reads. The text reaches grep on stdin, never
   * through the remote shell.
   * @param {string} text
   * @param {string} file - under /desk-home/profiles/
   * @returns {Promise<{ exists: boolean, count: number }>}
   */
  async dshGrepCount(text, file) {
    must(DSH_FILE.test(file) && !file.includes('..'), `file "${file}"`)
    must(text.length > 0 && text.length <= 200 && !/[\r\n]/.test(text), 'text')
    const res = await ssh(`sudo docker exec -i ${ENV.containers.dsh} grep -c -F -f - ${file}`, {
      input: `${text}\n`
    })
    // grep: 0 = found, 1 = no line matched, 2 = no such file (or another error).
    if (res.code === 2) return { exists: false, count: 0 }
    return { exists: true, count: Number.parseInt(res.stdout.trim(), 10) || 0 }
  },

  /**
   * Whether a file exists in the dsh profile.
   * @param {string} file - under /desk-home/profiles/
   */
  async dshFileExists(file) {
    must(DSH_FILE.test(file) && !file.includes('..'), `file "${file}"`)
    const res = await ssh(`sudo docker exec ${ENV.containers.dsh} test -f ${file}`)
    return res.code === 0
  },

  /**
   * One read-only SELECT on the SQLite database of an EmDash site THIS run created
   * (`<label>-web-1`, `/app/data/data.db` opened read-only). The SQL travels inside the script on
   * stdin, never through the remote shell.
   * @param {string} runId
   * @param {string} label - one of this run's ADDRESS labels (`<sitePrefix>e2e<runId>…`)
   * @param {string} select
   * @returns {Promise<any[]>}
   */
  async emSelect(runId, label, select) {
    must(RUN_ID.test(runId), `run id "${runId}"`)
    must(
      LABEL.test(label) && label.startsWith(`${ENV.sitePrefix}e2e${runId}`),
      `label "${label}" is not this run's`
    )
    const sql = select.trim()
    must(/^(select|with)\s/i.test(sql), 'not a SELECT')
    must(!sql.includes(';'), 'more than one statement')
    const script = [
      "const { createRequire } = await import('node:module')",
      "const Database = createRequire('/app/package.json')('better-sqlite3')",
      "const db = new Database('/app/data/data.db', { readonly: true, fileMustExist: true })",
      `process.stdout.write(JSON.stringify(db.prepare(${JSON.stringify(sql)}).all()))`
    ].join('\n')
    const res = await ssh(`sudo docker exec -i -w /app ${label}-web-1 node --input-type=module -`, {
      input: script
    })
    if (res.code !== 0) throw new Error(`em select failed: ${res.stderr.trim().slice(0, 300)}`)
    return JSON.parse(res.stdout)
  },

  /** The stack's read-only health script; ~75 s. */
  async checkServer() {
    const res = await ssh(`sudo bash ${ENV.checkServer} 2>&1`, { timeoutMs: 240_000 })
    return { code: res.code, output: res.stdout, ms: res.ms }
  }
}

/** Alias kept for the plan's vocabulary. */
export const devPsqlReadOnly = devExec.psqlReadOnly

/**
 * A session token for a run account, held in memory only.
 * @param {string} email
 * @param {{ ageS?: number }} [opts]
 */
export function mintCookie(email, opts) {
  return devExec.mint(email, opts)
}
