/**
 * `provision.sh` and the host's record of an imported copy's derived contract.
 *
 * The record (`<sitesRoot>/.import-contracts/<label>/manifest.json`) is what opens the derived
 * `content.contract` door on the open surface. A re-provision replaces the copy's files and database, so the
 * last import's record must be gone BEFORE those are replaced: a run that dies in between (a failed unpack,
 * an import that cannot finish, a container that will not start) must not leave a record describing content
 * that is no longer there. Only the collector, at the end of a run that succeeded, writes it again.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(new URL('../scripts/provision/provision.sh', import.meta.url))
const CLEAR = 'rm -f "$TRACY_SITES_ROOT/.import-contracts/$LABEL/manifest.json"'

const source = () => readFile(SCRIPT, 'utf8')
const at = (src, needle, from = 0) => {
  const found = src.indexOf(needle, from)
  assert.ok(found !== -1, `provision.sh no longer contains: ${needle}`)
  return found
}

test('provision.sh stays valid bash', () => {
  const checked = spawnSync('bash', ['-n', SCRIPT], { encoding: 'utf8' })
  assert.equal(checked.status, 0, checked.stderr)
})

test('the record is cleared once, after the per-site lock and before the first step that replaces the copy', async () => {
  const src = await source()
  assert.equal(src.split(CLEAR).length - 1, 1, 'one clear, in one place')
  const clear = at(src, CLEAR)
  // This run owns the label only once the lock is held: a refused second run must not clear a record.
  assert.ok(clear > at(src, 'if ! flock -n 8; then'), 'after the per-site lock')
  for (const replaced of [
    'stage "fetching webroot"',
    'tar -xmf "$SITE_DIR/work/webroot.tar"',
    'stage "starting database"',
    'stage "importing database"',
    'platform_configure\n'
  ])
    assert.ok(clear < at(src, replaced), `before ${replaced.trim()}`)
  // The capture itself stays at the end of the run, after the site folder and its facts exist.
  const collector = at(src, 'node "$HERE/collect-import-contract.mjs"')
  assert.ok(
    collector > at(src, 'node "$HERE/ensure-site-folder.mjs"'),
    'the collector runs after the folder is built'
  )
  assert.ok(collector > at(src, 'node "$HERE/collect-site-facts.mjs"'), 'and after the facts are measured')
  assert.ok(collector > at(src, 'platform_post_up\n'), 'and after the site is up')
})

/** The block that decides whether this run is an import and clears its record, lifted out of the script. */
async function clearBlock() {
  const src = await source()
  const start = at(src, 'SITE_ORIGIN=""')
  const end = at(src, '\nfi\n', at(src, CLEAR)) + 4
  const block = src.slice(start, end)
  assert.ok(
    block.length < 1200,
    `the clear is its own small block, not ${block.length} characters of the script`
  )
  assert.ok(block.includes(CLEAR))
  return block
}

/** Run the block with the variables the script has by then, over a scratch sites root. */
async function runBlock(env) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'import-provision-'))
  try {
    for (const label of ['source-copy', 'other-copy']) {
      await mkdir(path.join(root, '.import-contracts', label), { recursive: true })
      await writeFile(path.join(root, '.import-contracts', label, 'manifest.json'), '{}\n')
    }
    const vars = {
      TRACY_SITES_ROOT: root,
      LABEL: 'source-copy',
      PLATFORM: 'joomla',
      QUICKSTART: '',
      WEBROOT_KEY: 'example.com/migrate/1/webroot.tar',
      ...env
    }
    const script = [
      'set -euo pipefail',
      ...Object.entries(vars).map(([name, value]) => `${name}=${JSON.stringify(value)}`),
      ...(env.FRESH === undefined ? [] : [`export FRESH=${JSON.stringify(env.FRESH)}`]),
      await clearBlock(),
      'echo "origin=$SITE_ORIGIN"'
    ].join('\n')
    const run = spawnSync('bash', ['-c', script], { encoding: 'utf8', env: { PATH: process.env.PATH } })
    assert.equal(run.status, 0, run.stderr)
    const kept = async (label) =>
      (await readFile(path.join(root, '.import-contracts', label, 'manifest.json'), 'utf8').catch(
        () => null
      )) !== null
    return {
      origin: run.stdout.trim().replace('origin=', ''),
      recordKept: await kept('source-copy'),
      otherKept: await kept('other-copy')
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

test('an imported Joomla or WordPress copy loses its record, and no other site loses anything', async () => {
  for (const platform of ['joomla', 'wordpress']) {
    const ran = await runBlock({ PLATFORM: platform })
    assert.equal(ran.origin, 'imported', platform)
    assert.equal(ran.recordKept, false, `${platform}: the record is gone`)
    assert.equal(ran.otherKept, true, `${platform}: another site's record stays`)
  }
})

test('a run that is not an import clears nothing: a fresh site, a quickstart, no archive, EmDash', async () => {
  for (const [name, env] of [
    ['--fresh', { FRESH: '1' }],
    ['a quickstart', { QUICKSTART: 'tracy-base/wp7', PLATFORM: 'wordpress' }],
    ['no webroot archive', { WEBROOT_KEY: '' }],
    ['EmDash', { PLATFORM: 'emdash' }]
  ]) {
    const ran = await runBlock(env)
    assert.equal(ran.recordKept, true, `${name}: the record stays`)
    assert.equal(ran.otherKept, true, name)
  }
})
