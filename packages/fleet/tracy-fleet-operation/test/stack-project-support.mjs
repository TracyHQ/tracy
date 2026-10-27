/**
 * Shared pieces of the three "second stack" test files (deploy-stack-project, deploy-host-dsh-project,
 * check-server-project). Not a test file: the suites glob `*.test.mjs`.
 *
 * The fake `docker` of each file logs one line per call, `<argv>\t<value of the variable compose
 * interpolates the env_file from>`, so a case can assert both what was asked and what the compose
 * process was handed.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

/** Variables the scripts read; a developer's shell must not leak any of them into a case. */
export const SCRUBBED = [
  'TRACY_COMPOSE_PROJECT',
  'HOST_DSH_PROJECT',
  'TRACY_STACK_EXTRA_FILES',
  'TRACY_STACK_ENV_FILE',
  'TRACY_STACK_DIR',
  'TRACY_POSTGRES_CONTAINER',
  'HOST_DSH_CONTAINER',
  'HOST_DSH_COMPOSE',
  'HOST_DSH_ENV_FILE',
  'DSH_IMAGE',
  'WEB_IMAGE',
  'HOST_IMAGE',
  'ENV_FILE',
  'STACK_DIR'
]

/** The process environment of a case: PATH starts with the stub dir, and none of SCRUBBED survives. */
export function baseEnv(dir, extra = {}) {
  const env = { ...process.env, PATH: `${dir}/bin:${process.env.PATH}`, GITHUB_ACTIONS: '' }
  for (const k of SCRUBBED) delete env[k]
  return { ...env, ...extra }
}

/** One log line per docker call → `{ argv, env }`. */
export function readCalls(text) {
  return text
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const i = line.lastIndexOf('\t')
      return { argv: line.slice(0, i), env: line.slice(i + 1) }
    })
}

/** Every `docker compose …` that acts on a project (the capability probe `compose version` does not). */
export const composeCalls = (calls) =>
  calls.filter((c) => c.argv.startsWith('compose ') && c.argv !== 'compose version')

/** The text of the function `name() { … }` in a shell script (its closing brace is at column 0). */
export function shellFunction(scriptFile, name) {
  const fn = readFileSync(scriptFile, 'utf8').match(new RegExp(`^${name}\\(\\) \\{[\\s\\S]*?^\\}`, 'm'))?.[0]
  if (!fn) throw new Error(`no ${name}() in ${scriptFile}`)
  return fn
}

/**
 * The script's own one-line default assignments (`ENV_FILE=…`, `SERVICES=(…)`), so a test that runs
 * `rollback_command` alone starts from the values the script really defaults to and not from a copy.
 */
export function defaultAssignments(scriptFile, names) {
  const src = readFileSync(scriptFile, 'utf8')
  return names
    .map((n) => {
      const line = src.match(new RegExp(`^${n}=.*$`, 'm'))?.[0]
      if (!line) throw new Error(`no ${n}= line in ${scriptFile}`)
      return line
    })
    .join('\n')
}

/**
 * Whether the installed `docker compose` can render a file without its env files existing
 * (`config --no-env-resolution`, Compose 2.2x and later). The static proofs skip without it.
 */
export const canRenderConfig = (() => {
  const help = spawnSync('docker', ['compose', 'config', '--help'], { encoding: 'utf8' })
  return help.status === 0 && /--no-env-resolution/.test(help.stdout + help.stderr)
})()
