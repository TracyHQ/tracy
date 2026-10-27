// Machine cases for `contracts.js` (which contract seals a quickstart, and which Claude Cowork plugin floor it needs).
// Oracle: ADR 0017 §9 (a manifest says which quickstart it seals; the index is built from that; a profile that
// cannot say what it seals fails closed; an unsealed non-template quickstart is refused), ADR 0022 (the contract
// recommends, it does not lock) and the dated rulings written in contracts.js by the repo owners.
import fs from 'node:fs/promises'
import path from 'node:path'
import { PRODUCT, WEB_COPY, load, observe, withTempDir } from '../lib/helpers.mjs'

const ADR17 = 'docs/adr/0017-github-release-is-quickstart-source-of-truth.md'
const ok = (value, detail) => ({ ok: Boolean(value), detail })
const mutation = (id, describe, find, replace) => ({
  id,
  kind: 'product',
  describe,
  copy: WEB_COPY,
  files: [{ path: PRODUCT.contracts, find, replace }]
})
const tmp = (ctx) => path.join(ctx.outDir, 'tmp')

async function writeManifest(root, rel, manifest) {
  const dir = path.join(root, rel)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest))
}
const profile = (release, version, extra = {}) => ({
  id: `${release}/${version}`,
  platform: 'joomla',
  quickstart: { release, version },
  ...extra
})

/** A hand-built index: insertion order is part of the scenario (a "first found wins" bug shows only in some orders). */
const indexOf = (...keys) =>
  new Map(
    keys.map((k) => [
      k,
      { id: `id:${k}`, dir: '/x', platform: 'joomla', coworkMinVersion: null, mode: null, design: null }
    ])
  )

const FLOOR_KEYS = ['coworkContractVersion', 'receiverVersion', 'coworkMinVersion', 'receiverFloor']

const FAIL_CLOSED = {
  'profile-names-no-quickstart': {
    tags: ['missing-contract', 'invalid'],
    mutation: 'swallow-unnamed-profile',
    build: async (root) => {
      await writeManifest(root, 'a/1', { id: 'a', platform: 'joomla', quickstart: {} })
    },
    expect: /names no quickstart it seals/
  },
  'quickstart-claimed-twice': {
    tags: ['duplicate', 'mixed-version'],
    mutation: 'swallow-double-claim',
    build: async (root) => {
      await writeManifest(root, 'a/1', profile('t/j6', '1.0.0'))
      await writeManifest(root, 'b/1', { ...profile('t/j6', '1.0.0'), id: 'different-id' })
    },
    expect: /is claimed twice/
  }
}

const SEMVER = {
  'exact-version-wins': {
    index: () => indexOf('t/j6@1.0.0', 't/j6@1.0.2'),
    ask: ['t/j6', '1.0.2'],
    want: 'id:t/j6@1.0.2',
    mutation: 'no-exact-lookup',
    tags: ['happy', 'boundary']
  },
  'nearest-lower-patch': {
    index: () => indexOf('t/j6@1.0.0', 't/j6@1.0.2'),
    ask: ['t/j6', '1.0.3'],
    want: 'id:t/j6@1.0.2',
    fallback: '1.0.3',
    mutation: 'first-lower-wins',
    tags: ['upgrade-compat', 'boundary']
  },
  'never-a-higher-version': {
    index: () => indexOf('t/j6@1.0.3'),
    ask: ['t/j6', '1.0.1'],
    want: null,
    mutation: 'allow-higher',
    tags: ['upgrade-compat', 'boundary']
  },
  'never-another-major': {
    index: () => indexOf('t/j6@1.0.5'),
    ask: ['t/j6', '2.0.0'],
    want: null,
    mutation: 'allow-other-major',
    tags: ['upgrade-compat', 'mixed-version']
  },
  'prerelease-version-answers-null': {
    index: () => indexOf('t/j6@1.0.0'),
    ask: ['t/j6', '1.0.1-rc.1'],
    want: null,
    mutation: 'loose-semver',
    tags: ['upgrade-compat', 'invalid']
  },
  'never-another-release': {
    index: () => indexOf('a/j6@1.0.0'),
    ask: ['b/j6', '1.0.1'],
    want: null,
    mutation: 'ignore-release-prefix',
    tags: ['missing-contract', 'mixed-version']
  },
  'local-pack-is-sealed-as-its-release': {
    index: () => indexOf('t/j6@1.0.0'),
    ask: ['local/t/j6', '1.0.0'],
    want: 'id:t/j6@1.0.0',
    mutation: 'local-tag-unmapped',
    tags: ['happy', 'repeat']
  },
  'no-profile-answers-null': {
    index: () => indexOf('t/j6@1.0.0'),
    ask: ['u/j6', '1.0.0'],
    want: null,
    mutation: 'invent-contract',
    tags: ['missing-contract', 'empty']
  }
}

const MAY = {
  'not-choosable': {
    release: { choosable: false, setting: { card: {} } },
    contract: { id: 'c' },
    want: false,
    mutation: 'ignore-choosable',
    tags: ['invalid', 'missing-contract']
  },
  'sealed-and-choosable': {
    release: { choosable: true, setting: {} },
    contract: { id: 'c' },
    want: true,
    mutation: 'ignore-seal',
    tags: ['happy']
  },
  'unsealed-no-card': {
    release: { choosable: true, setting: {} },
    contract: null,
    want: false,
    mutation: 'allow-unsealed',
    tags: ['missing-contract', 'invalid']
  },
  'template-card-without-seal': {
    release: { choosable: true, setting: { card: { a: 1 } } },
    contract: null,
    want: true,
    mutation: 'deny-template',
    tags: ['missing-contract', 'happy']
  }
}

export const specs = [
  {
    item: 'contracts.readContracts',
    assertion: 'contracts.index-fails-closed',
    area: 'machine',
    requirement:
      'A profile that cannot say which quickstart it seals, or two profiles claiming one quickstart, make the index throw instead of answering "no contract".',
    oracle: {
      source: ADR17,
      section: '§9 and contracts.js readContracts doc',
      invariant: '"no contract" is the permissive state, so an unusable profile fails closed'
    },
    reads: ['apps/tracy-web/src/lib/contracts.js'],
    variants: Object.entries(FAIL_CLOSED).map(([key, v]) => ({
      key,
      tags: v.tags,
      params: { key },
      mutation: v.mutation
    })),
    mutations: {
      'swallow-unnamed-profile': mutation(
        'swallow-unnamed-profile',
        'an unnamed profile is skipped',
        'throw new Error(`contract profile ${file} names no quickstart it seals`)',
        'continue'
      ),
      'swallow-double-claim': mutation(
        'swallow-double-claim',
        'a double claim is skipped',
        'throw new Error(`quickstart ${key} is claimed twice: ${seen.id} and ${manifest.id}`)',
        'continue'
      )
    },
    async execute(ctx) {
      const mod = await load(ctx.root, PRODUCT.contracts)
      const row = FAIL_CLOSED[ctx.params.key]
      return withTempDir(tmp(ctx), async (root) => {
        const goodRoot = path.join(root, 'good')
        await writeManifest(goodRoot, 'a/1', profile('t/j6', '1.0.0'))
        await writeManifest(goodRoot, 'b/1', profile('t/j6', '1.0.0'))
        const good = await observe(() => mod.readContracts([goodRoot]))
        const badRoot = path.join(root, 'bad')
        await row.build(badRoot)
        const bad = await observe(() => mod.readContracts([badRoot]))
        return {
          control: ok(good.threw === null && good.value.size === 1, JSON.stringify({ threw: good.threw })),
          check: ok(row.expect.test(bad.threw ?? ''), JSON.stringify({ threw: bad.threw }))
        }
      })
    }
  },
  {
    item: 'contracts.readContracts',
    assertion: 'contracts.cowork-floor-is-read-from-every-spelling',
    area: 'machine',
    requirement:
      'The Claude Cowork plugin floor of a profile is read whichever of its four published spellings the profile uses; a profile with none has no floor.',
    oracle: {
      source:
        'apps/tracy-web/src/lib/contracts.js (measured incident 25/09/2026 in the readContracts comment) + the manifests under packages/cms/*/contracts',
      section: 'coworkMinVersion',
      invariant:
        'coworkContractVersion | receiverVersion | coworkMinVersion | receiverFloor all name the floor'
    },
    reads: ['apps/tracy-web/src/lib/contracts.js'],
    variants: [
      ...FLOOR_KEYS.map((key) => ({
        key: `floor-from-${key}`,
        tags: ['upgrade-compat', 'happy'],
        params: { floorKey: key },
        mutation: `ignore-${key}`
      })),
      {
        key: 'no-floor-declared',
        tags: ['upgrade-compat', 'empty'],
        params: { floorKey: null },
        mutation: 'invent-floor'
      }
    ],
    mutations: {
      ...Object.fromEntries(
        FLOOR_KEYS.map((k) => [
          `ignore-${k}`,
          mutation(`ignore-${k}`, `${k} is not read`, `manifest.${k}`, 'undefined')
        ])
      ),
      'invent-floor': mutation(
        'invent-floor',
        'a profile with no floor answers a made-up one',
        "].find((v) => typeof v === 'string') ?? null",
        "].find((v) => typeof v === 'string') ?? '0.0.0'"
      )
    },
    async execute(ctx) {
      const mod = await load(ctx.root, PRODUCT.contracts)
      const { floorKey } = ctx.params
      return withTempDir(tmp(ctx), async (root) => {
        // The control reads the floor from a spelling other than the one this case mutates.
        const ctlKey = floorKey === 'coworkMinVersion' ? 'coworkContractVersion' : 'coworkMinVersion'
        await writeManifest(root, 'ctl/1', profile('c/j6', '1.0.0', { [ctlKey]: '0.21.0' }))
        await writeManifest(root, 'one/1', profile('t/j6', '1.0.0', floorKey ? { [floorKey]: '0.17.2' } : {}))
        const index = await observe(() => mod.readContracts([root]))
        const get = (k) => index.value?.get(k)
        const want = floorKey ? '0.17.2' : null
        return {
          control: ok(
            get('c/j6@1.0.0')?.coworkMinVersion === '0.21.0',
            JSON.stringify({ threw: index.threw })
          ),
          check: ok(
            index.threw === null && get('t/j6@1.0.0')?.coworkMinVersion === want,
            JSON.stringify({ threw: index.threw, got: get('t/j6@1.0.0')?.coworkMinVersion ?? null, want })
          )
        }
      })
    }
  },
  {
    item: 'contracts.contractFor',
    assertion: 'contracts.contract-lookup-rules',
    area: 'machine',
    requirement:
      'contractFor answers the exact version, else the nearest lower patch/minor of the same release and major, never a higher or other-major or other-release one; a local pack is sealed as its release.',
    oracle: {
      source: `apps/tracy-web/src/lib/contracts.js (the 03/10/2026 ruling in contractFor) + ${ADR17} §10`,
      section: 'NEAREST LOWER PATCH/MINOR',
      invariant: 'highest version below the requested one, same tag, same major; non-semver answers null'
    },
    reads: ['apps/tracy-web/src/lib/contracts.js'],
    variants: Object.entries(SEMVER).map(([key, v]) => ({
      key,
      tags: v.tags,
      params: { key },
      mutation: v.mutation
    })),
    mutations: {
      'no-exact-lookup': mutation(
        'no-exact-lookup',
        'the exact version is not looked up first',
        'if (exact !== undefined) return exact',
        ''
      ),
      'first-lower-wins': mutation(
        'first-lower-wins',
        'the first lower version found wins, not the highest',
        'bestVersion === null || compareSemver(have, bestVersion) > 0',
        'bestVersion === null'
      ),
      'allow-higher': mutation(
        'allow-higher',
        'a higher version may answer',
        'compareSemver(have, wanted) >= 0',
        'false'
      ),
      'allow-other-major': mutation(
        'allow-other-major',
        'another major may answer',
        'have[0] !== wanted[0] || ',
        ''
      ),
      'loose-semver': mutation(
        'loose-semver',
        'a pre-release suffix is ignored when parsing',
        '(\\d+)$/.exec(version)',
        '(\\d+)/.exec(version)'
      ),
      'ignore-release-prefix': mutation(
        'ignore-release-prefix',
        'another release counts',
        'if (!key.startsWith(`${tag}@`)) continue',
        ''
      ),
      'invent-contract': mutation(
        'invent-contract',
        'a release with no profile answers an invented contract',
        'return best === null ? null : { ...best, fallbackFrom: version }',
        "return best === null ? { id: 'invented' } : { ...best, fallbackFrom: version }"
      ),
      'local-tag-unmapped': mutation(
        'local-tag-unmapped',
        'a local pack tag is not mapped to its release',
        'const tag = publishedTagOf(release)',
        'const tag = release'
      )
    },
    async execute(ctx) {
      const mod = await load(ctx.root, PRODUCT.contracts)
      const row = SEMVER[ctx.params.key]
      // The control avoids the path this case's mutant breaks: the exact-lookup case is controlled by a fallback lookup.
      const ctl =
        ctx.params.key === 'exact-version-wins'
          ? mod.contractFor(indexOf('c/j6@1.0.0'), 'c/j6', '1.0.1')
          : mod.contractFor(indexOf('c/j6@1.0.0'), 'c/j6', '1.0.0')
      const got = await observe(() => mod.contractFor(row.index(), ...row.ask))
      const id = got.value?.id ?? null
      const fallbackOk = row.fallback ? got.value?.fallbackFrom === row.fallback : true
      return {
        control: ok(ctl?.id === 'id:c/j6@1.0.0', JSON.stringify(ctl)),
        check: ok(
          got.threw === null && id === row.want && fallbackOk,
          JSON.stringify({ threw: got.threw, id, want: row.want, fallbackFrom: got.value?.fallbackFrom })
        )
      }
    }
  },
  {
    item: 'contracts.mayName',
    assertion: 'contracts.may-name-needs-a-seal-or-a-template-card',
    area: 'machine',
    requirement:
      'A quickstart may be named on site creation only when it is choosable and either sealed by a contract or a template card; the unsealed middle case is refused.',
    oracle: {
      source: ADR17,
      section: '§9',
      invariant: 'two grounds and no third: a sealing contract, or a template card installed as released'
    },
    reads: ['apps/tracy-web/src/lib/contracts.js'],
    variants: Object.entries(MAY).map(([key, v]) => ({
      key,
      tags: v.tags,
      params: { key },
      mutation: v.mutation
    })),
    mutations: {
      'ignore-choosable': mutation(
        'ignore-choosable',
        'a non-choosable release may be named',
        'if (!release?.choosable) return false',
        ''
      ),
      'ignore-seal': mutation(
        'ignore-seal',
        'a seal gives no right to be named',
        'if (contract !== null) return true',
        ''
      ),
      'allow-unsealed': mutation(
        'allow-unsealed',
        'any readable quickstart may be named',
        'return Boolean(release.setting?.card)',
        'return true'
      ),
      'deny-template': mutation(
        'deny-template',
        'a template card may not be named',
        'return Boolean(release.setting?.card)',
        'return false'
      )
    },
    async execute(ctx) {
      const mod = await load(ctx.root, PRODUCT.contracts)
      const row = MAY[ctx.params.key]
      // Control on the path the case's mutant does NOT touch: a sealed variant is controlled by the template-card path.
      const ctlArgs =
        ctx.params.key === 'sealed-and-choosable'
          ? [{ choosable: true, setting: { card: { a: 1 } } }, null]
          : [{ choosable: true, setting: {} }, { id: 'c' }]
      const ctl = mod.mayName(...ctlArgs)
      const got = await observe(() => mod.mayName(row.release, row.contract))
      return {
        control: ok(ctl === true, String(ctl)),
        check: ok(
          got.threw === null && got.value === row.want,
          JSON.stringify({ threw: got.threw, got: got.value, want: row.want })
        )
      }
    }
  }
]
