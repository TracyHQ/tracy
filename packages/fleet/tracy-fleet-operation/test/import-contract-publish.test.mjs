/**
 * The collector runs as root over a folder the AI agent can write (a read-write bind of the site folder), so
 * whatever the agent plants there is read and written with root's power: a symlink as `README.md`, a `docs`
 * that points elsewhere, a `revisions` directory that is a link. Publishing refuses all of it, and a publish
 * that dies half way repairs itself on the next run instead of leaving the agent a pointer to a missing file.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  link,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  rm,
  stat,
  symlink,
  writeFile
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  buildImportContract,
  publishImportContract
} from '../scripts/provision/import-contract-documents.mjs'

const UNSAFE = /Unsafe path in the site folder/

function inputOf(value = 'A real imported title') {
  const slots = [
    {
      key: 'module-1.params.aaaaaaaaaa',
      entity: 'module-1',
      column: 'params',
      leaf: 'key:heading',
      type: 'text',
      current: value,
      maxCharacters: 100
    }
  ]
  return {
    platform: 'joomla',
    siteKey: 'source.example',
    copyUrl: 'http://copy.tracy.test:51710',
    inspect: { ok: true, contract: 'derived/source-copy', revision: 'revision-1', slots },
    content: {
      completeness: { scope: 'supported-content', status: 'complete', unresolved: [] },
      pagination: { nextCursor: null },
      contents: []
    },
    info: {}
  }
}

const bundleOf = (value) => buildImportContract(inputOf(value))

/** A scratch tree: `folder` is the site folder, `outside` is what the agent must never reach. */
async function scratch() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'import-publish-'))
  const folder = path.join(root, 'site')
  const outside = path.join(root, 'outside')
  await mkdir(folder)
  await mkdir(outside)
  const directory = path.join(folder, 'docs/agents/import-contract')
  return {
    root,
    folder,
    outside,
    directory,
    publish: (bundle) => publishImportContract(directory, bundle, { root: folder }),
    cleanup: () => rm(root, { recursive: true, force: true })
  }
}

/** Every entry under `at`, links not followed: a path, what it is, and a hash of what it holds. */
async function tree(at) {
  const out = []
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      const name = path.relative(at, file)
      if (entry.isSymbolicLink()) out.push(`${name} -> ${await readlink(file)}`)
      else if (entry.isDirectory()) {
        out.push(`${name}/`)
        await walk(file)
      } else
        out.push(
          `${name} #${createHash('sha1')
            .update(await readFile(file))
            .digest('hex')
            .slice(0, 10)}`
        )
    }
  }
  await walk(at)
  return out.sort()
}

const exists = async (file) => (await lstat(file).catch(() => null)) !== null

// ── P2: nothing the agent planted is followed ───────────────────────────────────────────────────────────

for (const name of ['README.md', 'brief.md', 'slots.tsv', 'current.json']) {
  test(`a symlinked ${name} is refused and the file it points at is left alone`, async () => {
    const s = await scratch()
    try {
      const victim = path.join(s.outside, 'victim.txt')
      await writeFile(victim, 'A FILE THE AGENT SHOULD NOT TOUCH\n')
      await mkdir(s.directory, { recursive: true })
      await symlink(victim, path.join(s.directory, name))
      const before = await tree(s.root)
      await assert.rejects(s.publish(bundleOf()), UNSAFE)
      assert.deepEqual(await tree(s.root), before, 'no write at all, inside or outside')
      assert.equal(await readFile(victim, 'utf8'), 'A FILE THE AGENT SHOULD NOT TOUCH\n')
    } finally {
      await s.cleanup()
    }
  })
}

test('a hard link is replaced, never written through', async () => {
  const s = await scratch()
  try {
    const victim = path.join(s.outside, 'victim.txt')
    await writeFile(victim, 'A FILE THE AGENT SHOULD NOT TOUCH\n')
    await mkdir(s.directory, { recursive: true })
    await link(victim, path.join(s.directory, 'README.md'))
    const bundle = bundleOf()
    await s.publish(bundle)
    assert.equal(await readFile(victim, 'utf8'), 'A FILE THE AGENT SHOULD NOT TOUCH\n')
    assert.equal(await readFile(path.join(s.directory, 'README.md'), 'utf8'), bundle.documents['README.md'])
  } finally {
    await s.cleanup()
  }
})

for (const [name, plant] of [
  [
    'docs',
    async (s) => {
      await symlink(s.outside, path.join(s.folder, 'docs'))
    }
  ],
  [
    'docs/agents',
    async (s) => {
      await mkdir(path.join(s.folder, 'docs'))
      await symlink(s.outside, path.join(s.folder, 'docs/agents'))
    }
  ],
  [
    'the import-contract directory',
    async (s) => {
      await mkdir(path.dirname(s.directory), { recursive: true })
      await symlink(s.outside, s.directory)
    }
  ],
  [
    'revisions',
    async (s) => {
      await mkdir(s.directory, { recursive: true })
      await mkdir(path.join(s.outside, 'a'.repeat(64)))
      await writeFile(path.join(s.outside, 'a'.repeat(64), 'precious.txt'), 'x')
      await symlink(s.outside, path.join(s.directory, 'revisions'))
    }
  ]
]) {
  test(`a symlinked ${name} redirects nothing: the publish is refused and the target keeps what it had`, async () => {
    const s = await scratch()
    try {
      await plant(s)
      const before = await tree(s.root)
      await assert.rejects(s.publish(bundleOf()), UNSAFE)
      assert.deepEqual(await tree(s.root), before, 'nothing created, nothing pruned, inside or outside')
    } finally {
      await s.cleanup()
    }
  })
}

for (const [name, make] of [
  ['revisions as a regular file', (s) => writeFile(path.join(s.directory, 'revisions'), 'not a directory')],
  ['slots.tsv as a directory', (s) => mkdir(path.join(s.directory, 'slots.tsv'))],
  ['current.json as a directory', (s) => mkdir(path.join(s.directory, 'current.json'))],
  ['README.md as a directory', (s) => mkdir(path.join(s.directory, 'README.md'))]
]) {
  test(`${name} is not the expected type: refused, and nothing is written`, async () => {
    const s = await scratch()
    try {
      await mkdir(s.directory, { recursive: true })
      await make(s)
      const before = await tree(s.root)
      await assert.rejects(s.publish(bundleOf()), UNSAFE)
      assert.deepEqual(await tree(s.root), before)
    } finally {
      await s.cleanup()
    }
  })
}

test('a FIFO where a document belongs is refused without being opened (opening one waits for a writer)', {
  timeout: 15_000
}, async () => {
  const s = await scratch()
  try {
    await mkdir(s.directory, { recursive: true })
    const made = spawnSync('mkfifo', [path.join(s.directory, 'README.md')])
    if (made.status !== 0) return // no mkfifo on this machine: nothing to plant
    await assert.rejects(s.publish(bundleOf()), UNSAFE)
  } finally {
    await s.cleanup()
  }
})

test('a revision entry that is a link is removed as a link: its target survives the prune', async () => {
  const s = await scratch()
  try {
    await s.publish(bundleOf('first'))
    const target = path.join(s.outside, 'precious')
    await mkdir(target)
    await writeFile(path.join(target, 'keep.txt'), 'y')
    await symlink(target, path.join(s.directory, 'revisions', 'b'.repeat(64)))
    await s.publish(bundleOf('second'))
    assert.equal(await exists(path.join(s.directory, 'revisions', 'b'.repeat(64))), false)
    assert.equal(await readFile(path.join(target, 'keep.txt'), 'utf8'), 'y')
  } finally {
    await s.cleanup()
  }
})

test('a revision directory that is a link is replaced by a real one, and its target is not touched', async () => {
  const s = await scratch()
  try {
    const bundle = bundleOf()
    await s.publish(bundle)
    const revision = path.join(s.directory, 'revisions', bundle.manifest.revision)
    const decoy = path.join(s.outside, 'decoy')
    await mkdir(decoy)
    await writeFile(path.join(decoy, 'manifest.json'), 'NOT YOURS\n')
    await rm(revision, { recursive: true })
    await symlink(decoy, revision)
    const result = await s.publish(bundle)
    assert.equal(result.reused, false, 'a link is not a published revision')
    assert.ok((await lstat(revision)).isDirectory(), 'a real directory now')
    assert.equal(await readFile(path.join(decoy, 'manifest.json'), 'utf8'), 'NOT YOURS\n')
    assert.deepEqual(await readdir(decoy), ['manifest.json'])
  } finally {
    await s.cleanup()
  }
})

// ── P3: the pointer moves last, and a half-finished publish heals ──────────────────────────────────────────

test('a failure while the top-level files are written leaves the pointer where it was', async () => {
  const s = await scratch()
  try {
    const first = bundleOf('OLD words from the previous import')
    await s.publish(first)
    const pointer = await readFile(path.join(s.directory, 'current.json'), 'utf8')
    await rm(path.join(s.directory, 'slots.tsv'))
    await mkdir(path.join(s.directory, 'slots.tsv'))
    await writeFile(path.join(s.directory, 'slots.tsv', 'x'), 'x')
    await assert.rejects(s.publish(bundleOf('NEW words from the new import')))
    assert.equal(
      await readFile(path.join(s.directory, 'current.json'), 'utf8'),
      pointer,
      'the pointer still names the revision whose top-level files are all there'
    )
    assert.equal(
      await readFile(path.join(s.directory, 'README.md'), 'utf8'),
      first.documents['README.md'],
      'and the README is still the old revision own'
    )
  } finally {
    await s.cleanup()
  }
})

test('a retry of an unchanged source repairs the top-level files instead of reporting reuse over a hole', async () => {
  const s = await scratch()
  try {
    const bundle = bundleOf()
    await s.publish(bundle)
    await rm(path.join(s.directory, 'slots.tsv'))
    await writeFile(path.join(s.directory, 'README.md'), 'tampered\n')
    await rm(path.join(s.directory, 'brief.md'))
    const again = await s.publish(bundle)
    assert.equal(again.reused, true, 'the revision directory was complete')
    assert.deepEqual([...again.repaired].sort(), ['README.md', 'brief.md', 'slots.tsv'])
    assert.equal(await readFile(path.join(s.directory, 'slots.tsv'), 'utf8'), bundle.documents['slots.tsv'])
    assert.equal(await readFile(path.join(s.directory, 'README.md'), 'utf8'), bundle.documents['README.md'])
    assert.equal(await readFile(path.join(s.directory, 'brief.md'), 'utf8'), `${bundle.brief}\n`)
    const clean = await s.publish(bundle)
    assert.deepEqual(clean, { revision: bundle.manifest.revision, reused: true }, 'nothing left to repair')
  } finally {
    await s.cleanup()
  }
})

test('a corrupt or hand-edited current.json is treated as absent and rewritten', async () => {
  for (const damage of ['{"revision":', '[]', '"text"', '{"revision":"../../etc","directory":"x"}', '']) {
    const s = await scratch()
    try {
      const bundle = bundleOf()
      await s.publish(bundle)
      await writeFile(path.join(s.directory, 'current.json'), damage)
      const result = await s.publish(bundle)
      assert.equal(result.reused, false, JSON.stringify(damage))
      const pointer = JSON.parse(await readFile(path.join(s.directory, 'current.json'), 'utf8'))
      assert.equal(pointer.revision, bundle.manifest.revision)
      assert.equal(pointer.directory, `revisions/${bundle.manifest.revision}`)
      assert.deepEqual(await readdir(path.join(s.directory, 'revisions')), [bundle.manifest.revision])
    } finally {
      await s.cleanup()
    }
  }
})

test('a revision directory with a missing, altered or absent part is rebuilt, never reused or thrown on', async () => {
  for (const damage of [
    (revision) => rm(path.join(revision, 'content-map.json')),
    (revision) => writeFile(path.join(revision, 'content-map.json'), '{}'),
    (revision) => rm(path.join(revision, 'entities'), { recursive: true }),
    (revision) => rm(revision, { recursive: true })
  ]) {
    const s = await scratch()
    try {
      const bundle = bundleOf()
      await s.publish(bundle)
      const revision = path.join(s.directory, 'revisions', bundle.manifest.revision)
      await damage(revision)
      const result = await s.publish(bundle)
      assert.equal(result.reused, false)
      assert.equal(
        await readFile(path.join(revision, 'content-map.json'), 'utf8'),
        JSON.stringify(bundle.contentMap, null, 2) + '\n'
      )
      assert.ok(await exists(path.join(revision, 'entities', 'module-1.md')))
      assert.deepEqual(
        (await readdir(s.directory)).filter((n) => n.startsWith('.')),
        [],
        'no temporary directory is left behind'
      )
      assert.equal(
        (await stat(revision)).mode & 0o005,
        0o005,
        'readable by the agent (not the 0700 of a temp dir)'
      )
    } finally {
      await s.cleanup()
    }
  }
})

test('a crash between the revision directory and the pointer is finished by the next run', async () => {
  const s = await scratch()
  try {
    const first = bundleOf('first')
    const second = bundleOf('second')
    await s.publish(first)
    // The state a crash leaves: the new revision directory exists in full, the pointer does not name it yet.
    await s.publish(second)
    await writeFile(
      path.join(s.directory, 'current.json'),
      JSON.stringify({ revision: first.manifest.revision, directory: `revisions/${first.manifest.revision}` })
    )
    await writeFile(path.join(s.directory, 'slots.tsv'), first.documents['slots.tsv'])
    const result = await s.publish(second)
    assert.equal(result.reused, false)
    assert.equal(
      JSON.parse(await readFile(path.join(s.directory, 'current.json'), 'utf8')).revision,
      second.manifest.revision
    )
    assert.equal(await readFile(path.join(s.directory, 'slots.tsv'), 'utf8'), second.documents['slots.tsv'])
  } finally {
    await s.cleanup()
  }
})

test('files are replaced by rename: no temporary file survives a publish, and the pointer is the last to change', async () => {
  const s = await scratch()
  try {
    for (const value of ['one', 'two', 'three']) await s.publish(bundleOf(value))
    assert.deepEqual((await readdir(s.directory)).sort(), [
      'README.md',
      'brief.md',
      'current.json',
      'revisions',
      'slots.tsv'
    ])
    assert.equal(
      (await readdir(path.join(s.directory, 'revisions'))).length,
      2,
      'the new revision and the one it replaced'
    )
  } finally {
    await s.cleanup()
  }
})
