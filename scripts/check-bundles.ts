/**
 * Gate for generated bundles: does each plugin's `lib/client.js` match its source.
 *
 * WHY A MACHINE. A stale bundle is the **quietest** failure in this repo: change a string in `src/`,
 * forget to build, and what reaches the fleet is still the old text — no error, no warning, just a
 * wrong screen. `lib/client.js` is COMMITTED (the fleet copies the plugin folder as is and runs no build
 * there), so "forgot to build" is a pushable state.
 *
 * WHY THIS GATE CAME LATE. Until 2026-08-30 wiring it in meant random red: esbuild writes source-path
 * comments **relative to cwd**, so `pnpm --filter … build` (from the repo root) and
 * `node scripts/build-client.mjs` (from the package folder) produced two bundles 36 lines apart — none of
 * them code. `--check` compares verbatim, so it judged by **where the command was typed**, not by content.
 * Fixed with a fixed `absWorkingDir` in `tracy-view`; this gate is the rest of that work.
 *
 * Runs like any gate: cwd is the repo root, a non-zero exit is a failure.
 */
import { spawn } from 'node:child_process'
import { availableParallelism } from 'node:os'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { bareImports, installedTracyPackages } from './lib/bundle-imports.mjs'

/**
 * Packages with a generated bundle, and their check script.
 *
 * An explicit list, not a folder scan: a new plugin with a bundle must be added here
 * DELIBERATELY. With a scan, adding a plugin silently widens the gate and nobody notices the
 * scope changed — the same reason `check-all.ts` lists its gates by hand.
 */
const BUNDLED = [
  'packages/locale/tracy-locale-vi',
  // Added 02/10/2026 with the package (spec #730): de/fr/it/nl/zh dictionaries, same generated
  // and committed `lib/client.js` model as tracy-locale-vi.
  'packages/locale/tracy-locales',
  'packages/ui/tracy-chat-input',
  // Added 30/08/2026. This package has had `scripts/build-client.mjs` and a committed `lib/client.js`
  // since it was created, but was never named here — so the Settings page bundle could go stale with no
  // gate knowing, exactly the failure this gate exists to stop.
  //
  // How it was found is a reconciliation worth repeating when in doubt: list every package with
  // `lib/client.js` AND `scripts/build-client.mjs`, then compare with this list.
  // `packages/brand/tracy-brand` used to stay out: its `lib/client.js` was 55 hand-written lines, i.e.
  // source, not a build. No longer true since 03/09/2026 — the package has `src/` and two build scripts,
  // and precisely because no gate covered it, the `lib/` changed on 02/09 was never published to the registry.
  'packages/brand/tracy-brand',
  'packages/ui/tracy-sidebar',
  'packages/ui/tracy-settings',
  // Added 07/09/2026 with the rename (ADR 0010): the package has had both build scripts and a committed
  // `lib/` since 05/09, but was never listed here — the same gap as tracy-settings above.
  'packages/design/tracy-design-inspiration',
  // Added 31/08/2026, the SECOND time the reconciliation above found a missed package:
  // `tracy-add-site` has had `scripts/build-client.mjs` and a committed `lib/client.js` since it was
  // created, but was never named here. The Add site tab bundle could go stale with no gate knowing.
  //
  // From today this package has TWO committed builds — `lib/client.js` (browser) and `lib/index.js`
  // (the Node half). Both reach the fleet by copying the folder, so both can be "forgot to build".
  // The loop below runs every `scripts/build-*.mjs` the package has, instead of naming build-client.
  'packages/site/tracy-add-site',
  // Added 04/09/2026 — the THIRD time the reconciliation found missed packages, and this time two at
  // once. Both have had `scripts/build-client.mjs` and a committed `lib/client.js` since creation; both
  // stayed off this list, so the `lib/` of My Sites (the Start the agent button) and of the mode
  // picker could go stale with 19 gates still green.
  'packages/site/tracy-my-sites',
  'packages/site/tracy-inbox',
  'packages/ui/tracy-mode-picker',
  // Added 04/09/2026 with the package itself: two committed builds (client + host), like add-site.
  'packages/site/tracy-site-tabs',
  // Added 06/09/2026 with the package itself: host build only (the browser half comes with slice 3).
  'packages/design/tracy-brand-engine',
  // Added 13/09/2026 — the FOURTH time the reconciliation above found packages missing here, and
  // this time four at once. All four have `scripts/build-*.mjs` and a committed `lib/`. The one
  // that bit: two stage strings were added to `tracy-site-build-joomla`'s `strings.ts`, this gate
  // ran green, the image was built, and the Build card rendered the raw key `stage.language.run`
  // to the customer — 33 gates green, image parity green, and the words on screen were wrong.
  'packages/site/tracy-site-build-joomla',
  'packages/site/tracy-site-build-wordpress',
  // Added 15/09/2026 with the package itself: the EmDash Build (check · shot), same two builds.
  'packages/site/tracy-site-build-emdash',
  'packages/tools/tracy-site-tools',
  'packages/ui/tracy-tab-link',
  // Added 04/10/2026 with the package itself: the ask form tab, client build only.
  'packages/ui/tracy-ask-form',
  // Added 05/10/2026 with the package itself: the AI Assistant widget, client build only.
  'packages/ui/tracy-assistant',
  // Added 08/10/2026 with the package itself: Settings › Model plan (desktop app), client build only.
  'packages/ui/tracy-model-plan',
  // Added 10/10/2026 with the package itself: the desktop app's first-run screen, client build only.
  'packages/ui/tracy-onboard',
  // Added 18/10/2026 with the package itself: Website Opportunities, client build only (a vendor/
  // subtree until 24/10/2026, ADR 0036).
  'packages/site/tracy-website-opportunities'
] as const

/** Every committed build of a package — the script name, and what it builds. */
const BUILDERS = ['build-client.mjs', 'build-host.mjs'] as const

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const problems: string[] = []
/**
 * The `@tracy/*` packages the image installs; any other `@tracy/*` import left in a committed build
 * is a plugin dsh never loads — the byte comparison below cannot see that, because such a bundle
 * matches its source exactly. It happened twice on 29/09/2026 (site-tools #586, site-tabs #595).
 */
const INSTALLED = installedTracyPackages(
  readFileSync(join(root, 'packages/fleet/tracy-fleet-operation/dsh/Dockerfile'), 'utf8')
)

let checked = 0

/** One builder's `--check`, its output kept for the report. */
function runCheck(cwd: string, script: string): Promise<{ status: number | null; output: string }> {
  return new Promise((done) => {
    const child = spawn('node', [`scripts/${script}`, '--check'], { cwd })
    let output = ''
    child.stdout.on('data', (c: Buffer) => (output += c.toString()))
    child.stderr.on('data', (c: Buffer) => (output += c.toString()))
    child.on('close', (status) => done({ status, output }))
  })
}

/**
 * THE BUILDERS RUN SIDE BY SIDE (29/09/2026): one after another they were 38 s of the `checks` row on
 * CI. In `--check` mode a builder writes only into its own `mkdtemp` directory and compares, so two
 * of them share nothing. Problems are still reported in the package order above, whatever finished
 * first.
 */
const jobs = Math.max(1, Math.min(4, availableParallelism()))
const work = BUNDLED.map((pkg) => {
  const name = JSON.parse(readFileSync(join(root, pkg, 'package.json'), 'utf8')).name as string
  // Run whichever builders the package has. A client-only package is guarded as before;
  // a package with a host half too must have both builds match the source.
  const builders = BUILDERS.filter((script) => existsSync(join(root, pkg, 'scripts', script)))
  return { pkg, name, builders, results: [] as { script: string; status: number | null; output: string }[] }
})
const queue = work.flatMap((w) => w.builders.map((script) => ({ w, script })))
async function main(): Promise<void> {
  await Promise.all(
    Array.from({ length: jobs }, async () => {
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        const r = await runCheck(join(root, next.w.pkg), next.script)
        next.w.results.push({ script: next.script, ...r })
      }
    })
  )

  for (const { pkg, name, builders, results } of work) {
    if (builders.length === 0) {
      problems.push(
        `  ${name}: no scripts/build-*.mjs at all — this package does not belong in the bundle gate`
      )
      continue
    }
    for (const script of builders) {
      checked += 1
      const result = results.find((r) => r.script === script)
      if (result?.status !== 0) {
        const detail = (result?.output ?? '').trim()
        problems.push(`  ${name} (${script}): bundle differs from source\n${detail.replace(/^/gm, '    ')}`)
      }
    }
    for (const built of ['lib/index.js', 'lib/client.js']) {
      const file = join(root, pkg, built)
      if (!existsSync(file)) continue
      const bare = bareImports(readFileSync(file, 'utf8'), INSTALLED)
      if (bare.length > 0)
        problems.push(
          `  ${name} (${built}): imports ${bare.join(', ')}, which the image does not install — dsh will not load this plugin; bundle that package in (see the \`bundle-site-build-core\` esbuild plugin of tracy-site-tools)`
        )
    }
  }

  if (problems.length > 0) {
    console.error(`Bundle gate: ${problems.length} problem(s)\n`)
    console.error(problems.join('\n\n'))
    console.error(`\n  Run \`pnpm build\` and commit \`lib/client.js\` again.`)
    process.exit(1)
  }

  console.log(`Bundle gate: ${BUNDLED.length} packages, ${checked} builds, all match their source.`)
}

void main()
