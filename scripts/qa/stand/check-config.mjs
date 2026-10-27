#!/usr/bin/env node
/**
 * Check the QA env file and the rendered compose config BEFORE any build (§4.5, §10).
 *
 *   checkEnv(envMap) -> Problem[]
 *   checkCompose(config, envMap) -> Problem[]          // config = `docker compose … config --format json`
 *   checkReadConfig(srcDir, envMap) -> Promise<Problem[]>  // tree T's own readConfig, in node
 *   checkConfig({ envFile, srcDir, composeConfig? , docker? }) -> Promise<{ ok, problems }>
 *   type Problem = { key: string, message: string }
 *
 * Never prints a value: problems name keys and expected NON-secret values only.
 *
 * CLI: node check-config.mjs --env <file> --src <tree> [--compose-json <file> | --no-compose]
 *   Without --compose-json it runs `docker compose … config --format json` (read-only) through the
 *   `docker` on PATH. Exit 0 = clean; 1 = problems (one line each: `<key>: <message>`).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isForbidden } from './make-env.mjs'
import { QA, composeArgs, dockerRunner, parseEnv } from './qa-stand.mjs'

// §3.1, as the env file must spell it.
export const EXPECTED = Object.freeze({
  TRACY_ORIGIN: QA.origin,
  SITE_DOMAIN: QA.siteDomain,
  SESSION_DOMAIN: QA.siteDomain,
  WEB_PORT: QA.webPort,
  QA_WEB_HOST_PORT: QA.webHostPort,
  QA_DSH_PORT: QA.dshPort,
  TRACY_HOST_PORT: QA.hostPort,
  POSTGRES_PORT: QA.postgresPort,
  MINIO_PORT: QA.minioPort,
  TRACY_NETWORK_PREFIX: QA.networkPrefix,
  TRACY_SITE_NETWORK: QA.siteNetwork,
  TRACY_SITE_DNS: QA.siteDns,
  TRACY_SITE_SUBNET_PREFIX: QA.siteSubnetPrefix,
  SITE_ADDRESS_PREFIX: QA.siteAddressPrefix,
  SITE_PORT_MIN: QA.sitePortMin,
  SITE_PORT_MAX: QA.sitePortMax,
  APP_IMAGE_TAG: QA.imageTag,
  DSH_IMAGE_TAG: QA.imageTag,
  HOST_NAME: 'local',
  HOSTS: 'local',
  TRACY_EGRESS_FENCE: 'off',
  LOCAL_LOGIN_PREVIEW: '0',
  MAIL: 'console'
})
export const REQUIRED_SECRETS = Object.freeze([
  'SESSION_SECRET',
  'MCP_TRACY_ACTOR_SECRET',
  'HOST_local_SECRET',
  'SEAT_local_SECRET'
])
export const REQUIRED_PATHS = Object.freeze([
  'QA_HOME',
  'QA_TOOL_DIR',
  'TRACY_SITES_ROOT',
  'TRACY_PRIVATE_ROOT',
  'TRACY_DSH_HOME'
])

export function checkEnv(env) {
  const problems = []
  for (const [key, want] of Object.entries(EXPECTED)) {
    if (!env.has(key) || env.get(key) === '') problems.push({ key, message: `missing (want ${want})` })
    else if (env.get(key) !== want) problems.push({ key, message: `must be ${want}` })
  }
  for (const key of REQUIRED_SECRETS) {
    const v = env.get(key) ?? ''
    if (v.length < 32) problems.push({ key, message: 'must be a generated secret (>= 32 characters)' })
  }
  if (!env.get('MODEL_API_KEY'))
    problems.push({ key: 'MODEL_API_KEY', message: 'is empty — the stand chat cannot answer' })
  for (const key of REQUIRED_PATHS) {
    const v = env.get(key) ?? ''
    if (!path.isAbsolute(v)) problems.push({ key, message: 'must be an absolute path' })
  }
  const home = env.get('QA_HOME') ?? ''
  for (const [key, sub] of [
    ['TRACY_SITES_ROOT', 'sites'],
    ['TRACY_PRIVATE_ROOT', 'private'],
    ['TRACY_DSH_HOME', 'dsh-home']
  ]) {
    if (home && env.get(key) && env.get(key) !== path.join(home, sub))
      problems.push({ key, message: `must be QA_HOME/${sub}` })
  }
  for (const [key, v] of env) {
    if (isForbidden(key) && v !== '') problems.push({ key, message: 'must be empty on the QA stand' })
  }
  return problems
}

const portsOf = (svc) => (svc?.ports ?? []).map((p) => `${p.host_ip ?? ''}:${p.published}->${p.target}`)

export function checkCompose(config, env) {
  const problems = []
  const p = (key, message) => problems.push({ key, message })
  if (config.name !== QA.project) p('compose.name', `must be ${QA.project}`)
  const s = config.services ?? {}
  for (const name of QA.services) if (!s[name]) p(`services.${name}`, 'missing')
  if (s['dns-host']) p('services.dns-host', 'must not run on the QA stand (the shared stand owns its port)')

  const tracy = config.networks?.tracy ?? {}
  if (tracy.name !== QA.siteNetwork) p('networks.tracy.name', `must be ${QA.siteNetwork}`)
  if (tracy.internal !== true) p('networks.tracy.internal', 'must be true')
  const subnetOf = (n) => config.networks?.[n]?.ipam?.config?.[0]?.subnet
  if (subnetOf('tracy') !== `${QA.networkPrefix}.0/24`)
    p('networks.tracy.subnet', `must be ${QA.networkPrefix}.0/24`)
  for (const [n, want] of Object.entries(QA.subnets))
    if (subnetOf(n) !== want) p(`networks.${n}.subnet`, `must be ${want}`)

  const wantPorts = {
    'tracy-web': [`127.0.0.1:${QA.webHostPort}->${QA.webPort}`],
    'tracy-host': [`127.0.0.1:${QA.hostPort}->${QA.hostPort}`],
    'tracy-dsh': [`127.0.0.1:${QA.dshPort}->8080`],
    postgres: [`127.0.0.1:${QA.postgresPort}->5432`],
    minio: [`127.0.0.1:${QA.minioPort}->9000`]
  }
  for (const [name, want] of Object.entries(wantPorts)) {
    if (s[name] && JSON.stringify(portsOf(s[name])) !== JSON.stringify(want))
      p(`services.${name}.ports`, `must be ${want.join(',')}`)
  }
  for (const name of ['dns', 'docker-proxy', 'qa-egress', 'minio-init']) {
    if (s[name] && portsOf(s[name]).length) p(`services.${name}.ports`, 'must publish nothing')
  }
  for (const [name, img] of [
    ['tracy-web', 'tracy/web'],
    ['tracy-host', 'tracy/host'],
    ['tracy-dsh', 'tracy/dsh']
  ]) {
    if (s[name] && s[name].image !== `${img}:${QA.imageTag}`)
      p(`services.${name}.image`, `must be ${img}:${QA.imageTag}`)
  }
  for (const name of ['tracy-dsh', 'docker-proxy']) {
    const cn = s[name]?.container_name
    if (cn !== undefined && !cn.startsWith('tracy-qa-'))
      p(`services.${name}.container_name`, 'must start with tracy-qa-')
  }
  // env_file is resolved into `environment` by `compose config`; QA_HOME exists only in the QA env
  // file, so its presence with the right value proves the absolute QA env_file was used.
  for (const name of ['tracy-web', 'tracy-host']) {
    const e = s[name]?.environment ?? {}
    if (e.QA_HOME !== env.get('QA_HOME'))
      p(`services.${name}.env_file`, 'must be the QA env file (QA_HOME/.env)')
    if (e.TRACY_SITE_NETWORK !== QA.siteNetwork)
      p(`services.${name}.TRACY_SITE_NETWORK`, `must be ${QA.siteNetwork}`)
    if (e.TRACY_SITE_DNS !== QA.siteDns) p(`services.${name}.TRACY_SITE_DNS`, `must be ${QA.siteDns}`)
  }
  const dshEnv = s['tracy-dsh']?.environment ?? {}
  if (dshEnv.HTTPS_PROXY !== 'http://qa-egress:3128')
    p('services.tracy-dsh.HTTPS_PROXY', 'must be http://qa-egress:3128')
  if (dshEnv.NODE_USE_ENV_PROXY !== '1') p('services.tracy-dsh.NODE_USE_ENV_PROXY', 'must be 1')
  const dnsCmd = s.dns?.command ?? []
  if (dnsCmd.some((a) => String(a).startsWith('--server')))
    p('services.dns.command', 'must not forward (no --server)')
  if (!dnsCmd.includes(`--address=/${QA.siteDomain}/${QA.networkPrefix}.10`))
    p('services.dns.command', `must answer ${QA.siteDomain}`)
  const eg = s['qa-egress']?.networks ?? {}
  if (s['qa-egress'] && (!eg.egress || !eg.default))
    p('services.qa-egress.networks', 'must be on egress and default')
  return problems
}

export async function checkReadConfig(srcDir, env) {
  const file = path.join(srcDir, 'apps', 'tracy-web', 'src', 'config.js')
  // The environment tracy-web sees in the container: env_file + compose `environment:`.
  const runtime = Object.fromEntries(env)
  runtime.NODE_ENV = 'development'
  runtime.PORT = env.get('WEB_PORT') ?? ''
  runtime.DATABASE_URL = `postgres://tracy:${env.get('POSTGRES_PASSWORD') || 'tracy'}@postgres:5432/tracy`
  try {
    const mod = await import(`${pathToFileURL(file).href}?t=${Date.now()}`)
    mod.readConfig(runtime)
    return []
  } catch (error) {
    return [
      { key: error?.key ?? 'readConfig', message: `readConfig of ${srcDir}: ${error?.message ?? error}` }
    ]
  }
}

export async function checkConfig({ envFile, srcDir, composeConfig = undefined, docker = dockerRunner() }) {
  const env = parseEnv(readFileSync(envFile, 'utf8'))
  const problems = [...checkEnv(env)]
  let config = composeConfig
  if (config === undefined) {
    const r = docker([...composeArgs({ srcDir, envFile }), 'config', '--format', 'json'])
    if (r.code !== 0)
      problems.push({
        key: 'compose',
        message: `docker compose config failed: ${r.stderr.trim().split('\n').slice(-3).join(' | ')}`
      })
    else config = JSON.parse(r.stdout)
  }
  if (config) problems.push(...checkCompose(config, env))
  problems.push(...(await checkReadConfig(srcDir, env)))
  return { ok: problems.length === 0, problems }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2)
  const get = (flag) => {
    const i = argv.indexOf(flag)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const envFile = get('--env')
  const srcDir = get('--src')
  if (!envFile || !srcDir) {
    console.error('usage: check-config.mjs --env <file> --src <tree> [--compose-json <file> | --no-compose]')
    process.exit(2)
  }
  const jsonFile = get('--compose-json')
  const composeConfig = argv.includes('--no-compose')
    ? null
    : jsonFile
      ? JSON.parse(readFileSync(jsonFile, 'utf8'))
      : undefined
  const { ok, problems } = await checkConfig({
    envFile: path.resolve(envFile),
    srcDir: path.resolve(srcDir),
    composeConfig
  })
  for (const pr of problems) console.error(`${pr.key}: ${pr.message}`)
  if (ok) console.log('check-config: QA env and compose config match §3.1')
  process.exit(ok ? 0 : 1)
}
