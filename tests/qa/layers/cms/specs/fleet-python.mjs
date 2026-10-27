// Machine cases for the host-side quickstart code: `quickstart.py` (download, pin, unpack guards) and
// `quickstart_jpa.py` (the JPA reader). Python drives the product code; Node judges. No network: every
// artifact is a file under the scenario's own scratch folder, reached through the same `file:` door a dev stand uses.
//
// Oracle: ADR 0017 §3 and §10 (a pin is checked before bytes are unpacked; a `file:` address is read only from
// TRACY_LOCAL_RELEASES_DIR) and the fleet's own contract in quickstart.py's docstrings, cross-checked with
// the owner's regression test packages/fleet/tracy-fleet-operation/test/quickstart-jpa.test.py.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PRODUCT, PY_COPY, withTempDir } from '../lib/helpers.mjs'
import { spawnBounded } from '../lib/kit.mjs'

const ADR17 = 'docs/adr/0017-github-release-is-quickstart-source-of-truth.md'
const PROBE = fileURLToPath(new URL('../py/probe.py', import.meta.url))
const MODULE_DIR = path.dirname(PRODUCT.quickstartPy)
const ok = (value, detail) => ({ ok: Boolean(value), detail })

async function probe(ctx, scenario) {
  return withTempDir(path.join(ctx.outDir, 'tmp'), async (work) => {
    const r = await spawnBounded({
      argv: [
        'python3',
        PROBE,
        JSON.stringify({ ...scenario, module_dir: path.join(ctx.root, MODULE_DIR), work })
      ],
      cwd: work,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
      timeoutMs: 60_000
    })
    if (r.exit !== 0 || r.timedOut)
      throw new Error(`python probe failed: exit ${r.exit} ${r.stderr.slice(0, 400)}`)
    return JSON.parse(r.stdout)
  })
}

const pyMutation = (id, describe, find, replace, file = PRODUCT.quickstartPy) => ({
  id,
  kind: 'product',
  describe,
  copy: PY_COPY,
  files: [{ path: file, find, replace }]
})

const INTEGRITY = pyMutation(
  'skip-integrity',
  'size and sha256 are never compared',
  "if size != artifact['bytes'] or sha.hexdigest() != artifact['sha256']:",
  'if False:'
)

/** Download scenarios: [key, tags, scenario, expected error pattern, mutation id] */
const DOWNLOADS = [
  [
    'unpinned-null-sha',
    ['missing-contract', 'empty'],
    { part: 'webroot', pin: { sha256: null } },
    /not pinned yet/,
    'skip-pin-check'
  ],
  [
    'unpinned-short-sha',
    ['bad-hash', 'invalid'],
    { part: 'webroot', pin: { sha256: 'abc' } },
    /not pinned yet/,
    'skip-pin-check'
  ],
  [
    'unpinned-zero-bytes',
    ['boundary', 'invalid'],
    { part: 'webroot', pin: { bytes: 0 } },
    /not pinned yet/,
    'skip-pin-check'
  ],
  [
    'unpinned-bool-bytes',
    ['boundary', 'invalid'],
    { part: 'webroot', pin: { bytes: true } },
    /not pinned yet/,
    'skip-pin-check'
  ],
  [
    'modified-byte',
    ['bad-hash', 'invalid'],
    { part: 'webroot', tamper: 'flip' },
    /checksum mismatch/,
    'skip-integrity'
  ],
  [
    'truncated-download',
    ['bad-hash', 'boundary'],
    { part: 'webroot', tamper: 'truncate' },
    /checksum mismatch/,
    'skip-integrity'
  ],
  [
    'oversized-download',
    ['boundary', 'bad-hash'],
    { part: 'webroot', tamper: 'extend' },
    /size exceeds catalog/,
    'skip-size-cap'
  ],
  [
    'webroot-parent-traversal',
    ['archive-path', 'invalid'],
    { part: 'webroot', members: [{ name: '../evil.php' }] },
    /unsafe quickstart member/,
    'skip-tar-guard'
  ],
  [
    'webroot-nested-traversal',
    ['archive-path', 'invalid'],
    { part: 'webroot', members: [{ name: 'a/../../evil.php' }] },
    /unsafe quickstart member/,
    'skip-tar-guard'
  ],
  [
    'webroot-absolute-member',
    ['archive-path', 'invalid'],
    { part: 'webroot', members: [{ name: '/etc/cron.d/evil' }] },
    /unsafe quickstart member/,
    'skip-tar-guard'
  ],
  [
    'webroot-symlink-member',
    ['archive-path', 'secret-scrub'],
    { part: 'webroot', members: [{ name: 'link', type: 'symlink', target: '/etc/passwd' }] },
    /unsafe quickstart member/,
    'skip-tar-guard'
  ],
  [
    'state-parent-traversal',
    ['archive-path', 'invalid'],
    { part: 'state', members: [{ name: '../evil.db' }] },
    /unsafe quickstart member/,
    'skip-tar-guard'
  ],
  [
    'installer-parent-traversal',
    ['archive-path', 'invalid'],
    {
      part: 'installer',
      artifact: 'zip',
      members: [{ name: 'installation/joomla.php' }, { name: '../evil.php' }]
    },
    /unsafe quickstart member/,
    'skip-zip-guard'
  ],
  [
    'installer-absolute-member',
    ['archive-path', 'invalid'],
    {
      part: 'installer',
      artifact: 'zip',
      members: [{ name: 'installation/joomla.php' }, { name: '/evil.php' }]
    },
    /unsafe quickstart member/,
    'skip-zip-guard'
  ],
  [
    'installer-without-joomla-cli',
    ['mixed-version', 'invalid'],
    { part: 'installer', artifact: 'zip', members: [{ name: 'index.php' }] },
    /installation\/joomla\.php/,
    'skip-installer-cli-check'
  ],
  [
    'local-file-outside-root',
    ['archive-path', 'secret-scrub'],
    { part: 'webroot', local_url: 'outside' },
    /outside TRACY_LOCAL_RELEASES_DIR/,
    'skip-local-root'
  ],
  [
    'local-file-symlink-escape',
    ['archive-path', 'secret-scrub'],
    { part: 'webroot', local_url: 'symlink' },
    /outside TRACY_LOCAL_RELEASES_DIR/,
    'skip-local-root'
  ],
  [
    'local-file-names-the-root',
    ['boundary', 'archive-path'],
    { part: 'webroot', local_url: 'root' },
    /outside TRACY_LOCAL_RELEASES_DIR/,
    'skip-local-root'
  ],
  [
    'local-file-root-unset',
    ['dependency-failure', 'secret-scrub'],
    { part: 'webroot', root: 'unset' },
    /names none/,
    'skip-root-required'
  ]
]

const DOWNLOAD_MUTATIONS = {
  'skip-pin-check': pyMutation(
    'skip-pin-check',
    'pinned() is never called',
    "    pinned(artifact, part)\n    url = artifact['url']",
    "    url = artifact['url']"
  ),
  'skip-integrity': INTEGRITY,
  'skip-size-cap': pyMutation(
    'skip-size-cap',
    'the running size cap never fires',
    "if size > artifact['bytes']:",
    'if False:'
  ),
  'skip-tar-guard': pyMutation(
    'skip-tar-guard',
    'tar members are not inspected',
    "if name.is_absolute() or '..' in name.parts or not (member.isfile() or member.isdir()):",
    'if False:'
  ),
  'skip-zip-guard': pyMutation(
    'skip-zip-guard',
    'zip members are not inspected',
    "if inside.is_absolute() or '..' in inside.parts:",
    'if False:'
  ),
  'skip-installer-cli-check': pyMutation(
    'skip-installer-cli-check',
    'the installer CLI file is not required',
    "if 'installation/joomla.php' not in names:",
    'if False:'
  ),
  'skip-local-root': pyMutation(
    'skip-local-root',
    'a file: address may name any path',
    'if wanted == base or os.path.commonpath([wanted, base]) != base:',
    'if False:'
  ),
  'skip-root-required': pyMutation(
    'skip-root-required',
    'a file: address needs no configured root',
    'if not os.path.isabs(root):',
    'if False:'
  )
}

const JPA_SAFE = [['index.php', '<?php']]
const JPA = [
  [
    'parent-traversal',
    ['archive-path', 'invalid'],
    { files: [['../secret', 'x']] },
    /unsafe or duplicate JPA path/,
    'jpa-no-dotdot'
  ],
  [
    'nested-traversal',
    ['archive-path', 'invalid'],
    { files: [['folder/../../secret', 'x']] },
    /unsafe or duplicate JPA path/,
    'jpa-no-dotdot'
  ],
  [
    'absolute-path',
    ['archive-path', 'invalid'],
    { files: [['/secret', 'x']] },
    /unsafe or duplicate JPA path/,
    'jpa-no-absolute'
  ],
  [
    'backslash-path',
    ['archive-path', 'invalid'],
    { files: [['a\\b', 'x']] },
    /unsafe or duplicate JPA path/,
    'jpa-no-backslash'
  ],
  [
    'nul-in-name',
    ['archive-path', 'encoding-injection'],
    { files: [['a\u0000b', 'x']] },
    /unsafe or duplicate JPA path/,
    'jpa-no-nul'
  ],
  [
    'duplicate-entry',
    ['duplicate', 'invalid'],
    {
      files: [
        ['same', ''],
        ['same', '']
      ]
    },
    /unsafe or duplicate JPA path/,
    'jpa-no-duplicates'
  ],
  [
    'truncated-archive',
    ['boundary', 'invalid'],
    { files: [['file', 'x']], cut: 1 },
    /unsupported JPA entry/,
    'jpa-no-truncation'
  ],
  ['bad-header', ['invalid', 'empty'], { raw_b64: 'WFhY' }, /invalid JPA header/, 'jpa-header-check']
]
const JPA_MUTATIONS = {
  'jpa-no-dotdot': pyMutation(
    'jpa-no-dotdot',
    "'..' segments are accepted",
    "'..' in path.parts or ",
    '',
    PRODUCT.quickstartJpaPy
  ),
  'jpa-no-absolute': pyMutation(
    'jpa-no-absolute',
    'absolute paths are accepted',
    'path.is_absolute() or ',
    '',
    PRODUCT.quickstartJpaPy
  ),
  'jpa-no-backslash': pyMutation(
    'jpa-no-backslash',
    'backslashes are accepted',
    "'\\\\' in name or ",
    '',
    PRODUCT.quickstartJpaPy
  ),
  'jpa-no-nul': pyMutation(
    'jpa-no-nul',
    'NUL bytes are accepted',
    "'\\0' in name or ",
    '',
    PRODUCT.quickstartJpaPy
  ),
  'jpa-no-duplicates': pyMutation(
    'jpa-no-duplicates',
    'duplicate names are accepted',
    ' or name in seen:',
    ':',
    PRODUCT.quickstartJpaPy
  ),
  'jpa-no-truncation': pyMutation(
    'jpa-no-truncation',
    'an entry running past the end is accepted',
    ' or pos + header + size > len(raw):',
    ':',
    PRODUCT.quickstartJpaPy
  ),
  'jpa-header-check': pyMutation(
    'jpa-header-check',
    'the JPA magic is not checked',
    "if raw[:3] != b'JPA' or len(raw) < 19:",
    'if False:',
    PRODUCT.quickstartJpaPy
  )
}

export const specs = [
  {
    item: 'quickstart.py.download',
    assertion: 'quickstart-py.download-refuses-unsafe-or-unpinned',
    area: 'machine',
    requirement:
      'The host downloader refuses an unpinned entry, bytes that miss the pin, archive members that escape the webroot, and a file: address outside the local-releases directory.',
    oracle: {
      source: `${ADR17} + packages/fleet/tracy-fleet-operation/scripts/provision/quickstart.py (docstrings of pinned/local_file)`,
      section: '§3 pin checked at fetch; §10 file: only under TRACY_LOCAL_RELEASES_DIR',
      invariant: 'ValueError with the named sentence, and no output file for a refused artifact'
    },
    reads: [PRODUCT.quickstartPy, PRODUCT.quickstartJpaPy],
    prerequisites: ['tool:python3'],
    variants: DOWNLOADS.map(([key, tags, , , mutation]) => ({
      key,
      tags,
      params: { key },
      mutation
    })),
    mutations: DOWNLOAD_MUTATIONS,
    async execute(ctx) {
      const row = DOWNLOADS.find((d) => d[0] === ctx.params.key)
      const [, , scenario, expected] = row
      const members =
        scenario.part === 'installer'
          ? [{ name: 'installation/joomla.php' }, { name: 'index.php' }]
          : [{ name: 'index.php' }]
      const good = await probe(ctx, {
        op: 'download',
        part: scenario.part,
        artifact: scenario.artifact,
        members
      })
      const controlOk = good.raised === null && good.output_sha256 === good.declared_sha256
      const bad = await probe(ctx, { op: 'download', ...scenario })
      const refused =
        bad.raised === 'ValueError' && expected.test(bad.message ?? '') && bad.output_sha256 === null
      return {
        control: ok(controlOk, JSON.stringify(good)),
        check: ok(refused, JSON.stringify(bad))
      }
    }
  },
  {
    item: 'quickstart-jpa.entries',
    assertion: 'quickstart-jpa.entries-refuses-hostile-archives',
    area: 'machine',
    requirement:
      'The JPA reader raises on traversal, absolute, backslash, NUL, duplicate, truncated and malformed archives, and lists the entries of a clean one.',
    oracle: {
      source:
        'packages/fleet/tracy-fleet-operation/test/quickstart-jpa.test.py (owner regression) + quickstart_jpa.py module docstring',
      section: 'test_refuses_traversal_links_and_truncation',
      invariant: 'unsafe or malformed JPA input raises ValueError before any entry is handed to the unpacker'
    },
    reads: [PRODUCT.quickstartJpaPy],
    prerequisites: ['tool:python3'],
    variants: JPA.map(([key, tags, , , mutation]) => ({ key, tags, params: { key }, mutation })),
    mutations: JPA_MUTATIONS,
    async execute(ctx) {
      const row = JPA.find((d) => d[0] === ctx.params.key)
      const [, , scenario, expected] = row
      const good = await probe(ctx, { op: 'jpa', files: JPA_SAFE })
      const bad = await probe(ctx, { op: 'jpa', ...scenario })
      return {
        control: ok(good.raised === null && good.value?.[0] === 'index.php', JSON.stringify(good)),
        check: ok(bad.raised === 'ValueError' && expected.test(bad.message ?? ''), JSON.stringify(bad))
      }
    }
  }
]
