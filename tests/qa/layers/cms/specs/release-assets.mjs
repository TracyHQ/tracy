// Machine cases for `release-assets.js`: the code that turns "a release says this file has this hash"
// into bytes a host will unpack. Oracle: ADR 0017 §3 (the pin is checked when the file is fetched,
// and a name the release does not carry is refused) and the module header ("the checksum is not optional").
import { PRODUCT, WEB_COPY, load, observe, scriptedGithub, sha256Hex } from '../lib/helpers.mjs'

const ADR17 = 'docs/adr/0017-github-release-is-quickstart-source-of-truth.md'
const GOOD = Buffer.from('QA quickstart archive bytes: webroot v1')
const FILE = 'qa-webroot-1.0.0.tar.gz'
const TAG = 'quickstart/qa-nova/j6'
const ok = (value, detail) => ({ ok: Boolean(value), detail })

const releaseAssetsMutation = (id, describe, find, replace) => ({
  id,
  kind: 'product',
  describe,
  copy: WEB_COPY,
  files: [{ path: PRODUCT.releaseAssets, find, replace }]
})

async function download(ctx, spec, pin, file = FILE) {
  const mod = await load(ctx.root, PRODUCT.releaseAssets)
  const gh = scriptedGithub({ tag: TAG, ...spec })
  const call = await observe(() =>
    mod.downloadReleaseAsset(gh.fetchImpl, { tag: TAG, file, sha256: pin, token: 't' })
  )
  return { call, gh }
}

/** Positive control shared by the download cases: the right bytes with the right pin come through intact. */
async function control(ctx) {
  const { call } = await download(ctx, { files: { [FILE]: GOOD } }, sha256Hex(GOOD))
  const v = call.value
  return ok(
    v?.bytes && Buffer.compare(v.bytes, GOOD) === 0 && v.reason === null,
    JSON.stringify({ threw: call.threw, reason: v?.reason })
  )
}

const flip = (buf) => {
  const copy = Buffer.from(buf)
  copy[copy.length >> 1] ^= 0xff
  return copy
}
const BAD_BYTES = {
  'modified-byte': () => flip(GOOD),
  truncated: () => GOOD.subarray(0, GOOD.length - 1),
  extended: () => Buffer.concat([GOOD, Buffer.from('\n')]),
  'error-page-200': () => Buffer.from('<html><body>502 Bad Gateway</body></html>'),
  'empty-body': () => Buffer.alloc(0),
  'other-file': () => Buffer.from('a different quickstart entirely')
}

export const specs = [
  {
    item: 'release-assets.download',
    assertion: 'release-assets.refuses-bytes-that-miss-the-pin',
    area: 'machine',
    requirement:
      'A fetched asset whose bytes do not hash to the pin the release declared is never handed on.',
    oracle: {
      source: ADR17,
      section: '§3 and Consequences',
      invariant:
        'sha256 pin in tracy_setting.json is checked when the file is fetched; mismatching bytes are refused with a sentence'
    },
    reads: ['apps/tracy-web/src/lib/release-assets.js'],
    variants: Object.keys(BAD_BYTES).map((key) => ({
      key,
      tags: ['bad-hash', 'invalid'],
      params: { bytes: key },
      mutation: 'skip-sha-compare'
    })),
    mutations: {
      'skip-sha-compare': releaseAssetsMutation(
        'skip-sha-compare',
        'the checksum comparison can never be true',
        'got !== sha256',
        "got === 'never'"
      )
    },
    async execute(ctx) {
      const served = BAD_BYTES[ctx.params.bytes]()
      const { call } = await download(ctx, { files: { [FILE]: served } }, sha256Hex(GOOD))
      const v = call.value
      const refused = call.threw === null && v?.bytes === null && /checksum/i.test(v.reason ?? '')
      return {
        control: await control(ctx),
        check: ok(
          refused,
          JSON.stringify({ threw: call.threw, gotBytes: Boolean(v?.bytes), reason: v?.reason })
        )
      }
    }
  },
  {
    item: 'release-assets.download',
    assertion: 'release-assets.refuses-a-name-the-release-lacks',
    area: 'machine',
    requirement:
      'Asking for a file the release does not carry yields no bytes and a sentence naming the file.',
    oracle: {
      source: ADR17,
      section: '§3',
      invariant:
        "each file name is checked against the release's real asset list; a name it does not carry is refused"
    },
    reads: ['apps/tracy-web/src/lib/release-assets.js'],
    variants: [
      {
        key: 'absent-file',
        tags: ['missing-asset', 'invalid'],
        params: { files: 'other' },
        mutation: 'serve-first-asset'
      },
      {
        key: 'only-other-asset',
        tags: ['missing-asset', 'boundary'],
        params: { files: 'near-name' },
        mutation: 'serve-first-asset'
      },
      {
        key: 'empty-asset-list',
        tags: ['missing-asset', 'empty'],
        params: { files: 'none' },
        mutation: 'drop-guard'
      },
      {
        key: 'assets-field-missing',
        tags: ['missing-asset', 'invalid'],
        params: { files: 'nofield' },
        mutation: 'drop-guard'
      }
    ],
    mutations: {
      'serve-first-asset': releaseAssetsMutation(
        'serve-first-asset',
        'fall back to the first asset when the name is not found',
        '.find((a) => a.name === file)',
        '.find((a) => a.name === file) ?? (release.assets ?? [])[0]'
      ),
      'drop-guard': releaseAssetsMutation(
        'drop-guard',
        'the missing-asset guard never fires',
        'if (!asset) return { bytes: null',
        'if (false) return { bytes: null'
      )
    },
    async execute(ctx) {
      const shapes = {
        other: { files: { 'unrelated.zip': GOOD } },
        'near-name': { files: { [`${FILE}.sig`]: GOOD, [FILE.toUpperCase()]: GOOD } },
        none: { files: {} },
        nofield: { files: {}, assetsField: false }
      }
      const { call } = await download(ctx, shapes[ctx.params.files], sha256Hex(GOOD))
      const v = call.value
      const refused =
        call.threw === null && v?.bytes === null && v.reason.includes(FILE) && /no asset/i.test(v.reason)
      return {
        control: await control(ctx),
        check: ok(
          refused,
          JSON.stringify({ threw: call.threw, gotBytes: Boolean(v?.bytes), reason: v?.reason })
        )
      }
    }
  },
  {
    item: 'release-assets.download',
    assertion: 'release-assets.reports-github-failures-as-sentences',
    area: 'machine',
    requirement:
      'When GitHub cannot answer, the download returns no bytes and a sentence naming the status; it never throws or returns an error body as an archive.',
    oracle: {
      source: ADR17,
      section: 'Consequences: GitHub going down does not take Tracy down',
      invariant:
        'a failed read is a reason an administrator can act on, not a stack trace and not unverified bytes'
    },
    reads: ['apps/tracy-web/src/lib/release-assets.js'],
    variants: [
      ...[500, 401, 403, 429, 503].map((status) => ({
        key: `release-lookup-${status}`,
        tags: ['dependency-failure', 'invalid'],
        params: { stage: 'release', status },
        mutation: 'all-errors-mean-missing'
      })),
      {
        key: 'release-lookup-404',
        tags: ['dependency-failure', 'missing-asset'],
        params: { stage: 'release', status: 404 },
        mutation: 'drop-404-branch'
      },
      ...[500, 404].map((status) => ({
        key: `asset-download-${status}`,
        tags: ['dependency-failure', 'invalid'],
        params: { stage: 'asset', status },
        mutation: 'ignore-download-status'
      }))
    ],
    mutations: {
      'all-errors-mean-missing': releaseAssetsMutation(
        'all-errors-mean-missing',
        'every release-lookup error is reported as "no such release"',
        'if (response.status === 404)',
        'if (response.status >= 400)'
      ),
      'drop-404-branch': releaseAssetsMutation(
        'drop-404-branch',
        'a missing release is reported as a generic GitHub status',
        'if (response.status === 404)',
        'if (false)'
      ),
      'ignore-download-status': releaseAssetsMutation(
        'ignore-download-status',
        'the asset download status is not looked at',
        'if (!response.ok) return { bytes: null, reason: `GitHub answered ${response.status} downloading ${file}.` }',
        'if (false) return { bytes: null, reason: `GitHub answered ${response.status} downloading ${file}.` }'
      )
    },
    async execute(ctx) {
      const { stage, status } = ctx.params
      const spec = {
        files: { [FILE]: GOOD },
        ...(stage === 'release' ? { releaseStatus: status } : { assetStatus: status })
      }
      const { call } = await download(ctx, spec, sha256Hex(GOOD))
      const v = call.value
      const words =
        stage === 'release' && status === 404 ? /no release tagged/i : new RegExp(`GitHub answered ${status}`)
      const good = call.threw === null && v?.bytes === null && words.test(v.reason ?? '')
      return {
        control: await control(ctx),
        check: ok(good, JSON.stringify({ threw: call.threw, gotBytes: Boolean(v?.bytes), reason: v?.reason }))
      }
    }
  },
  {
    item: 'release-assets.upload',
    assertion: 'release-assets.upload-is-delete-then-upload',
    area: 'machine',
    requirement:
      'Re-uploading a file name already on a release removes the old asset first and says it replaced one; a refused upload is a sentence, not a success.',
    oracle: {
      source: 'apps/tracy-web/src/lib/release-assets.js (module header, owner Tracy web)',
      section: 'GITHUB DOES NOT REPLACE AN ASSET, IT REFUSES ONE',
      invariant:
        'upload over an existing name = DELETE then POST, result.replaced === true; a 422 from GitHub is ok:false with a reason'
    },
    reads: ['apps/tracy-web/src/lib/release-assets.js'],
    variants: [
      {
        key: 'existing-name',
        tags: ['repeat', 'happy'],
        params: { existing: true, uploadStatus: 201 },
        mutation: 'skip-delete'
      },
      {
        key: 'new-name',
        tags: ['happy'],
        params: { existing: false, uploadStatus: 201 },
        mutation: 'always-replaced'
      },
      {
        key: 'github-422',
        tags: ['dependency-failure', 'invalid'],
        params: { existing: false, uploadStatus: 422 },
        mutation: 'ignore-upload-status'
      }
    ],
    mutations: {
      'skip-delete': releaseAssetsMutation(
        'skip-delete',
        'the old asset is not removed before uploading',
        'if (existing) {\n    const failed = await removeAsset(fetchImpl, repo, existing.id, token)\n    if (failed) return { ok: false, reason: failed }\n  }\n\n  const response',
        'const response'
      ),
      'always-replaced': releaseAssetsMutation(
        'always-replaced',
        'replaced is always true',
        'replaced: Boolean(existing)',
        'replaced: true'
      ),
      'ignore-upload-status': releaseAssetsMutation(
        'ignore-upload-status',
        'a refused upload is treated as accepted',
        'if (!response.ok)\n    return {\n      ok: false,\n      reason: `GitHub answered ${response.status} attaching',
        'if (false)\n    return {\n      ok: false,\n      reason: `GitHub answered ${response.status} attaching'
      )
    },
    async execute(ctx) {
      const mod = await load(ctx.root, PRODUCT.releaseAssets)
      const run = async (existing, uploadStatus) => {
        const gh = scriptedGithub({ tag: TAG, files: existing ? { 'card.json': '{}' } : {}, uploadStatus })
        const call = await observe(() =>
          mod.uploadReleaseAsset(
            { github: null, releasesToken: 't' },
            { tag: TAG, name: 'card.json', body: '{"a":1}' },
            { fetchImpl: gh.fetchImpl }
          )
        )
        return { call, methods: gh.calls.map((c) => c.method) }
      }
      // Control on the path this case's mutant leaves alone: the new-name case is controlled by a replace.
      const base =
        ctx.params.existing === false && ctx.params.uploadStatus === 201
          ? await run(true, 201)
          : await run(false, 201)
      const controlOk =
        base.call.value?.ok === true &&
        base.call.value.replaced === (ctx.params.existing === false && ctx.params.uploadStatus === 201)
      const { existing, uploadStatus } = ctx.params
      const got = await run(existing, uploadStatus)
      const v = got.call.value
      let good
      if (uploadStatus !== 201)
        good = got.call.threw === null && v?.ok === false && /422/.test(v.reason ?? '')
      else if (existing)
        good =
          v?.ok === true &&
          v.replaced === true &&
          got.methods.indexOf('DELETE') !== -1 &&
          got.methods.indexOf('DELETE') < got.methods.indexOf('POST')
      else good = v?.ok === true && v.replaced === false && !got.methods.includes('DELETE')
      return {
        control: ok(controlOk, JSON.stringify(base.call.value)),
        check: ok(good, JSON.stringify({ threw: got.call.threw, result: v, methods: got.methods }))
      }
    }
  },
  {
    item: 'release-assets.delete',
    assertion: 'release-assets.delete-of-absent-asset-is-not-a-failure',
    area: 'machine',
    requirement:
      'Deleting an asset that is not on the release succeeds with deleted:false, and issues no DELETE.',
    oracle: {
      source: 'apps/tracy-web/src/lib/release-assets.js (deleteReleaseAsset contract, owner Tracy web)',
      section: 'deleteReleaseAsset doc comment',
      invariant: 'deleted:false means it was not there, which is the end state asked for'
    },
    reads: ['apps/tracy-web/src/lib/release-assets.js'],
    variants: [
      {
        key: 'absent-asset',
        tags: ['empty', 'repeat', 'cleanup'],
        params: {},
        mutation: 'delete-always-reports-deleted'
      }
    ],
    mutations: {
      'delete-always-reports-deleted': releaseAssetsMutation(
        'delete-always-reports-deleted',
        'an absent asset is reported as deleted',
        'if (!existing) return { ok: true, deleted: false }',
        'if (!existing) return { ok: true, deleted: true }'
      )
    },
    async execute(ctx) {
      const mod = await load(ctx.root, PRODUCT.releaseAssets)
      const del = async (files) => {
        const gh = scriptedGithub({ tag: TAG, files })
        const call = await observe(() =>
          mod.deleteReleaseAsset(
            { github: null, releasesToken: 't' },
            { tag: TAG, name: 'card.json' },
            { fetchImpl: gh.fetchImpl }
          )
        )
        return { call, methods: gh.calls.map((c) => c.method) }
      }
      const present = await del({ 'card.json': '{}' })
      const absent = await del({})
      return {
        control: ok(
          present.call.value?.ok === true &&
            present.call.value.deleted === true &&
            present.methods.includes('DELETE'),
          JSON.stringify(present.call.value)
        ),
        check: ok(
          absent.call.value?.ok === true &&
            absent.call.value.deleted === false &&
            !absent.methods.includes('DELETE'),
          JSON.stringify({ result: absent.call.value, methods: absent.methods, threw: absent.call.threw })
        )
      }
    }
  },
  {
    item: 'release-assets.download',
    assertion: 'pending.release-assets.empty-pin-is-unverified',
    area: 'machine',
    requirement: 'downloadReleaseAsset skips the checksum when the pin is an empty string or missing.',
    oracle: {
      source: ADR17,
      section: '§3 plus module header "THE CHECKSUM IS NOT OPTIONAL HERE"',
      invariant:
        'every part that reaches a host is pinned; the only caller (ops/demos.js) passes a pin that validateSetting already required to be 64 hex'
    },
    reads: ['apps/tracy-web/src/lib/release-assets.js', 'apps/tracy-web/src/ops/demos.js'],
    variants: [{ key: 'empty-pin', tags: ['empty', 'boundary'], params: {}, mutation: null }],
    mutations: {},
    pending:
      'caller precondition holds (validateSetting rejects a shape part without a 64-hex sha256), so the function-level leniency is not reachable from the one caller; whether the function itself must refuse an empty pin has no ruling in an ADR. Recorded, not judged.'
  }
]
