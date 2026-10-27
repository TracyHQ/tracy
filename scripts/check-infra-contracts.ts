/**
 * Gate: wiring rules between files of the fleet, the tools, the CMS packages, tracy-host and the
 * docs site that no compiler, no import and no runtime joins.
 *
 * WHY THIS IS A GATE AND NOT UNIT TESTS. Every check below reads a file of the repo as DATA and
 * concludes "the repo is wired correctly": one shell script's line order, two Python hook servers
 * against the provision script they call, a catalogue against the shell that reads it, a doc tree
 * against its own English source. None of that is a claim about what code DOES, so it does not
 * belong in a package's unit tier (where it was: `db-volume`, `hook-doors`, `wordpress-quickstart`,
 * `template-quickstart`, `surface`, `consistency`, `content-identity`, `site-label-parity`,
 * `ops-cms-parity`, `tokens-dark-covers-body`, `od-brand-tokens`, `modify-site-skill`, the docs
 * `i18n` test). In a unit tier such a test is a change detector: it fails on a harmless edit, and
 * the run that finds it red is the one that had no reason to open that file.
 *
 * WHAT IS CHECKED, one section each:
 *
 *   - provision scripts: the ORDER of the steps that must not swap (the password check before the
 *     password is minted, the refusal before the install, the marker before the bind, ...) and the
 *     names the shell shares with the catalogue and the hook servers;
 *   - the two hook servers (`tracy-hooks.contabo.py` / `.do.py`): the short list of doors where a
 *     difference between them is a bug and the symptom is silence;
 *   - `quickstarts.json`: every entry names a platform, carries no `card`, and every download part
 *     is pinned or says it is pending;
 *   - tracy-host and the fleet scripts: the provision lock, the identity marker and the outcome
 *     words of the Joomla script are the ones tracy-host's backfill reads;
 *   - tracy-site-tools: every platform-only tool name is registered by its owner, and the
 *     model-facing EmDash texts (skill, persona, preset) name only tools EmDash has and never say
 *     "list first";
 *   - the two copies of the site-label rule (plugin and tracy-web);
 *   - `tokens.css`: the dark palette reaches `body`;
 *   - the brand engine's token names equal the names every vendored design system declares;
 *   - the `modify-site` skill: every path it names exists;
 *   - the docs site: a translation declares itself, keeps the structure of its English source and
 *     links into its own tree;
 *   - the WordPress theme overlays carry no updater of their own;
 *   - the ops-cms parsers agree with the modules they describe.
 *
 * It runs like any other gate: cwd is the repo root, a non-zero exit is a failure.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { labelKeys } from '../apps/tracy-docs/sidebar.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** A single problem found. */
export interface Problem {
  /** Repo-relative file the problem lives in. */
  readonly file: string
  /** What is wrong. */
  readonly message: string
}

const problem = (file: string, message: string): Problem => ({ file, message })

// ── ordered steps inside a script ─────────────────────────────────────────────────────────────

/** A text to find, or the LAST occurrence of a text (`{ last: text }`). */
export type Anchor = string | { readonly last: string }

/** One ordering rule: these anchors appear in this order, starting from `after` when given. */
export interface OrderRule {
  readonly file: string
  /** Why the order matters, printed with a failure. */
  readonly why: string
  /** Search starts at the first occurrence of this text (whole file when absent). */
  readonly after?: Anchor
  readonly anchors: readonly Anchor[]
}

const anchorText = (a: Anchor): string => (typeof a === 'string' ? a : a.last)
const locate = (source: string, a: Anchor, from: number): number =>
  typeof a === 'string' ? source.indexOf(a, from) : Math.max(source.lastIndexOf(a.last), -1)

/**
 * Every anchor exists and each sits after the one before it.
 * @param rule - the rule to hold.
 * @param source - the file's text.
 */
export function checkOrder(rule: OrderRule, source: string): Problem[] {
  let cursor = 0
  if (rule.after !== undefined) {
    cursor = locate(source, rule.after, 0)
    if (cursor < 0)
      return [
        problem(rule.file, `order rule cannot start: "${anchorText(rule.after)}" is gone (${rule.why})`)
      ]
  }
  let previous = ''
  for (const anchor of rule.anchors) {
    const at = locate(source, anchor, cursor)
    if (at < 0)
      return [
        problem(
          rule.file,
          `"${anchorText(anchor)}" is missing${previous ? ` after "${previous}"` : ''} (${rule.why})`
        )
      ]
    cursor = at
    previous = anchorText(anchor)
  }
  return []
}

const PROVISION = 'packages/fleet/tracy-fleet-operation/scripts/provision'

export const ORDER_RULES: readonly OrderRule[] = [
  {
    file: `${PROVISION}/provision.sh`,
    why: 'a site rebuilt on a volume that kept the old database password would boot with the wrong password',
    anchors: [
      "reusing this stack's existing database password",
      'tracy_db_volume_conflict "$LABEL" "$SITE_DIR"',
      'DB_PASSWORD="$(head -c 24 /dev/urandom',
      'docker compose up -d db'
    ]
  },
  {
    file: `${PROVISION}/platform/joomla.sh`,
    why: 'a template card must take its own road before a contract is demanded of it',
    anchors: ['= template ]; then', 'provision resolved no content contract']
  },
  {
    file: `${PROVISION}/platform/joomla.sh`,
    why: 'a failed bootstrap must not leave an unrestricted site behind: marker first, bind second',
    after: '= template ]; then',
    anchors: ['content-contracts/$LABEL.json"', 'joomla_bind_contract "$card_contract"']
  },
  {
    file: `${PROVISION}/platform/joomla.sh`,
    why: 'a failed bootstrap must not leave an unrestricted site behind: marker first, bind second',
    after: 'provision resolved no content contract',
    anchors: ['content-contracts/$LABEL.json"', 'joomla_bind_contract "$CONTRACT_ID"']
  },
  {
    file: `${PROVISION}/platform/joomla.sh`,
    why: 'refusing after the install is refusing after the cost',
    anchors: [
      'refusing to install a Claude Cowork plugin that may not bind',
      'elif joomla_install_cowork_release; then'
    ]
  },
  {
    file: `${PROVISION}/platform/joomla.sh`,
    why: 'the refusal must come before the pairing that would fail',
    anchors: [
      'refusing to install a Claude Cowork plugin that may not bind',
      'pairing the template with its private Cowork token'
    ]
  },
  {
    file: `${PROVISION}/platform/wordpress.sh`,
    why: 'a template card must take its own road before a contract is demanded of it',
    anchors: ['= template ]; then', 'provision resolved no content contract']
  },
  {
    file: `${PROVISION}/platform/wordpress.sh`,
    why: 'a sealed site is marked before the doors, bound after them, and a refused bind stops the provision',
    after: { last: 'if [ -n "$CONTRACT_ID" ]; then' },
    anchors: [
      '> "$marker"',
      '--part cowork',
      'tracy_wp_install_doors "$COWORK_MIN_VERSION" "$package"',
      'tracy_wp_bind_contract "$CONTRACT_ID" || return 1'
    ]
  },
  {
    file: `${PROVISION}/platform/wordpress.sh`,
    why: 'the AcyMailing keys are rewritten once the database is proven, before the site is handed over',
    after: 'if [ -n "${QUICKSTART:-}" ]; then',
    anchors: [
      'wp core is-installed',
      'tracy_wp_acym_keys "$WP_TABLE_PREFIX" || return 1',
      'if [ -n "$CONTRACT_ID" ]; then'
    ]
  },
  {
    file: `${PROVISION}/joomla-contract-install.php`,
    why: 'the PSR-4 map is rebuilt after the install, once the plugin is on disk (load() alone is the blind road)',
    anchors: [
      'createExtensionNamespaceMap()',
      'Installer::getInstance()->install(',
      '(new \\JNamespacePsr4Map())->create();',
      'Contract Claude Cowork plugin installed'
    ]
  },
  {
    file: `${PROVISION}/joomla-bootstrap.php`,
    why: 'the optional-pairing exit is read before the exception that would fail the provision',
    anchors: [
      "if (!$row && !empty($site['optional'])) return 3;",
      "throw new RuntimeException('Cowork is missing",
      "'optional' => getenv('TRACY_PAIR_OPTIONAL') === '1'"
    ]
  },
  {
    file: `${PROVISION}/provision.sh`,
    why: 'the database import says it ran, so the content-identity pass knows which road imported it',
    after: 'stage "importing database"',
    anchors: ['DB_IMPORTED=1', 'fi # PLATFORM_NEEDS_DB']
  },
  {
    file: `${PROVISION}/platform/emdash.sh`,
    why: 'the tools layer goes on after the state is restored and before the image is announced and used',
    anchors: [
      'emdash_restore_state "$SITE_DIR/work/state.tar.gz"',
      'emdash_tools_image',
      '==> EmDash image (quickstart'
    ]
  }
]

/** A text a file must (or must not) contain. */
export interface TextRule {
  readonly file: string
  readonly why: string
  readonly must?: string
  readonly mustNot?: string
}

export function checkText(rule: TextRule, source: string): Problem[] {
  const out: Problem[] = []
  if (rule.must !== undefined && !source.includes(rule.must))
    out.push(problem(rule.file, `no longer contains "${rule.must}" (${rule.why})`))
  if (rule.mustNot !== undefined && source.includes(rule.mustNot))
    out.push(problem(rule.file, `contains "${rule.mustNot}" (${rule.why})`))
  return out
}

export const PROVISION_TEXT_RULES: readonly TextRule[] = [
  {
    file: `${PROVISION}/provision.sh`,
    why: 'the shell asks the catalogue which platform a quickstart is; it lists no ids',
    must: 'quickstart.py" --id "$QUICKSTART" --platform'
  },
  {
    file: `${PROVISION}/provision.sh`,
    why: 'the shell asks the catalogue whether an entry is a finished site',
    must: 'quickstart.py" --id "$QUICKSTART" --field template.id'
  },
  {
    file: `${PROVISION}/provision.sh`,
    why: 'the floor travels as COWORK_FLOOR, the name platform/joomla.sh reads',
    must: 'export COWORK_FLOOR="$COWORK_MIN_VERSION"'
  },
  {
    file: `${PROVISION}/platform/joomla.sh`,
    why: 'the name provision.sh exports the Cowork floor under',
    must: '${COWORK_FLOOR:-'
  },
  {
    file: `${PROVISION}/provision.sh`,
    why: 'the hook servers pass --image; provision must turn it into the variable emdash.sh reads',
    must: 'TRACY_EMDASH_IMAGE="$2"'
  },
  {
    file: `${PROVISION}/platform/emdash.sh`,
    why: 'the one value that becomes an argument to `docker compose up` is restricted to Tracy namespace',
    must: 'tracy/*:*)'
  },
  {
    file: `${PROVISION}/platform/emdash.sh`,
    why: 'a refusal must say what was asked for',
    must: 'refused image'
  }
]

/** A `PROVISION_FLAGS`-style rule: the design-plan runs only when a quickstart is not a template. */
export function checkDesignPlanGuard(file: string, source: string): Problem[] {
  return /\[ "\$PLATFORM" = joomla \] && \[ "\$BUILD_WORKFLOW" != template \]; then\n[\s\S]*?design-plan\.py/.test(
    source
  )
    ? []
    : [problem(file, 'design-plan.py no longer runs only for a non-template Joomla quickstart')]
}

/** The gate slice of provision.sh spells no quickstart id. */
export function checkNoIdInGate(file: string, source: string): Problem[] {
  const start = source.indexOf('if [ -n "$QUICKSTART" ]; then')
  const end = source.indexOf('SITE_DIR="$ROOT/$LABEL"')
  if (start < 0 || end < start) return [problem(file, 'the quickstart gate block cannot be found')]
  const gate = source.slice(start, end)
  return /'?(tracy|quickstart)-?[a-z-]*\/[a-z0-9]+'?/.test(gate.replace(/\$QUICKSTART/g, ''))
    ? [problem(file, 'a quickstart id is spelled in the platform gate; ask the catalogue instead')]
    : []
}

/** `tracy_wp_install_doors` is defined once and called on the fresh and the quickstart path. */
export function checkWordPressDoors(file: string, source: string): Problem[] {
  const out: Problem[] = []
  if ((source.match(/^tracy_wp_install_doors\(\) \{/gm) ?? []).length !== 1)
    out.push(problem(file, 'tracy_wp_install_doors must be defined exactly once, at top level'))
  const calls = (source.match(/tracy_wp_install_doors [^\n(]/g) ?? []).length
  if (calls < 2)
    out.push(problem(file, 'the doors must be installed on both the fresh and the quickstart path'))
  for (const [text, pattern] of [
    ['cowork_latest wordpress', /cowork_latest wordpress/g],
    ['wp option get claude_cowork_token', /wp option get claude_cowork_token/g]
  ] as const)
    if ((source.match(pattern) ?? []).length !== 1)
      out.push(problem(file, `"${text}" must live in the doors function only (found more or fewer copies)`))
  return out
}

// ── hook servers ──────────────────────────────────────────────────────────────────────────────

const HOOK_DIR = 'packages/fleet/tracy-fleet-operation/scripts/hooks'
export const HOOK_FILES = ['tracy-hooks.contabo.py', 'tracy-hooks.do.py'] as const

/**
 * The short list where a difference between the two hook servers is a bug and the symptom is
 * silence (`scripts/hooks/README.md`: two different services that share a name).
 * @param name - hook file name.
 * @param source - its text.
 */
export function checkHookServer(name: string, source: string): Problem[] {
  const file = `${HOOK_DIR}/${name}`
  const out: Problem[] = []
  const need = (ok: boolean, message: string) => {
    if (!ok) out.push(problem(file, message))
  }
  const door = (from: string) => source.slice(source.indexOf(from), source.indexOf('def _relay_signed'))

  need(
    source.includes('if self.path == "/site-attach":') && source.includes('def _site_attach(self)'),
    'no /site-attach door: sites born on this host have no agent'
  )
  need(
    source.includes('ATTACH_SITE = "/opt/tracy-fleet/provision/attach-site.sh"'),
    'ATTACH_SITE is not under provision/ (tools/ is outside fleet-receive.sh ALLOWED)'
  )
  need(!source.includes('/opt/tracy-fleet/tools/attach-site.sh'), 'still points at tools/attach-site.sh')
  const attach = door('def _site_attach')
  need(/_relay_signed/.test(attach) && attach.includes('"bad signature"'), '/site-attach is not signed')
  need(/SAFE_ARG\.match\(label\)/.test(attach), '/site-attach does not check its label')

  const start = source.indexOf('PROVISION_FLAGS = {')
  const flags = start < 0 ? '' : source.slice(start, source.indexOf('}', start))
  need(
    /"siteKey": "--site-key"/.test(flags),
    'siteKey never reaches provision (the agent is told the wrong address)'
  )
  need(/"label": "--label"/.test(flags), 'label is not in PROVISION_FLAGS')
  need(/"image":\s*"--image"/.test(flags), 'image is not in PROVISION_FLAGS')

  for (const gone of ['/lane', '/lane-update', '/lane-versions'])
    need(!source.includes(`self.path == "${gone}"`), `lane door ${gone} is back`)
  for (const helper of [
    '_lane_versions',
    '_lane_update',
    'run_lane_update',
    'LANE_UPDATE_LOCK',
    'def _lane('
  ])
    need(!source.includes(helper), `${helper} is back`)
  for (const script of ['ensure-lane.sh', 'update-lane.sh', 'lane-versions.mjs'])
    need(!source.includes(script), `still calls the deleted ${script}`)

  need(
    source.includes('if self.path == "/dsh-versions":') && source.includes('def _dsh_versions(self)'),
    'no /dsh-versions door'
  )
  need(
    source.includes('DSH_VERSIONS = "/opt/tracy-fleet/provision/dsh-versions.mjs"'),
    'DSH_VERSIONS is not under provision/'
  )
  need(!source.includes('/opt/tracy-fleet/tools/dsh-versions.mjs'), 'still points at tools/dsh-versions.mjs')
  const versions = door('def _dsh_versions')
  need(/_relay_signed/.test(versions) && versions.includes('"bad signature"'), '/dsh-versions is not signed')
  need(/HOST_NAME/.test(versions), '/dsh-versions does not say which host it speaks for')
  for (const word of ['write_job', 'threading.Thread', 'LOCK'])
    need(!versions.includes(word), `/dsh-versions grew a ${word}: it reads and never writes`)
  return out
}

/** The two hosts name themselves with the names the fleet already uses. */
export function checkHookHostNames(sources: Readonly<Record<string, string>>): Problem[] {
  const out: Problem[] = []
  const expected: Record<string, string> = { 'tracy-hooks.contabo.py': 'contabo', 'tracy-hooks.do.py': 'do' }
  for (const [name, want] of Object.entries(expected)) {
    const got = /HOST_NAME = "([a-z0-9-]+)"/.exec(sources[name] ?? '')?.[1]
    if (got !== want)
      out.push(problem(`${HOOK_DIR}/${name}`, `HOST_NAME is ${String(got)}, the fleet knows it as ${want}`))
  }
  return out
}

// ── quickstarts.json ──────────────────────────────────────────────────────────────────────────

export const QUICKSTART_PLATFORMS = ['joomla', 'wordpress', 'emdash']

/**
 * The static catalogue: every entry names a platform, carries no `card` (it lives on the release
 * since 16/09), and every download part is either pinned or says it is pending.
 * @param catalog - parsed `quickstarts.json`.
 */
export function checkCatalog(catalog: Record<string, Record<string, unknown>>): Problem[] {
  const file = `${PROVISION}/quickstarts.json`
  const out: Problem[] = []
  for (const [id, entry] of Object.entries(catalog)) {
    if (!QUICKSTART_PLATFORMS.includes(String(entry.platform)))
      out.push(problem(file, `${id}: names no platform`))
    if ('card' in entry) out.push(problem(file, `${id}: carries a card block; it lives on the release`))
    for (const part of ['webroot', 'database']) {
      const p = entry[part] as Record<string, unknown> | undefined
      if (p === undefined) continue
      if (typeof p.pending === 'string') continue
      if (!/^[0-9a-f]{64}$/.test(String(p.sha256)))
        out.push(problem(file, `${id}.${part}: sha256 is not pinned`))
      if (!(typeof p.bytes === 'number' && Number.isInteger(p.bytes) && p.bytes > 0))
        out.push(problem(file, `${id}.${part}: bytes is not pinned`))
    }
  }
  return out
}

// ── tracy-host ↔ fleet scripts ────────────────────────────────────────────────────────────────

/** What tracy-host's content-identity pass shares with the fleet scripts. */
export interface IdentityWiring {
  readonly lockPath: string
  readonly marker: string
  readonly provision: string
  readonly joomla: string
  readonly wordpress: string
  readonly joomlaPhp: string
}

export function checkContentIdentityWiring(w: IdentityWiring): Problem[] {
  const out: Problem[] = []
  if (!w.provision.includes(`exec 8>"${w.lockPath}"`))
    out.push(
      problem(`${PROVISION}/provision.sh`, `does not hold the lock ${w.lockPath} that tracy-host waits on`)
    )
  for (const [name, text] of [
    ['joomla.sh', w.joomla],
    ['wordpress.sh', w.wordpress]
  ] as const)
    if (!text.includes(`"$SITE_DIR/${w.marker}"`))
      out.push(problem(`${PROVISION}/platform/${name}`, `does not write the marker ${w.marker}`))
  const words = [...w.joomlaPhp.matchAll(/TRACY_RESULT content_reader=([a-z]+)/g)].map((m) => m[1] ?? '')
  if (JSON.stringify([...words].sort()) !== JSON.stringify(['enabled', 'none', 'outdated', 'unsupported']))
    out.push(problem(`${PROVISION}/joomla-content-identity.php`, `outcome words are ${words.join(',')}`))
  if (!/ContentIdentity::install\(\$db, getenv\('TRACY_NEW_SITE'\) === '1'\)/.test(w.joomlaPhp))
    out.push(
      problem(`${PROVISION}/joomla-content-identity.php`, 'the new-site seed is not the provision only')
    )
  return out
}

// ── tracy-site-tools ──────────────────────────────────────────────────────────────────────────

/** Files that register the tools named in `PLATFORM_ONLY_TOOLS`. */
export const TOOL_OWNER_FILES = [
  'packages/site/tracy-site-build-joomla/src/host/index.ts',
  'packages/site/tracy-site-build-wordpress/src/host/index.ts',
  'packages/site/tracy-site-build-emdash/src/host/index.ts',
  'packages/tools/tracy-webroot-read/index.js',
  'packages/tools/tracy-site-tools/src/host/index.ts'
] as const

/**
 * Every platform-only tool name is registered by one of its owners: a stale name hides nothing and
 * dsh's restrict() throws on it.
 * @param names - keys of `PLATFORM_ONLY_TOOLS`.
 * @param owners - owner file text keyed by path.
 */
export function checkPlatformOnlyTools(
  names: readonly string[],
  owners: Readonly<Record<string, string>>
): Problem[] {
  const all = Object.values(owners).join('\n')
  return names
    .filter((n) => !new RegExp(`(?:tool|name): '${n}'`).test(all))
    .map((n) =>
      problem(
        'packages/tools/tracy-site-tools/src/host/surface.mjs',
        `PLATFORM_ONLY_TOOLS names ${n}, which no owner registers`
      )
    )
}

/** Every EmDash tool a text names: EmDash's own `family_verb` names (`schema_delete_*` = a family). */
export const emdashToolsNamed = (text: string): string[] => [
  ...new Set(
    [
      ...text.matchAll(/\b((?:content|menu|media|schema|taxonomy|revision|settings|byline)_[a-z_]+)(\*)?/g)
    ].map((m) => (m[2] ? `${m[1]}*` : (m[1] ?? '').replace(/_+$/, '')))
  )
]

const LIST_FIRST = [
  /\{\s*list\s*:\s*true\s*\}\)?\s*(first|before)/i,
  /(start with|first)[^.\n]{0,40}\{\s*list\s*:\s*true/i
]

/**
 * The model-facing EmDash texts that live in files (skill, persona, preset): they name only tools
 * EmDash has, and never send the model to `{list: true}` first.
 * @param texts - text by label.
 * @param tools - EmDash's own tool names.
 */
export function checkEmdashModelTexts(
  texts: Readonly<Record<string, string>>,
  tools: ReadonlySet<string>
): Problem[] {
  const out: Problem[] = []
  const has = (name: string) =>
    name.endsWith('*') ? [...tools].some((t) => t.startsWith(name.slice(0, -1))) : tools.has(name)
  for (const [where, text] of Object.entries(texts)) {
    for (const tool of emdashToolsNamed(text))
      if (!has(tool)) out.push(problem(where, `names ${tool}, which EmDash does not have`))
    for (const pattern of LIST_FIRST)
      if (pattern.test(text)) out.push(problem(where, 'sends the model to {list: true} first'))
  }
  return out
}

// ── site-label rule, two copies ───────────────────────────────────────────────────────────────

/** The RULE half of a site-label file: from `SITE_LABEL_RE` to `siteLabelRefusal`, comments gone. */
export function siteLabelRuleCode(text: string): string | null {
  const start = text.indexOf('export const SITE_LABEL_RE')
  if (start < 0) return null
  const body = text.slice(start)
  const stop = body.indexOf('export function isSiteLabel')
  return (stop === -1 ? body : body.slice(0, stop))
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .filter((line) => line.trim() !== '' && !line.trim().startsWith('//'))
    .join('\n')
    .trim()
}

export function checkSiteLabelParity(plugin: string, web: string): Problem[] {
  const a = siteLabelRuleCode(plugin)
  const b = siteLabelRuleCode(web)
  if (a === null || b === null)
    return [problem('apps/tracy-web/src/lib/site-label-rules.js', 'SITE_LABEL_RE not found in one copy')]
  return a === b
    ? []
    : [
        problem(
          'apps/tracy-web/src/lib/site-label-rules.js',
          'the rule differs from packages/site/tracy-add-site/src/client/site-label.mjs: copy the change across'
        )
      ]
}

// ── tokens.css ────────────────────────────────────────────────────────────────────────────────

/**
 * The dark token block must reach `body`, because the light block declares on `body` too: a custom
 * property is inherited from the NEAREST declaring ancestor, so a light `body` beats a dark `html`.
 * @param css - `tokens.css` text.
 */
export function checkDarkReachesBody(css: string): Problem[] {
  const file = 'packages/ui/tracy-ui/src/tokens.css'
  const found: string[] = []
  for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g))
    if (/^\s*--popover\s*:/m.test(body ?? '')) found.push((selector ?? '').trim().replace(/\s+/g, ' '))
  const [light, dark] = found
  const out: Problem[] = []
  if (!/\bbody\b/.test(light ?? '')) out.push(problem(file, 'the light palette no longer declares on body'))
  if (dark === undefined)
    return [...out, problem(file, 'no second block declares --popover (the dark palette)')]
  for (const toggle of ['.dark', ':root[data-theme="dark"]'])
    if (!dark.split(',').some((s) => s.trim() === `${toggle} body`))
      out.push(problem(file, `dark block must include "${toggle} body"; it reads: ${dark}`))
  return out
}

// ── brand engine tokens ───────────────────────────────────────────────────────────────────────

/**
 * The names the brand engine derives are a subset of what EVERY vendored design system declares (a
 * system may carry extras of its own), and exactly what the reference system declares.
 * @param names - `TRACY_TOKEN_NAMES` of the engine.
 * @param systems - `tokens.css` text by system id.
 * @param reference - the system whose names must equal the engine's exactly.
 */
export function checkEngineTokenNames(
  names: readonly string[],
  systems: Readonly<Record<string, string>>,
  reference = 'airbnb'
): Problem[] {
  const want = [...new Set(names)].sort()
  const out: Problem[] = []
  for (const [id, css] of Object.entries(systems)) {
    const declared = [...new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1] ?? ''))].sort()
    const file = `vendor/tracy/od-design-system/systems/${id}/tokens.css`
    const missing = want.filter((n) => !declared.includes(n))
    if (missing.length > 0) out.push(problem(file, `does not declare the engine's ${missing.join(' ')}`))
    const extra = declared.filter((n) => !want.includes(n))
    if (id === reference && extra.length > 0)
      out.push(
        problem(file, `the reference system declares ${extra.join(' ')}, which the engine does not derive`)
      )
  }
  if (!(reference in systems))
    out.push(problem('vendor/tracy/od-design-system/systems', `reference system ${reference} is gone`))
  return out
}

// ── modify-site skill ─────────────────────────────────────────────────────────────────────────

/** Paths a skill file names into a tree: at least two `/`, so `packages/` in a sentence is not one. */
export function pathsNamedIn(text: string): string[] {
  const found = new Set<string>()
  for (const m of text.matchAll(/(?:vendor|packages|apps|scripts)\/[\w.-]+\/[\w./-]+/g))
    found.add(m[0].replace(/[.,)]+$/, '').replace(/\/$/, ''))
  return [...found]
}

/**
 * Every path the skill names exists; the three references exist; and the regex still finds paths
 * (a regex that matches nothing would make this gate green while measuring nothing).
 * @param files - skill file text by repo-relative label.
 * @param exists - whether a repo-relative path exists.
 * @param references - reference files that must exist.
 */
export function checkSkillPaths(
  files: Readonly<Record<string, string>>,
  exists: (path: string) => boolean,
  references: readonly string[]
): Problem[] {
  const out: Problem[] = []
  for (const ref of references) if (!exists(ref)) out.push(problem(ref, 'skill reference is missing'))
  let total = 0
  for (const [label, text] of Object.entries(files))
    for (const path of pathsNamedIn(text)) {
      total += 1
      if (!exists(path)) out.push(problem(label, `points at ${path}, which does not exist`))
    }
  if (total === 0)
    out.push(problem('.agents/skills/modify-site', 'names no path at all: does the regex still match?'))
  return out
}

// ── docs site translations ────────────────────────────────────────────────────────────────────

/**
 * Every label key the docs sidebar reads — one list, owned by `apps/tracy-docs/sidebar.mjs`; each
 * translation's `_sidebar.json` must carry exactly these.
 */
export const DOCS_LABEL_KEYS: readonly string[] = labelKeys()

/** The documentation content tree as the checker reads it. */
export interface DocsTree {
  /** Pages of the English source by relative path, generated pages already left out. */
  readonly english: Readonly<Record<string, string>>
  /** Whether the English root carries a translation marker (it must not). */
  readonly englishHasMarker: boolean
  readonly locales: Readonly<Record<string, { sidebar: unknown; pages: Readonly<Record<string, string>> }>>
}

function docsShape(text: string, locale?: string) {
  const body = text.replace(/^---\n[\s\S]*?\n---\n/, '')
  return {
    fences: (body.match(/^```/gm) ?? []).length,
    headings: (body.match(/^#{1,6}\s/gm) ?? []).length,
    links: [...body.matchAll(/\]\(([^)\s]+)\)/g)]
      .map((m) => m[1] ?? '')
      // The site is served at the root of its own host (`base: '/'`): a translation's page lives
      // under `/<locale>/`, the English one at `/`.
      .map((href) => (locale && href.startsWith(`/${locale}/`) ? href.slice(locale.length + 1) : href))
      .sort()
  }
}

export function checkDocsTranslations(tree: DocsTree): Problem[] {
  const root = 'apps/tracy-docs/src/content/docs'
  const out: Problem[] = []
  if (tree.englishHasMarker) out.push(problem(root, 'the English tree carries a translation marker'))
  if (!('index.mdx' in tree.english)) out.push(problem(root, 'the English tree has no index.mdx'))
  const locales = Object.entries(tree.locales)
  if (locales.length === 0) out.push(problem(root, 'no translated tree found'))
  for (const [locale, { sidebar, pages }] of locales) {
    const at = `${root}/${locale}`
    const side = (sidebar ?? {}) as { lang?: unknown; label?: unknown; labels?: Record<string, unknown> }
    if (!/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(String(side.lang)))
      out.push(problem(at, 'lang is not a BCP-47 tag'))
    if (typeof side.label !== 'string' || side.label === '') out.push(problem(at, 'no switcher label'))
    const keys = Object.keys(side.labels ?? {}).sort()
    if (JSON.stringify(keys) !== JSON.stringify([...DOCS_LABEL_KEYS].sort()))
      out.push(problem(at, `sidebar label keys are ${keys.join(',')}`))
    for (const key of DOCS_LABEL_KEYS) {
      const v = side.labels?.[key]
      if (typeof v !== 'string' || v.trim() === '') out.push(problem(at, `empty label ${key}`))
    }
    if (JSON.stringify(Object.keys(sidebar as object).sort()) !== JSON.stringify(['label', 'labels', 'lang']))
      out.push(problem(at, 'unknown keys in the sidebar file'))
    if (!('index.mdx' in pages)) out.push(problem(at, 'no index.mdx'))
    for (const [rel, text] of Object.entries(pages)) {
      const source = tree.english[rel]
      if (source === undefined) {
        out.push(problem(`${at}/${rel}`, `no English page at ${rel}`))
        continue
      }
      const a = docsShape(source)
      const b = docsShape(text, locale)
      if (a.headings !== b.headings)
        out.push(problem(`${at}/${rel}`, 'headings differ from the English source'))
      if (a.fences !== b.fences)
        out.push(problem(`${at}/${rel}`, 'code fences differ from the English source'))
      if (JSON.stringify(a.links) !== JSON.stringify(b.links))
        out.push(problem(`${at}/${rel}`, 'link targets differ from the English source'))
      // Every root-relative link of a translated page stays in its language, except the API
      // reference and its documents (`/api/…`), which exist once for every language.
      for (const m of text.matchAll(/(?:\]\(|link:\s*)(\/(?!\/)[^)\s]*)/g)) {
        const href = m[1] ?? ''
        if (!href.startsWith('/api/') && !href.startsWith(`/${locale}/`))
          out.push(problem(`${at}/${rel}`, `${href} points at the English tree`))
      }
    }
  }
  return out
}

// ── WordPress theme overlays ──────────────────────────────────────────────────────────────────

/**
 * `src/tracy/inc/update.php` is the one updater source; an overlay carries none of its own.
 * @param overlayDirsWithUpdater - overlay slugs that have an `inc/update.php`.
 */
export function checkNoOverlayUpdater(overlayDirsWithUpdater: readonly string[]): Problem[] {
  return overlayDirsWithUpdater.map((slug) =>
    problem(
      `packages/cms/tracy-wordpress-theme/overlays/${slug}/inc/update.php`,
      'an overlay must not carry its own updater'
    )
  )
}

// ── ops-cms parsers against the modules they describe ─────────────────────────────────────────

const OPS = 'scripts/ops-cms/extract.mjs'

/** The stage list the parser reads equals what the module runs. */
export function compareStages(cms: string, parsed: readonly string[], real: readonly string[]): Problem[] {
  return JSON.stringify(parsed) === JSON.stringify(real)
    ? []
    : [
        problem(
          OPS,
          `reports ${cms}'s pipeline as ${JSON.stringify(parsed)} while the module runs ${JSON.stringify(real)}`
        )
      ]
}

/** The fence table the parser reads equals `FS_TOOL_ARGS`. */
export function compareFence(
  parsed: Readonly<Record<string, { paths: readonly string[]; content: readonly string[] }>>,
  real: Readonly<Record<string, { paths: readonly string[]; content: readonly string[] }>>
): Problem[] {
  const out: Problem[] = []
  for (const [name, spec] of Object.entries(real)) {
    const p = parsed[name]
    if (JSON.stringify(p) !== JSON.stringify({ paths: [...spec.paths], content: [...spec.content] }))
      out.push(problem(OPS, `the fence row for \`${name}\` would be shown wrong`))
  }
  if (JSON.stringify(Object.keys(parsed).sort()) !== JSON.stringify(Object.keys(real).sort()))
    out.push(problem(OPS, 'the parser found a different set of fence tools than the router declares'))
  return out
}

/** The preset rule the screen applies equals `presetFor` on every input. */
export function comparePresetRule(
  rule: { roles: readonly string[]; platforms: readonly string[]; fallbackRole: string },
  presetFor: (current: unknown, platform: string) => string | null
): Problem[] {
  const applied = (current: unknown, platform: string) => {
    if (!rule.platforms.includes(platform)) return null
    const have = typeof current === 'string' ? current : ''
    const role = rule.roles.find((r) => rule.platforms.some((p) => have === `${r}-${p}`)) ?? rule.fallbackRole
    return `${role}-${platform}`
  }
  const currents: unknown[] = [
    ...rule.roles.flatMap((r) => rule.platforms.map((p) => `${r}-${p}`)),
    'standard',
    'plan',
    '',
    'designer',
    'designer-shopify',
    'DESIGNER-JOOMLA',
    undefined,
    null,
    0,
    {}
  ]
  const platforms = [...rule.platforms, 'shopify', '', 'JOOMLA']
  const out: Problem[] = []
  for (const current of currents)
    for (const platform of platforms)
      if (applied(current, platform) !== presetFor(current, platform))
        out.push(
          problem(
            OPS,
            `the screen answers differently from presetFor for (${JSON.stringify(current)}, ${JSON.stringify(platform)})`
          )
        )
  return out
}

// ── shell and Dockerfile text rules ───────────────────────────────────────────────────────────

const FLEET = 'packages/fleet/tracy-fleet-operation'

/** Patterns a file must (and must not) match. Every rule says why, so a red gate is self-explaining. */
export interface PatternRule {
  readonly file: string
  readonly why: string
  readonly must?: readonly RegExp[]
  readonly mustNot?: readonly RegExp[]
}

export function checkPatterns(rule: PatternRule, source: string): Problem[] {
  const out: Problem[] = []
  for (const pattern of rule.must ?? [])
    if (!pattern.test(source))
      out.push(problem(rule.file, `no longer matches ${String(pattern)} (${rule.why})`))
  for (const pattern of rule.mustNot ?? [])
    if (pattern.test(source)) out.push(problem(rule.file, `matches ${String(pattern)} (${rule.why})`))
  return out
}

const WEB_IMAGES = ['joomla', 'wordpress', 'emdash'] as const

export const PATTERN_RULES: readonly PatternRule[] = [
  {
    file: `${PROVISION}/platform/joomla.sh`,
    why: 'the installer shape builds a site with the CLI installer instead of restoring an archive',
    must: [
      /--field installer\.file/,
      /if \[ -n "\$\{QUICKSTART_INSTALLER:-\}" \]; then[\s\S]*?WEBROOT_KEY=""[\s\S]*?DB_KEY=""/,
      /PLATFORM_NEEDS_WEBROOT=0/,
      /PLATFORM_HAS_WEBROOT=1/,
      /installation\/joomla\.php install/,
      /--db-prefix/,
      // provision.sh's own chown is gated on PLATFORM_NEEDS_WEBROOT=1, which this shape turns off
      /chown -R www-data:www-data/,
      /rm -rf "\$webroot\/installation"/
    ],
    mustNot: [/mysql < .*custom\.sql|custom\.sql" \| /]
  },
  {
    file: `${PROVISION}/platform/joomla.sh`,
    why: 'the bundle/runtime road keeps its own post-up refusals',
    must: [/quickstart configuration is missing/, /quickstart installer was not removed/]
  },
  {
    file: `${PROVISION}/platform/emdash.sh`,
    why: 'the quickstart road runs the tools layer and the site takes the image it answers',
    must: [/emdash_tools_image "\$WEB_IMAGE"\n {2}WEB_IMAGE="\$EMDASH_TOOLS_IMAGE"/]
  },
  ...WEB_IMAGES.map(
    (platform): PatternRule => ({
      file: `${FLEET}/web/${platform}.Dockerfile`,
      why: 'the site-mail shim must be in every web image, with the label enable-site-mail.sh insists on',
      must: [
        /^COPY --from=tracy-web-files --chmod=0755 tracy-sendmail \/usr\/local\/bin\/tracy-sendmail$/m,
        /ln -sf \/usr\/local\/bin\/tracy-sendmail \/usr\/sbin\/sendmail/,
        /^LABEL tracy\.site-mail="v1"$/m,
        ...(platform === 'emdash'
          ? []
          : [
              /^COPY --from=tracy-web-files --chmod=0644 tracy-sendmail\.ini \/usr\/local\/etc\/php\/conf\.d\/zz-tracy-sendmail\.ini$/m,
              /ini_get\("sendmail_path"\) === "\/usr\/local\/bin\/tracy-sendmail -t -i"/
            ])
      ]
    })
  ),
  {
    file: `${FLEET}/web/tracy-sendmail.ini`,
    why: 'php must hand mail to the shim',
    must: [/^sendmail_path = \/usr\/local\/bin\/tracy-sendmail -t -i$/m]
  }
]

/** Every IMAGE_TAGS line names a dated build no older than the shim it must contain. */
export function checkImageTags(text: string, floor = 20260923): Problem[] {
  const file = `${FLEET}/web/IMAGE_TAGS`
  const lines = text.split('\n').filter((l) => l && !l.startsWith('#'))
  if (lines.length === 0) return [problem(file, 'lists no image')]
  const out: Problem[] = []
  for (const line of lines) {
    const date = /-(\d{8})-r\d+$/.exec(line)
    if (!date) out.push(problem(file, `no date tag on: ${line}`))
    else if (Number(date[1]) < floor) out.push(problem(file, `${line} predates the site-mail shim`))
  }
  return out
}

/** provision.sh asks the front page of a Joomla/WordPress quickstart after the site is up, before the site folder. */
export function checkFrontPageOrder(source: string): Problem[] {
  const file = `${PROVISION}/provision.sh`
  const ask = source.indexOf('tracy_front_page_refusal "$LABEL" "$HOST_PORT"')
  const postUp = source.indexOf('if declare -F platform_post_up')
  const folder = source.indexOf('stage "building the site folder"')
  if (ask < 0 || postUp < 0 || folder < 0) return [problem(file, 'the front-page refusal anchors moved')]
  const out: Problem[] = []
  if (!(ask > postUp))
    out.push(problem(file, 'the front page is asked before the platform brought the site up'))
  if (!(ask < folder))
    out.push(problem(file, 'the front page is asked after the site folder: no refusal may come then'))
  const guard = source.slice(source.lastIndexOf('if [', ask), ask)
  for (const part of ['[ -n "$QUICKSTART" ]', '"$PLATFORM" = joomla', '"$PLATFORM" = wordpress'])
    if (!guard.includes(part)) out.push(problem(file, `the front-page ask is no longer guarded by ${part}`))
  return out
}

/** stage-cms-seeder.sh runs every pnpm against ROOT and reads the dist it built from the same ROOT. */
export function checkStageSeeder(source: string): Problem[] {
  const file = `${FLEET}/scripts/tools/stage-cms-seeder.sh`
  const out: Problem[] = []
  const pnpm = source.split('\n').filter((l) => /^\s*pnpm\s/.test(l))
  if (pnpm.length === 0) out.push(problem(file, 'no pnpm invocation left'))
  for (const line of pnpm)
    if (!/pnpm\s+-C\s+"\$ROOT"/.test(line))
      out.push(problem(file, `pnpm resolves its workspace from the caller's cwd: ${line.trim()}`))
  if (!/cp -R "\$ROOT\/packages\/cms\/tracy-seeder\/dist\/\." "\$OUT\/"/.test(source))
    out.push(problem(file, 'the dist is not copied from $ROOT'))
  if (!/^OUT="\$ROOT\//m.test(source)) out.push(problem(file, 'OUT is not under $ROOT'))
  return out
}

/** The EmDash content-api post-up never puts the raw token on a docker command line. */
export function checkContentPostUp(source: string): Problem[] {
  const file = `${PROVISION}/platform/emdash.sh`
  const body = /_emdash_content_api_post_up\(\) \{\n[\s\S]*?\n\}\n/.exec(source)?.[0]
  if (!body) return [problem(file, '_emdash_content_api_post_up not found')]
  const out: Problem[] = []
  for (const line of body.split('\n').filter((l) => /docker (exec|cp)/.test(l))) {
    const argv = line.slice(line.indexOf('docker ')).replace('${tok:0:11}', '')
    if (/\$tok\b|\$\{tok\}/.test(argv))
      out.push(problem(file, `raw token on a docker command line: ${line.trim()}`))
  }
  if (!/tracy-content-relay\.sha256/.test(body))
    out.push(problem(file, 'the relay digest is no longer handed over'))
  if (/identity-sqlite\.mjs"? migrate|\bmigrate\b/.test(body))
    out.push(problem(file, 'a guard-installing repeater migration runs in post-up (init/fork stamp row ids)'))
  return out
}

/** A Dockerfile's instructions with continuations joined and comments dropped, grouped by stage. */
export function dockerStages(text: string): Array<{ name: string; base: string; lines: string[] }> {
  const lines = text
    .replace(/\\\r?\n/g, ' ')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
  const out: Array<{ name: string; base: string; lines: string[] }> = []
  for (const line of lines) {
    const from = /^FROM\s+(\S+)(?:\s+AS\s+(\S+))?/i.exec(line)
    if (from) {
      out.push({ name: from[2] ?? from[1] ?? '', base: from[1] ?? '', lines: [] })
      continue
    }
    out.at(-1)?.lines.push(line)
  }
  return out
}

/**
 * Layer-cache invariants of the tracy-dsh Dockerfile. None changes what the image contains; each
 * decides how much of a build the next commit can reuse, and each broke silently once (the build
 * stays green and gets slower, which no other gate notices).
 * @param text - `dsh/Dockerfile`.
 */
export function checkDshDockerfile(text: string): Problem[] {
  const file = `${FLEET}/dsh/Dockerfile`
  const stages = dockerStages(text)
  const out: Problem[] = []
  const stage = (name: string) => stages.find((s) => s.name === name)
  const need = (ok: boolean, message: string) => {
    if (!ok) out.push(problem(file, message))
  }

  const dsh = stage('dsh')
  need(dsh?.base === 'tools', 'the dsh stage must start from tools')
  need(dsh?.lines.some((l) => /pnpm build:official/.test(l)) === true, 'the dsh stage does not build dsh')
  need(
    dsh?.lines.some((l) => /^RUN find \/opt\/dsh .*\.map.*-delete/.test(l)) === true,
    "the dsh stage does not delete /opt/dsh's source maps itself"
  )
  need(stage('build')?.base === 'dsh', 'the build stage must start from the dsh stage')

  const writes =
    /(\brm\b|\bmv\b|-delete|\bsed -i\b|>\s*\/opt\/dsh|\bchmod\b|\bchown\b|\btouch\b|\bln\b)[^&|;]*\/opt\/dsh|\/opt\/dsh[^&|;]*(-delete)/
  for (const line of (stage('build')?.lines ?? []).filter((l) => l.startsWith('RUN') && writes.test(l)))
    out.push(
      problem(file, `the build stage changes /opt/dsh (the runtime COPY would re-hash 1.6 GB): ${line}`)
    )

  const copies = (stage('runtime')?.lines ?? []).filter((l) => /^COPY\s+--from=/.test(l))
  const fromOf = (path: string) =>
    copies.find((l) => l.split(/\s+/).includes(path))?.match(/--from=(\S+)/)?.[1]
  for (const path of ['/opt/dsh', '/usr/local/bin/docker', '/usr/local/bin/wp'])
    need(fromOf(path) === 'dsh', `the runtime stage must copy ${path} from the dsh stage`)

  // pnpm 11 remembers a lockfile that passed the supply-chain check in its cache dir.
  const installs = stages.flatMap((st) =>
    st.lines
      .filter((l) => l.startsWith('RUN') && /\bpnpm install\b/.test(l))
      .map((l) => [st.name, l] as const)
  )
  need(installs.length >= 3, `expected the dsh and both sidebar installs, found ${installs.length}`)
  for (const [name, line] of installs) {
    need(
      /--mount=type=cache,target=\/root\/\.local\/share\/pnpm\/store\s/.test(line),
      `${name}: no pnpm store mount`
    )
    need(/--mount=type=cache,target=\/root\/\.cache\/pnpm\s/.test(line), `${name}: no pnpm cache-dir mount`)
  }

  const forks: Array<[string, string, string[]]> = [
    ['vendor/tracy/dsh-passwords', 'passwords', ['package.json', 'npm-shrinkwrap.json']],
    ['vendor/tracy/dsh-better-sidebar', 'sidebar', ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']]
  ]
  for (const [fork, name, manifests] of forks) {
    const dir = `/opt/${fork}`
    const manifestOnly = (l: string) =>
      l.startsWith('COPY') && manifests.every((m) => l.includes(`${fork}/${m}`))
    const sourceCopy = (l: string) => new RegExp(`^COPY ${fork}\\s`).test(l)
    const build = stage('build')?.lines ?? []
    need(
      build.some((l) => new RegExp(`^COPY --from=${name}\\s+${dir}\\s`).test(l)),
      `${name}: build does not COPY --from=${name}`
    )
    need(
      !build.some((l) => new RegExp(`^COPY ${fork}[\\s/]`).test(l)),
      `${name}: the build stage copies the fork source itself`
    )
    for (const st of [`${name}-deps`, `${name}-prod`, name])
      need(stage(st)?.base === 'tools', `${st}: a fork stage must start from tools`)
    need(stage(`${name}-build`)?.base === `${name}-deps`, `${name}-build must start from ${name}-deps`)
    for (const st of [`${name}-deps`, `${name}-prod`]) {
      const lines = stage(st)?.lines ?? []
      need(lines.some(manifestOnly), `${st}: no manifest-only COPY`)
      need(!lines.some(sourceCopy), `${st}: copies the whole source, so a source edit re-runs the install`)
      need(
        lines.some((l) => /\b(npm ci|pnpm install)\b/.test(l)),
        `${st}: no install`
      )
    }
    need((stage(`${name}-build`)?.lines ?? []).some(sourceCopy), `${name}-build does not copy the source`)
    const forkStages = stages.filter((x) => x.name === name || x.name.startsWith(`${name}-`))
    need(
      forkStages.length === 4,
      `expected ${name}, ${name}-deps, -build, -prod, found ${forkStages.map((x) => x.name).join(', ') || 'none'}`
    )
    for (const st of forkStages) {
      for (const bad of st.lines.filter((l) => /\bnpm prune\b|rm -rf node_modules(\s|$)/.test(l)))
        out.push(problem(file, `${st.name} deletes installed packages from a lower layer: ${bad}`))
      need(
        !st.lines.some((l) => /pnpm rebuild(\s*$|\s*&&|\s*\\)/.test(l)),
        `${st.name}: bare \`pnpm rebuild\``
      )
    }
  }
  return out
}

// ── main ──────────────────────────────────────────────────────────────────────────────────────

const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8')
const fileUrl = (rel: string): string => pathToFileURL(join(ROOT, rel)).href
const listFiles = (dir: string): string[] => (existsSync(join(ROOT, dir)) ? readdirSync(join(ROOT, dir)) : [])

function docsTree(): DocsTree {
  const content = join(ROOT, 'apps/tracy-docs/src/content/docs')
  const MARKER = '_sidebar.json'
  const GENERATED = new Set(['changelog.md', 'reference/errors.md', 'reference/compatibility.md'])
  const walk = (dir: string, rel = ''): Record<string, string> => {
    const out: Record<string, string> = {}
    for (const entry of readdirSync(join(dir, rel))) {
      const relPath = rel ? `${rel}/${entry}` : entry
      const full = join(dir, relPath)
      if (statSync(full).isDirectory()) {
        if (!existsSync(join(full, MARKER))) Object.assign(out, walk(dir, relPath))
      } else if (/\.mdx?$/.test(entry) && !entry.startsWith('_')) out[relPath] = readFileSync(full, 'utf8')
    }
    return out
  }
  const english = Object.fromEntries(Object.entries(walk(content)).filter(([rel]) => !GENERATED.has(rel)))
  const locales: Record<string, { sidebar: unknown; pages: Record<string, string> }> = {}
  for (const entry of readdirSync(content, { withFileTypes: true }))
    if (entry.isDirectory() && existsSync(join(content, entry.name, MARKER)))
      locales[entry.name] = {
        sidebar: JSON.parse(readFileSync(join(content, entry.name, MARKER), 'utf8')),
        pages: walk(join(content, entry.name))
      }
  return { english, englishHasMarker: existsSync(join(content, MARKER)), locales }
}

async function opsCmsProblems(): Promise<Problem[]> {
  const out: Problem[] = []
  const { parseStages, extractStages, extractTools, extractPresets, extractQuestions } = await import(
    fileUrl(OPS)
  )
  const { objectTree } = await import(fileUrl('scripts/ops-cms/tree.mjs'))
  const { CMS } = await import(fileUrl('scripts/ops-cms/schema.mjs'))
  const stagesPath = (cms: string) => `packages/site/tracy-site-build-${cms}/src/host/stages.mjs`

  const cmsList = [...CMS] as string[]
  const files: Record<string, string> = {}
  for (const cms of cmsList) {
    const real = await import(fileUrl(stagesPath(cms)))
    out.push(...compareStages(cms, parseStages(read(stagesPath(cms))), [...real.STAGES]))
    files[stagesPath(cms)] = read(stagesPath(cms))
  }
  const section = await extractStages(objectTree(files))
  for (const cms of cmsList) {
    const real = await import(fileUrl(stagesPath(cms)))
    if (section.data.byCms[cms].status !== 'ok')
      out.push(problem(OPS, `${cms} does not read as ok from its own module`))
    else out.push(...compareStages(cms, section.data.byCms[cms].stages, [...real.STAGES]))
  }

  const fencePath = 'packages/tools/tracy-subprocess-docker/src/route.mjs'
  const route = await import(fileUrl(fencePath))
  const tools = await extractTools(objectTree({ [fencePath]: read(fencePath) }))
  if (tools.status !== 'ok') out.push(problem(OPS, 'the fence section does not read as ok'))
  else
    out.push(
      ...compareFence(
        Object.fromEntries(
          tools.data.fence.tools.map((t: { name: string; paths: string[]; content: string[] }) => [
            t.name,
            { paths: t.paths, content: t.content }
          ])
        ),
        route.FS_TOOL_ARGS
      )
    )

  const { FEEDS } = await import(fileUrl('packages/site/tracy-site-build-core/src/questions.mjs'))
  const questionFiles = cmsList.map((cms) => `packages/site/tracy-site-build-${cms}/questions.json`)
  const questions = await extractQuestions(
    objectTree(Object.fromEntries(questionFiles.map((f) => [f, read(f)])))
  )
  for (const cms of cmsList) {
    const one = questions.data.byCms[cms]
    if (one.status !== 'ok') out.push(problem(OPS, `${cms} questions: ${String(one.reason ?? 'not ok')}`))
    else
      for (const q of one.questions as Array<{ id: string; feeds: string[] }>)
        for (const feed of q.feeds)
          if (!FEEDS.includes(feed))
            out.push(
              problem(questionFiles[0] ?? OPS, `${cms}: ${q.id} names feed ${feed}, which nothing reads`)
            )
  }

  const contractPath = 'packages/tools/tracy-subprocess-docker/src/content-contract.mjs'
  const contract = await import(fileUrl(contractPath))
  const cc = (
    await extractTools(objectTree({ [contractPath]: read(contractPath), [fencePath]: read(fencePath) }))
  ).data.contentContract
  if (cc.dbWriteRefusal !== contract.directDbWriteReason('mysql -e "DELETE FROM wp_posts"'))
    out.push(problem(OPS, 'the screen would quote a different refusal than the agent receives'))
  if (contract.directDbWriteReason('wp option update blogname x') !== null)
    out.push(problem(contractPath, 'a plain wp option update is read as a direct database write'))

  const presetPath = 'packages/design/tracy-design-inspiration/src/client/preset-for.mjs'
  const presetFor = await import(fileUrl(presetPath))
  const presets = await extractPresets(
    objectTree({ 'config/mode-matrix.json': read('config/mode-matrix.json'), [presetPath]: read(presetPath) })
  )
  const rule = presets.data.resolver
  if (!(rule.roles && rule.platforms && rule.fallbackRole))
    out.push(problem(OPS, `the preset rule is not readable: ${String(rule.unreadable ?? '')}`))
  else out.push(...comparePresetRule(rule, presetFor.presetFor))
  return out
}

async function main(): Promise<void> {
  const problems: Problem[] = []

  for (const rule of ORDER_RULES) problems.push(...checkOrder(rule, read(rule.file)))
  for (const rule of PROVISION_TEXT_RULES) problems.push(...checkText(rule, read(rule.file)))
  problems.push(...checkDesignPlanGuard(`${PROVISION}/provision.sh`, read(`${PROVISION}/provision.sh`)))
  problems.push(...checkNoIdInGate(`${PROVISION}/provision.sh`, read(`${PROVISION}/provision.sh`)))
  problems.push(
    ...checkWordPressDoors(`${PROVISION}/platform/wordpress.sh`, read(`${PROVISION}/platform/wordpress.sh`))
  )
  problems.push(...checkFrontPageOrder(read(`${PROVISION}/provision.sh`)))
  problems.push(...checkStageSeeder(read(`${FLEET}/scripts/tools/stage-cms-seeder.sh`)))
  problems.push(...checkContentPostUp(read(`${PROVISION}/platform/emdash.sh`)))
  for (const rule of PATTERN_RULES) problems.push(...checkPatterns(rule, read(rule.file)))
  problems.push(...checkImageTags(read(`${FLEET}/web/IMAGE_TAGS`)))
  problems.push(...checkDshDockerfile(read(`${FLEET}/dsh/Dockerfile`)))

  // Shell that only a fleet host runs: a syntax error would surface as a failed provision.
  for (const dir of [PROVISION, `${PROVISION}/platform`])
    for (const name of listFiles(dir).filter((n) => n.endsWith('.sh'))) {
      const run = spawnSync('bash', ['-n', join(ROOT, dir, name)], { encoding: 'utf8' })
      if (run.status !== 0) problems.push(problem(`${dir}/${name}`, `bash -n: ${run.stderr.trim()}`))
    }

  const hooks: Record<string, string> = {}
  for (const name of HOOK_FILES) {
    hooks[name] = read(`${HOOK_DIR}/${name}`)
    problems.push(...checkHookServer(name, hooks[name]))
  }
  problems.push(...checkHookHostNames(hooks))

  problems.push(...checkCatalog(JSON.parse(read(`${PROVISION}/quickstarts.json`))))

  const identity = await import(fileUrl('apps/tracy-host/src/content-identity.js'))
  problems.push(
    ...checkContentIdentityWiring({
      lockPath: identity.provisionLock('$LABEL'),
      marker: identity.CONTENT_IDENTITY_MARKER,
      provision: read(`${PROVISION}/provision.sh`),
      joomla: read(`${PROVISION}/platform/joomla.sh`),
      wordpress: read(`${PROVISION}/platform/wordpress.sh`),
      joomlaPhp: read(`packages/fleet/tracy-fleet-operation/scripts/${identity.JOOMLA_SCRIPT}`)
    })
  )

  const surface = await import(fileUrl('packages/tools/tracy-site-tools/src/host/surface.mjs'))
  problems.push(
    ...checkPlatformOnlyTools(
      Object.keys(surface.PLATFORM_ONLY_TOOLS),
      Object.fromEntries(TOOL_OWNER_FILES.map((f) => [f, read(f)]))
    )
  )
  const emdashTools = new Set<string>(
    (
      JSON.parse(read('packages/tools/tracy-site-tools/test/fixtures/emdash/tools-0.38.json')) as Array<{
        name: string
      }>
    ).map((t) => t.name)
  )
  const presetsText = read('packages/bundle/tracy-cowork/presets.patch.yml')
    .split(/^ {4}- id: /m)
    .find((row) => row.startsWith('preset-designer-emdash\n'))
  problems.push(
    ...checkEmdashModelTexts(
      {
        'packages/design/tracy-design-skill/skills/emdash-site/SKILL.md': read(
          'packages/design/tracy-design-skill/skills/emdash-site/SKILL.md'
        ),
        'config/mode-matrix.json (emdash persona)': String(
          JSON.parse(read('config/mode-matrix.json')).overlays.emdash.persona
        ),
        'packages/bundle/tracy-cowork/presets.patch.yml (preset-designer-emdash)': presetsText ?? ''
      },
      emdashTools
    )
  )
  if (presetsText === undefined)
    problems.push(problem('packages/bundle/tracy-cowork/presets.patch.yml', 'no preset-designer-emdash row'))

  problems.push(
    ...checkSiteLabelParity(
      read('packages/site/tracy-add-site/src/client/site-label.mjs'),
      read('apps/tracy-web/src/lib/site-label-rules.js')
    )
  )
  problems.push(...checkDarkReachesBody(read('packages/ui/tracy-ui/src/tokens.css')))

  const engineIndex = 'vendor/tracy/od-brand-engine/dist/index.js'
  if (!existsSync(join(ROOT, engineIndex)))
    problems.push(problem(engineIndex, 'missing: the brand engine is not built'))
  else {
    const engine = await import(fileUrl(engineIndex))
    const systems = 'vendor/tracy/od-design-system/systems'
    problems.push(
      ...checkEngineTokenNames(
        engine.TRACY_TOKEN_NAMES,
        Object.fromEntries(
          listFiles(systems)
            .filter((id) => existsSync(join(ROOT, systems, id, 'tokens.css')))
            .map((id) => [id, read(`${systems}/${id}/tokens.css`)])
        )
      )
    )
  }

  const skill = '.agents/skills/modify-site'
  const skillFiles: Record<string, string> = { [`${skill}/SKILL.md`]: read(`${skill}/SKILL.md`) }
  for (const name of listFiles(`${skill}/references`))
    skillFiles[`${skill}/references/${name}`] = read(`${skill}/references/${name}`)
  problems.push(
    ...checkSkillPaths(
      skillFiles,
      (p) => existsSync(join(ROOT, p)),
      ['wordpress', 'joomla', 'emdash'].map((cms) => `${skill}/references/${cms}.md`)
    )
  )

  problems.push(...checkDocsTranslations(docsTree()))

  const overlays = 'packages/cms/tracy-wordpress-theme/overlays'
  problems.push(
    ...checkNoOverlayUpdater(
      listFiles(overlays).filter((slug) => existsSync(join(ROOT, overlays, slug, 'inc/update.php')))
    )
  )

  problems.push(...(await opsCmsProblems()))

  if (problems.length > 0) {
    for (const p of problems)
      process.stderr.write(`check-infra-contracts: ${relative(ROOT, join(ROOT, p.file))}: ${p.message}\n`)
    process.exit(1)
  }
  process.stdout.write('check-infra-contracts: every cross-file contract holds\n')
}

// Guarded so the checkers can be imported by a test without running `main()` against the repo.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(`check-infra-contracts: ${String(error)}\n`)
    process.exit(1)
  })
}
