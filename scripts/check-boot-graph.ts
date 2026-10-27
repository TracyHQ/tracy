/**
 * Gate: once dsh has booted it must deliver the CLIENT PLUGIN GRAPH, not just HTML.
 *
 * WHY A SEPARATE GATE. Every other gate in `scripts/` inspects SOURCE — plugin names, translated
 * strings, tokens, bundles. None of them goes red when the plugin tree compiles fine, boots fine and
 * serves the right HTML, yet `__DSH_BOOT__.entries` is empty. That is exactly the 30/08 breakage:
 * `--dump-config` listed all 153 rows, dsh answered HTTP 200, the log had not a single error line — and
 * the browser only showed "Failed to load plugins — client-modules: HTML did not preload …/client.js".
 *
 * THE FAILURE IT CATCHES. `dsh-client-modules` scans each Loader entry for packages declaring
 * `dsh.client`, and every resolve failure is swallowed in `catch {}` and read as "this package is not
 * a client package". A single cause underneath — that day it was `cordis-plugin-loader` mislabelling
 * the `resolveSync` signature by Node version — dropped ALL 153 entries at once, silently. There is no
 * middle ground: the UI is either all there or all gone. So asserting `entries > 0` is strong enough,
 * and that is also why this gate does not need to count exactly how many entries are right.
 *
 * WHY IT MUST REALLY BOOT. The graph only exists after the Loader has loaded the tree and
 * client-modules has scanned it. There is no way to read it statically: any hand-made rebuild would
 * itself become the thing to check, and would be green while the real one is red.
 *
 * The gate costs more than the content gates (~2-3 seconds, one dsh process), so it sits last in the list.
 *
 * WHAT IT DOES NOT REACH — said so nobody reads its green wider than the truth. This gate hits dsh
 * DIRECTLY. Users go through the password gate (dsh-passwords), and that layer has bugs of its own:
 * on 30/08 it re-encoded the query of the combo URL `/plugins/??a,b&rev=…` so dsh answered 404, while
 * everything measured here was still 200. Closing that would need signing in with the admin account,
 * whose password lives in SQLite, not in any config a gate can read — putting it in the repo would
 * trade one hole for a worse one. So this gap is DELIBERATE, not an oversight.
 */
import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:net'
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { load } from 'js-yaml'

const ROOT = resolve(import.meta.dirname, '..')
const DSH = join(ROOT, 'node_modules/.bin/dsh')

/**
 * Profiles to check — TWO, and they are two DIFFERENT plugin trees, not the same thing twice.
 *
 * `web` and `desktop` really are the same thing twice: same `@tracy/dsh-cowork-bundle`, the same layer
 * that broke on 30/08. Checking one is enough, and the first version of this gate checked only `web` for that reason.
 *
 * `native` does NOT share that layer (31/08): it loads `@tracy/dsh-native-bundle` instead of the sidecar
 * bundle, and it is the ONLY profile that loads `dsh-better-sidebar`. Another plugin tree is another
 * chance for `entries` to be empty — and that failure has no middle ground, so it would arrive as "a
 * blank UI on exactly the surface about to ship to customers".
 */
const PROFILES = ['web', 'native'] as const

/** dsh loads ~90 plugin packages; the first run on a cold machine is much slower than later ones. */
const BOOT_TIMEOUT_MS = 90_000

/**
 * Ask the OS for a free port.
 *
 * NOT a hard-coded number: a running `web` profile holds 51710 and `desktop` holds 51720, so a
 * constant would turn "machine is running dev" into "gate is red" — the kind of thing that gets gates switched off.
 * @returns The port number just allocated and released.
 */
async function freePort(): Promise<number> {
  return await new Promise((ok, no) => {
    const server = createServer()
    server.on('error', no)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        server.close(() => no(new Error('check-boot-graph: could not get a free port')))
        return
      }
      server.close(() => ok(address.port))
    })
  })
}

/**
 * Boot dsh and return exactly the line it prints with the sign-in token.
 * @param profile - profile to boot.
 * @param port - port forced on the webserver.
 * @param patch - path of the overlay that forces the port.
 * @returns The dsh process and a promise for the URL with token.
 */
function boot(profile: string, port: number, patch: string) {
  const child = spawn(
    DSH,
    [
      '--profile',
      profile,
      '--patch',
      patch,
      '--no-open',
      '--trusted-host',
      `127.0.0.1:${String(port)}`,
      '--trusted-host',
      `localhost:${String(port)}`
    ],
    { cwd: ROOT, env: { ...process.env, DSH_HOME: join(ROOT, 'tch') }, stdio: ['ignore', 'pipe', 'pipe'] }
  )

  let log = ''
  const url = new Promise<string>((ok, no) => {
    const timer = setTimeout(() => {
      no(new Error(`check-boot-graph: dsh printed no URL within ${String(BOOT_TIMEOUT_MS / 1000)}s\n${log}`))
    }, BOOT_TIMEOUT_MS)
    const read = (chunk: Buffer): void => {
      log += chunk.toString()
      const found = /dsh web: (\S+)/.exec(log)
      if (found !== null) {
        clearTimeout(timer)
        ok(found[1])
      }
    }
    child.stdout.on('data', read)
    child.stderr.on('data', read)
    // A process that dies before printing the URL must become an error with its log, not a silent
    // 90-second timeout — the two look alike to a CI reader, and only one of them names the cause.
    child.on('exit', (code) => {
      clearTimeout(timer)
      no(new Error(`check-boot-graph: dsh exited early (code ${String(code)})\n${log}`))
    })
  })

  return { child, url }
}

/**
 * Read `__DSH_BOOT__` from the home page, after trading the token for a cookie.
 * @param origin - dsh's HTTP origin.
 * @param token - the sign-in token dsh prints at startup.
 * @returns The name of every entry in the graph.
 */
async function bootGraphNames(origin: string, token: string): Promise<string[]> {
  // alpha.1 requires the cookie `dsh-auth-<host:port>`, only issued through `/?token=`. Skip this step and
  // the gate's read gets a 401 and would wrongly report "empty graph".
  const minted = await fetch(`${origin}/?token=${encodeURIComponent(token)}`, { redirect: 'manual' })
  const cookie = (minted.headers.getSetCookie() ?? []).map((line) => line.split(';')[0]).join('; ')
  if (cookie === '') throw new Error('check-boot-graph: dsh issued no cookie for the startup token')

  const page = await fetch(`${origin}/`, { headers: { cookie } })
  if (!page.ok) throw new Error(`check-boot-graph: home page answered ${String(page.status)}`)
  const html = await page.text()

  const found = /__DSH_BOOT__"\] = (\{.*?\})<\/script>/s.exec(html)
  if (found === null) throw new Error('check-boot-graph: __DSH_BOOT__ not found in the HTML')
  const parsed = JSON.parse(found[1]) as { entries?: unknown; batches?: unknown }
  if (!Array.isArray(parsed.entries))
    throw new Error('check-boot-graph: __DSH_BOOT__.entries is not an array')
  if (!Array.isArray(parsed.batches))
    throw new Error('check-boot-graph: __DSH_BOOT__.batches is not an array')

  // A FULL GRAPH DOES NOT MEAN IT LOADS. The first version of this gate only counted `entries` and was
  // green while the browser still died — because the bundle sits behind a combo URL `/plugins/??a,b&rev=…`
  // that a middle layer can mangle. Counting entries proves dsh CAN BUILD the graph; only a real load
  // proves it can DELIVER it.
  // Since dsh 0.1.7 the boot rows are DOCUMENT-RELATIVE (`plugins/??a,b&rev=…`, no leading
  // slash, upstream `eeb9b03465`) so that one build serves under any mount; before that they
  // were absolute (`/plugins/…`). Resolving against the served page's URL handles both, where
  // string concatenation produced `127.0.0.1:53288plugins/…` and a URL-parse error (26/09).
  for (const batch of parsed.batches as { phase: string; url: string }[]) {
    const script = await fetch(new URL(batch.url, `${origin}/`), { headers: { cookie } })
    if (!script.ok)
      throw new Error(`check-boot-graph: batch "${batch.phase}" answered ${String(script.status)}`)
    if ((await script.text()).length === 0)
      throw new Error(`check-boot-graph: batch "${batch.phase}" is empty`)
  }
  return (parsed.entries as unknown[]).map((e) => {
    const row = e as { name?: unknown; id?: unknown }
    return String(row.name ?? row.id ?? '')
  })
}

/**
 * Client plugins a profile MUST deliver, derived from the very bundles it loads.
 *
 * 🔒 WHY NOT A HAND-COPIED LIST. A hand-copied list drifts on the first plugin added, and a gate
 * watching an old list is a meaninglessly green gate. Here the expected set is read from the profile's
 * `dsh.profile.bundles` → each bundle's `cordis.patch.yml` → each package's `dsh.client`. Adding a plugin
 * to a bundle adds it to the check automatically.
 *
 * Only workspace packages are considered (two levels under `packages`): third-party packages live in the
 * profile's `node_modules`, and a profile not yet materialized cannot be read — the gate would go red for
 * missing files, not missing plugins. Tracy's packages are what we change daily, so they are also what
 * is most worth watching.
 * @param profile - profile name.
 * @returns `names`: the packages that must appear in `__DSH_BOOT__.entries`; `disabledIds`: rows the
 *   bundle inserts with `disabled: true` (a later layer turns them on), which this gate's boot switches on to measure them.
 */
function expectedClientPlugins(profile: string): { names: string[]; disabledIds: string[] } {
  const profileManifest = join(ROOT, 'tch/profiles', profile, 'package.json')
  if (!existsSync(profileManifest)) return { names: [], disabledIds: [] }
  const bundles = (
    JSON.parse(readFileSync(profileManifest, 'utf8')) as {
      dsh?: { profile?: { bundles?: unknown } }
    }
  ).dsh?.profile?.bundles
  if (!Array.isArray(bundles)) return { names: [], disabledIds: [] }

  // Workspace package name → folder, and which packages declare `dsh.client`.
  const clientPackages = new Map<string, boolean>()
  const bundleDirs = new Map<string, string>()
  const packagesDir = join(ROOT, 'packages')
  for (const group of readdirSync(packagesDir)) {
    let names: string[]
    try {
      names = readdirSync(join(packagesDir, group))
    } catch {
      continue
    }
    for (const name of names) {
      const manifest = join(packagesDir, group, name, 'package.json')
      if (!existsSync(manifest)) continue
      const pkg = JSON.parse(readFileSync(manifest, 'utf8')) as {
        name?: string
        dsh?: { client?: unknown; bundle?: unknown }
      }
      if (typeof pkg.name !== 'string') continue
      clientPackages.set(pkg.name, pkg.dsh?.client !== undefined)
      if (pkg.dsh?.bundle !== undefined) bundleDirs.set(pkg.name, join(packagesDir, group, name))
    }
  }

  const expected = new Set<string>()
  const disabledIds: string[] = []
  for (const bundle of bundles) {
    const dir = bundleDirs.get(String(bundle))
    if (dir === undefined) continue
    const patch = load(readFileSync(join(dir, 'cordis.patch.yml'), 'utf8'))
    if (!Array.isArray(patch)) continue
    for (const entry of patch) {
      const inserted = (entry as { insert?: unknown }).insert
      if (!Array.isArray(inserted)) continue
      for (const row of inserted) {
        const name = String((row as { name?: unknown }).name ?? '')
        if (clientPackages.get(name) !== true) continue
        expected.add(name)
        // Inserted DISABLED: a later layer turns it on (the desktop app's own patch for
        // `@tracy/dsh-model-plan`). The boot below switches it on too, so its bundle is still proven
        // to load instead of leaving the graph unchecked.
        if ((row as { disabled?: unknown }).disabled === true)
          disabledIds.push(String((row as { id?: unknown }).id))
      }
    }
  }
  return { names: [...expected].sort(), disabledIds }
}

/**
 * Rebuild every checked profile's plugin tree before booting anything.
 *
 * WHY THE GATE DOES THIS ITSELF, AND WHY IT DOES IT EVERY RUN. Until 06/09 a profile installed its
 * own plugins from a registry, so dsh materialized the tree on the way up and this gate only had to
 * boot. That is gone: profiles declare `dependencies: {}` and the tree exists only because
 * `materialize-profile.mjs` linked it from the workspace. A gate that needs a manual step nobody
 * names is a gate that is red for a reason its own message does not mention.
 *
 * The worse half is the one that stays green. This gate asserts `entries > 0`, and dsh's own
 * bundles supply entries on their own -- so a profile whose Tracy plugins never got linked can
 * still answer with a non-empty graph. Relinking here means the number is read off the tree this
 * repository actually declares, not off whatever a previous run happened to leave behind.
 */
function materializeProfiles(): void {
  const result = spawnSync('node', [join(ROOT, 'scripts', 'materialize-profile.mjs'), ...PROFILES], {
    cwd: ROOT,
    stdio: 'inherit'
  })
  if (result.status !== 0) {
    process.stderr.write(
      'check-boot-graph: materialize-profile failed — the profile plugin tree could not be built,\n' +
        'check-boot-graph: so every number below would describe another tree. Run `pnpm install` and\n' +
        'check-boot-graph: `pnpm dsh:build` first.\n'
    )
    process.exit(result.status ?? 1)
  }
}

/**
 * Boot ONE profile, read the graph, and go red when it is empty.
 * @param profile - profile to check.
 */
async function checkProfile(profile: string): Promise<void> {
  const port = await freePort()
  const dir = mkdtempSync(join(tmpdir(), 'tch-boot-graph-'))
  const patch = join(dir, 'port.patch.yml')
  const expected = expectedClientPlugins(profile)
  writeFileSync(
    patch,
    `- id: webserver\n  config:\n    host: 127.0.0.1\n    port: ${String(port)}\n` +
      expected.disabledIds.map((id) => `- id: ${id}\n  disabled: false\n`).join('')
  )

  const { child, url } = boot(profile, port, patch)
  try {
    const authenticated = await url
    const token = new URL(authenticated).searchParams.get('token')
    if (token === null)
      throw new Error(`check-boot-graph: the URL dsh printed carries no token: ${authenticated}`)

    const names = await bootGraphNames(`http://127.0.0.1:${String(port)}`, token)
    const size = names.length
    if (size === 0) {
      process.stderr.write(
        `check-boot-graph: [${profile}] __DSH_BOOT__.entries is EMPTY — dsh booted but delivers no client plugin.\n` +
          'check-boot-graph: the browser will show "Failed to load plugins". Look at where `dsh-client-modules`\n' +
          'check-boot-graph: swallows resolve errors, and at the `internal.version` label of cordis-plugin-loader.\n'
      )
      process.exit(1)
    }
    // COUNTING IS NOT PRESENCE, and that gap has really bitten. On 2026-08-31 a plugin was right there
    // in `--dump-config`, all peers resolved, the profile installed the right version — yet it was ABSENT
    // from `entries`, while the graph still had 52 entries. `dsh-client-modules` resolves each entry to see
    // whether the package declares `dsh.client` and swallows every failure in `catch {}`; a package that
    // fails to resolve is classed "not a client package", silently. The cause that day: the `.` export lacked
    // the `require`/`default` condition. So `size > 0` is necessary, not sufficient.
    const missing = expected.names.filter((name) => !names.includes(name))
    if (missing.length > 0) {
      process.stderr.write(
        `check-boot-graph: [${profile}] the graph has ${String(size)} entries but is MISSING ` +
          `${String(missing.length)} plugin(s) this profile's bundles declare:\n` +
          missing.map((m) => `  - ${m}\n`).join('') +
          'check-boot-graph: the package reached the loader tree but was not classed as a client package. Check\n' +
          'check-boot-graph: whether its `exports` resolve with require, and whether its peers are all there.\n'
      )
      process.exit(1)
    }
    process.stdout.write(
      `check-boot-graph: [${profile}] ${String(size)} entries, all ${String(expected.names.length)} declared Tracy plugins present\n`
    )
  } finally {
    child.kill('SIGTERM')
  }
}

/**
 * Check each profile, IN SEQUENCE.
 *
 * In parallel it is twice as fast and wrong: `freePort()` asks for a port and RETURNS it before dsh
 * binds, so two concurrent runs can be handed the same number. A gate that goes red on a port clash
 * teaches people to switch it off.
 */
async function main(): Promise<void> {
  materializeProfiles()
  for (const profile of PROFILES) await checkProfile(profile)
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
