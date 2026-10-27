// Real Docker adapter. Every call is an argument array run without a shell, with a deadline.
// The stand code only talks to this interface, so selftests substitute a fake with the same methods.
import { execFile } from 'node:child_process'

const KINDS = { container: 'container', volume: 'volume', network: 'network' }
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/
const PROJECT_LABEL = 'com.docker.compose.project'

// Every line must be a plausible resource name; anything else means the output cannot be trusted.
function parseNames(stdout, what) {
  // Only the final newline is dropped; an empty line anywhere else is malformed output.
  const body = stdout.endsWith('\n') ? stdout.slice(0, -1) : stdout
  const lines = stdout === '' ? [] : body.split('\n')
  const bad = lines.find((l) => !NAME_RE.test(l))
  if (bad !== undefined) throw new Error(`${what}: malformed output line ${JSON.stringify(bad.slice(0, 80))}`)
  return lines
}

// A listing is used to prove absence, so a call that exits 0 but wrote to stderr is not trusted:
// the daemon may have warned that the answer is partial. That is "unknown", never an empty list.
function refuseWarnings(r, what) {
  if (r.stderr !== '')
    throw new Error(`${what}: exited 0 with output on stderr: ${r.stderr.trim().slice(0, 200)}`)
}

const isText = (v) => typeof v === 'string' && v !== ''
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const labelsOk = (v) =>
  v === undefined ||
  v === null ||
  (isObject(v) && Object.values(v).every((value) => typeof value === 'string'))

// Each kind has its own required fields; the shape of another kind is refused, so a network
// document can never become a container's identity in a manifest.
function inspectShapeProblem(kind, doc) {
  if (!isText(doc.Name)) return 'output lacks a Name'
  if (kind === 'container') {
    if (!/^[0-9a-f]{12,64}$/.test(doc.Id ?? '')) return 'output lacks a container Id'
    if (!isObject(doc.Config) || !isObject(doc.State) || !isText(doc.Image))
      return 'output lacks Config, State or Image: not a container'
    return labelsOk(doc.Config.Labels) ? null : 'Config.Labels is not a string map'
  }
  if (kind === 'network') {
    if (!/^[0-9a-f]{12,64}$/.test(doc.Id ?? '')) return 'output lacks a network Id'
    if (!isText(doc.Driver) || !isText(doc.Scope) || !isObject(doc.IPAM))
      return 'output lacks Driver, Scope or IPAM: not a network'
    return labelsOk(doc.Labels) ? null : 'Labels is not a string map'
  }
  if (!isText(doc.Driver) || !isText(doc.Scope) || !isText(doc.CreatedAt))
    return 'output lacks Driver, Scope or CreatedAt: not a volume'
  if ('Id' in doc || 'IPAM' in doc || 'Config' in doc) return 'output has fields of another kind'
  return labelsOk(doc.Labels) ? null : 'Labels is not a string map'
}

function runDocker(args, { timeoutMs = 60_000, cwd, bin = 'docker' } = {}) {
  return new Promise((resolve) => {
    execFile(
      bin,
      args,
      { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, encoding: 'utf8', cwd },
      (error, stdout, stderr) => {
        if (!error) return resolve({ code: 0, stdout, stderr })
        resolve({
          code: typeof error.code === 'number' ? error.code : 1,
          stdout: stdout ?? '',
          stderr: stderr || error.message,
          unavailable: error.code === 'ENOENT',
          timedOut: error.killed === true
        })
      }
    )
  })
}

export function makeDocker({ cwd, bin } = {}) {
  const run = (args, options = {}) => runDocker(args, { cwd, bin, ...options })
  return {
    async available() {
      const r = await run(['version', '--format', '{{.Server.Version}}'], { timeoutMs: 15_000 })
      return r.code === 0 ? { ok: true } : { ok: false, detail: r.stderr.trim().slice(0, 300) }
    },
    async composeUp({ project, files, envFile, timeoutMs }) {
      const args = [
        'compose',
        '-p',
        project,
        ...files.flatMap((f) => ['-f', f]),
        '--env-file',
        envFile,
        '--profile',
        'local',
        'up',
        '-d',
        '--wait'
      ]
      const r = await run(args, { timeoutMs })
      return { ok: r.code === 0, detail: `${r.stdout}${r.stderr}`.trim().slice(-2000) }
    },
    async list(kind, project) {
      const sub = `${KINDS[kind]}`
      const args = kind === 'container' ? ['container', 'ls', '-a', '--no-trunc'] : [sub, 'ls']
      const r = await run([
        ...args,
        '--filter',
        `label=${PROJECT_LABEL}=${project}`,
        '--format',
        kind === 'container' ? '{{.Names}}' : '{{.Name}}'
      ])
      if (r.code !== 0) throw new Error(`docker ${sub} ls failed: ${r.stderr.trim().slice(0, 300)}`)
      refuseWarnings(r, `docker ${sub} ls`)
      return parseNames(r.stdout, `docker ${sub} ls`)
    },
    async listByPrefix(kind, prefix) {
      const args = kind === 'container' ? ['container', 'ls', '-a'] : [KINDS[kind], 'ls']
      const r = await run([
        ...args,
        '--filter',
        `name=${prefix}`,
        '--format',
        kind === 'container' ? '{{.Names}}' : '{{.Name}}'
      ])
      if (r.code !== 0) throw new Error(`docker ${kind} ls failed: ${r.stderr.trim().slice(0, 300)}`)
      refuseWarnings(r, `docker ${kind} ls`)
      return parseNames(r.stdout, `docker ${kind} ls`).filter((n) => n.startsWith(prefix))
    },
    // → null when absent, else { id, project } (volume identity = CreatedAt, which changes on re-creation).
    async inspect(kind, name) {
      const r = await run([KINDS[kind], 'inspect', name])
      if (r.code !== 0) {
        // Only an explicit "no such object" means absent; a dead daemon or a timeout is unknown.
        // The message must name the object asked about and carry nothing else.
        // Supported absence messages (the whole stderr, one line, naming kind and name).
        const n = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const prefix = '(?:Error(?: response from daemon)?:\\s+)?'
        const forms = {
          container: [`No such container:\\s+${n}`],
          volume: [`get\\s+${n}:\\s+no such volume`, `no such volume:\\s+${n}`],
          network: [`network\\s+${n}\\s+not found`, `No such network:\\s+${n}`]
        }
        const message = r.stderr.trim()
        const absent = forms[kind].some((form) => new RegExp(`^${prefix}${form}$`, 'i').test(message))
        if (!r.timedOut && !r.unavailable && absent) return null
        throw new Error(`docker ${kind} inspect ${name} failed: ${r.stderr.trim().slice(0, 300)}`)
      }
      let parsed
      let doc
      try {
        parsed = JSON.parse(r.stdout)
        doc = parsed?.[0]
      } catch {
        throw new Error(`docker ${kind} inspect ${name}: unparseable output`)
      }
      if (!Array.isArray(parsed) || parsed.length !== 1 || !doc || typeof doc !== 'object') {
        throw new Error(`docker ${kind} inspect ${name}: unexpected output shape`)
      }
      const shapeProblem = inspectShapeProblem(kind, doc)
      if (shapeProblem) throw new Error(`docker ${kind} inspect ${name}: ${shapeProblem}`)
      const reportedName = kind === 'container' ? doc.Name.replace(/^\//, '') : doc.Name
      if (reportedName !== name) {
        throw new Error(`docker ${kind} inspect ${name}: output describes ${JSON.stringify(reportedName)}`)
      }
      const labels = (kind === 'container' ? doc.Config.Labels : doc.Labels) ?? {}
      const id = kind === 'volume' ? `${doc.Name}@${doc.CreatedAt}` : doc.Id
      return { id, project: labels[PROJECT_LABEL] ?? null, image: doc.Image ?? null }
    },
    async remove(kind, ref) {
      const args = kind === 'container' ? ['rm', '-f', ref] : [KINDS[kind], 'rm', ref]
      const r = await run(args)
      return { ok: r.code === 0, detail: r.stderr.trim().slice(0, 300) }
    },
    async exec(container, argv, { timeoutMs = 15_000 } = {}) {
      const r = await run(['exec', container, ...argv], { timeoutMs })
      return {
        ok: r.code === 0,
        detail: `${r.stdout}${r.stderr}`.trim().slice(0, 300),
        timedOut: r.timedOut === true
      }
    }
  }
}
