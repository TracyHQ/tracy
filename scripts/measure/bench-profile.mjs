#!/usr/bin/env node
/**
 * A dsh profile that answers ONE prompt and exits, carrying the same plugin stack a customer's
 * agent carries — so a change to the harness can be measured instead of argued about.
 *
 * WHY THIS HAD TO BE BUILT. Task §3 of `tasks/todo-beta-01-10.md` asks for "time and tokens per
 * agent turn" and then for "two improvements with before/after numbers", and on 17/09 there was no
 * way to get either without a person driving a browser. dsh speaks RPC over a WebSocket and serves
 * no REST for it, so a prompt cannot be posted; the CLI does have a one-shot mode
 * (`dsh --profile headless "…"`), but the shipped image carries only the `native` profile, which
 * boots the web server instead.
 *
 * 🔒 THE STACK MUST BE THE CUSTOMER'S, OR THE NUMBER IS ABOUT A DIFFERENT PROGRAM. Two traps, both
 * measured the hard way on 17/09:
 *
 *  1. `@tracy/dsh-site-tools` declares `inject = ['webServer', 'tools']`. The headless bundle
 *     publishes no `webServer`, so the plugin under measurement silently does not activate — the
 *     run succeeds, prints an answer, and `tracy_site` was never in the tool list. The first bench
 *     run looked fine and measured an agent with no site door at all. A `webserver` row is therefore
 *     INSERTED here on loopback, on a port nothing else uses.
 *  2. The native profile's own patch amends a `webserver` row it expects the web bundle to have
 *     brought. Patching by id against a bundle that has no such row is skipped in silence, which is
 *     how trap 1 survived the first fix.
 *
 * Five rows still do not activate, and none of them changes what a model can do: `better-sidebar`,
 * `dsh-passwords` and `tracy-add-site` are browser surfaces, and `workflow-ptc` and `tool-workflow`
 * wait on runtimes this deployment disables in the image anyway. Every run PRINTS what did not
 * activate, so that list is checked each time instead of trusted — it is how the webserver trap was
 * caught twice.
 *
 * WHAT IT IS NOT. It is not a gate and it must never become one: it spends real model tokens and its
 * answers vary run to run. It is a measuring instrument, so it reports the SPREAD of repeats rather
 * than one number, and it refuses to print a comparison from a single sample.
 *
 * Usage:
 *   node scripts/measure/bench-profile.mjs stage                 # write the profile into the container
 *   node scripts/measure/bench-profile.mjs run <label> "<prompt>" [--repeat 2]
 *   node scripts/measure/bench-profile.mjs report [n]            # decode the last n sessions
 */
import { execFile } from 'node:child_process'
import process from 'node:process'

/** The container the fleet's one dsh runs in; the same one `rebuild-local.sh` recreates. */
const DSH = process.env.TRACY_DSH_CONTAINER ?? 'tracy-dsh'
/** Where dsh keeps profiles inside that container — the bind mount, so a stage survives a restart. */
const PROFILES = '/desk-home/profiles'
/** A port no Tracy surface uses, so the bench web server can never be mistaken for a real one. */
const BENCH_PORT = 51799

/** @param {string[]} argv @param {number} [ms] @returns {Promise<{ code: number, out: string }>} */
function run(argv, ms = 600_000) {
  return new Promise((resolve) => {
    execFile('docker', argv, { timeout: ms, maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) =>
      resolve({ code: error ? 1 : 0, out: `${stdout ?? ''}${stderr ?? ''}` })
    )
  })
}

/** @param {string} script @param {string} [cwd] */
const sh = (script, cwd = '/') => run(['exec', '-w', cwd, DSH, 'sh', '-lc', script])

const PROFILE_JSON = JSON.stringify(
  {
    name: 'dsh-profile-bench',
    private: true,
    description:
      'Measurement only. The native plugin stack with the headless app in place of the web server, so one prompt can be answered and counted. Written by scripts/measure/bench-profile.mjs; not shipped in any image.',
    dependencies: {},
    dsh: {
      profile: {
        bundles: [
          '@deepseek-ai/dsh-base',
          '@deepseek-ai/dsh-headless',
          'dsh-better-sidebar',
          '@tracy/dsh-native-bundle'
        ],
        patchReload: 'startup'
      }
    }
  },
  null,
  2
)

/**
 * The one row the native patch cannot supply here, prepended to a copy of that patch.
 *
 * `insert` takes a LIST, not a boolean — a boolean throws `patch.insert?.forEach is not a function`
 * out of the profile loader, which is a good failure and was how this was found.
 */
const WEBSERVER_ROW = `# Written by scripts/measure/bench-profile.mjs — the row \`@tracy/dsh-site-tools\` needs to exist at
# all. It declares inject = ['webServer', 'tools']; the headless bundle publishes no webServer, so
# without this the plugin under measurement does not activate and the run measures an agent that has
# no site door. Loopback and a port no Tracy surface uses: this server is never meant to be reached.
- insert:
    - id: webserver
      name: '@deepseek-ai/dsh-host-webserver'
      config:
        host: 127.0.0.1
        port: ${BENCH_PORT}

`

async function stage() {
  const probe = await sh(`test -f ${PROFILES}/native/cordis.patch.yml && echo yes || echo no`)
  if (!probe.out.includes('yes')) {
    console.error(`bench: ${DSH} has no native profile at ${PROFILES}/native — is the container up?`)
    process.exit(1)
  }
  // 🔒 NEWLINES, NOT `&&`. A heredoc ends at its delimiter ON ITS OWN LINE; joining these with
  // ` && ` puts `JSON && cat …` on that line and the shell answers `Syntax error: "&&" unexpected`.
  // `set -e` gives back the abort-on-failure that the chain was there for.
  const staged = await sh(
    [
      'set -e',
      `mkdir -p ${PROFILES}/bench`,
      `cat > ${PROFILES}/bench/package.json <<'JSON'`,
      PROFILE_JSON,
      'JSON',
      `cat > ${PROFILES}/bench/cordis.patch.yml <<'YAML'`,
      WEBSERVER_ROW.trimEnd(),
      'YAML',
      // 🔒 AND THE NATIVE ROW MUST BE NEUTRALISED, not merely outranked. A patch by id replaces the
      // row's WHOLE config (CLAUDE.md §native profile), so the deployment's own `- id: webserver`
      // drags the inserted row back to 0.0.0.0:51700 — the port the RUNNING tracy-dsh already holds.
      // The bind then fails, no webServer is ever published, and every Tracy plugin waits for it
      // for ever: the exact silent shape this file exists to refuse. Renaming the id leaves a patch
      // that matches nothing, which the loader skips quietly and harmlessly.
      `sed 's/^- id: webserver$/- id: webserver-not-for-the-bench/' ${PROFILES}/native/cordis.patch.yml >> ${PROFILES}/bench/cordis.patch.yml`,
      // The plugin trees are the native profile's own, so the bench measures the code the customer
      // runs rather than a second copy that can drift from it.
      `ln -sfn ${PROFILES}/native/node_modules ${PROFILES}/bench/node_modules`,
      'echo staged'
    ].join('\n')
  )
  if (!staged.out.includes('staged')) {
    console.error(`bench: could not stage the profile\n${staged.out}`)
    process.exit(1)
  }
  console.log(`bench: profile staged at ${PROFILES}/bench in ${DSH}`)
}

/** @param {string} label @param {string} prompt @param {number} repeat */
async function runPrompt(label, prompt, repeat) {
  await stage()
  for (let i = 1; i <= repeat; i += 1) {
    process.stdout.write(`bench: ${label} run ${i}/${repeat} … `)
    const started = Date.now()
    const answer = await sh(
      `node /opt/dsh/apps/cli/lib/bin.js --profile bench ${JSON.stringify(prompt)}`,
      `/site/${label}`
    )
    const inactive = [...answer.out.matchAll(/^(\S+) \(([^)]+)\): pending/gm)].map((m) => m[1])
    console.log(`${((Date.now() - started) / 1000).toFixed(0)}s`)
    // Said on every run, never assumed: a plugin that did not activate is a plugin the number is not
    // about, and `tracy-site-tools` missing is the difference between measuring Tracy and measuring dsh.
    if (inactive.includes('tracy-site-tools')) {
      console.error('  ⚠ tracy-site-tools DID NOT ACTIVATE — this run measures an agent with no site door')
    }
    if (inactive.length > 0) console.log(`  (did not activate: ${inactive.join(', ')})`)
  }
  console.log('bench: now run `report` to count what those runs cost')
}

const USAGE = `use:
  node scripts/measure/bench-profile.mjs stage
  node scripts/measure/bench-profile.mjs run <site-label> "<prompt>" [--repeat N]
  node scripts/measure/bench-profile.mjs report [how-many-sessions]`

const [command, ...rest] = process.argv.slice(2)
if (command === 'stage') {
  await stage()
} else if (command === 'run') {
  const [label, prompt] = rest
  const at = rest.indexOf('--repeat')
  const repeat = at >= 0 ? Number(rest[at + 1]) : 1
  if (!label || !prompt || !Number.isInteger(repeat) || repeat < 1) {
    console.error(USAGE)
    process.exit(2)
  }
  await runPrompt(label, prompt, repeat)
} else if (command === 'report') {
  const { report } = await import('./session-metrics.mjs')
  await report(Number(rest[0]) || 4)
} else {
  console.error(USAGE)
  process.exit(2)
}
