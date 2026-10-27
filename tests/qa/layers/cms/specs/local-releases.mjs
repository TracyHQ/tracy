// Machine cases for `local-releases.js`: a pack that is not published yet is read through the same validator
// as a release, and its files are re-checked against their pins when the host asks for them.
// Oracle: ADR 0017 §10 (a local pack goes through the same validator, installs only from inside its folder,
// and its checksum is confirmed against the bytes as they are now).
import fs from 'node:fs/promises'
import path from 'node:path'
import { PRODUCT, WEB_COPY, load, observe, sha256Hex, withTempDir } from '../lib/helpers.mjs'

const ADR17 = 'docs/adr/0017-github-release-is-quickstart-source-of-truth.md'
const ok = (value, detail) => ({ ok: Boolean(value), detail })
const WEBROOT = Buffer.from('local pack webroot bytes')
const DB = Buffer.from('local pack database bytes')

const mutation = (id, describe, find, replace, file = PRODUCT.localReleases) => ({
  id,
  kind: 'product',
  describe,
  copy: WEB_COPY,
  files: [{ path: file, find, replace }]
})

/** A pack folder `<root>/qa-nova/wp7/` built from the producer's shape: two parts and a setting that pins them. */
async function makePack(root, { setting = null, skip = [], tamper = null, symlinkDb = false } = {}) {
  const dir = path.join(root, 'qa-nova', 'wp7')
  await fs.mkdir(dir, { recursive: true })
  const doc = setting ?? {
    schemaVersion: 'tracy-setting/v1',
    platform: 'wordpress',
    label: 'QA Nova',
    version: '1.0.0',
    cms: '7.1',
    install: {
      webroot: { file: 'qa-webroot.tar.gz', sha256: sha256Hex(WEBROOT) },
      database: { file: 'qa-db.sql.gz', sha256: sha256Hex(DB) }
    }
  }
  await fs.writeFile(path.join(dir, 'qa-webroot.tar.gz'), WEBROOT)
  if (symlinkDb) {
    const outside = path.join(root, 'outside-db.sql.gz')
    await fs.writeFile(outside, DB)
    await fs.symlink(outside, path.join(dir, 'qa-db.sql.gz'))
  } else await fs.writeFile(path.join(dir, 'qa-db.sql.gz'), DB)
  if (!skip.includes('setting')) await fs.writeFile(path.join(dir, 'tracy_setting.json'), JSON.stringify(doc))
  if (skip.includes('db')) await fs.rm(path.join(dir, 'qa-db.sql.gz'))
  if (tamper) await fs.appendFile(path.join(dir, tamper), 'X')
  return dir
}

async function readOne(ctx, root) {
  const mod = await load(ctx.root, PRODUCT.localReleases)
  const r = await observe(() => mod.readLocalPacks(root))
  return { threw: r.threw, pack: r.value?.[0] ?? null, count: r.value?.length ?? 0 }
}

const tmp = (ctx) => path.join(ctx.outDir, 'tmp')

async function packControl(ctx) {
  return withTempDir(tmp(ctx), async (root) => {
    await makePack(root)
    const r = await readOne(ctx, root)
    const names = (r.pack?.release.assets ?? []).map((a) => a.name)
    return ok(
      r.pack?.setting &&
        r.pack.reason === null &&
        r.pack.release.tag_name === 'local/qa-nova/wp7' &&
        names.includes('qa-db.sql.gz'),
      JSON.stringify({ threw: r.threw, reason: r.pack?.reason, tag: r.pack?.release.tag_name })
    )
  })
}

const READ = {
  'modified-after-pin': {
    opts: { tamper: 'qa-db.sql.gz' },
    expect: /hashes to/,
    mutation: 'skip-pack-sha',
    tags: ['bad-hash', 'invalid']
  },
  'wrong-pin': {
    opts: {
      setting: {
        schemaVersion: 'tracy-setting/v1',
        platform: 'wordpress',
        label: 'QA Nova',
        version: '1.0.0',
        cms: '7.1',
        install: {
          webroot: { file: 'qa-webroot.tar.gz', sha256: '0'.repeat(64) },
          database: { file: 'qa-db.sql.gz', sha256: sha256Hex(DB) }
        }
      }
    },
    expect: /hashes to/,
    mutation: 'skip-pack-sha',
    tags: ['bad-hash', 'invalid']
  },
  'missing-file': {
    opts: { skip: ['db'] },
    expect: /is not an asset of this release/,
    mutation: 'skip-asset-check',
    tags: ['missing-asset', 'invalid']
  },
  'symlinked-part': {
    opts: { symlinkDb: true },
    expect: /is not an asset of this release/,
    mutation: 'follow-symlinks',
    tags: ['archive-path', 'secret-scrub']
  },
  'no-setting-file': {
    opts: { skip: ['setting'] },
    expect: /No tracy_setting\.json/,
    mutation: 'assume-setting-file',
    tags: ['missing-contract', 'empty']
  }
}

const PART = {
  'parent-traversal': { file: '../secret.bin', tags: ['archive-path', 'invalid'] },
  'nested-name': { file: 'sub/qa-webroot.tar.gz', tags: ['archive-path', 'invalid'] },
  'absolute-name': { file: '/etc/hosts', tags: ['archive-path', 'invalid'] }
}

export const specs = [
  {
    item: 'local-releases.read',
    assertion: 'local-releases.pack-must-match-its-pins',
    area: 'machine',
    requirement:
      'A local pack whose files miss their pins, are absent, are symlinks, or lack tracy_setting.json is listed with a reason and has no usable setting.',
    oracle: {
      source: ADR17,
      section: '§10',
      invariant:
        'a pack is a release not yet cut, read through the same validator, and its checksum is confirmed against the bytes'
    },
    reads: ['apps/tracy-web/src/lib/local-releases.js'],
    variants: Object.entries(READ).map(([key, v]) => ({
      key,
      tags: v.tags,
      params: { key },
      mutation: v.mutation
    })),
    mutations: {
      'skip-pack-sha': mutation(
        'skip-pack-sha',
        'bytes are not hashed against the pin',
        'if (actual !== p.sha256)',
        'if (false)'
      ),
      'skip-asset-check': mutation(
        'skip-asset-check',
        'the asset list is not passed to the validator',
        'validateSetting(doc, { assets: files })',
        'validateSetting(doc, {})'
      ),
      'follow-symlinks': mutation(
        'follow-symlinks',
        'symlinks count as files of the pack',
        '.filter((e) => e.isFile())',
        '.filter((e) => e.isFile() || e.isSymbolicLink())'
      ),
      'assume-setting-file': mutation(
        'assume-setting-file',
        'the setting file is assumed present',
        "if (!files.includes('tracy_setting.json')) {",
        'if (false) {'
      )
    },
    async execute(ctx) {
      const row = READ[ctx.params.key]
      const check = await withTempDir(tmp(ctx), async (root) => {
        await makePack(root, row.opts)
        const r = await readOne(ctx, root)
        const refused =
          r.threw === null && r.pack && r.pack.setting === null && row.expect.test(r.pack.reason ?? '')
        return ok(
          refused,
          JSON.stringify({ threw: r.threw, setting: Boolean(r.pack?.setting), reason: r.pack?.reason })
        )
      })
      return { control: await packControl(ctx), check }
    }
  },
  {
    item: 'local-releases.install-part',
    assertion: 'local-releases.install-part-stays-inside-the-pack',
    area: 'machine',
    requirement:
      'A part whose file is not a plain file name of the pack, or whose bytes changed after the read, yields a pending sentence and no size.',
    oracle: {
      source: ADR17,
      section: '§10',
      invariant:
        'the host reads such an address only from under its own TRACY_LOCAL_RELEASES_DIR, with the checksum confirmed now'
    },
    reads: ['apps/tracy-web/src/lib/local-releases.js'],
    variants: [
      ...Object.entries(PART).map(([key, v]) => ({
        key,
        tags: v.tags,
        params: { kind: 'name', key },
        mutation: 'allow-any-name'
      })),
      {
        key: 'changed-after-read',
        tags: ['bad-hash', 'repeat'],
        params: { kind: 'changed' },
        mutation: 'skip-install-sha'
      }
    ],
    mutations: {
      'allow-any-name': mutation(
        'allow-any-name',
        'any file name is accepted',
        'if (path.basename(file.file) !== file.file || path.dirname(at) !== dir)',
        'if (false)'
      ),
      'skip-install-sha': mutation(
        'skip-install-sha',
        'the checksum is not confirmed at install time',
        'if (actual !== file.sha256)',
        'if (false)'
      )
    },
    async execute(ctx) {
      const mod = await load(ctx.root, PRODUCT.localReleases)
      return withTempDir(tmp(ctx), async (root) => {
        const dir = await makePack(root)
        // A file with the right bytes sits outside the pack, so a traversal that is followed would "verify".
        await fs.writeFile(path.join(root, 'qa-nova', 'secret.bin'), WEBROOT)
        await fs.mkdir(path.join(dir, 'sub'), { recursive: true })
        await fs.writeFile(path.join(dir, 'sub', 'qa-webroot.tar.gz'), WEBROOT)
        const pin = sha256Hex(WEBROOT)
        const good = await observe(() =>
          mod.localInstallPart(dir, { file: 'qa-webroot.tar.gz', sha256: pin })
        )
        const controlOk = good.value?.bytes === WEBROOT.length && !good.value.pending
        let file = 'qa-webroot.tar.gz'
        if (ctx.params.kind === 'name') file = PART[ctx.params.key].file
        else await fs.appendFile(path.join(dir, 'qa-webroot.tar.gz'), 'tampered')
        const bad = await observe(() => mod.localInstallPart(dir, { file, sha256: pin }))
        const v = bad.value
        const expected =
          ctx.params.kind === 'name' ? /not a file name of this pack/ : /changed after the pack was read/
        return {
          control: ok(controlOk, JSON.stringify(good)),
          check: ok(
            bad.threw === null && v?.bytes === null && expected.test(v.pending ?? ''),
            JSON.stringify(bad)
          )
        }
      })
    }
  }
]
