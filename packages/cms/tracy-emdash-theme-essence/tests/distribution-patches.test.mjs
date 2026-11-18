// pnpm reads every patch file pnpm-workspace.yaml names under `patchedDependencies`, and
// `pnpm install --frozen-lockfile` (the Dockerfile, a clean install) stops when one is missing. The
// contract's `distribution.include` is an allowlist written by a generator, so a regenerated contract
// that forgets `patches` would pack a template that cannot be installed. Two fences: every generator
// passes its list through `withPatches` (adds `patches` only when the folder exists), and the packer
// refuses a package whose pnpm-workspace.yaml names a patch file the allowlist leaves out.
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { distributionFiles, patchFilesOf } from '../tools/distribution.mjs'
import { withPatches } from '../tools/qa-contract.mjs'

const WORKSPACE = `packages: []
patchedDependencies:
  # a comment inside the block
  picomatch@2.3.2: patches/picomatch@2.3.2.patch
  '@scope/pkg@1.0.0': "./patches/@scope__pkg@1.0.0.patch"
overrides:
  'zod@<4.6.6': 4.6.7
`

function tree({ patches = true } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'dist-patches-'))
  const files = {
    'package.json': '{"name":"x"}',
    'pnpm-lock.yaml': 'lockfileVersion: 9',
    'pnpm-workspace.yaml': WORKSPACE,
    'public/favicon.svg': '<svg/>'
  }
  if (patches) {
    files['patches/picomatch@2.3.2.patch'] = 'diff'
    files['patches/@scope__pkg@1.0.0.patch'] = 'diff'
  }
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
    writeFileSync(path.join(root, rel), text)
  }
  return root
}
const contract = (include) => ({ distribution: { include, required: ['public/favicon.svg'] } })
const BASE = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'public']

describe('patch files of pnpm-workspace.yaml', () => {
  it('reads the patchedDependencies block only, quoted or not, normalised', () => {
    assert.deepEqual(patchFilesOf(WORKSPACE), [
      'patches/picomatch@2.3.2.patch',
      'patches/@scope__pkg@1.0.0.patch'
    ])
    assert.deepEqual(patchFilesOf('packages: []\noverrides:\n  a: 1\n'), [])
  })

  it('withPatches adds patches after pnpm-workspace.yaml only when the folder exists', () => {
    const withFolder = tree()
    const without = tree({ patches: false })
    try {
      assert.deepEqual(withPatches(BASE, withFolder), [
        'package.json',
        'pnpm-lock.yaml',
        'pnpm-workspace.yaml',
        'patches',
        'public'
      ])
      assert.deepEqual(withPatches(BASE, without), BASE)
      assert.deepEqual(withPatches([...BASE, 'patches'], withFolder), [...BASE, 'patches'])
      assert.deepEqual(withPatches(['package.json'], withFolder), ['package.json', 'patches'])
    } finally {
      rmSync(withFolder, { recursive: true, force: true })
      rmSync(without, { recursive: true, force: true })
    }
  })

  it('the packer carries the patch files when the allowlist lists patches', () => {
    const root = tree()
    try {
      const files = distributionFiles(root, contract(withPatches(BASE, root)))
      assert.ok(files.includes('patches/picomatch@2.3.2.patch'))
      assert.ok(files.includes('patches/@scope__pkg@1.0.0.patch'))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('the packer refuses an allowlist that leaves a named patch file out', () => {
    const root = tree()
    try {
      assert.throws(() => distributionFiles(root, contract(BASE)), /Patch file omitted: patches\/picomatch@2\.3\.2\.patch/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
