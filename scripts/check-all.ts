/**
 * Run every TCH gate, in order, and fail on the first one that fails.
 *
 * The gate list is explicit rather than a directory scan: a gate that stops being
 * discovered is a gate that stops running, and nothing would say so. Adding a file to
 * `scripts/` does not enrol it -- adding a line here does.
 */

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

/** One gate: a script under `scripts/`, run with the repository root as cwd. */
interface Gate {
  /** Name shown in progress output. */
  readonly name: string
  /** Path relative to `scripts/`. */
  readonly script: string
  /**
   * Extra argv for the script.
   *
   * Exists for one shape: a script that both WRITES an artefact and VERIFIES it, where the gate
   * must run the verifying half. `gen-doc-index.ts --check` is that -- one file so the generator
   * and the check can never disagree about the format, which two files would eventually do.
   */
  readonly args?: readonly string[]
}

/**
 * Every gate, in run order. Cheapest and most structural first: a tree that is not
 * self-contained, or a plugin whose name disagrees with itself, makes the content gates'
 * findings beside the point.
 */
/** `turbo-config` on a pull request measures only the tasks the diff touches; see the gate below. */
const TURBO_CONFIG_ARGS: readonly string[] =
  process.env.TRACY_TURBO_TASK_AUDITS === '1'
    ? ['--check', '--structure-only']
    : process.env.GITHUB_EVENT_NAME === 'pull_request'
      ? ['--check', '--changed-since', 'HEAD^1']
      : ['--check']

const GATES: readonly Gate[] = [
  // Cheapest and catches the most: lint + typecheck + format, all three read-only. First because
  // a type error makes every finding below talk about code that does not compile.
  { name: 'lint', script: 'check-lint.ts' },
  // An index with broken pointers is worse than no index: an agent follows it, finds nothing, then
  // invents a replacement rule. The first run (30/08) caught 9 broken links.
  { name: 'doc-links', script: 'check-doc-links.ts' },
  // Three doc gates close three different ends, and none replaces another:
  //   doc-links      — every link must lead somewhere
  //   doc-frontmatter— every reference doc must declare the code it describes, and that code must exist
  //   doc-index      — every doc must be pointed to by the index (no orphan docs)
  { name: 'doc-frontmatter', script: 'check-doc-frontmatter.ts' },
  { name: 'doc-index', script: 'gen-doc-index.ts', args: ['--check'] },
  //   env-example  — deploy/.env.example matches, BOTH WAYS, the keys the code really reads. Catches
  //   a dead key (fill it in and nobody reads it) and a key nobody knows to set. Both happened
  //   10/09: `MODEL_API_KEY` read by no service, and EIGHT keys named after the old Workers.
  { name: 'env-example', script: 'check-env-example.ts' },
  //   compose-yaml — every compose file under deploy/ must PARSE. Only one thing reads them: a
  //   `docker compose` run on the server, so a syntax error there shows up as a FAILED DEPLOY, after
  //   a whole build and a runner queue. Measured 11/09 on production: `did not find expected
  //   ',' or '}'` — the `}` of `${VAR:-default}` closed the flow mapping. Thirty green gates stayed
  //   silent twice in a row about a file that could not load.
  { name: 'compose-yaml', script: 'check-compose-yaml.ts' },
  // The skill mirror is SYMLINKS. A symlink turned into a copy still works on the machine that broke
  // it, so only a gate sees it — the same shape as "a copy is a drift bomb".
  { name: 'skills', script: 'skills-check.ts' },
  // Script paths in `.github/workflows/`. Workflow files are the ONLY files in the repo no other gate
  // opens — every other gate reads `packages/`, `workers/`, `docs/`, `vendor/` or the lockfile — so only
  // CI judges them, and CI judges by RUNNING. On 08/09 a rename (`stage-cms-themes.sh` →
  // `stage-cms-seeder.sh`) went through a merge while the workflow kept the old name: 27 gates green,
  // then the job died with `exit 127` after 59 seconds of install, and on `build-dsh-image` after a whole
  // 4.4 GB build. Reading it costs milliseconds.
  { name: 'workflow-scripts', script: 'check-workflow-scripts.ts' },
  // Every owner of workers tests is a Turbo task with a generated `test:ci` script and turbo.json
  // (12/10/2026). An owner without one would be a suite Tracy CI's Turbo rows never run on a pull
  // request into develop; this gate turns that into a red `checks` row instead of silence.
  // Audited Turbo tasks measure reads during their test run, before Turbo can cache success.
  // Only their planner-selected checks row delegates measurement; structure and ignored-input
  // checks still run here. Legacy/fallback/release/nightly paths keep the measurement below.
  // Since 12/10/2026 it also MEASURES: it runs every task's suite under the read tracer and is red
  // when a suite reads a path its task's hash does not cover (Turbo would serve a stale green once
  // that file changes) or when a hashed file is ignored by git (the plan job's checkout lacks it,
  // so its hash would differ from the rows'). That is the whole workers + interop + vendor suite
  // once more, with the database: the price of the hash meaning what it says. On a pull request
  // only the tasks whose inputs the diff touches are measured (`--changed-since HEAD^1`, the base
  // tip of the merge commit; the reasoning is at the top of the script) — a docs-only or
  // template-data pull request measures few or none. Everywhere else, the nightly included: all.
  { name: 'turbo-config', script: 'ci/turbo-setup.mjs', args: TURBO_CONFIG_ARGS },
  { name: 'self-contained', script: 'check-self-contained.ts' },
  { name: 'plugin-identity', script: 'check-plugin-identity.ts' },
  // Cross-file wiring of dsh plugins that no import joins (seat-only tabs, Build plugins' words and
  // stages, slot registrations...): rules that used to be source-reading unit tests inside plugins.
  { name: 'plugin-contracts', script: 'check-plugin-contracts.ts' },
  { name: 'language', script: 'check-language.ts' },
  // The Website Opportunities package becomes a public repository, and going public exposes every commit it ever had.
  // Its own leak scanner (Vietnamese, internal names and hosts, people, private or server IPs, secrets) runs here
  // too, so a leak is stopped in TCH before it can reach that repository's history.
  { name: 'wo-public', script: '../packages/wo/website-opportunities/scripts/check-public.mjs' },
  // Vocabulary: a coined word still reads smoothly, so reviewers do not catch it. Two coined i18n
  // namespaces lived a whole day and spread into READMEs, ADRs and folder names before anyone
  // noticed. See docs/references/vocabulary.md §Enforcement.
  { name: 'vocabulary', script: 'check-vocabulary.ts' },
  // A test file a pull request adds or edits may not add an assertion that cannot fail for a product
  // bug, in the three shapes the syntax tells for certain (a value compared with itself, a product
  // constant compared with a copy, a session's temporary path). Only what the change adds: old pins
  // stay until someone touches them. Seconds; parses, never runs. See check-test-quality.mjs.
  { name: 'test-quality', script: 'check-test-quality.mjs' },
  // A plugin client calling dsh's host half by absolute path works locally (dsh at the root) and
  // breaks on a prefixed lane with a Worker 404. See check-dsh-paths.ts.
  { name: 'dsh-paths', script: 'check-dsh-paths.ts' },
  // `@source` pointing at nothing: Tailwind does not complain, it just scans less, and the library's
  // own classes vanish. The design bench ran like that until 30/08 — see check-tailwind-source.ts.
  { name: 'tailwind-source', script: 'check-tailwind-source.ts' },
  { name: 'dsh-locale', script: 'check-dsh-locale.ts' },
  { name: 'kept-terms', script: 'check-kept-terms.ts' },
  // Every language in Settings › Language complete on Tracy's AND dsh's screens, except gaps in the
  // debt ledger `scripts/locale-debt.json` (spec #730). Fails on a new gap and on a translated
  // row nobody struck, so the ledger only shrinks. Reads the loaded plugin set from
  // `dsh --dump-config`, so it needs the dsh build like `boot-graph` does.
  { name: 'interface-languages', script: 'check-interface-languages.ts' },
  // Every customer-visible switch has a guide article (what the site agent's `tracy_guide` and `/help`
  // read) or a reasoned exemption: a feature that ships without telling the assistants is how own domain
  // was missed (21/10/2026). Cheap: reads the catalogue and the articles, runs nothing.
  { name: 'guide-coverage', script: 'check-guide-coverage.mjs' },
  // The same promise for what tracy-web says itself (#753): sign-in, team and invite pages, every
  // mail, the JSON refusal messages. Every key of `apps/tracy-web/src/i18n/strings.js` translated in
  // every shown language, same placeholders, no extra keys. No ledger: a gap is fixed in the change.
  { name: 'web-languages', script: 'check-web-languages.mjs' },
  // And for the /ops SPA: each namespace under `packages/web/tracy-harness/src/i18n/ns/` complete in
  // every shown language, its English fingerprinted, its screens free of bare English. No ledger.
  { name: 'ops-languages', script: 'check-ops-languages.ts' },
  // Design tokens: a mistyped name is hidden by its fallback, so this is the only gate that sees it.
  { name: 'dsh-tokens', script: 'check-dsh-tokens.ts' },
  // `lane-tabs` retired on 06/09 together with `packages/bundle/tracy-guest`. It guarded exactly ONE
  // file — the guest lane bundle — and the rule it kept ("seat-requiring tabs must not be pre-seeded for
  // signed-out people") has nowhere left to be broken: guest is now a ROLE in the host dsh, not a
  // separate lane with its own bundle. A gate listing a file that does not exist goes red for the wrong reason.
  // Seat door: three rules an edit can break by accident with no test going red — the password door
  // reopening next to the seat door, missing config read as "door open", or the signature built in
  // a second place. See TCH ADR 0001.
  { name: 'seat-door', script: 'check-seat-door.ts' },
  // Every refusal the Apply door answers on the `tracy_site` path must name a way out. A code the
  // plugin cannot translate is not a dead stop — it is a detour: measured 16/09 on a two-call job,
  // `NOT_SIGNED_IN` had no case and the model spent fifteen further steps walking around the door,
  // ending in a PHP script that wrote the site's database directly. Nine of thirteen codes were in
  // that state, so this is a class, not a slip. Sits beside `seat-door` because it guards the same
  // boundary from the other side: that one keeps the door shut, this one keeps a shut door legible.
  { name: 'refusal-next', script: 'check-refusal-next.ts' },
  // A production address pinned in Worker code must be DECLARED with a reason. Six such constants were
  // found in two days (07–08/09), each broken a different way on dev and none saying so: the OAuth
  // round trip ran on the real surface, invitations carried rejected links, the Origin guard blocked
  // every write with 403. This gate does not ban hard-coding — it makes you write WHY, and the moment
  // of writing is when people ask themselves "is this right on dev?".
  { name: 'origins', script: 'check-origins.ts' },
  // After the content gates: a stale bundle makes every finding above talk about the source rather
  // than what really reaches the fleet. Last because it is the most expensive gate — it spawns a build per package.
  // dsh presets are GENERATED from `config/mode-matrix.json`. Drift between the two turns nothing red
  // at runtime: dsh still boots, the harness screen still draws, only the customer's agent carries a
  // different tool set than the admin page says. This gate runs the generator itself in compare mode.
  { name: 'presets', script: 'gen-presets.ts', args: ['--check'] },
  // Story labels are GENERATED from the import graph, nobody can declare them, so this gate does not
  // guard typos. It guards what NOBODY LOOKS AT: when a screen is ported from a drawing into real code,
  // its UI review starts reaching customers, and that must show in the diff rather than be found
  // later. The gate runs the generator itself in compare mode.
  { name: 'story-kinds', script: 'gen-story-kinds.ts', args: ['--check'] },
  // slots.json is DATA generated from vendor fixtures; a stale copy means the card puts words in the
  // wrong element and nothing errors. Compare, do not regenerate: the gate must not write.
  { name: 'od-slots', script: 'build-od-slots.mjs', args: ['--check'] },
  { name: 'design-tokens', script: 'build-design-tokens.mjs', args: ['--check'] },
  // dark.json is the same kind of DATA: the verdict on whether a fixture survives the dark override.
  // Stale means the dialog offers Dark on a fixture that paints white blocks, and nothing errors.
  { name: 'od-dark', script: 'build-od-dark.mjs', args: ['--check'] },
  // agent-tools.json is the /ops/api copy of what the agent is sent (tracy-web cannot import the plugin).
  // Stale means the reference shows tool text the agent no longer receives, and nothing errors.
  { name: 'agent-tools', script: 'build-agent-tools.mjs', args: ['--check'] },
  // Wiring between fleet scripts, hook servers, the catalogue, tracy-host, the docs site and a few
  // shared files that no import joins. These used to be unit tests that read source text; see the
  // header of check-infra-contracts.ts for why they are a gate.
  { name: 'infra-contracts', script: 'check-infra-contracts.ts' },
  // The CMS template and theme carry the 152 design systems as DATA generated from the same vendor
  // library (152 token files + an option list for Joomla; 152 style variations for WordPress). Stale
  // means a customer's site wears last month's tokens and nothing errors. Compare, never regenerate.
  // The section library writes INTO both themes, so it is checked first: a stale section is a
  // stale theme, and the two theme gates below would otherwise pass on yesterday's copy.
  { name: 'cms-sections', script: 'build-cms-sections.mjs', args: ['--check'] },
  // The motion library writes into both themes too, and for the same reason goes ahead of them.
  { name: 'cms-motion', script: 'build-cms-motion.mjs', args: ['--check'] },
  // The preview agent writes into both themes AND into the side card's copy of the wire contract —
  // three trees agreeing on four strings. A channel renamed in one of them throws nowhere: the page
  // posts on the old name, the side card listens on the new one, and live preview quietly becomes a
  // reload button again. Ahead of the theme gates for the same reason the two above are.
  { name: 'cms-preview', script: 'build-cms-preview.mjs', args: ['--check'] },
  { name: 'joomla-template', script: 'build-joomla-template.mjs', args: ['--check'] },
  { name: 'wordpress-theme', script: 'build-wordpress-theme.mjs', args: ['--check'] },
  // The multilingual profile of a quickstart contract classifies EACH of its 197 entities. An
  // unclassified entity raises no error anywhere: it just gets no translation, and the Chinese page
  // carries an English block among translated ones. A reviewer of 197 JSON lines cannot see the
  // missing 198th; this gate regenerates from the source contract and compares byte by byte.
  { name: 'joomla-multilingual', script: 'build-joomla-multilingual.mjs', args: ['--check'] },
  // A quickstart's demo-trim map lists the demo rows a sealed customer site may hide — 247 on
  // ja-kinetic. A stale list does not fail anywhere: a post missing from it just stays on the
  // customer's site. So it is regenerated from the contract and compared byte for byte.
  { name: 'joomla-demo-trim', script: 'build-joomla-demo-trim.mjs', args: ['--check'] },
  // The showcase-navigation maps list the template showcase entries (typography, "Joomla Pages", Home
  // colour variants) a customer site takes out of its menus, pinned to the contract bytes like the
  // demo-trim map. A stale map hides nothing new and keeps hiding what a new release renamed.
  { name: 'joomla-showcase-nav', script: 'build-joomla-showcase-nav.mjs', args: ['--check'] },
  // The WordPress twins. Both are generated from `inventory.json`, itself captured from the
  // release archive (`capture-inventory.mjs`, provenance = the dump's sha256): editions map each
  // mapped page to its Polylang copy in every shipped language (a wrong id puts the customer's
  // Vietnamese hero on the Danish page, no error), and the demo-trim map lists the demo posts a
  // bound site may hide (a stale row hides a customer's page or keeps a demo article, no error).
  { name: 'wordpress-editions', script: 'build-wordpress-editions.mjs', args: ['--check'] },
  { name: 'wordpress-demo-trim', script: 'build-wordpress-demo-trim.mjs', args: ['--check'] },
  { name: 'wordpress-showcase-nav', script: 'build-wordpress-showcase-nav.mjs', args: ['--check'] },
  { name: 'wordpress-superseded', script: 'build-wordpress-superseded.mjs', args: ['--check'] },
  // The Business template's README carries six Mermaid diagrams — site map, page layout, where to
  // edit what, content model, submit and publish flows — and they are the ONLY description of the
  // site an administrator gets before touching the admin. They are generated from that package's
  // own sources (seed schema, menus, taxonomies, the router's conditions, which collection each
  // view reads, which chrome field each frame component prints), so nothing in them is typed by
  // hand — and nothing in them errors when it goes stale either. A diagram that quietly describes
  // last month's schema is worse than no diagram: it is read as fact and acted on. Compare, never
  // regenerate.
  { name: 'emdash-diagrams', script: 'build-emdash-diagrams.mjs', args: ['--check'] },
  // Worker page stories import the page-building function itself, so the HTML cannot drift. The ERROR
  // sentence can: it is a parameter, retyped into the story, and every copy drifts. Twice in one branch on
  // 04/09 — one sentence made up outright, one the code no longer returned — both spotted by reviewers.
  // The table deciding which template a new Joomla site is built from, and its copy in the tracy-web
  // image. If the two drift, the form promises one design while the fleet builds another —
  // and it only shows on the customer's machine. Sits next to the GENERATED DATA gates above, same family.
  { name: 'design-templates', script: 'check-design-templates.ts' },
  { name: 'quickstart-overrides', script: 'check-quickstart-overrides.ts' },
  { name: 'contracts', script: 'check-contracts.ts' },
  // Slot roles a demo fills from: a content map whose roles are unknown, split across cards or missing
  // on a text or image slot (ADR 0038), or a sidecar `slot-roles.json` whose contract moved under it
  // (stale `baseHash`) or that leaves an evidence slot with no fact role (ADR 0037), fills a demo from
  // the wrong slot map with no error.
  { name: 'slot-roles', script: 'slot-roles/check.mjs' },
  // One schema and conformance corpus for every CMS; drift otherwise surfaces only on sites.
  { name: 'content-api', script: 'check-content-api.mjs' },
  // The public API reference is BUILT from the door's tables, so a route or field leaves it with no file
  // saying so; compared with the committed snapshot, a breaking change is red until the version moves.
  { name: 'api-spec', script: 'check-api-spec.ts' },
  { name: 'questions', script: 'check-questions.ts' },
  { name: 'templates', script: 'check-templates.ts' },
  { name: 'story-strings', script: 'check-story-strings.ts' },
  // Two skills in two different repos state the same source contract, and neither repo can check
  // that — only TCH vendors all three. Runs on bundled fixtures: no Docker, no network.
  { name: 'site-model', script: 'check-site-model.ts' },
  // Same shape as `site-model`, different place: here the copy is CODE, not a contract. The two
  // EmDash templates in `packages/cms/` carry a copy of the skill kit's tool set, and the drift went the
  // dangerous way unnoticed — measured 19/09: both templates carry a safety latch in
  // `tools/restore.sh` that the KIT lacks, so every template generated from the kit is missing it.
  { name: 'emdash-kit-sync', script: 'check-emdash-kit-sync.ts' },
  // Each EmDash template's `docs/generated/inventory.{json,md}` — collections, routes and a hash
  // of every source input — is read as the template's description and errors nowhere when stale.
  // Measured 26/09 (#404): both were stale on `develop` since the commits that last wrote them,
  // because the kit generator's `--check` ran in no gate. Compare, never regenerate.
  { name: 'emdash-inventory', script: 'check-emdash-inventory.mjs' },
  { name: 'bundles', script: 'check-bundles.ts' },
  // `image-lock` retired on 06/09, the same day the private registry retired, and it retired because of
  // LOST DATA, NOT BECAUSE ANYONE FOUND IT ANNOYING. That gate compared two lockfiles to answer "does the
  // image run the same dsh tree the dev machine runs". The second half no longer exists: `@deepseek-ai/*`
  // are workspace members now, so the repo's `pnpm-lock.yaml` records NO version of them — only
  // paths. Kept running it would be a permanently red gate, reading `0.1.1-rc.2` (the npmjs build a
  // third-party plugin pulls in) and mistaking it for the dev tree.
  //
  // Its replacement is `image-profile` just below: it compares no lockfile, it reads four static
  // files directly (two cordis patches, `profile/package.json`, `entrypoint.sh`) and checks exactly the
  // invariants the Dockerfile asserts with `--dump-config` + `grep` — but WITHOUT building the image.
  // Next to `bundles` because it is the same family: both are "what really reaches the fleet", not source conventions.
  { name: 'image-profile', script: 'check-image-profile.ts' },
  // ADR 0027: the dsh-passwords fork is upstream core byte-for-byte plus a Tracy layer behind a
  // closed list of hooks. This reads `vendor/tracy/dsh-passwords/tracy-core.json` and compares the
  // tree with the pinned snapshot — the only machine that notices a "convenient" edit to gateway.ts.
  { name: 'passwords-core-diff', script: 'check-passwords-core-diff.ts' },
  // The 230 tests of `vendor/tracy/dsh-passwords`, which nobody ran until 2026-08-30. After the source
  // gates because it is expensive (~15s) and because tests of a tree that does not compile mean nothing.
  { name: 'tests', script: 'check-tests.ts' },
  // The only gate that really boots dsh. Every gate above inspects source, so none goes red when the
  // plugin tree is right to the letter yet the runtime delivers an empty client graph — the 30/08 failure shape.
  { name: 'boot-graph', script: 'check-boot-graph.ts' }
]

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Run one gate as a child process.
 * @param gate - the gate to run.
 * @returns True when the gate exited 0.
 */
function runGate(gate: Gate): boolean {
  process.stdout.write(`check-all: ${gate.name}\n`)
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', join(root, 'scripts', gate.script), ...(gate.args ?? []), ...extraArgs(gate)],
    { cwd: root, stdio: 'inherit' }
  )
  if (result.status !== 0) {
    process.stderr.write(`check-all: gate ${gate.name} failed: ${failureDetail(result)}\n`)
  }
  return result.status === 0
}

/**
 * What the operating system reported about a gate that did not exit 0.
 *
 * WHY (13/10/2026): a gate ended by a signal has no exit status, so the summary line alone left a
 * log with a gate that starts and then is simply gone. This names the fields Node was given and
 * concludes nothing from them — a signal is not rewritten as an exit status or as a cause.
 *
 * Only the signal name, the numeric status and the error CODE are printed. The error's message and
 * stack carry the executable's absolute path, so they stay out of the log.
 * @param result - what `spawnSync` returned for the gate.
 * @returns The fields present, space-separated.
 */
function failureDetail(result: ReturnType<typeof spawnSync>): string {
  const parts: string[] = []
  if (typeof result.signal === 'string') parts.push(`signal=${result.signal}`)
  if (typeof result.status === 'number') parts.push(`status=${result.status}`)
  const code = (result.error as NodeJS.ErrnoException | undefined)?.code
  if (typeof code === 'string' && /^[A-Z0-9_]+$/.test(code)) parts.push(`spawn-error=${code}`)
  return parts.length > 0 ? parts.join(' ') : 'no status, signal or error code reported'
}

/**
 * `--tests-part <spec>` forwarded to the `tests` gate as its own `--part`.
 *
 * WHY IT IS ROUTED, NOT GLOBAL (20/09/2026). The `tests` gate is four independent suites and, at
 * 36m30 measured, it is the whole of Tracy CI's wall clock; CI now runs it as several jobs. The
 * flag names the gate it belongs to so `check-all --tests-part …` can never be read as "pass this
 * to whichever gate happens to understand it" — and `check-tests.ts` refuses a spec it does not
 * know, so a typo here is red rather than an empty run.
 *
 * @param gate - the gate about to run.
 * @returns Extra arguments for that gate; empty for every gate but `tests`.
 */
function extraArgs(gate: Gate): string[] {
  if (gate.name !== 'tests') return []
  const argv = process.argv.slice(2)
  const at = argv.indexOf('--tests-part')
  return at !== -1 && at + 1 < argv.length ? ['--part', argv[at + 1]] : []
}

/**
 * Gate names named by `--skip <name>`, repeatable.
 *
 * WHY A FLAG AT ALL. `boot-graph` boots a real dsh, which needs a materialized profile under
 * `tch/profiles/<name>/node_modules` -- gitignored, so absent on any fresh checkout, including
 * a CI runner's `_work/`. Until that materialization is a committed, repeatable step, CI has to
 * name what it is not running.
 *
 * WHY NOT AN ENV VAR OR A SILENT AUTO-DETECT. A gate that quietly stands down when its
 * preconditions are missing reports the same green as a gate that ran -- that is the fail-open
 * shape this repository rejects everywhere else. Skipping must be typed out by a caller, and it
 * is echoed in the summary line so a reader of the log sees the reduced scope.
 * @returns Names to skip, in the order given.
 */
function skippedNames(): string[] {
  const out: string[] = []
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--skip' && i + 1 < argv.length) {
      out.push(argv[i + 1])
      i += 1
    }
  }
  return out
}

/**
 * Gate names named by `--only <name>`, repeatable.
 *
 * WHY (15/09/2026): Tracy CI runs the gate list as three parallel jobs — `--only lint`,
 * `--only tests`, and `--skip lint --skip tests` for everything else. The third half is written as
 * a SKIP on purpose: a gate added to the list above lands in that job without anyone editing the
 * workflow, so splitting the run can never quietly drop a gate. `--only` and `--skip` together is
 * refused — one call either names what it runs or what it leaves out, never both.
 * @returns Names to run, in the order given.
 */
function onlyNames(): string[] {
  const out: string[] = []
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--only' && i + 1 < argv.length) {
      out.push(argv[i + 1])
      i += 1
    }
  }
  return out
}

/** Run the gate list, or refuse to report success when there is nothing to run. */
function main(): void {
  if (GATES.length === 0) {
    // Exiting 0 here would make `build:check` green while checking nothing at all --
    // the same fail-open shape this repository rejects elsewhere (see the
    // allowed_folders note in tasks/todo-tch-greenfield.md). Fail loudly instead.
    process.stderr.write(
      'check-all: no gates registered yet -- see Phase 5 of tasks/todo-tch-greenfield.md.\n' +
        'check-all: this is a deliberate failure, not a broken command.\n'
    )
    process.exit(1)
  }

  const skip = skippedNames()
  const only = onlyNames()
  if (skip.length > 0 && only.length > 0) {
    process.stderr.write('check-all: pass --only or --skip, not both\n')
    process.exit(1)
  }
  const unknown = [...skip, ...only].filter((name) => !GATES.some((gate) => gate.name === name))
  if (unknown.length > 0) {
    // A typo in `--skip` would otherwise skip nothing and read as a full run; in `--only` it would
    // run nothing and read as green.
    process.stderr.write(
      `check-all: --skip/--only names no such gate: ${unknown.join(', ')}\n` +
        `check-all: gates are ${GATES.map((g) => g.name).join(', ')}\n`
    )
    process.exit(1)
  }

  const selected =
    only.length > 0
      ? GATES.filter((gate) => only.includes(gate.name))
      : GATES.filter((gate) => !skip.includes(gate.name))
  const failed = selected.filter((gate) => !runGate(gate))
  if (failed.length > 0) {
    process.stderr.write(
      `check-all: ${failed.length} gate(s) failed: ${failed.map((g) => g.name).join(', ')}\n`
    )
    process.exit(1)
  }

  const note =
    only.length > 0
      ? ` (--only: ${GATES.length - selected.length} of ${GATES.length} left to the other CI jobs)`
      : skip.length > 0
        ? ` (${skip.length} skipped by --skip: ${skip.join(', ')})`
        : ''
  process.stdout.write(`check-all: ${selected.length} gate(s) passed${note}\n`)
}

main()
