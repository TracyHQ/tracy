// Machine cases for `validateSetting`: what a release must declare before Tracy lists it as installable.
// Oracle: ADR 0017 §2–§4 (the setting pins sha256 for the release's own files, never a URL; the file
// names are checked against the real asset list; PHP CMSs install in a named shape, not half of one).
import { PRODUCT, WEB_COPY, load, observe } from '../lib/helpers.mjs'

const ADR17 = 'docs/adr/0017-github-release-is-quickstart-source-of-truth.md'
const ok = (value, detail) => ({ ok: Boolean(value), detail })
const hex = (c) => c.repeat(64)

const mutation = (id, describe, find, replace) => ({
  id,
  kind: 'product',
  describe,
  copy: WEB_COPY,
  files: [{ path: PRODUCT.tracySetting, find, replace }]
})

const good = (platform) => {
  const parts = {
    joomla: { webroot: 'j-webroot.tar.gz', database: 'j-db.sql.gz' },
    wordpress: { webroot: 'w-webroot.tar.gz', database: 'w-db.sql.gz' },
    emdash: { source: 'e-source.zip', state: 'e-state.tar.gz' }
  }[platform]
  return {
    schemaVersion: 'tracy-setting/v1',
    platform,
    label: 'QA',
    version: '1.0.0',
    cms: '1',
    install: Object.fromEntries(
      Object.entries(parts).map(([part, file]) => [part, { file, sha256: hex('a') }])
    )
  }
}
const assetsOf = (doc) => Object.values(doc.install).map((p) => p.file)

async function validate(ctx, doc, opts) {
  const mod = await load(ctx.root, PRODUCT.tracySetting)
  return observe(() => mod.validateSetting(structuredClone(doc), opts))
}

/** Control: a good setting of every platform is accepted when its files are on the release. */
async function control(ctx) {
  for (const platform of ['joomla', 'wordpress', 'emdash']) {
    const doc = good(platform)
    const r = await validate(ctx, doc, { assets: assetsOf(doc) })
    if (r.threw || r.value.length > 0) return ok(false, `${platform}: ${JSON.stringify(r)}`)
  }
  const bundle = good('joomla')
  bundle.install = { bundle: { file: 'b.jpa', sha256: hex('b') } }
  const r = await validate(ctx, bundle, { assets: ['b.jpa'] })
  const installer = good('joomla')
  installer.install = { installer: { file: 'i.zip', sha256: hex('c') } }
  const r2 = await validate(ctx, installer, { assets: ['i.zip'] })
  return ok(
    !r.threw && r.value.length === 0 && !r2.threw && r2.value.length === 0,
    JSON.stringify({ bundle: r, installer: r2 })
  )
}

const PINS = {
  'sha-uppercase': (p) => ({ ...p, sha256: hex('A') }),
  'sha-63-chars': (p) => ({ ...p, sha256: 'a'.repeat(63) }),
  'sha-65-chars': (p) => ({ ...p, sha256: 'a'.repeat(65) }),
  'sha-not-hex': (p) => ({ ...p, sha256: 'g'.repeat(64) }),
  'sha-null': (p) => ({ ...p, sha256: null }),
  'sha-missing': (p) => ({ file: p.file }),
  'sha-number': (p) => ({ ...p, sha256: 12345 }),
  'sha-empty': (p) => ({ ...p, sha256: '' })
}

const SHAPES = {
  'webroot-without-database': {
    platform: 'wordpress',
    install: (d) => ({ webroot: d.install.webroot }),
    expect: /install must be/
  },
  'database-without-webroot': {
    platform: 'joomla',
    install: (d) => ({ database: d.install.database }),
    expect: /install must be/
  },
  'empty-install': { platform: 'joomla', install: () => ({}), expect: /install must be/ },
  'installer-on-wordpress': {
    platform: 'wordpress',
    install: () => ({ installer: { file: 'x.zip', sha256: hex('a') } }),
    expect: /not a part an wordpress|install must be/
  },
  'emdash-with-php-shape': {
    platform: 'emdash',
    install: (d) => ({ webroot: d.install.source, database: d.install.state }),
    expect: /not a part|is missing/
  },
  'emdash-source-without-state': {
    platform: 'emdash',
    install: (d) => ({ source: d.install.source }),
    expect: /install\.state is missing/
  },
  'unknown-part': {
    platform: 'joomla',
    install: (d) => ({ ...d.install, firmware: { file: 'f.bin', sha256: hex('a') } }),
    expect: /install\.firmware is not a part/
  }
}

const VERSIONS = [
  ['1.0', false],
  ['1.0.0.0', false],
  ['v1.0.0', false],
  ['', false],
  ['1.0.0-rc.1', true],
  ['0.0.0', true],
  ['10.20.30', true]
]

export const specs = [
  {
    item: 'tracy-setting.validate',
    assertion: 'tracy-setting.rejects-bad-pins',
    area: 'machine',
    requirement:
      'A shape part whose sha256 is not exactly 64 lowercase hex characters is a problem, whatever the platform.',
    oracle: {
      source: ADR17,
      section: '§3',
      invariant:
        'install{} declares each file with a sha256 pin; a pin that cannot be a sha256 makes the release invalid'
    },
    reads: ['apps/tracy-web/src/lib/tracy-setting.mjs'],
    variants: Object.keys(PINS).map((key) => ({
      key,
      tags: ['bad-hash', 'invalid'],
      params: { pin: key },
      mutation: 'accept-any-pin'
    })),
    mutations: {
      'accept-any-pin': mutation(
        'accept-any-pin',
        'the sha256 check never fires',
        "if (typeof p.sha256 !== 'string' || !SHA256.test(p.sha256))",
        'if (false)'
      )
    },
    async execute(ctx) {
      const doc = good('wordpress')
      doc.install.webroot = PINS[ctx.params.pin](doc.install.webroot)
      const r = await validate(ctx, doc, { assets: assetsOf(good('wordpress')) })
      return {
        control: await control(ctx),
        check: ok(!r.threw && r.value.some((p) => /sha256/.test(p)), JSON.stringify(r))
      }
    }
  },
  {
    item: 'tracy-setting.validate',
    assertion: 'tracy-setting.refuses-files-the-release-does-not-carry',
    area: 'machine',
    requirement:
      'A file named by the setting that is not among the release assets is a problem; so is a file replaced after the setting was cut (GitHub digest differs).',
    oracle: {
      source: ADR17,
      section: '§3',
      invariant: 'file names are checked against the real asset list before a quickstart is listed usable'
    },
    reads: ['apps/tracy-web/src/lib/tracy-setting.mjs'],
    variants: [
      {
        key: 'file-not-an-asset',
        tags: ['missing-asset', 'invalid'],
        params: { mode: 'missing' },
        mutation: 'skip-asset-list'
      },
      {
        key: 'asset-list-empty',
        tags: ['missing-asset', 'empty'],
        params: { mode: 'empty' },
        mutation: 'skip-asset-list'
      },
      {
        key: 'file-replaced-on-release',
        tags: ['bad-hash', 'mixed-version'],
        params: { mode: 'digest' },
        mutation: 'skip-digest'
      },
      {
        key: 'digest-matches',
        tags: ['happy', 'bad-hash'],
        params: { mode: 'digest-ok' },
        mutation: 'always-digest-problem'
      }
    ],
    mutations: {
      'skip-asset-list': mutation(
        'skip-asset-list',
        'the asset-list check never fires',
        'assets && !assets.includes(p.file)',
        'false'
      ),
      'skip-digest': mutation(
        'skip-digest',
        'the GitHub digest is never compared',
        'digests.get(p.file) !== p.sha256',
        'false'
      ),
      'always-digest-problem': mutation(
        'always-digest-problem',
        'every digest counts as different',
        'digests.get(p.file) !== p.sha256',
        'true'
      )
    },
    async execute(ctx) {
      const doc = good('joomla')
      const files = assetsOf(doc)
      const { mode } = ctx.params
      let r
      let expectProblem
      if (mode === 'missing') {
        r = await validate(ctx, doc, { assets: files.slice(1) })
        expectProblem = /is not an asset of this release/
      } else if (mode === 'empty') {
        r = await validate(ctx, doc, { assets: [] })
        expectProblem = /is not an asset of this release/
      } else {
        const digests = new Map(files.map((f) => [f, hex('a')]))
        if (mode === 'digest') digests.set(files[0], hex('f'))
        r = await validate(ctx, doc, { assets: files, digests })
        expectProblem = /GitHub reports/
      }
      const good_ =
        mode === 'digest-ok'
          ? !r.threw && r.value.length === 0
          : !r.threw && r.value.some((p) => expectProblem.test(p))
      return { control: await control(ctx), check: ok(good_, JSON.stringify(r)) }
    }
  },
  {
    item: 'tracy-setting.validate',
    assertion: 'tracy-setting.install-must-be-a-named-shape',
    area: 'machine',
    requirement:
      'A setting that declares half a shape, a shape of another CMS, or an unknown part is invalid, and says which shapes exist.',
    oracle: {
      source: ADR17,
      section: '§4',
      invariant:
        'PHP CMS: webroot+database | bundle | (Joomla only) installer; EmDash: source+state; half a shape is no shape'
    },
    reads: ['apps/tracy-web/src/lib/tracy-setting.mjs'],
    variants: Object.keys(SHAPES).map((key) => ({
      key,
      tags: ['mixed-version', 'invalid'],
      params: { shape: key },
      mutation: 'any-part-is-fine'
    })),
    mutations: {
      'any-part-is-fine': {
        id: 'any-part-is-fine',
        kind: 'product',
        describe: 'shape detection accepts any installed part and never reports a missing one',
        copy: WEB_COPY,
        files: [
          {
            path: PRODUCT.tracySetting,
            find: 'const shape = shapeOf(d.platform, d.install) ?? (shapes.length === 1 ? shapes[0] : null)',
            replace: 'const shape = Object.keys(d.install)'
          },
          {
            path: PRODUCT.tracySetting,
            find: 'if (shape === null) {',
            replace: 'if (shape === null && false) {'
          },
          { path: PRODUCT.tracySetting, find: 'if (!allowed.has(part))', replace: 'if (false)' }
        ]
      }
    },
    async execute(ctx) {
      const s = SHAPES[ctx.params.shape]
      const doc = good(s.platform)
      doc.install = s.install(doc)
      const r = await validate(ctx, doc, {})
      return {
        control: await control(ctx),
        check: ok(!r.threw && r.value.some((p) => s.expect.test(p)), JSON.stringify(r))
      }
    }
  },
  {
    item: 'tracy-setting.validate',
    assertion: 'tracy-setting.pins-carry-no-url',
    area: 'machine',
    requirement:
      'A pinned part must not carry a url: the address is built from tag and file name, so a setting cannot point a host elsewhere.',
    oracle: {
      source: ADR17,
      section: '§3',
      invariant:
        'install declares files with sha256 and no URL; the download address is composed from tag + file name'
    },
    reads: ['apps/tracy-web/src/lib/tracy-setting.mjs'],
    variants: [
      {
        key: 'part-with-url',
        tags: ['invalid', 'archive-path'],
        params: { url: 'https://evil.example/x.tgz' },
        mutation: 'ignore-url'
      },
      {
        key: 'part-with-file-url',
        tags: ['invalid', 'archive-path'],
        params: { url: 'file:///etc/passwd' },
        mutation: 'ignore-url'
      }
    ],
    mutations: {
      'ignore-url': mutation(
        'ignore-url',
        'a url on a part is not refused',
        'if (p.url !== undefined)',
        'if (false)'
      )
    },
    async execute(ctx) {
      const doc = good('joomla')
      doc.install.webroot.url = ctx.params.url
      const r = await validate(ctx, doc, { assets: assetsOf(doc) })
      return {
        control: await control(ctx),
        check: ok(!r.threw && r.value.some((p) => /\.url is not read/.test(p)), JSON.stringify(r))
      }
    }
  },
  {
    item: 'tracy-setting.validate',
    assertion: 'tracy-setting.version-boundaries',
    area: 'machine',
    requirement:
      'version must be x.y.z with an optional pre-release or build suffix; shorter, longer, prefixed or empty versions are problems.',
    oracle: {
      source:
        'apps/tracy-web/src/lib/tracy-setting.mjs ("version must be a version like 1.0.0"), docs/adr/0017 §2',
      invariant: 'version is a semantic version triple'
    },
    reads: ['apps/tracy-web/src/lib/tracy-setting.mjs'],
    variants: VERSIONS.map(([v, valid]) => ({
      key: `version-${v === '' ? 'empty' : v.replace(/[^0-9A-Za-z.-]/g, '_')}`,
      tags: ['boundary', valid ? 'happy' : 'invalid'],
      params: { version: v, valid },
      mutation: valid ? 'reject-all-versions' : 'accept-all-versions'
    })),
    mutations: {
      'accept-all-versions': mutation(
        'accept-all-versions',
        'the version test never fails',
        '!VERSION.test(d.version)',
        'false'
      ),
      'reject-all-versions': mutation(
        'reject-all-versions',
        'the version test always fails',
        '!VERSION.test(d.version)',
        'true'
      )
    },
    async execute(ctx) {
      const doc = good('wordpress')
      doc.version = ctx.params.version
      const r = await validate(ctx, doc, { assets: assetsOf(doc) })
      const problem = !r.threw && r.value.some((p) => /version must be/.test(p))
      // The control must not run through the code a mutant of this case breaks: a valid version's mutant rejects
      // everything, so its control is that a bad version IS rejected; an invalid version's control is a good one accepted.
      let ctl
      if (ctx.params.valid) {
        const bad = good('wordpress')
        bad.version = 'v1.0.0'
        const rb = await validate(ctx, bad, { assets: assetsOf(bad) })
        ctl = ok(!rb.threw && rb.value.some((p) => /version must be/.test(p)), JSON.stringify(rb))
      } else ctl = await control(ctx)
      return { control: ctl, check: ok(ctx.params.valid ? !r.threw && !problem : problem, JSON.stringify(r)) }
    }
  }
]
