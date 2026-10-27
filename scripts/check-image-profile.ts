/**
 * Gate: the four invariants of the fleet image profile, checked WITHOUT A BUILD.
 *
 * WHY THIS NEEDS A GATE OF ITS OWN. `packages/fleet/tracy-fleet-operation/dsh/Dockerfile` already
 * checks the composed tree with `--dump-config` piped through `grep` — but that block only runs
 * when somebody BUILDS. Edit `profile/cordis.patch.yml` and send a PR without building the image
 * and no gate in `check-all.ts` touches it: every other gate reads `packages/` by the plugin
 * convention, and none of them opens the four files under `tracy-fleet-operation`'s `dsh/`. A row
 * deleted by accident — `sandbox` losing `disabled: true`, or `seedTabs` dropping an element —
 * sits quietly in the diff, green at every gate, and surfaces only for the next person who BUILDS
 * the image, which is a whole operational step later than the PR.
 *
 * WHY NOT JUST WAIT FOR `--dump-config`. Booting a real dsh (what `check-boot-graph.ts` does) is
 * expensive and needs a materialized `node_modules`; building the whole image is a step more
 * expensive again and needs Docker. The four files below are static YAML/JSON/bash — every
 * invariant the Dockerfile asserts by `grep` on the composed tree can be read straight out of the
 * patch, with NO tree composed first. This is the cheapest way to catch that exact class of
 * mistake before anyone builds.
 *
 * THE FAILURES IT CATCHES, ONE LINE EACH — see the in-place comments in `cordis.patch.yml` and in
 * the Dockerfile's assert block:
 *   - `subprocess`/`sandbox` losing `disabled: true` means the model's code runs INSIDE the
 *     container that holds the docker socket.
 *   - `ptc-runtime` not disabled, or `tools.config.mode` no longer `native`, is that same door
 *     reopened another way — no environment variable can turn the PTC runtime back on, but the
 *     patch can.
 *   - a wrong host/port on `webserver` means dsh does not listen on the port docker publishes, or
 *     listens out on 0.0.0.0 (it either fails to boot, or boots on a port the seat door does not
 *     proxy to).
 *   - either missing `insert` row means `@tracy/dsh-sandbox-docker` / `@tracy/dsh-subprocess-docker`
 *     is not loaded — sandbox/subprocess are switched off with nothing put in their place, and the
 *     agent can run no command at all.
 *   - `better-sidebar` losing `workspaceFence: true` (fleet patch or native bundle), or carrying a
 *     key dsh-better-sidebar 0.21 removed (`shell`, `seedTabs`, `tabsEnabled.terminal`, …), is a
 *     row that reads as a decision in force and configures nothing — the schema drops it silently.
 *   - `directory-picker` not disabled, or the host browse row missing, means an OS dialog tries to
 *     open INSIDE a container with no display — it hangs, silently. (The client browse row is gone
 *     on purpose since 15/09/2026: a workspace is a site, made by Add site only.)
 *   - `ui-brand-official` not disabled means the logo changes between two boots (whoever registers
 *     last wins the `single` seat, and that order is not the patch's to decide).
 *   - one of dsh's four shipped presets (`preset-standard`/`-ptc`/`-minimal`/`-cordis`, rows since
 *     0.1.7-rc.2) enabled in a Tracy bundle puts it in the roster, and `preset-cordis` brings
 *     `tool-plugin-manager`, an agent tool that rewrites the profile of every site on the host.
 *   - `agent-preset-registry.config.default` naming an id the generated `presets.patch.yml` does
 *     not declare boots green and then fails every NEW session at creation.
 *   - the host `skill-filesystem` row switched on in a Tracy bundle registers into the skill
 *     registry's GLOBAL layer, which dsh merges into every agent's catalogue: every preset is sent
 *     the whole library again, and the per-preset skill sets (`skill-sets.json`) cut nothing.
 *   - a row dsh 0.1.7-rc.2 turned on that writes host state from a browser (`settings`,
 *     `config-editor`, the DeepSeek account rows, the Plugins-page forms — `STANDS_DOWN`) back on
 *     lets one customer's browser change the configuration of every site on the host.
 *   - `ui-model-selection` missing or disabled removes the model chip and `/model`; an inserted
 *     duplicate can shadow its row. The policy plugin `tracy-mode-picker` must remain loaded so
 *     browser code cannot change `agent-default-model`; user session selections are forwarded to
 *     dsh for availability validation (`packages/ui/tracy-mode-picker/src/host/model-policy.mjs`).
 *     A row id declared twice in one patch is red too: a later row patches over an earlier one.
 *   - the native bundle's `approval` row not saying `policy: never`, or a `permission` preset that
 *     says `approval: ask` (in the bundle, or in a fleet row that restates either), brings back the
 *     wait on an approval no seat can see: dsh-base pins `ask` on every new session, `dsh-passwords`
 *     shows a seat no approval, and one `bash` escalation held a bench turn 643 s (29/09/2026). A
 *     preset table missing `workspace-write` with its own sandbox mode makes the permission service
 *     throw at boot (`APPROVAL_POLICY`).
 *   - any `!!js` tag in the patch is arbitrary code able to run while `js-yaml` `load()`s a file
 *     nobody reviews as code — a patch reads like data, not like a program.
 *   - `profile/package.json` naming a different set of five bundles means the image builds a tree
 *     other than the one the Dockerfile's first lines describe: the build stays green, and the
 *     tree that runs is a different tree.
 *   - `entrypoint.sh` losing the line that writes `MCP_GATEWAY_SSH_ENDPOINTS` drops the second
 *     lock on the two terminal sockets (dsh-passwords 2.7.7 lets a seat open any WebSocket a plugin
 *     declares; the Tracy policy refuses them first, and this owner-only row is the layer behind it,
 *     ADR 0027). The 2.6.6 variable `MCP_GATEWAY_WS_ADMIN_ALLOWLIST` is no longer read;
 *     losing the masked-profile check means the container boots into an empty client graph with
 *     nobody saying why.
 *
 * It runs like any other gate: cwd is the repo root, a non-zero exit is a failure.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { load } from 'js-yaml'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const FLEET_DIR = join(ROOT, 'packages/fleet/tracy-fleet-operation/dsh')

/** The four files this gate reads, and nothing else — see the module comment for why these four. */
const FLEET_PATCH_PATH = join(FLEET_DIR, 'profile/cordis.patch.yml')
const PROFILE_PACKAGE_PATH = join(FLEET_DIR, 'profile/package.json')
const ENTRYPOINT_PATH = join(FLEET_DIR, 'entrypoint.sh')
/**
 * `@tracy/dsh-native-bundle`'s own patch. Not under `dsh/`, but named by `profile/package.json`'s
 * bundle list, so some of the invariants the Dockerfile asserts on the COMPOSED tree
 * (`directory-picker`, `ui-brand-official`, the preset registry) live here rather than in the
 * fleet's own patch — the fleet patch's header says as much: "IT CARRIES ONLY WHAT NO BUNDLE
 * CARRIES."
 */
const NATIVE_BUNDLE_PATCH_PATH = join(ROOT, 'packages/bundle/tracy-native/cordis.patch.yml')
const NATIVE_BUNDLE_PACKAGE_PATH = join(ROOT, 'packages/bundle/tracy-native/package.json')
/** The native bundle's GENERATED preset rows (`scripts/gen-presets.ts`): the ids a default may name. */
const NATIVE_PRESETS_PATH = join(ROOT, 'packages/bundle/tracy-native/presets.patch.yml')
/**
 * `@tracy/dsh-cowork-bundle` is not in the image, but it carries the same preset decision for the
 * local `web`/`desktop` profiles; a stand that measures a different roster than the fleet measures
 * a different system, so its registry and shipped-preset rows are held to the same rule.
 */
const COWORK_BUNDLE_PATCH_PATH = join(ROOT, 'packages/bundle/tracy-cowork/cordis.patch.yml')
const COWORK_PRESETS_PATH = join(ROOT, 'packages/bundle/tracy-cowork/presets.patch.yml')

/** dsh's own presets, rows of `@deepseek-ai/dsh-web-app`'s `presets/*.patch.yml` since 0.1.7-rc.2. */
export const SHIPPED_PRESETS = ['preset-standard', 'preset-ptc', 'preset-minimal', 'preset-cordis'] as const

/**
 * The HOST skill provider row. dsh's skill registry is host + per-scope layered: a host row files
 * into the global layer, and every agent reads the global layer merged with its preset's (dsh
 * `skill/src/index.ts` `collectFresh`). So it stays down in both Tracy bundles, as `dsh-web-app`
 * leaves it, and each preset's own `skill-filesystem` row reads its own set (28/09/2026: until then
 * the native bundle switched it on over the whole `/opt/tracy/skills`, and every preset was sent all
 * 31 model-invocable skills).
 */
export const HOST_SKILL_ROW = 'skill-filesystem'

/**
 * Rows dsh 0.1.7-rc.2 turned on by default that Tracy turns off — in both bundles and in the fleet
 * patch, each with its reason in `packages/bundle/tracy-native/cordis.patch.yml`. `shortcuts` and
 * `job-controller` are deliberately NOT here: `ui-layout` requires the first, and
 * `dsh-better-sidebar` reads jobs through the second. `ui-shortcuts` left the list on 28/09/2026:
 * it writes no host state (web rebindings live in the viewer's localStorage), and whether its
 * Settings row shows is an operator switch now (`@tracy/core/ui-switches`).
 * `ui-settings-models` joined on 07/10/2026 (tasks/todo-desktop-surface.md): dsh's Models page is
 * where an LLM sign-in starts, and on a host one dsh serves every seat (ADR 0014), so a credential
 * signed in there would be the whole host's. Until then it was off in both bundles but no gate held it.
 */
export const STANDS_DOWN = [
  'settings',
  'config-editor',
  'authorization',
  'ui-settings-models',
  'deepseek-account',
  'llm-deepseek-account',
  'account-controller',
  'ui-settings-account',
  'ui-settings-shell',
  'ui-settings-agent-loop',
  'ui-settings-subagent',
  'ui-settings-web-search',
  'cordis-inspect-providers',
  'product-analytics',
  'ui-settings-session-log',
  'otel',
  'session-telemetry-otel',
  'open-in-app',
  'ui-open-in-app'
] as const

/**
 * Plugins the native bundle inserts DISABLED, and no later row of it switches on (tasks/todo-desktop-surface.md
 * part B). The desktop app turns them on in the patch it writes for its own dsh
 * (`packages/desktop/tracy-desktop/src/plan-profile.js`). Settings › Model plan
 * (`@tracy/dsh-model-plan`, 08/10/2026) connects a customer's own model plan; since 967b3f344 the
 * fleet patch turns it on as well, but only beside `accountSubscriptions` (checked in
 * `checkFleetPatch`): each plan belongs to one account in tracy-web and the shared dsh holds no
 * credential, so no plan becomes the whole host's (ADR 0014: one dsh serves every seat).
 */
export const DESKTOP_ONLY = [{ id: 'tracy-model-plan', package: '@tracy/dsh-model-plan' }] as const

/**
 * The desktop-only plugins in the native bundle: inserted, disabled, never switched on again.
 * @param rows - the parsed bundle patch.
 * @param label - file to blame problems on.
 * @returns Problems found.
 */
function checkDesktopOnlyInBundle(rows: readonly unknown[], label: string): Problem[] {
  const out: Problem[] = []
  for (const plugin of DESKTOP_ONLY) {
    const inserted = requireInserted(rows, plugin.id, plugin.package, label)
    if (inserted.length > 0) {
      out.push(...inserted)
      continue
    }
    const entry = collectInserted(rows).find((candidate) => candidate.id === plugin.id)
    if (entry?.disabled !== true) {
      out.push({
        file: label,
        message: `insert row "${plugin.id}" must carry \`disabled: true\` — it is for the desktop app's own dsh, which turns it on`
      })
    }
    for (const row of findRows(rows, plugin.id)) {
      if (row.disabled !== true) {
        out.push({
          file: label,
          message: `row "${plugin.id}" must not switch the desktop-only plugin on, found \`disabled: ${JSON.stringify(row.disabled)}\``
        })
      }
    }
  }
  return out
}

/**
 * A customer does not choose the model of a conversation (28/09/2026). The picker row stands
 * down in all three patches; the plugin that holds the door and the request to the deployment
 * default is inserted by both bundles and disabled by none of the three; the default it reads is
 * not disabled either. `settings`/`config-editor`, the other way to rewrite that default from a
 * browser, are in `STANDS_DOWN` above.
 */
export const MODEL_LOCK = {
  picker: 'ui-model-selection',
  pickerPackage: '@deepseek-ai/dsh-client-ui-model-selection',
  policy: 'tracy-mode-picker',
  policyPackage: '@tracy/dsh-mode-picker',
  defaultModel: 'agent-default-model'
} as const

/**
 * The fleet's own `llm-deepseek` row (survey 08/10/2026). A patch by id replaces the whole row, so a
 * key the dsh catalogue's `deepseek-flash` row carries is lost unless restated: `toolUpdate` was (its
 * cost measured small, reasons in the fleet patch). A `retryableCodes` list replaces dsh's default
 * five (`packages/llm/llm/src/retry-policy.ts`), so it must keep them.
 */
export const MODEL_ROW = {
  id: 'llm-deepseek',
  model: 'deepseek-flash',
  toolUpdate: 'addition-only',
  // Measured choice (PR #1026): host-wide, so a conversation never switches effort and loses its cache.
  reasoningEffort: 'low',
  defaultRetryable: ['EMPTY_RESPONSE', 'RATE_LIMIT', 'SERVER', 'TIMEOUT', 'TRANSPORT']
} as const

/**
 * The fleet model row keeps the catalogue row's `toolUpdate`, dsh's default retryable codes and the
 * measured host-wide `reasoningEffort`.
 * @param rows - the parsed fleet patch.
 * @param label - file to blame problems on.
 * @returns Problems found.
 */
function checkModelRow(rows: readonly unknown[], label: string): Problem[] {
  const out: Problem[] = []
  for (const row of findRows(rows, MODEL_ROW.id)) {
    const config = row.config ?? {}
    const retry = config.retryPolicy as Record<string, unknown> | undefined
    const codes = retry?.retryableCodes
    if (codes !== undefined) {
      const listed = Array.isArray(codes) ? codes : []
      const missing = MODEL_ROW.defaultRetryable.filter((code) => !listed.includes(code))
      if (missing.length > 0) {
        out.push({
          file: label,
          message: `row "${MODEL_ROW.id}" lists \`retryableCodes\` without dsh's default ${missing.join(', ')} — the list replaces the defaults`
        })
      }
    }
    if (config.reasoningEffort !== MODEL_ROW.reasoningEffort) {
      out.push({
        file: label,
        message: `row "${MODEL_ROW.id}" must set \`reasoningEffort: ${MODEL_ROW.reasoningEffort}\` (the measured host-wide effort, PR #1026), found ${JSON.stringify(config.reasoningEffort)}`
      })
    }
    const models = Array.isArray(config.models) ? (config.models as Record<string, unknown>[]) : []
    for (const model of models) {
      if (model?.id === MODEL_ROW.model && model.toolUpdate !== MODEL_ROW.toolUpdate) {
        out.push({
          file: label,
          message: `row "${MODEL_ROW.id}" model "${MODEL_ROW.model}" must carry \`toolUpdate: ${MODEL_ROW.toolUpdate}\` like dsh's catalogue row, found ${JSON.stringify(model.toolUpdate)}`
        })
      }
    }
  }
  return out
}

/**
 * No session on a Tracy host waits on an approval nobody can see (29/09/2026). dsh-base pins
 * `approval: ask` on every new session through its `workspace-write` preset; `dsh-passwords`
 * forwards no approval frame to a seat, and dsh waits for an answer with no timeout — one `bash`
 * escalation held a bench turn 643 s. The native bundle answers it with two rows (reasons in
 * `packages/bundle/tracy-native/cordis.patch.yml`): the service default `never`, and a preset
 * table in which every preset says `never` while dsh-base's three names keep their own sandbox
 * mode. The mode matters as much as the policy: the default preset is the one matching the
 * composed defaults (`workspace-write` + `never`), and none matching throws at boot.
 */
export const APPROVAL_POLICY = {
  approvalRow: 'approval',
  permissionRow: 'permission',
  policy: 'never',
  presets: ['read-only', 'workspace-write', 'danger-full-access']
} as const
const DOCKERFILE_PATH = join(FLEET_DIR, 'Dockerfile')

/** A patch row shaped like `{ id, disabled?, config? }`. */
interface PatchRow {
  readonly id?: unknown
  readonly disabled?: unknown
  readonly config?: Record<string, unknown>
}

/** One problem found, in the order it should be reported. */
interface Problem {
  readonly file: string
  readonly message: string
}

/**
 * Parse a cordis patch file's top-level document, tolerating a parse failure as one Problem
 * rather than an uncaught throw — the whole point of this gate is to say WHICH row is missing,
 * and "the file doesn't parse" is itself that kind of answer.
 * @param text - raw file contents.
 * @param label - name to blame the problem on.
 * @returns The parsed array, or `undefined` alongside a Problem when it isn't a list.
 */
export function parsePatch(text: string, label: string): { rows: unknown[]; problems: Problem[] } {
  let parsed: unknown
  try {
    parsed = load(text)
  } catch (error) {
    return { rows: [], problems: [{ file: label, message: `does not parse as YAML: ${String(error)}` }] }
  }
  if (!Array.isArray(parsed)) {
    return { rows: [], problems: [{ file: label, message: 'top-level document is not a list of rows' }] }
  }
  return { rows: parsed, problems: [] }
}

/**
 * Find a top-level row by id — a plain patch row, not an `insert:` entry.
 * @param rows - the parsed patch document.
 * @param id - the row id to find.
 * @returns The row, or `undefined` when no top-level row carries that id.
 */
function findRow(rows: readonly unknown[], id: string): PatchRow | undefined {
  for (const item of rows) {
    if (item !== null && typeof item === 'object' && !Array.isArray(item) && (item as PatchRow).id === id) {
      return item as PatchRow
    }
  }
  return undefined
}

/**
 * Every top-level row carrying an id, in file order.
 * @param rows - the parsed patch document.
 * @param id - the row id to find.
 * @returns The rows; more than one means a later row patches over an earlier one.
 */
function findRows(rows: readonly unknown[], id: string): PatchRow[] {
  return rows.filter(
    (item): item is PatchRow =>
      item !== null && typeof item === 'object' && !Array.isArray(item) && (item as PatchRow).id === id
  )
}

/**
 * Collect every `{ id, name }` pair inserted anywhere in the patch's `insert:` blocks.
 * @param rows - the parsed patch document.
 * @returns Every inserted entry, in file order.
 */
function collectInserted(
  rows: readonly unknown[]
): { id: string | undefined; name: string | undefined; disabled: unknown; config: unknown }[] {
  const out: { id: string | undefined; name: string | undefined; disabled: unknown; config: unknown }[] = []
  for (const item of rows) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) continue
    const insert = (item as { insert?: unknown }).insert
    if (!Array.isArray(insert)) continue
    for (const entry of insert) {
      if (entry === null || typeof entry !== 'object') continue
      const e = entry as Record<string, unknown>
      out.push({
        id: typeof e.id === 'string' ? e.id : undefined,
        name: typeof e.name === 'string' ? e.name : undefined,
        disabled: e.disabled,
        config: e.config
      })
    }
  }
  return out
}

/**
 * Require that a top-level row exists and carries `disabled: true`.
 * @param rows - the parsed patch document.
 * @param id - the row id.
 * @param label - file to blame problems on.
 * @returns Problems found, empty when the row is disabled as required.
 */
function requireDisabled(rows: readonly unknown[], id: string, label: string): Problem[] {
  const found = findRows(rows, id)
  if (found.length === 0)
    return [{ file: label, message: `row "${id}" is missing — expected \`disabled: true\`` }]
  if (found.length > 1) {
    return [
      {
        file: label,
        message: `row "${id}" is declared ${String(found.length)} times — a later row patches over an earlier one; keep one, with \`disabled: true\``
      }
    ]
  }
  const row = found[0]
  if (row.disabled !== true) {
    return [
      {
        file: label,
        message: `row "${id}" must carry \`disabled: true\`, found ${JSON.stringify(row.disabled)}`
      }
    ]
  }
  return []
}

/** Require one top-level row and ensure it remains enabled. */
function requirePresentNotDisabled(rows: readonly unknown[], id: string, label: string): Problem[] {
  const found = findRows(rows, id)
  if (found.length === 0) return [{ file: label, message: `row "${id}" is missing` }]
  if (found.length > 1) {
    return [{ file: label, message: `row "${id}" is declared ${String(found.length)} times — keep one` }]
  }
  return requireNotDisabled(rows, id, label)
}

/**
 * Require that a top-level row's `insert:`-inserted counterpart exists with the given name.
 * @param rows - the parsed patch document.
 * @param id - the inserted row's id.
 * @param name - the package name it must load.
 * @param label - file to blame problems on.
 * @returns Problems found, empty when the row is present with the right name.
 */
function requireInserted(rows: readonly unknown[], id: string, name: string, label: string): Problem[] {
  const entry = collectInserted(rows).find((candidate) => candidate.id === id)
  if (entry === undefined) {
    return [
      { file: label, message: `no \`insert:\` row with id "${id}" (expected name ${JSON.stringify(name)})` }
    ]
  }
  if (entry.name !== name) {
    return [
      {
        file: label,
        message: `insert row "${id}" names ${JSON.stringify(entry.name)}, expected ${JSON.stringify(name)}`
      }
    ]
  }
  return []
}

/**
 * Require that no top-level row disables a plugin the profile depends on.
 * @param rows - the parsed patch document.
 * @param id - the row id.
 * @param label - file to blame problems on.
 * @returns Problems found, empty when no row with that id carries `disabled` other than `false`.
 */
function requireNotDisabled(rows: readonly unknown[], id: string, label: string): Problem[] {
  return findRows(rows, id)
    .filter((row) => row.disabled !== undefined && row.disabled !== false)
    .map((row) => ({
      file: label,
      message: `row "${id}" must not be disabled, found \`disabled: ${JSON.stringify(row.disabled)}\``
    }))
}

/**
 * The model lock (`MODEL_LOCK`), in one patch: the picker row down and never inserted again under
 * another id; the policy plugin and the deployment default not disabled; the policy never given
 * `customerRoutes` (a customer's own plan); and, in a bundle, the policy plugin inserted.
 * @param rows - the parsed patch document.
 * @param label - file to blame problems on.
 * @param insertsPolicy - whether this patch is a bundle that must insert the policy plugin.
 * @returns Problems found.
 */
function checkModelLock(rows: readonly unknown[], label: string, insertsPolicy: boolean): Problem[] {
  const out = requirePresentNotDisabled(rows, MODEL_LOCK.picker, label)
  for (const entry of collectInserted(rows)) {
    if (entry.name === MODEL_LOCK.pickerPackage) {
      out.push({
        file: label,
        message: `insert row "${String(entry.id)}" loads ${MODEL_LOCK.pickerPackage} again — the conversation model picker must stay off`
      })
    }
    if (entry.id === MODEL_LOCK.policy && entry.disabled !== undefined && entry.disabled !== false) {
      out.push({
        file: label,
        message: `insert row "${MODEL_LOCK.policy}" must not be disabled, found \`disabled: ${JSON.stringify(entry.disabled)}\``
      })
    }
  }
  // The customer's own model plan (`customerRoutes`, `session-models.mjs`) belongs only to the
  // desktop app's dsh on the customer's machine, written by the app into its own patch. On a host one
  // dsh serves every seat (ADR 0014): a plan connected there would be the whole host's.
  const carriesRoutes = (config: unknown): boolean =>
    config !== null && typeof config === 'object' && !Array.isArray(config) && 'customerRoutes' in config
  for (const row of findRows(rows, MODEL_LOCK.policy)) {
    if (carriesRoutes(row.config)) {
      out.push({
        file: label,
        message: `row "${MODEL_LOCK.policy}" carries \`customerRoutes\` — a customer's model plan is for the desktop app's own dsh, never a shared host`
      })
    }
  }
  for (const entry of collectInserted(rows)) {
    if (
      (entry.id === MODEL_LOCK.policy || entry.name === MODEL_LOCK.policyPackage) &&
      carriesRoutes(entry.config)
    ) {
      out.push({
        file: label,
        message: `insert row "${String(entry.id)}" carries \`customerRoutes\` — a customer's model plan is for the desktop app's own dsh, never a shared host`
      })
    }
  }
  if (insertsPolicy) out.push(...requireInserted(rows, MODEL_LOCK.policy, MODEL_LOCK.policyPackage, label))
  out.push(...requireNotDisabled(rows, MODEL_LOCK.policy, label))
  out.push(...requireNotDisabled(rows, MODEL_LOCK.defaultModel, label))
  return out
}

/**
 * The approval decision (`APPROVAL_POLICY`) in one patch. The native bundle must carry both rows;
 * the fleet patch need not, but a row it does carry replaces the bundle's whole `config:` (it is
 * applied later), so it is held to the same values.
 * @param rows - the parsed patch document.
 * @param label - file to blame problems on.
 * @param required - whether the patch must declare both rows (the native bundle does).
 * @returns Problems found.
 */
function checkApprovalRows(rows: readonly unknown[], label: string, required: boolean): Problem[] {
  const out: Problem[] = []
  const { approvalRow, permissionRow, policy, presets: names } = APPROVAL_POLICY
  /** One row, found exactly once, or the problem that stands in for it. */
  const single = (id: string, expected: string): PatchRow | undefined => {
    const found = findRows(rows, id)
    if (found.length > 1) {
      out.push({
        file: label,
        message: `row "${id}" is declared ${String(found.length)} times — a later row patches over an earlier one; keep one`
      })
      return undefined
    }
    if (found.length === 0) {
      if (required) out.push({ file: label, message: `row "${id}" is missing — expected ${expected}` })
      return undefined
    }
    if (found[0].disabled !== undefined && found[0].disabled !== false) {
      out.push({
        file: label,
        message: `row "${id}" must not be disabled, found \`disabled: ${JSON.stringify(found[0].disabled)}\``
      })
      return undefined
    }
    return found[0]
  }

  const approval = single(approvalRow, `\`config.policy: ${policy}\``)
  if (approval !== undefined && approval.config?.policy !== policy) {
    out.push({
      file: label,
      message: `row "${approvalRow}" must carry \`config.policy: ${policy}\`, found ${JSON.stringify(approval.config?.policy)} — a seat never sees an approval, so any other policy waits on one forever`
    })
  }

  const permission = single(permissionRow, `\`config.presets\` with every preset \`approval: ${policy}\``)
  if (permission === undefined) return out
  const table = permission.config?.presets
  if (table === null || typeof table !== 'object' || Array.isArray(table)) {
    out.push({
      file: label,
      message: `row "${permissionRow}" must carry \`config.presets\` (a patch by id replaces the whole config), found ${JSON.stringify(table)}`
    })
    return out
  }
  const presets = table as Record<string, unknown>
  for (const name of names) {
    const spec = presets[name] as { sandbox?: unknown } | null | undefined
    if (spec === null || typeof spec !== 'object' || spec.sandbox !== name) {
      out.push({
        file: label,
        message: `row "${permissionRow}" must keep preset "${name}" with \`sandbox: ${name}\`, found ${JSON.stringify(spec)}`
      })
    }
  }
  for (const [name, spec] of Object.entries(presets)) {
    const said = (spec as { approval?: unknown } | null)?.approval
    if (said !== policy) {
      out.push({
        file: label,
        message: `row "${permissionRow}" preset "${name}" must carry \`approval: ${policy}\`, found ${JSON.stringify(said)} — a new session is pinned its preset's policy, not the service default`
      })
    }
  }
  return out
}

/**
 * Config keys `dsh-better-sidebar` 0.21 removed (the plugin's Terminal tab, tab seeding, the
 * side-card browser). The schema (`vendor/tracy/dsh-better-sidebar/src/config.ts`) drops an
 * unknown key without a word, so one of these in a row is a decision that reads as in force and
 * does nothing.
 */
export const REMOVED_SIDEBAR_KEYS = [
  'shell',
  'shellArgs',
  'terminalsPerSession',
  'reconnectGraceMs',
  'seedTabs',
  'seedFilesTab',
  'openByDefault',
  'browserNoSandbox',
  'agentBrowserTools'
] as const

/**
 * The `better-sidebar` row, in the fleet patch and in `@tracy/dsh-native-bundle` alike.
 *
 * 🔒 UNTIL 0.21 THIS ASKED FOR `shell: /bin/bash`, `seedTabs: []`, `seedFilesTab: false` AND
 * `tabsEnabled.terminal: false`. Upstream removed the Terminal tab and tab seeding, so those four
 * stopped meaning anything — green on a row that configures nothing. What still has teeth:
 *   - `workspaceFence: true` present. It is the containment switch of every sidebar file route
 *     (`fs.*`, `/sidebar/file`, `/sidebar/upload`, `ws/fs-watch` — the last one the only sidebar
 *     socket `dsh-passwords` opens to a seat). The fork pins it on (TRACY-FORK.md P1), but the
 *     row is where a reader sees the boundary, and a patch by id replaces the row's whole config:
 *     the fleet layer dropping it is the fleet layer dropping everything the bundle set.
 *   - no removed key, and no `tabsEnabled.terminal`. Each is a decision that looks enforced and is
 *     not; the replacement for the Terminal decision is structural (no such tab, and the socket
 *     stays owner-only), not a switch.
 * @param rows - the parsed patch document.
 * @param label - file to blame problems on.
 * @returns Problems found.
 */
function checkBetterSidebarRow(rows: readonly unknown[], label: string): Problem[] {
  const row = findRow(rows, 'better-sidebar')
  if (row === undefined) {
    return [
      { file: label, message: 'row "better-sidebar" is missing — expected `config.workspaceFence: true`' }
    ]
  }
  const out: Problem[] = []
  const config = row.config ?? {}
  if (config.workspaceFence !== true) {
    out.push({
      file: label,
      message: `row "better-sidebar" must carry \`config.workspaceFence: true\`, found ${JSON.stringify(config.workspaceFence)}`
    })
  }
  for (const key of REMOVED_SIDEBAR_KEYS) {
    if (key in config) {
      out.push({
        file: label,
        message: `row "better-sidebar" carries \`config.${key}\`, which dsh-better-sidebar 0.21 removed — the schema drops it silently`
      })
    }
  }
  // `config` is `Record<string, unknown>`, so the nested switch is read through a narrow rather
  // than a cast: a patch is YAML somebody hand-wrote.
  const tabsEnabled = config.tabsEnabled
  if (
    tabsEnabled !== null &&
    typeof tabsEnabled === 'object' &&
    !Array.isArray(tabsEnabled) &&
    'terminal' in (tabsEnabled as Record<string, unknown>)
  ) {
    out.push({
      file: label,
      message:
        'row "better-sidebar" carries `config.tabsEnabled.terminal`, a tab dsh-better-sidebar 0.21 no longer has'
    })
  }
  return out
}

/**
 * Check the fleet image's own profile patch — the rows Dockerfile §Build-time-asserts checks
 * against the COMPOSED tree, but readable here without composing anything.
 * @param text - raw contents of `profile/cordis.patch.yml`.
 * @param label - repo-relative path, for messages.
 * @returns Problems found.
 */
export function checkFleetPatch(text: string, label: string): Problem[] {
  const { rows, problems } = parsePatch(text, label)
  if (problems.length > 0) return problems
  const out: Problem[] = []

  out.push(...requireDisabled(rows, 'subprocess', label))
  out.push(...requireDisabled(rows, 'sandbox', label))
  out.push(...requireDisabled(rows, 'ptc-runtime', label))
  // dsh 0.1.6-alpha.2: the Plugin Manager rewrites the profile at runtime and HMR applies the
  // edit live — on a host whose one dsh serves every site, both are a change to every customer
  // at once, so both stay down and the image build stays the only path to a profile change.
  out.push(...requireDisabled(rows, 'plugin-manager', label))
  out.push(...requireDisabled(rows, 'hmr', label))
  // dsh 0.1.7-rc.2: restated here like the two above — the image's own layer is applied last.
  for (const id of STANDS_DOWN) out.push(...requireDisabled(rows, id, label))
  // This UI uses account-scoped broker doors; local subscription credentials stay forbidden.
  out.push(...requireDisabled(rows, 'dsh-subscriptions', label))
  const accountUi = findRow(rows, 'tracy-model-plan')
  const accountPolicy = findRow(rows, MODEL_LOCK.policy)
  if (
    accountUi?.disabled !== false ||
    (accountPolicy?.config as Record<string, unknown> | undefined)?.accountSubscriptions !== true
  ) {
    out.push({
      file: label,
      message: 'Account subscription UI requires the account-scoped model policy on the fleet.'
    })
  }
  out.push(...checkModelLock(rows, label, false))
  out.push(...checkModelRow(rows, label))
  // The bundle decides the approval policy; this layer, applied after it, may only agree.
  out.push(...checkApprovalRows(rows, label, false))

  const tools = findRow(rows, 'tools')
  if (tools === undefined) {
    out.push({ file: label, message: 'row "tools" is missing — expected `config.mode: native`' })
  } else if (tools.config?.mode !== 'native') {
    out.push({
      file: label,
      message: `row "tools" must carry \`config.mode: native\`, found ${JSON.stringify(tools.config?.mode)}`
    })
  }

  const webserver = findRow(rows, 'webserver')
  if (webserver === undefined) {
    out.push({ file: label, message: 'row "webserver" is missing — expected host 0.0.0.0, port 51700' })
  } else {
    if (webserver.config?.host !== '0.0.0.0') {
      out.push({
        file: label,
        message: `row "webserver" must carry \`config.host: 0.0.0.0\`, found ${JSON.stringify(webserver.config?.host)}`
      })
    }
    if (webserver.config?.port !== 51700) {
      out.push({
        file: label,
        message: `row "webserver" must carry \`config.port: 51700\`, found ${JSON.stringify(webserver.config?.port)}`
      })
    }
  }

  out.push(...requireInserted(rows, 'tracy-sandbox-docker', '@tracy/dsh-sandbox-docker', label))
  out.push(...requireInserted(rows, 'tracy-subprocess-docker', '@tracy/dsh-subprocess-docker', label))

  out.push(...checkBetterSidebarRow(rows, label))

  out.push(...checkNoJsTag(text, label))
  return out
}

/**
 * The preset ids a GENERATED `presets.patch.yml` declares: `config.id` of every inserted
 * `@deepseek-ai/dsh-agent-preset` row.
 * @param text - raw contents of a bundle's `presets.patch.yml`.
 * @param label - repo-relative path, for messages.
 * @returns The ids, plus a Problem when the file declares none (a gutted file must not pass as a
 *   set every default fails against quietly).
 */
export function presetIdsOf(text: string, label: string): { ids: Set<string>; problems: Problem[] } {
  const { rows, problems } = parsePatch(text, label)
  if (problems.length > 0) return { ids: new Set(), problems }
  const ids = new Set<string>()
  for (const item of rows) {
    const insert =
      item !== null && typeof item === 'object' ? (item as { insert?: unknown }).insert : undefined
    if (!Array.isArray(insert)) continue
    for (const entry of insert) {
      const e = entry as { name?: unknown; config?: { id?: unknown } } | null
      if (e?.name === '@deepseek-ai/dsh-agent-preset' && typeof e.config?.id === 'string')
        ids.add(e.config.id)
    }
  }
  if (ids.size === 0)
    return { ids, problems: [{ file: label, message: 'declares no `@deepseek-ai/dsh-agent-preset` row' }] }
  return { ids, problems: [] }
}

/**
 * The preset decision a Tracy bundle carries since dsh 0.1.7-rc.2: dsh's four shipped preset rows
 * disabled, `agent-preset-registry.config.default` naming one of the bundle's generated ids, and the
 * host skill row down so each preset's skills are its own (`HOST_SKILL_ROW`).
 * @param rows - the parsed bundle patch.
 * @param label - repo-relative path, for messages.
 * @param presetIds - ids the bundle's generated `presets.patch.yml` declares.
 * @returns Problems found.
 */
function checkPresetRegistry(
  rows: readonly unknown[],
  label: string,
  presetIds: ReadonlySet<string>
): Problem[] {
  const out: Problem[] = []
  for (const id of SHIPPED_PRESETS) out.push(...requireDisabled(rows, id, label))
  out.push(...requireDisabled(rows, HOST_SKILL_ROW, label))
  const registry = findRow(rows, 'agent-preset-registry')
  if (registry === undefined) {
    out.push({
      file: label,
      message: 'row "agent-preset-registry" is missing — expected `config.default` naming a Tracy preset'
    })
  } else if (typeof registry.config?.default !== 'string' || !presetIds.has(registry.config.default)) {
    out.push({
      file: label,
      message:
        `row "agent-preset-registry" must carry \`config.default\` naming a generated preset ` +
        `(${[...presetIds].join(', ')}), found ${JSON.stringify(registry.config?.default)}`
    })
  }
  return out
}

/**
 * Check `@tracy/dsh-native-bundle`'s patch for the composed-tree invariants that live there rather
 * than in the fleet's own patch — see `NATIVE_BUNDLE_PATCH_PATH`'s comment for why.
 * @param text - raw contents of the native bundle's `cordis.patch.yml`.
 * @param label - repo-relative path, for messages.
 * @param presetIds - ids the bundle's generated `presets.patch.yml` declares.
 * @returns Problems found.
 */
export function checkNativeBundlePatch(
  text: string,
  label: string,
  presetIds: ReadonlySet<string>
): Problem[] {
  const { rows, problems } = parsePatch(text, label)
  if (problems.length > 0) return problems
  const out: Problem[] = []

  out.push(...requireDisabled(rows, 'directory-picker', label))
  // dsh's shipped presets must stay OUT of the fleet roster. Until 0.1.6 that was the
  // `agent-presets` row's `includeShippedRoot: false` (held here since 19/09); since 0.1.7-rc.2 the
  // four are rows of their own, and `preset-cordis` enables `tool-plugin-manager` wherever a
  // profile context exists — the fleet always has one.
  out.push(...checkPresetRegistry(rows, label, presetIds))
  for (const id of STANDS_DOWN) out.push(...requireDisabled(rows, id, label))
  out.push(...checkModelLock(rows, label, true))
  out.push(...checkDesktopOnlyInBundle(rows, label))
  out.push(...checkApprovalRows(rows, label, true))
  out.push(
    ...requireInserted(
      rows,
      'directory-picker-browse',
      '@deepseek-ai/dsh-host-directory-picker-browse',
      label
    )
  )
  // No `ui-directory-picker-browse` row: since 15/09/2026 a workspace IS a site and only Add site
  // makes one, so the client half of the flow is left out on purpose — its empty
  // `directoryFlow` slot is what hides "Add workspace…". The host half stays: dsh still
  // resolves directories through it.
  out.push(...requireDisabled(rows, 'ui-brand-official', label))
  out.push(...checkBetterSidebarRow(rows, label))

  out.push(...checkNoJsTag(text, label))
  return out
}

/**
 * Check `@tracy/dsh-cowork-bundle`'s patch for the same preset and stand-down decisions — see
 * `COWORK_BUNDLE_PATCH_PATH`'s comment for why a non-image bundle is read here.
 * @param text - raw contents of the cowork bundle's `cordis.patch.yml`.
 * @param label - repo-relative path, for messages.
 * @param presetIds - ids the bundle's generated `presets.patch.yml` declares.
 * @returns Problems found.
 */
export function checkCoworkBundlePatch(
  text: string,
  label: string,
  presetIds: ReadonlySet<string>
): Problem[] {
  const { rows, problems } = parsePatch(text, label)
  if (problems.length > 0) return problems
  const out = checkPresetRegistry(rows, label, presetIds)
  for (const id of STANDS_DOWN) out.push(...requireDisabled(rows, id, label))
  out.push(...checkModelLock(rows, label, true))
  return out
}

/**
 * No `!!js` YAML tag anywhere in a patch file.
 *
 * `js-yaml`'s default schema does not resolve `!!js/function` or `!!js/undefined` — `load()`
 * throws on them — but a schema upgrade or a call site switched to `loadAll`/a custom schema
 * would turn a patch file into a place arbitrary code runs at parse time, unreviewed as code
 * because it reads as data. Catching the tag textually means this holds regardless of which
 * loader eventually reads the file.
 * @param text - raw file contents.
 * @param label - repo-relative path, for messages.
 * @returns A single Problem when the tag appears, empty otherwise.
 */
function checkNoJsTag(text: string, label: string): Problem[] {
  if (text.includes('!!js')) {
    return [{ file: label, message: 'contains a `!!js` YAML tag — arbitrary code at parse time' }]
  }
  return []
}

/**
 * Check `profile/package.json` names exactly the five bundles the Dockerfile's header comment
 * and its build-time assert both assume.
 * @param text - raw file contents.
 * @param label - repo-relative path, for messages.
 * @returns Problems found.
 */
export function checkProfilePackage(text: string, label: string): Problem[] {
  const EXPECTED = [
    '@deepseek-ai/dsh-base',
    '@deepseek-ai/dsh-web-app',
    'dsh-better-sidebar',
    '@goodandready/dsh-subscriptions',
    '@tracy/dsh-native-bundle'
  ]
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    return [{ file: label, message: `does not parse as JSON: ${String(error)}` }]
  }
  const bundles = (parsed as { dsh?: { profile?: { bundles?: unknown } } }).dsh?.profile?.bundles
  if (!Array.isArray(bundles) || JSON.stringify(bundles) !== JSON.stringify(EXPECTED)) {
    return [
      {
        file: label,
        message: `dsh.profile.bundles must be exactly ${JSON.stringify(EXPECTED)}, found ${JSON.stringify(bundles)}`
      }
    ]
  }
  return []
}

/**
 * Check `entrypoint.sh` still carries the two literal markers it must never lose silently — see
 * the module comment for what each one guards.
 * @param text - raw file contents.
 * @param label - repo-relative path, for messages.
 * @returns Problems found.
 */
export function checkEntrypoint(text: string, label: string): Problem[] {
  const out: Problem[] = []
  if (!text.includes('MCP_GATEWAY_SSH_ENDPOINTS=owner:ws:/sidebar/ws/terminal')) {
    out.push({
      file: label,
      message:
        'missing the MCP_GATEWAY_SSH_ENDPOINTS write — the terminal sockets lose their owner-only ' +
        'row, the layer behind the Tracy policy that refuses them to seats'
    })
  }
  if (!text.includes('node_modules/@tracy/dsh-native-bundle/package.json')) {
    out.push({
      file: label,
      message:
        'missing the profile-masked guard (the required-file check naming ' +
        '$DSH_HOME/profiles/native/node_modules/@tracy/dsh-native-bundle/package.json) — a ' +
        'volume mounted over $DSH_HOME would boot dsh into an empty client graph with no error line'
    })
  }
  return out
}

/**
 * Read one file, or report it missing rather than throwing — a checker for an absent file
 * should say "the file is gone", not crash with an unrelated stack trace.
 * @param path - absolute path to read.
 * @param label - repo-relative path, for messages.
 * @returns The file's text, or `undefined` alongside a Problem when it does not exist.
 */
export function readOrMissing(
  path: string,
  label: string
): { text: string | undefined; problems: Problem[] } {
  if (!existsSync(path))
    return { text: undefined, problems: [{ file: label, message: 'file does not exist' }] }
  return { text: readFileSync(path, 'utf8'), problems: [] }
}

/** Run every check against the real files and report, exiting non-zero on the first problem. */
/**
 * Every `@tracy/*` the native bundle names is a directory the image actually COPIES.
 *
 * 🔒 THE ONE INVARIANT THAT IS NOT IN A YAML FILE, AND IT COST A DEPLOY TO LEARN. The bundle's
 * `dependencies` decide what dsh tries to load at boot; the Dockerfile's `COPY` lines decide what
 * is on disk to load. Nothing keeps the two lists in step, and they are edited by different kinds
 * of work: adding a plugin is a `packages/` change, and the image is a `dsh/` change one directory
 * away.
 *
 * Measured 08/09: merging `main` brought `@tracy/dsh-site-build` into the bundle. Every gate was
 * green, the image BUILT, it pushed to GHCR, the host pulled it — and `tracy-dsh` then crash-looped
 * fourteen times on
 *
 *   Cannot find package '@tracy/dsh-site-build' imported from /desk-home/profiles/native/
 *
 * The deploy noticed only through its own 300-second health timeout, by which point the tag file
 * named the broken image and the dev environment was down until someone rolled it back BY HAND
 * (the automatic rollback could not: it re-pulls, and the host holds no GHCR token by design).
 *
 * A two-list comparison is the cheapest possible check for that, and it needs no Docker.
 * @param bundleText - the native bundle's package.json.
 * @param dockerText - the image Dockerfile.
 * @param bundleLabel - path shown in a problem.
 * @returns the plugins named but never copied.
 */
export function checkBundleCopiedIntoImage(
  bundleText: string,
  dockerText: string,
  bundleLabel: string
): Problem[] {
  let named: string[]
  try {
    const parsed = JSON.parse(bundleText) as { dependencies?: Record<string, string> }
    named = Object.keys(parsed.dependencies ?? {}).filter((d) => d.startsWith('@tracy/'))
  } catch (error) {
    return [{ file: bundleLabel, message: `unreadable JSON: ${(error as Error).message}` }]
  }
  // A COPY line ends in the package's place inside the profile tree, so the name is read from the
  // DESTINATION rather than the source directory — the two do not have to match, and twice already
  // they have not (`tracy-design-system` → `@tracy/dsh-design-inspiration`).
  const copied = new Set(Array.from(dockerText.matchAll(/node_modules\/(@tracy\/[a-z0-9-]+)/g), (m) => m[1]))
  return named
    .filter((name) => !copied.has(name))
    .map((name) => ({
      file: bundleLabel,
      message:
        `the bundle lists \`${name}\` but the Dockerfile does not COPY it into the profile — dsh will die at boot ` +
        `with "Cannot find package ${name}", and it only shows once someone DEPLOYS`
    }))
}

function main(): void {
  const problems: Problem[] = []

  const fleetLabel = relative(ROOT, FLEET_PATCH_PATH)
  const fleet = readOrMissing(FLEET_PATCH_PATH, fleetLabel)
  problems.push(...fleet.problems)
  if (fleet.text !== undefined) problems.push(...checkFleetPatch(fleet.text, fleetLabel))

  for (const [patchPath, presetsPath, check] of [
    [NATIVE_BUNDLE_PATCH_PATH, NATIVE_PRESETS_PATH, checkNativeBundlePatch],
    [COWORK_BUNDLE_PATCH_PATH, COWORK_PRESETS_PATH, checkCoworkBundlePatch]
  ] as const) {
    const presetsLabel = relative(ROOT, presetsPath)
    const presets = readOrMissing(presetsPath, presetsLabel)
    problems.push(...presets.problems)
    const declared = presets.text === undefined ? undefined : presetIdsOf(presets.text, presetsLabel)
    problems.push(...(declared?.problems ?? []))
    if (presets.text !== undefined) problems.push(...checkNoJsTag(presets.text, presetsLabel))

    const patchLabel = relative(ROOT, patchPath)
    const patch = readOrMissing(patchPath, patchLabel)
    problems.push(...patch.problems)
    if (patch.text !== undefined) problems.push(...check(patch.text, patchLabel, declared?.ids ?? new Set()))
  }

  const packageLabel = relative(ROOT, PROFILE_PACKAGE_PATH)
  const packageJson = readOrMissing(PROFILE_PACKAGE_PATH, packageLabel)
  problems.push(...packageJson.problems)
  if (packageJson.text !== undefined) problems.push(...checkProfilePackage(packageJson.text, packageLabel))

  const bundlePkgLabel = relative(ROOT, NATIVE_BUNDLE_PACKAGE_PATH)
  const bundlePkg = readOrMissing(NATIVE_BUNDLE_PACKAGE_PATH, bundlePkgLabel)
  const dockerfile = readOrMissing(DOCKERFILE_PATH, relative(ROOT, DOCKERFILE_PATH))
  problems.push(...bundlePkg.problems, ...dockerfile.problems)
  if (bundlePkg.text !== undefined && dockerfile.text !== undefined)
    problems.push(...checkBundleCopiedIntoImage(bundlePkg.text, dockerfile.text, bundlePkgLabel))

  const entrypointLabel = relative(ROOT, ENTRYPOINT_PATH)
  const entrypoint = readOrMissing(ENTRYPOINT_PATH, entrypointLabel)
  problems.push(...entrypoint.problems)
  if (entrypoint.text !== undefined) problems.push(...checkEntrypoint(entrypoint.text, entrypointLabel))

  if (problems.length > 0) {
    for (const problem of problems) {
      process.stderr.write(`check-image-profile: ${problem.file}: ${problem.message}\n`)
    }
    process.exit(1)
  }

  process.stdout.write('check-image-profile: fleet image profile invariants hold\n')
}

// Guarded so the checker functions above can be imported by a test without running `main()` as
// a side effect of the import — `node --test` loads this module directly (Node 24 strips TS
// types with no build step), and a `main()` that reads the real repo and calls `process.exit`
// on import would make every fixture test either crash the test runner or assert on the wrong
// files.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
}
