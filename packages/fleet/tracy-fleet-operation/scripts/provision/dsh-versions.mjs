#!/usr/bin/env node
/**
 * What this host's dsh is running — image tag, container state, and every Tracy package inside it.
 * Runs ON a fleet host, behind `POST /dsh-versions`. Reads only; changes nothing.
 *
 * ## Use
 *
 *   dsh-versions.mjs --host contabo
 *
 * One line of JSON on stdout. Exit code is 0 even when the container is absent — see ABSENT below.
 *
 * ## Why it exists, and why it is not the old one
 *
 * The harness screen `Site agents` asked each host `POST /lane-versions` for one container per
 * site. ADR 0014 left it nothing to draw — one dsh per machine, shared by every site on it — and
 * the screen, the Worker module and all three lane doors were removed on 2026-09-06 (`fb51fe8e`,
 * `f723ff3c`). The question survived the answer: which host runs which build. This is that
 * question asked per HOST.
 *
 * 🔒 IN THE REPO, UNLIKE ITS PREDECESSOR. `tools/lane-versions.mjs` lived only at
 * `/opt/tracy-fleet/tools/` on two machines and was in no repository — `git log` for it is empty.
 * Two copies drifted with nothing to compare them against, which is the same failure mode as the
 * CI runners' `compose.yml`. This one ships from here, and `provision/` rather than `tools/`
 * because `deploy/fleet-receive.sh` only accepts that prefix (gate `infra-contracts` states
 * it): a script under `tools/` is a script the host never receives.
 *
 * 🔒 THE ENV FILE IS NOT A PAYLOAD. `/etc/tracy/host-dsh.env` is `env_file` for the container, so
 * its own header warns that `docker inspect tracy-dsh` prints all of it to anyone in the docker
 * group — seat secrets included, if a later editor puts one there against that warning. Exactly
 * three keys leave this script, and `tagsFrom` is an allow-list rather than a parser.
 *
 * ⚠ ABSENT IS AN ANSWER. A stopped container, a missing env file, a docker that will not talk: all
 * of them come back as a payload that says so. The old `fleet.js` put the rule one level up — "a
 * host that does not answer is a ROW, not an exception" — and it has to hold here too, or the
 * screen shows a blank row with nothing to explain it. Throwing would turn one sick host into an
 * empty table.
 */

import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'

const run = promisify(execFile)

const ENV_FILE = process.env.HOST_DSH_ENV_FILE ?? '/etc/tracy/host-dsh.env'
const CONTAINER = process.env.HOST_DSH_CONTAINER || 'tracy-dsh'

/** Where the Dockerfile copies every Tracy plugin. Not a guess: `dsh/Dockerfile` COPY lines. */
const PLUGIN_ROOT = '/desk-home/profiles/native/node_modules/@tracy'

/**
 * The repository `deploy-host-dsh.sh` defaults to: `<TRACY_IMAGE_PREFIX>/tracy-dsh`, the prefix being
 * the GHCR owner `build-dsh-image.yml` pushes to unless the host names another registry.
 */
const DEFAULT_IMAGE = `${process.env.TRACY_IMAGE_PREFIX || 'ghcr.io/tracyhq'}/tracy-dsh`

/**
 * The three keys wanted out of the env file — an ALLOW-LIST, deliberately not a parser.
 *
 * @param {string} text - contents of `/etc/tracy/host-dsh.env`.
 * @returns {{ image: string, tag: string|null, previous: string|null }}
 */
export function tagsFrom(text) {
  const read = (key) => {
    // Last assignment wins, matching how a shell would source the file, and a commented line is
    // not an assignment: `deploy-host-dsh.sh` rewrites these lines and leaves the old ones
    // commented above, so a parser that ignored `#` would report the tag before last.
    const found = String(text ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith(`${key}=`))
      .pop()
    return found ? found.slice(key.length + 1).trim() || null : null
  }
  return {
    image: read('DSH_IMAGE') ?? DEFAULT_IMAGE,
    tag: read('DSH_IMAGE_TAG'),
    previous: read('DSH_IMAGE_TAG_PREVIOUS')
  }
}

/**
 * Package rows, sorted by name so two hosts can be compared line by line on the screen.
 *
 * A missing `version` stays `null`. The image copies plugin directories verbatim and runs no build
 * in them (CLAUDE.md RULE #3), so a package that states no version is a real fact about this
 * image — and a guess here would read on screen exactly like a measurement.
 *
 * @param {readonly {name: string, version?: string}[]} entries
 * @returns {{name: string, version: string|null}[]}
 */
export function packagesFrom(entries) {
  return [...(entries ?? [])]
    .map((entry) => ({ name: entry.name, version: entry.version ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * The answer this host sends back.
 *
 * `image.tag` is what the env file CLAIMS; `container.image` is what docker says is actually
 * running. They differ exactly when a deploy half-succeeded — the file rewritten, the container
 * not restarted — and only carrying both lets the screen show it.
 *
 * @param {{host: string, tags: object, inspect: object|null, packages: readonly object[], error?: string|null}} input
 */
export function payloadFrom({ host, tags, inspect, packages, error = null }) {
  const state = inspect?.State ?? null
  return {
    host,
    image: { repository: tags.image, tag: tags.tag, previous: tags.previous },
    container: {
      name: CONTAINER,
      // `absent` and `exited` are different answers: one means nothing was ever there for this
      // deploy, the other means it ran and stopped.
      status: state?.Status ?? 'absent',
      // A container with no healthcheck has no `Health` at all. Reporting that as `unhealthy`
      // would put a red dot beside a machine that is fine.
      health: state?.Health?.Status ?? null,
      startedAt: state?.StartedAt ?? null,
      image: inspect?.Config?.Image ?? null
    },
    packages: packagesFrom(packages),
    error
  }
}

/** `docker inspect` for the one container, or `null` when it is not there. Never throws. */
async function inspectContainer() {
  try {
    const { stdout } = await run('docker', ['inspect', CONTAINER], { timeout: 20_000 })
    const parsed = JSON.parse(stdout)
    return Array.isArray(parsed) ? (parsed[0] ?? null) : null
  } catch {
    return null
  }
}

/**
 * Every `@tracy/*` package inside the running container, read from its own `package.json`.
 *
 * One `docker exec` rather than one per package: twelve execs into a container that is serving
 * every site on the machine is twelve pauses for a screen that refreshes every four seconds.
 */
async function readPackages() {
  const script = `
    const { readdirSync, readFileSync } = require('fs')
    const root = ${JSON.stringify(PLUGIN_ROOT)}
    const out = []
    for (const dir of readdirSync(root)) {
      try {
        const pkg = JSON.parse(readFileSync(root + '/' + dir + '/package.json', 'utf8'))
        out.push({ name: pkg.name ?? '@tracy/' + dir, version: pkg.version })
      } catch {}
    }
    process.stdout.write(JSON.stringify(out))
  `
  try {
    const { stdout } = await run('docker', ['exec', CONTAINER, 'node', '-e', script], {
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024
    })
    const parsed = JSON.parse(stdout)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function main() {
  const argv = process.argv.slice(2)
  const at = argv.indexOf('--host')
  const host = at >= 0 ? (argv[at + 1] ?? '') : ''

  let tags = { image: DEFAULT_IMAGE, tag: null, previous: null }
  let error = null
  try {
    tags = tagsFrom(await readFile(ENV_FILE, 'utf8'))
  } catch {
    // Not fatal, and worth naming: a host whose env file cannot be read still has a container to
    // report on, and the screen should say which half is missing.
    error = `cannot read ${ENV_FILE}`
  }

  const inspect = await inspectContainer()
  const packages = inspect?.State?.Status === 'running' ? await readPackages() : []

  process.stdout.write(`${JSON.stringify(payloadFrom({ host, tags, inspect, packages, error }))}\n`)
}

// Only when run, never when imported by the test beside it.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  await main()
}
