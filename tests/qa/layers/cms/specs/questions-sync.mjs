// Machine cases for (1) the three-tier Site questions lookup and (2) what Tracy keeps when GitHub cannot be read.
// Oracle for (1): CLAUDE.md §1 "One questionnaire for the customer" (three tiers: the quickstart's own set -> the CMS
// default chosen in /ops -> the CMS standard file) and ADR 0017 §5-§6. Oracle for (2): ADR 0017 Consequences and §3/§7.
// Stub pools stand in for PostgreSQL, so SQL itself is NOT verified here.
import path from 'node:path'
import { PRODUCT, WEB_COPY, load, memoryPool, observe, releasesGithub, sha256Hex } from '../lib/helpers.mjs'

const ADR17 = 'docs/adr/0017-github-release-is-quickstart-source-of-truth.md'
const ok = (value, detail) => ({ ok: Boolean(value), detail })
const mutation = (id, describe, file, find, replace) => ({
  id,
  kind: 'product',
  describe,
  copy: WEB_COPY,
  files: [{ path: file, find, replace }]
})

const doc = (owner, id) => ({
  schemaVersion: 'tracy-questions/v1',
  owner,
  languages: ['en'],
  questions: [{ id, kind: 'text', step: 1, label: { en: id }, feeds: ['agent'] }]
})

/** Rows per owner, the default the administrator chose for the CMS, and the per-owner choice rows. */
function pool({ sets = {}, defaultSource = null, chosen = {} }) {
  return {
    query: async (sql, params = []) => {
      const text = sql.replace(/\s+/g, ' ')
      if (text.includes('from question_set where owner'))
        return {
          rows: (sets[params[0]] ?? []).map((r, i) => ({
            revision: 1,
            id: `${params[0]}#${i}`,
            owner: params[0],
            source: 'released',
            version: '1.0.0',
            ...r
          }))
        }
      if (text.includes('from question_choice where owner'))
        return { rows: chosen[params[0]] ? [{ set_id: chosen[params[0]], revision: 1 }] : [] }
      if (text.includes('build_questions'))
        return {
          rows: defaultSource ? [{ source: defaultSource, revision: 2, updated_by: 'ops@qa.test' }] : []
        }
      return { rows: [] }
    }
  }
}

const QS = 'qa-own/emdash'
const OTHER = 'qa-other/emdash'
// D11 (CLAUDE.md §1, since 07/10/2026): the door always serves the CMS standard file; a quickstart's own set and the
// CMS default chosen in /ops stay in the database but are not read. Each variant offers one of those rows.
const STANDARD_WANT = { source: 'standard', owner: 'emdash', first: 'name' }
const TIERS = {
  'quickstart-own-set-not-served': {
    tags: ['happy'],
    args: {
      quickstart: QS,
      pool: () =>
        pool({
          sets: {
            [QS]: [{ name: 'Released', doc: doc(QS, 'own-q') }],
            [OTHER]: [{ name: 'R', doc: doc(OTHER, 'default-q') }]
          },
          defaultSource: OTHER
        })
    },
    want: STANDARD_WANT,
    mutation: 'quickstart-labelled'
  },
  'quickstart-admin-chose-standard': {
    tags: ['happy', 'repeat'],
    args: {
      quickstart: QS,
      pool: () =>
        pool({
          sets: {
            [QS]: [{ name: 'Released', doc: doc(QS, 'own-q') }],
            [OTHER]: [{ name: 'R', doc: doc(OTHER, 'default-q') }]
          },
          defaultSource: OTHER,
          chosen: { [QS]: 'emdash@standard' }
        })
    },
    want: STANDARD_WANT,
    mutation: 'quickstart-labelled'
  },
  'cms-default-not-served-without-quickstart': {
    tags: ['happy'],
    args: {
      quickstart: null,
      pool: () =>
        pool({ sets: { [OTHER]: [{ name: 'R', doc: doc(OTHER, 'default-q') }] }, defaultSource: OTHER })
    },
    want: STANDARD_WANT,
    mutation: 'owner-lost'
  },
  'vanished-default-falls-to-standard': {
    tags: ['dependency-failure', 'missing-contract'],
    args: { quickstart: null, pool: () => pool({ defaultSource: 'gone/emdash' }) },
    want: STANDARD_WANT,
    mutation: 'owner-lost'
  },
  'standard-when-nothing-is-chosen': {
    tags: ['empty', 'happy'],
    args: { quickstart: null, pool: () => pool({}) },
    want: STANDARD_WANT,
    mutation: 'owner-lost'
  },
  'cms-default-not-served-for-a-quickstart': {
    tags: ['happy', 'missing-contract'],
    args: {
      quickstart: QS,
      pool: () =>
        pool({ sets: { [OTHER]: [{ name: 'R', doc: doc(OTHER, 'default-q') }] }, defaultSource: OTHER })
    },
    want: STANDARD_WANT,
    mutation: 'quickstart-labelled'
  }
}

const bq = (id, describe, find, replace) => mutation(id, describe, PRODUCT.buildQuestions, find, replace)

const READINGS_FILES = {
  'tracy-business-emdash-quickstart-1.0.0.zip': 'zip bytes',
  'tracy-business-emdash-state-1.0.0.tar.gz': 'tar bytes'
}
const setting = (over = {}) => ({
  schemaVersion: 'tracy-setting/v1',
  platform: 'emdash',
  label: 'Tracy Business',
  version: '1.0.0',
  cms: '0.37.0',
  install: {
    source: { file: 'tracy-business-emdash-quickstart-1.0.0.zip', sha256: 'a'.repeat(64) },
    state: { file: 'tracy-business-emdash-state-1.0.0.tar.gz', sha256: 'b'.repeat(64) }
  },
  ...over
})
const TAG = 'tracy-business/emdash-0.x'
const goodRelease = () => ({ tag: TAG, files: { ...READINGS_FILES, 'tracy_setting.json': setting() } })

const qr = (id, describe, find, replace) => mutation(id, describe, PRODUCT.quickstartReleases, find, replace)

async function syncOnce(ctx, releases, opts = {}) {
  const mod = await load(ctx.root, PRODUCT.quickstartReleases)
  const p = memoryPool()
  const gh = releasesGithub(releases, opts)
  const result = await observe(() => mod.syncReleases(p, { token: 't', fetchImpl: gh.fetchImpl }))
  const read = await observe(() => mod.readReleases(p))
  return { mod, p, gh, result, read: read.value ?? [], readThrew: read.threw }
}

const SYNC = {
  'github-502-keeps-last-reading': {
    tags: ['dependency-failure', 'repeat'],
    mutation: 'failed-read-reports-ok',
    async run(ctx) {
      const first = await syncOnce(ctx, [goodRelease()])
      const failing = releasesGithub([goodRelease()], { status: 502 })
      const again = await observe(() =>
        first.mod.syncReleases(first.p, { token: 't', fetchImpl: failing.fetchImpl })
      )
      const after = await first.mod.readReleases(first.p)
      const v = again.value
      return ok(
        again.threw === null &&
          v?.ok === false &&
          /502/.test(v.reason ?? '') &&
          after.length === 1 &&
          after[0].tag === TAG &&
          after[0].choosable,
        JSON.stringify({ threw: again.threw, result: v, kept: after.map((r) => r.tag) })
      )
    }
  },
  'second-page-fails-nothing-is-written': {
    tags: ['dependency-failure', 'partial-write'],
    mutation: 'partial-pages-are-kept',
    async run(ctx) {
      const hundred = Array.from({ length: 100 }, (_, i) => ({ tag: `qa/page-one-${i}/j6`, files: {} }))
      const r = await syncOnce(ctx, hundred, { failAfter: 1 })
      return ok(
        r.result.threw === null && r.result.value?.ok === false && r.p.rows.quickstart_releases.size === 0,
        JSON.stringify({
          threw: r.result.threw,
          result: r.result.value,
          rows: r.p.rows.quickstart_releases.size
        })
      )
    }
  },
  'release-without-setting-is-listed-with-a-reason': {
    tags: ['missing-contract', 'empty'],
    mutation: 'hide-settingless-releases',
    async run(ctx) {
      const r = await syncOnce(ctx, [{ tag: 'quickstart/qa-bare/j6', files: { 'qa-bare.zip': 'zip' } }])
      const row = r.read.find((x) => x.tag === 'quickstart/qa-bare/j6')
      return ok(
        row && row.choosable === false && typeof row.reason === 'string' && row.reason !== '',
        JSON.stringify({ row: row && { choosable: row.choosable, reason: row.reason } })
      )
    }
  },
  'setting-naming-a-file-the-release-lacks-is-not-choosable': {
    tags: ['missing-asset', 'invalid'],
    mutation: 'skip-asset-list-on-sync',
    async run(ctx) {
      const files = {
        'tracy_setting.json': setting(),
        'tracy-business-emdash-quickstart-1.0.0.zip': 'zip bytes'
      }
      const r = await syncOnce(ctx, [{ tag: TAG, files }])
      const row = r.read.find((x) => x.tag === TAG)
      return ok(
        row && row.choosable === false && /is not an asset of this release/.test(row.reason ?? ''),
        JSON.stringify({ row: row && { choosable: row.choosable, reason: row.reason } })
      )
    }
  },
  'asset-replaced-after-the-setting-was-cut': {
    tags: ['bad-hash', 'mixed-version'],
    mutation: 'skip-digest-on-sync',
    async run(ctx) {
      const bytes = 'replaced bytes'
      const pinned = setting({
        install: {
          source: { file: 'tracy-business-emdash-quickstart-1.0.0.zip', sha256: sha256Hex('original') },
          state: { file: 'tracy-business-emdash-state-1.0.0.tar.gz', sha256: 'b'.repeat(64) }
        }
      })
      const files = { ...READINGS_FILES, 'tracy_setting.json': pinned }
      const mod = await load(ctx.root, PRODUCT.quickstartReleases)
      const p = memoryPool()
      const gh = releasesGithub([{ tag: TAG, files }])
      // GitHub states each asset's own sha256: wrap the listing so the zip's digest is that of the replaced bytes.
      const wrapped = async (url, init) => {
        const res = await gh.fetchImpl(url, init)
        if (!String(url).includes('/releases?')) return res
        const list = await res.json()
        for (const r of list)
          for (const a of r.assets) if (a.name.endsWith('.zip')) a.digest = `sha256:${sha256Hex(bytes)}`
        return new Response(JSON.stringify(list), { status: 200 })
      }
      await observe(() => mod.syncReleases(p, { token: 't', fetchImpl: wrapped }))
      const row = (await mod.readReleases(p)).find((x) => x.tag === TAG)
      return ok(
        row && row.choosable === false && /GitHub reports/.test(row.reason ?? ''),
        JSON.stringify({ row: row && { choosable: row.choosable, reason: row.reason } })
      )
    }
  }
}

export const specs = [
  {
    item: 'build-questions.resolveQuestions',
    assertion: 'questions.standard-always-served',
    area: 'machine',
    requirement:
      'Since D11 every site is asked the CMS standard file shipped in the image, whatever own set, chosen standard or /ops default the database holds; those rows are kept but not read.',
    oracle: {
      source: 'CLAUDE.md §1 (One questionnaire for the customer, D11 #1013)',
      section: 'Since 07/10/2026 (D11, #1013)',
      invariant: 'the door always serves the CMS standard file; own sets and the /ops default are not read'
    },
    reads: [
      'apps/tracy-web/src/lib/build-questions.js',
      'apps/tracy-web/src/lib/question-sets.js',
      'apps/tracy-web/src/questions/emdash.json'
    ],
    variants: Object.entries(TIERS).map(([key, v]) => ({
      key,
      tags: v.tags,
      params: { key },
      mutation: v.mutation
    })),
    mutations: {
      'quickstart-labelled': bq(
        'quickstart-labelled',
        'a named quickstart is answered as if its own set were served',
        "    source: 'standard',",
        "    source: quickstart ? 'quickstart' : 'standard',"
      ),
      'owner-lost': bq(
        'owner-lost',
        'without a quickstart the answer no longer names the CMS it came from',
        '    owner: platform,',
        '    owner: quickstart ?? null,'
      )
    },
    async execute(ctx) {
      const mod = await load(ctx.root, PRODUCT.buildQuestions)
      const standard = mod.loadStandardQuestions(path.join(ctx.root, 'apps/tracy-web/src/questions/'))
      const row = TIERS[ctx.params.key]
      const run = async (args) =>
        observe(() => mod.resolveQuestions({ platform: 'emdash', lang: 'en', standard, ...args }))
      // The control is a variant this case's mutant leaves alone: one without a quickstart for a case that names one,
      // and the reverse.
      const control =
        TIERS[row.args.quickstart ? 'standard-when-nothing-is-chosen' : 'quickstart-own-set-not-served']
      const c = await run({ quickstart: control.args.quickstart, pool: control.args.pool() })
      const cv = c.value
      const got = await run({ quickstart: row.args.quickstart, pool: row.args.pool() })
      const v = got.value
      const summary = { threw: got.threw, source: v?.source, owner: v?.owner, first: v?.questions?.[0]?.id }
      return {
        control: ok(
          cv?.source === control.want.source && cv.questions[0].id === control.want.first,
          JSON.stringify({ threw: c.threw, source: cv?.source })
        ),
        check: ok(
          got.threw === null &&
            v.source === row.want.source &&
            v.owner === row.want.owner &&
            v.questions[0].id === row.want.first,
          JSON.stringify({ got: summary, want: row.want })
        )
      }
    }
  },
  {
    item: 'quickstart-releases.sync',
    assertion: 'quickstart-releases.sync-keeps-what-it-can-trust',
    area: 'machine',
    requirement:
      'When GitHub cannot be read, the last reading stays and nothing partial is written; a release with no or bad setting is still listed, with a reason, and is not choosable.',
    oracle: {
      source: ADR17,
      section: 'Consequences (GitHub going down does not take Tracy down), §3, §7',
      invariant:
        'cached reading survives a failed refresh; each file name is checked against the real asset list; unreadable releases are listed with a sentence'
    },
    reads: ['apps/tracy-web/src/lib/quickstart-releases.js'],
    variants: Object.entries(SYNC).map(([key, v]) => ({
      key,
      tags: v.tags,
      params: { key },
      mutation: v.mutation
    })),
    mutations: {
      'failed-read-reports-ok': qr(
        'failed-read-reports-ok',
        'a failed GitHub read is reported as success with nothing read',
        'return { ok: false, reason: e instanceof Error ? e.message : String(e) }',
        'readings = []'
      ),
      'partial-pages-are-kept': qr(
        'partial-pages-are-kept',
        'a failing page ends the listing instead of failing the read',
        '`${API}/repos/${repo}/releases?per_page=100&page=${page}`, token)',
        '`${API}/repos/${repo}/releases?per_page=100&page=${page}`, token).catch(() => [])'
      ),
      'hide-settingless-releases': qr(
        'hide-settingless-releases',
        'a release without a setting is dropped from the list',
        'readings.push({ reading: readingOf(release, setting, reason, { inspiration, cardReason }), questions })',
        'if (setting) readings.push({ reading: readingOf(release, setting, reason, { inspiration, cardReason }), questions })'
      ),
      'skip-asset-list-on-sync': qr(
        'skip-asset-list-on-sync',
        'the real asset list is not given to the validator',
        'assets: assets.map((a) => a.name),',
        'assets: undefined,'
      ),
      'skip-digest-on-sync': qr(
        'skip-digest-on-sync',
        "GitHub's digests are not given to the validator",
        'digests: digestsOf(assets)',
        'digests: undefined'
      )
    },
    async execute(ctx) {
      const row = SYNC[ctx.params.key]
      const control = await syncOnce(ctx, [goodRelease()])
      const c = control.read.find((x) => x.tag === TAG)
      return {
        control: ok(
          control.result.value?.ok === true && c?.choosable === true,
          JSON.stringify({ result: control.result.value, choosable: c?.choosable, reason: c?.reason })
        ),
        check: await row.run(ctx)
      }
    }
  }
]
