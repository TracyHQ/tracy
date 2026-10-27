/**
 * Shared facts and helpers of the QA stand `tracy-qa` (tasks/todo-daily-qa.md §3.1, §4.5).
 *
 * Exports:
 *   QA                                   — the §3.1 table as data (ports, subnets, names)
 *   qaHome(env?) -> string               — QA_HOME, default ~/TCH-local/qa
 *   composeFiles(srcDir) -> string[]     — the three compose files, in order
 *   composeArgs({srcDir, envFile}) -> string[]  — argv after `docker` for the QA project
 *   parseEnv(text) -> Map<string,string> — dotenv parser (compose rules for unquoted `#`)
 *   atomicWrite(path, data, mode?)       — write tmp → fsync → rename
 *   dockerRunner(bin?) -> (args, opts?) => {code, stdout, stderr}
 *   sha256(text|Buffer) -> hex
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { closeSync, fsyncSync, openSync, renameSync, writeSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const QA = Object.freeze({
  project: 'tracy-qa',
  siteDomain: 'qa.tracy.test',
  origin: 'http://qa.tracy.test:36080',
  webPort: '36080',
  webHostPort: '36081',
  dshPort: '36700',
  hostPort: '36720',
  postgresPort: '36730',
  minioPort: '36740',
  networkPrefix: '10.91.36',
  siteNetwork: 'tracy-qa_tracy',
  siteDns: '10.91.36.53',
  siteSubnetPrefix: '10.241',
  siteSubnet: '10.241.0.0/16',
  subnets: Object.freeze({
    default: '10.233.36.0/24',
    egress: '10.233.37.0/24',
    'docker-api': '10.233.38.0/24'
  }),
  siteAddressPrefix: 'qa-',
  sitePortMin: '53000',
  sitePortMax: '53019',
  imageTag: 'qa',
  appImages: Object.freeze(['tracy/web', 'tracy/host', 'tracy/dsh']),
  fixedSites: Object.freeze(['qa-fixedwp', 'qa-fixedjo', 'qa-fixedem']),
  // Health is checked by service NAME (§4.5), never by "everything is up".
  services: Object.freeze([
    'postgres',
    'minio',
    'dns',
    'tracy-web',
    'tracy-host',
    'docker-proxy',
    'tracy-dsh',
    'qa-egress'
  ]),
  postgresContainer: 'tracy-qa-postgres-1',
  standVolumes: Object.freeze({
    pg: 'tracy-qa_tracy-pg',
    minio: 'tracy-qa_tracy-minio',
    jobs: 'tracy-qa_tracy-host-jobs'
  })
})

export function qaHome(env = process.env) {
  return env.QA_HOME && env.QA_HOME !== '' ? env.QA_HOME : path.join(homedir(), 'TCH-local', 'qa')
}

// The QA overlay belongs to the orchestrator's own tree (qa-tool), not to the product tree being
// built: the product commit under test predates the overlay and must not need to carry it.
export const QA_OVERLAY = fileURLToPath(new URL('../../../deploy/compose.qa.yml', import.meta.url))

export function composeFiles(srcDir, overlay = process.env.QA_COMPOSE_OVERLAY || QA_OVERLAY) {
  const d = path.join(srcDir, 'deploy')
  return [path.join(d, 'compose.yml'), path.join(d, 'compose.macos.yml'), overlay]
}

export function composeArgs({ srcDir, envFile }) {
  const args = [
    'compose',
    '--project-directory',
    path.join(srcDir, 'deploy'),
    '--env-file',
    envFile,
    '-p',
    QA.project
  ]
  for (const f of composeFiles(srcDir)) args.push('-f', f)
  args.push('--profile', 'local')
  return args
}

export function parseEnv(text) {
  const out = new Map()
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '' || line.startsWith('#')) continue
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line)
    if (!m) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.lastIndexOf('"') > 0) || (v.startsWith("'") && v.lastIndexOf("'") > 0)) {
      v = v.slice(1, v.lastIndexOf(v[0]))
    } else {
      v = v.replace(/\s+#.*$/, '').trim()
    }
    out.set(m[1], v)
  }
  return out
}

export function atomicWrite(file, data, mode = 0o644) {
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
  const fd = openSync(tmp, 'w', mode)
  try {
    writeSync(fd, data)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  renameSync(tmp, file)
}

export function dockerRunner(bin = 'docker') {
  return (args, opts = {}) => {
    const r = spawnSync(bin, args, {
      encoding: 'utf8',
      input: opts.input,
      env: opts.env ?? process.env,
      maxBuffer: 256 * 1024 * 1024
    })
    return {
      code: r.status ?? 1,
      stdout: r.stdout ?? '',
      stderr: r.stderr ?? (r.error ? String(r.error) : '')
    }
  }
}

export function sha256(data) {
  return createHash('sha256').update(data).digest('hex')
}
