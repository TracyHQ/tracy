/**
 * The pure checkers of `scripts/check-infra-contracts.ts`, run on small fixtures: one text that
 * keeps the contract and, for each rule, one that breaks it. The gate itself (the real repo) runs in
 * `build:check`; these prove that a rule can go red at all.
 *
 *   node --import tsx --test scripts/test/check-infra-contracts.test.ts
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  checkCatalog,
  checkContentIdentityWiring,
  checkDarkReachesBody,
  checkDocsTranslations,
  DOCS_LABEL_KEYS,
  checkEmdashModelTexts,
  checkEngineTokenNames,
  checkHookHostNames,
  checkHookServer,
  checkNoIdInGate,
  checkNoOverlayUpdater,
  checkContentPostUp,
  checkDshDockerfile,
  checkFrontPageOrder,
  checkImageTags,
  checkOrder,
  checkPatterns,
  checkStageSeeder,
  checkPlatformOnlyTools,
  checkSiteLabelParity,
  checkSkillPaths,
  checkText,
  checkWordPressDoors,
  compareFence,
  compareStages,
  comparePresetRule,
  emdashToolsNamed,
  type DocsTree,
  type OrderRule
} from '../check-infra-contracts.ts'

const messages = (problems: ReadonlyArray<{ message: string }>): string =>
  problems.map((p) => p.message).join(' | ')

// ── ordered steps ─────────────────────────────────────────────────────────────────────────────

const RULE: OrderRule = { file: 'x.sh', why: 'w', anchors: ['reuse', 'ask', 'mint', 'up'] }

const ORDER_CASES: Array<[string, string, OrderRule, string | null]> = [
  ['in order', 'reuse\nask\nmint\nup', RULE, null],
  ['two steps swapped', 'reuse\nmint\nask\nup', RULE, '"mint" is missing after "ask"'],
  ['a step gone', 'reuse\nask\nup', RULE, '"mint" is missing after "ask"'],
  ['first step gone', 'ask\nmint\nup', RULE, '"reuse" is missing'],
  [
    'search starts at the marker',
    'mint\nbranch\nreuse',
    { ...RULE, after: 'branch', anchors: ['reuse'] },
    null
  ],
  [
    'search starts at a marker that is gone',
    'reuse',
    { ...RULE, after: 'branch', anchors: ['reuse'] },
    'cannot start'
  ],
  [
    'the last occurrence is the start',
    'if\nmint\nif\nreuse',
    { ...RULE, after: { last: 'if' }, anchors: ['reuse'] },
    null
  ],
  [
    'an anchor only before the last occurrence does not count',
    'reuse\nif\nmint\nif',
    { ...RULE, after: { last: 'if' }, anchors: ['reuse'] },
    '"reuse" is missing'
  ]
]
for (const [name, source, rule, expected] of ORDER_CASES)
  test(`checkOrder: ${name}`, () => {
    const found = messages(checkOrder(rule, source))
    if (expected === null) assert.equal(found, '')
    else assert.ok(found.includes(expected), found)
  })

test('checkText: a must-text that is gone and a must-not text that appeared are both named', () => {
  const rule = { file: 'f', why: 'w', must: 'A', mustNot: 'B' }
  assert.equal(checkText(rule, 'A').length, 0)
  assert.match(messages(checkText(rule, 'B')), /no longer contains "A".*contains "B"/)
})

test('checkNoIdInGate: a quickstart id spelled in the platform gate is refused', () => {
  const wrap = (gate: string) => `if [ -n "$QUICKSTART" ]; then\n${gate}\nfi\nSITE_DIR="$ROOT/$LABEL"`
  assert.equal(checkNoIdInGate('p.sh', wrap('quickstart.py --id "$QUICKSTART" --platform')).length, 0)
  assert.equal(checkNoIdInGate('p.sh', wrap('[ "$QUICKSTART" = \'tracy-base/wp7\' ]')).length, 1)
  assert.equal(checkNoIdInGate('p.sh', 'nothing here').length, 1)
})

test('checkWordPressDoors: defined once, called on both paths, each step in the doors function only', () => {
  const good = [
    'tracy_wp_install_doors() {',
    '  cowork_latest wordpress "$floor"',
    '  wp option get claude_cowork_token',
    '}',
    'tracy_wp_install_doors 0.8.0',
    'tracy_wp_install_doors "$COWORK_MIN_VERSION"'
  ].join('\n')
  assert.equal(checkWordPressDoors('w.sh', good).length, 0)
  assert.equal(checkWordPressDoors('w.sh', `${good}\ncowork_latest wordpress "$x"`).length, 1)
  assert.equal(checkWordPressDoors('w.sh', good.replace('tracy_wp_install_doors 0.8.0', '')).length, 1)
  assert.equal(checkWordPressDoors('w.sh', `${good}\ntracy_wp_install_doors() {`).length, 1)
})

// ── hook servers ──────────────────────────────────────────────────────────────────────────────

const HOOK = `HOST_NAME = "contabo"
ATTACH_SITE = "/opt/tracy-fleet/provision/attach-site.sh"
DSH_VERSIONS = "/opt/tracy-fleet/provision/dsh-versions.mjs"
PROVISION_FLAGS = {"label": "--label", "siteKey": "--site-key", "image": "--image"}
class H:
    def do_POST(self):
        if self.path == "/site-attach":
            return self._site_attach()
        if self.path == "/dsh-versions":
            return self._dsh_versions()
    def _site_attach(self):
        if not SAFE_ARG.match(label): return
        self._relay_signed()
        send("bad signature")
    def _dsh_versions(self):
        self._relay_signed()
        send("bad signature", HOST_NAME)
    def _relay_signed(self):
        pass
`

const HOOK_CASES: Array<[string, string, string]> = [
  ['site-attach door removed', HOOK.replace('if self.path == "/site-attach":', ''), 'no /site-attach'],
  [
    'attach script outside provision/',
    HOOK.replace('provision/attach-site.sh', 'tools/attach-site.sh'),
    'ATTACH_SITE'
  ],
  ['attach label unchecked', HOOK.replace('SAFE_ARG.match(label)', 'True'), 'does not check its label'],
  [
    'siteKey dropped from the flags',
    HOOK.replace('"siteKey": "--site-key", ', ''),
    'siteKey never reaches provision'
  ],
  [
    'image dropped from the flags',
    HOOK.replace(', "image": "--image"', ''),
    'image is not in PROVISION_FLAGS'
  ],
  ['a lane door is back', `${HOOK}\nif self.path == "/lane-update":`, 'lane door /lane-update is back'],
  ['a lane helper is back', `${HOOK}\nrun_lane_update()`, 'run_lane_update is back'],
  [
    'dsh-versions unsigned',
    HOOK.replace(
      'def _dsh_versions(self):\n        self._relay_signed()',
      'def _dsh_versions(self):\n        pass'
    ),
    '/dsh-versions is not signed'
  ],
  [
    'dsh-versions grows a write',
    HOOK.replace('send("bad signature", HOST_NAME)', 'send("bad signature", HOST_NAME); write_job()'),
    'grew a write_job'
  ]
]
test('checkHookServer: the fixture keeps every rule', () => {
  assert.equal(messages(checkHookServer('tracy-hooks.contabo.py', HOOK)), '')
})
for (const [name, source, expected] of HOOK_CASES)
  test(`checkHookServer: ${name}`, () => {
    const found = messages(checkHookServer('tracy-hooks.contabo.py', source))
    assert.ok(found.includes(expected), found)
  })

test('checkHookHostNames: each hook names the host the fleet knows', () => {
  const ok = { 'tracy-hooks.contabo.py': 'HOST_NAME = "contabo"', 'tracy-hooks.do.py': 'HOST_NAME = "do"' }
  assert.equal(checkHookHostNames(ok).length, 0)
  assert.equal(checkHookHostNames({ ...ok, 'tracy-hooks.do.py': 'HOST_NAME = "contabo"' }).length, 1)
})

// ── catalogue ─────────────────────────────────────────────────────────────────────────────────

const PINNED = { sha256: 'a'.repeat(64), bytes: 10 }
const CATALOG_CASES: Array<[string, Record<string, Record<string, unknown>>, string | null]> = [
  ['pinned parts', { a: { platform: 'wordpress', webroot: PINNED, database: PINNED } }, null],
  ['a pending part', { a: { platform: 'joomla', webroot: { pending: 'not published' } } }, null],
  ['a part-less entry', { a: { platform: 'emdash' } }, null],
  ['no platform', { a: { platform: 'shopify' } }, 'a: names no platform'],
  ['a card block', { a: { platform: 'joomla', card: {} } }, 'carries a card block'],
  ['a short hash', { a: { platform: 'joomla', webroot: { ...PINNED, sha256: 'abc' } } }, 'a.webroot: sha256'],
  ['no size', { a: { platform: 'joomla', database: { sha256: PINNED.sha256 } } }, 'a.database: bytes']
]
for (const [name, catalog, expected] of CATALOG_CASES)
  test(`checkCatalog: ${name}`, () => {
    const found = messages(checkCatalog(catalog))
    if (expected === null) assert.equal(found, '')
    else assert.ok(found.includes(expected), found)
  })

// ── tracy-host and the fleet scripts ──────────────────────────────────────────────────────────

const WIRING = {
  lockPath: '/var/lock/tracy-provision-$LABEL.lock',
  marker: '.tracy/identity.json',
  provision: 'exec 8>"/var/lock/tracy-provision-$LABEL.lock"',
  joomla: '"$SITE_DIR/.tracy/identity.json"',
  wordpress: '"$SITE_DIR/.tracy/identity.json"',
  joomlaPhp: [
    'TRACY_RESULT content_reader=enabled',
    'TRACY_RESULT content_reader=none',
    'TRACY_RESULT content_reader=outdated',
    'TRACY_RESULT content_reader=unsupported',
    "ContentIdentity::install($db, getenv('TRACY_NEW_SITE') === '1')"
  ].join('\n')
}
const WIRING_CASES: Array<[string, Partial<typeof WIRING>, string]> = [
  ['lock path drifted', { provision: 'exec 8>"/var/lock/other.lock"' }, 'does not hold the lock'],
  ['wordpress marker drifted', { wordpress: '"$SITE_DIR/.tracy/other.json"' }, 'does not write the marker'],
  ['an outcome word renamed', { joomlaPhp: WIRING.joomlaPhp.replace('=none', '=nothing') }, 'outcome words'],
  ['the seed is asked for by anyone', { joomlaPhp: WIRING.joomlaPhp.replace("=== '1'", '') }, 'new-site seed']
]
test('checkContentIdentityWiring: the fixture keeps the contract', () => {
  assert.equal(messages(checkContentIdentityWiring(WIRING)), '')
})
for (const [name, patch, expected] of WIRING_CASES)
  test(`checkContentIdentityWiring: ${name}`, () => {
    assert.ok(messages(checkContentIdentityWiring({ ...WIRING, ...patch })).includes(expected))
  })

// ── tools and model texts ─────────────────────────────────────────────────────────────────────

test('checkPlatformOnlyTools: a name no owner registers is named', () => {
  const owners = { a: "{ tool: 'tracy_site_build_joomla' }", b: "{ name: 'tracy_emdash' }" }
  assert.equal(checkPlatformOnlyTools(['tracy_site_build_joomla', 'tracy_emdash'], owners).length, 0)
  assert.match(messages(checkPlatformOnlyTools(['tracy_gone'], owners)), /tracy_gone/)
})

test('emdashToolsNamed: reads family_verb names and wildcard families', () => {
  assert.deepEqual(emdashToolsNamed('use content_get and schema_delete_* then menu_list.'), [
    'content_get',
    'schema_delete_*',
    'menu_list'
  ])
})

const TOOLS = new Set(['content_get', 'schema_delete_field'])
const MODEL_CASES: Array<[string, string, string | null]> = [
  ['known tools', 'call content_get, or schema_delete_*', null],
  ['an unknown tool', 'call content_gone', 'content_gone'],
  ['an unknown family', 'call media_delete_*', 'media_delete_*'],
  ['list first, one way', 'call {list: true} first', '{list: true} first'],
  ['list first, the other way', 'Start with content, {list: true}', '{list: true} first'],
  ['list mentioned without ordering', 'use {list: true} to page', null]
]
for (const [name, text, expected] of MODEL_CASES)
  test(`checkEmdashModelTexts: ${name}`, () => {
    const found = messages(checkEmdashModelTexts({ skill: text }, TOOLS))
    if (expected === null) assert.equal(found, '')
    else assert.ok(found.includes(expected), found)
  })

// ── small parity rules ────────────────────────────────────────────────────────────────────────

const LABEL = (comment: string, extra = '') =>
  `// ${comment}\nexport const SITE_LABEL_RE = /^[a-z]+$/${extra}\nexport const RESERVED = ['api']\n/* c */\nexport function siteLabelRefusal() {}\nexport function isSiteLabel() { return 1 }`

test('checkSiteLabelParity: comments may differ, code may not', () => {
  assert.equal(checkSiteLabelParity(LABEL('one'), LABEL('another words')).length, 0)
  assert.equal(checkSiteLabelParity(LABEL('one'), LABEL('one', '\nexport const EXTRA = 1')).length, 1)
  assert.equal(checkSiteLabelParity('nothing', LABEL('one')).length, 1)
})

const TOKENS_CSS = (dark: string) => `:root, body { --popover: white; }\n${dark} { --popover: black; }\n`
test('checkDarkReachesBody: the dark selector list must reach body for both toggles', () => {
  const good = TOKENS_CSS('.dark, .dark body, :root[data-theme="dark"], :root[data-theme="dark"] body')
  assert.equal(checkDarkReachesBody(good).length, 0)
  assert.match(
    messages(checkDarkReachesBody(TOKENS_CSS('.dark, .dark body, :root[data-theme="dark"]'))),
    /data-theme="dark"\] body/
  )
  assert.match(messages(checkDarkReachesBody(TOKENS_CSS('.dark'))), /\.dark body/)
  assert.match(messages(checkDarkReachesBody(':root { --popover: white; }')), /light palette|second block/)
})

test('checkEngineTokenNames: every system declares the engine names; the reference declares no more', () => {
  const css = (names: string[]) => names.map((n) => `${n}: 1px;`).join(' ')
  const names = ['--a', '--b']
  assert.equal(checkEngineTokenNames(names, { airbnb: css(names), other: css([...names, '--x']) }).length, 0)
  assert.match(messages(checkEngineTokenNames(names, { airbnb: css(names), other: css(['--a']) })), /--b/)
  assert.match(messages(checkEngineTokenNames(names, { airbnb: css([...names, '--x']) })), /reference system/)
  assert.match(messages(checkEngineTokenNames(names, { other: css(names) })), /is gone/)
})

test('checkSkillPaths: a dead path, a missing reference and a regex that finds nothing are all red', () => {
  const exists = (p: string) => p === 'packages/a/b/c.md' || p === 'ref.md'
  assert.equal(checkSkillPaths({ s: 'see packages/a/b/c.md.' }, exists, ['ref.md']).length, 0)
  assert.match(messages(checkSkillPaths({ s: 'see packages/a/b/gone.md' }, exists, ['ref.md'])), /gone\.md/)
  assert.match(
    messages(checkSkillPaths({ s: 'see packages/a/b/c.md' }, exists, ['nope.md'])),
    /reference is missing/
  )
  assert.match(messages(checkSkillPaths({ s: 'no paths' }, exists, [])), /names no path/)
})

test('checkNoOverlayUpdater: each overlay with its own updater is named', () => {
  assert.equal(checkNoOverlayUpdater([]).length, 0)
  assert.match(messages(checkNoOverlayUpdater(['x'])), /own updater/)
})

// ── docs translations ─────────────────────────────────────────────────────────────────────────

const LABELS = Object.fromEntries(DOCS_LABEL_KEYS.map((k) => [k, k]))
const EN = '# Title\n\n```js\nx\n```\n\n[go](/quickstart/)\n'
const docs = (
  page: string,
  sidebar: object = { lang: 'vi', label: 'Tieng Viet', labels: LABELS }
): DocsTree => ({
  english: { 'index.mdx': EN },
  englishHasMarker: false,
  locales: { vi: { sidebar, pages: { 'index.mdx': page } } }
})
const REF = '# Title\n\n[ref](/api/reference/) [doc](/api/openapi.json)\n'
const DOCS_CASES: Array<[string, DocsTree, string | null]> = [
  [
    'the reference and its documents keep one address in every language',
    {
      english: { 'index.mdx': REF },
      englishHasMarker: false,
      locales: { vi: { sidebar: { lang: 'vi', label: 'V', labels: LABELS }, pages: { 'index.mdx': REF } } }
    },
    null
  ],
  ['a faithful translation', docs('# Tieu de\n\n```js\nx\n```\n\n[di](/vi/quickstart/)\n'), null],
  ['a dropped heading', docs('```js\nx\n```\n\n[di](/vi/quickstart/)\n'), 'headings differ'],
  ['a dropped code fence', docs('# T\n\n[di](/vi/quickstart/)\n'), 'code fences differ'],
  ['a link left in the English tree', docs('# T\n\n```js\nx\n```\n\n[di](/quickstart/)\n'), 'English tree'],
  ['a link to another page', docs('# T\n\n```js\nx\n```\n\n[di](/vi/other/)\n'), 'link targets differ'],
  [
    'a missing sidebar label',
    docs(EN, { lang: 'vi', label: 'V', labels: { ...LABELS, errors: '' } }),
    'empty label errors'
  ],
  ['a wrong language tag', docs(EN, { lang: 'Vietnamese', label: 'V', labels: LABELS }), 'BCP-47'],
  ['a marker at the English root', { ...docs(EN), englishHasMarker: true }, 'translation marker'],
  [
    'a translated page with no English source',
    {
      ...docs(EN),
      locales: {
        vi: { sidebar: { lang: 'vi', label: 'V', labels: LABELS }, pages: { 'index.mdx': EN, 'x.mdx': EN } }
      }
    },
    'no English page at x.mdx'
  ]
]
for (const [name, tree, expected] of DOCS_CASES)
  test(`checkDocsTranslations: ${name}`, () => {
    const found = messages(checkDocsTranslations(tree))
    if (expected === null) assert.equal(found, '')
    else assert.ok(found.includes(expected), found)
  })

// ── ops-cms comparisons ───────────────────────────────────────────────────────────────────────

test('compareStages: a parser that reads other stages than the module runs is named', () => {
  assert.equal(compareStages('joomla', ['a', 'b'], ['a', 'b']).length, 0)
  assert.match(messages(compareStages('joomla', ['a'], ['a', 'b'])), /joomla/)
})

test('compareFence: a path argument drawn as content, or a missing tool, is named', () => {
  const real = { read: { paths: ['path'], content: [] as string[] } }
  assert.equal(compareFence({ read: { paths: ['path'], content: [] } }, real).length, 0)
  assert.match(messages(compareFence({ read: { paths: [], content: ['path'] } }, real)), /`read`/)
  assert.match(messages(compareFence({}, real)), /`read`.*different set|different set/)
})

test('comparePresetRule: a rule that disagrees with presetFor on any input is named', () => {
  const rule = { roles: ['designer'], platforms: ['joomla'], fallbackRole: 'designer' }
  const same = (_current: unknown, platform: string) => {
    if (platform !== 'joomla') return null
    return 'designer-joomla'
  }
  assert.equal(comparePresetRule(rule, same).length, 0)
  const drifted = (_current: unknown, platform: string) => (platform === 'joomla' ? 'builder-joomla' : null)
  assert.ok(comparePresetRule(rule, drifted).length > 0)
})

// ── shell and Dockerfile text rules ───────────────────────────────────────────────────────────

test('checkPatterns: a missing must-pattern and a present must-not pattern are both named', () => {
  const rule = { file: 'f', why: 'w', must: [/alpha/], mustNot: [/beta/] }
  assert.equal(checkPatterns(rule, 'alpha').length, 0)
  assert.match(messages(checkPatterns(rule, 'gamma')), /no longer matches \/alpha\//)
  assert.match(messages(checkPatterns(rule, 'alpha beta')), /matches \/beta\//)
})

const TAG_CASES: Array<[string, string, string | null]> = [
  ['a dated build after the floor', 'tracy/x:v1-20260924-r1\n# comment\n', null],
  ['a build before the floor', 'tracy/x:v1-20260901-r1\n', 'predates'],
  ['no date tag', 'tracy/x:latest\n', 'no date tag'],
  ['an empty list', '# only comments\n', 'lists no image']
]
for (const [name, text, expected] of TAG_CASES)
  test(`checkImageTags: ${name}`, () => {
    const found = messages(checkImageTags(text))
    if (expected === null) assert.equal(found, '')
    else assert.ok(found.includes(expected), found)
  })

const PROVISION_FRONT = (guard: string, order: 'ok' | 'late' | 'early') => {
  const ask = `${guard}\n  tracy_front_page_refusal "$LABEL" "$HOST_PORT"\nfi\n`
  const up = 'if declare -F platform_post_up; then\nfi\n'
  const folder = 'stage "building the site folder"\n'
  return order === 'ok' ? up + ask + folder : order === 'late' ? up + folder + ask : ask + up + folder
}
const GUARD = 'if [ -n "$QUICKSTART" ] && { [ "$PLATFORM" = joomla ] || [ "$PLATFORM" = wordpress ]; }; then'
const FRONT_CASES: Array<[string, string, string | null]> = [
  ['asked between post-up and the folder', PROVISION_FRONT(GUARD, 'ok'), null],
  ['asked after the site folder', PROVISION_FRONT(GUARD, 'late'), 'after the site folder'],
  ['asked before the site is up', PROVISION_FRONT(GUARD, 'early'), 'before the platform'],
  [
    'guard drops the quickstart test',
    PROVISION_FRONT(GUARD.replace('[ -n "$QUICKSTART" ] && ', ''), 'ok'),
    '[ -n "$QUICKSTART" ]'
  ],
  [
    'guard drops wordpress',
    PROVISION_FRONT(GUARD.replace('"$PLATFORM" = wordpress', 'true'), 'ok'),
    '= wordpress'
  ],
  ['anchors gone', 'nothing', 'anchors moved']
]
for (const [name, source, expected] of FRONT_CASES)
  test(`checkFrontPageOrder: ${name}`, () => {
    const found = messages(checkFrontPageOrder(source))
    if (expected === null) assert.equal(found, '')
    else assert.ok(found.includes(expected), found)
  })

const SEEDER =
  'ROOT=/r\nOUT="$ROOT/out"\npnpm -C "$ROOT" build\ncp -R "$ROOT/packages/cms/tracy-seeder/dist/." "$OUT/"\n'
const SEEDER_CASES: Array<[string, string, string | null]> = [
  ['every pnpm and the cp name ROOT', SEEDER, null],
  ['a pnpm from the caller cwd', `${SEEDER}pnpm build\n`, "caller's cwd"],
  ['no pnpm at all', SEEDER.replace('pnpm -C "$ROOT" build\n', ''), 'no pnpm invocation'],
  [
    'the dist copied from another tree',
    SEEDER.replace('cp -R "$ROOT/', 'cp -R "$PWD/'),
    'not copied from $ROOT'
  ],
  ['OUT outside ROOT', SEEDER.replace('OUT="$ROOT/out"', 'OUT=/tmp/out'), 'OUT is not under']
]
for (const [name, source, expected] of SEEDER_CASES)
  test(`checkStageSeeder: ${name}`, () => {
    const found = messages(checkStageSeeder(source))
    if (expected === null) assert.equal(found, '')
    else assert.ok(found.includes(expected), found)
  })

const POST_UP = (body: string) => `_emdash_content_api_post_up() {\n${body}\n}\n`
const POST_CASES: Array<[string, string, string | null]> = [
  [
    'token piped, digest handed over',
    POST_UP('  printf %s "$tok" | docker exec -i c sh\n  cat tracy-content-relay.sha256'),
    null
  ],
  [
    'the display prefix is allowed',
    POST_UP('  docker exec c echo ${tok:0:11}\n  x tracy-content-relay.sha256'),
    null
  ],
  ['raw token in argv', POST_UP('  docker exec c run "$tok"\n  x tracy-content-relay.sha256'), 'raw token'],
  ['digest dropped', POST_UP('  printf %s "$tok" | docker exec -i c sh'), 'relay digest'],
  [
    'a migration in post-up',
    POST_UP('  x tracy-content-relay.sha256\n  node identity-sqlite.mjs migrate'),
    'migration'
  ],
  ['function gone', 'nothing', 'not found']
]
for (const [name, source, expected] of POST_CASES)
  test(`checkContentPostUp: ${name}`, () => {
    const found = messages(checkContentPostUp(source))
    if (expected === null) assert.equal(found, '')
    else assert.ok(found.includes(expected), found)
  })

const CACHE =
  '--mount=type=cache,target=/root/.local/share/pnpm/store --mount=type=cache,target=/root/.cache/pnpm '
const forkStages = (name: string, fork: string, manifests: string) =>
  [
    `FROM tools AS ${name}-deps`,
    `COPY ${manifests} /opt/${fork}/`,
    `RUN ${CACHE}pnpm install`,
    `FROM ${name}-deps AS ${name}-build`,
    `COPY ${fork} /opt/${fork}`,
    `FROM tools AS ${name}-prod`,
    `COPY ${manifests} /opt/${fork}/`,
    `RUN ${CACHE}pnpm install --prod`,
    `FROM tools AS ${name}`,
    `COPY --from=${name}-prod /opt/${fork}/node_modules /x`
  ].join('\n')
const DOCKERFILE = [
  'FROM node AS tools',
  'FROM tools AS dsh',
  `RUN ${CACHE}pnpm install`,
  'RUN pnpm build:official',
  'RUN find /opt/dsh -name "*.map" -delete',
  forkStages(
    'passwords',
    'vendor/tracy/dsh-passwords',
    'vendor/tracy/dsh-passwords/package.json vendor/tracy/dsh-passwords/npm-shrinkwrap.json'
  ),
  forkStages(
    'sidebar',
    'vendor/tracy/dsh-better-sidebar',
    'vendor/tracy/dsh-better-sidebar/package.json vendor/tracy/dsh-better-sidebar/pnpm-lock.yaml vendor/tracy/dsh-better-sidebar/pnpm-workspace.yaml'
  ),
  'FROM dsh AS build',
  'COPY --from=passwords /opt/vendor/tracy/dsh-passwords /opt/vendor/tracy/dsh-passwords',
  'COPY --from=sidebar /opt/vendor/tracy/dsh-better-sidebar /opt/vendor/tracy/dsh-better-sidebar',
  'FROM node AS runtime',
  'COPY --from=dsh /opt/dsh /opt/dsh',
  'COPY --from=dsh /usr/local/bin/docker /usr/local/bin/docker',
  'COPY --from=dsh /usr/local/bin/wp /usr/local/bin/wp'
].join('\n')

const DOCKER_CASES: Array<[string, string, string | null]> = [
  ['the fixture keeps every invariant', DOCKERFILE, null],
  [
    'the build stage rewrites /opt/dsh',
    DOCKERFILE.replace('FROM dsh AS build', 'FROM dsh AS build\nRUN chmod -R a+r /opt/dsh'),
    'the build stage changes /opt/dsh'
  ],
  [
    'dsh stage stops deleting source maps',
    DOCKERFILE.replace('RUN find /opt/dsh -name "*.map" -delete\n', ''),
    'source maps'
  ],
  [
    'an install loses the cache-dir mount',
    DOCKERFILE.replace(
      `RUN ${CACHE}pnpm install\nRUN pnpm build:official`,
      'RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install\nRUN pnpm build:official'
    ),
    'no pnpm cache-dir mount'
  ],
  [
    'runtime copies /opt/dsh from build',
    DOCKERFILE.replace('COPY --from=dsh /opt/dsh /opt/dsh', 'COPY --from=build /opt/dsh /opt/dsh'),
    'copy /opt/dsh from the dsh stage'
  ],
  [
    'the build stage copies a fork source itself',
    DOCKERFILE.replace('FROM dsh AS build', 'FROM dsh AS build\nCOPY vendor/tracy/dsh-passwords /x'),
    'copies the fork source itself'
  ],
  [
    'a deps stage copies the whole source',
    DOCKERFILE.replace(
      'FROM tools AS passwords-deps\nCOPY',
      'FROM tools AS passwords-deps\nCOPY vendor/tracy/dsh-passwords /y\nCOPY'
    ),
    'copies the whole source'
  ],
  [
    'a fork stage starts from dsh',
    DOCKERFILE.replace('FROM tools AS passwords-prod', 'FROM dsh AS passwords-prod'),
    'passwords-prod: a fork stage must start from tools'
  ],
  [
    'a stage prunes a lower layer',
    DOCKERFILE.replace('FROM tools AS passwords\n', 'FROM tools AS passwords\nRUN npm prune --omit=dev\n'),
    'deletes installed packages'
  ]
]
for (const [name, text, expected] of DOCKER_CASES)
  test(`checkDshDockerfile: ${name}`, () => {
    const found = messages(checkDshDockerfile(text))
    if (expected === null) assert.equal(found, '')
    else assert.ok(found.includes(expected), found)
  })
