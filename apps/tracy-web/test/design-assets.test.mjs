import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DS_SLOT_DIR, DS_ROOT, referoLibrary, emitFor } from '../src/lib/ds-slot.js'
import { designAssets, designAssetFingerprint } from '../src/lib/design-assets.js'

const run = promisify(execFile)
test('a source-free checkout lists offline, fetches only selected assets, and emits identical CSS', async () => {
  const temp = await mkdtemp(path.join(tmpdir(), 'tracy-lazy-design-'))
  const blobs = new Map()
  const descriptor = (bytes) => {
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    blobs.set(sha256, bytes)
    return { sha256, bytes: bytes.length }
  }
  const systems = []
  const expected = []
  for (const row of (await referoLibrary()).slice(0, 2)) {
    const dir = path.join(DS_ROOT, 'vendor/tracy/refero/systems', row.uuid)
    const raw = {
      system: JSON.parse(await readFile(path.join(dir, 'design-system.json'))),
      manifest: JSON.parse(await readFile(path.join(dir, 'manifest.json')))
    }
    systems.push({
      ...row,
      profile: descriptor(Buffer.from(JSON.stringify(raw))),
      thumbnail: descriptor(await readFile(path.join(DS_SLOT_DIR, 'refero-thumbs', `${row.uuid}.webp`)))
    })
    expected.push(await emitFor({ id: row.id, platform: 'emdash', contract: 'emdash-base' }))
  }
  assert.ok(expected.every((r) => r.ok))
  let downloads = 0
  const server = createServer((req, res) => {
    if (req.url === '/count') return res.end(String(downloads))
    downloads++
    const bytes = blobs.get(req.url.slice('/blobs/'.length))
    if (!bytes) {
      res.writeHead(404)
      return res.end()
    }
    res.end(bytes)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const lib = path.join(temp, 'apps/tracy-web/src/lib')
    await mkdir(lib, { recursive: true })
    await cp(fileURLToPath(new URL('../src/lib/', import.meta.url)), lib, { recursive: true })
    await cp(fileURLToPath(new URL('../src/config.js', import.meta.url)), path.join(lib, '../config.js'))
    await writeFile(path.join(temp, 'package.json'), '{"type":"module"}')
    const slot = path.join(temp, 'packages/design/tracy-ds-slot')
    for (const folder of ['src', 'templates'])
      await cp(path.join(DS_SLOT_DIR, folder), path.join(slot, folder), { recursive: true })
    const indexFile = path.join(temp, 'index.json')
    const fingerprint = designAssetFingerprint(DS_SLOT_DIR)
    await writeFile(
      indexFile,
      JSON.stringify({ schemaVersion: 'tracy-design-assets/v1', fingerprint, systems })
    )
    await writeFile(path.join(temp, 'expected.json'), JSON.stringify(expected))
    const origin = `http://127.0.0.1:${server.address().port}`
    const result = await run(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
      import assert from 'node:assert/strict';
      import {readFileSync,existsSync} from 'node:fs';
      import {referoLibrary,referoScreenshotPath,emitFor} from './apps/tracy-web/src/lib/ds-slot.js';
      assert.equal(existsSync('./vendor'),false);
      const rows=await referoLibrary();
      assert.equal(rows.length,2);
      const count=async()=>Number(await (await fetch(process.env.TRACY_DESIGN_ASSET_ORIGIN+'/count')).text());
      assert.equal(await count(),0);
      await referoScreenshotPath(rows[0].uuid); assert.equal(await count(),1);
      const expected=JSON.parse(readFileSync('./expected.json'));
      const first=await emitFor({id:rows[0].id,platform:'emdash',contract:'emdash-base'});
      assert.deepEqual(first,expected[0]); assert.equal(await count(),2);
      assert.deepEqual(await emitFor({id:rows[0].id,platform:'emdash',contract:'emdash-base'}),first);
      assert.equal(await count(),2);
      assert.deepEqual(await emitFor({id:rows[1].id,platform:'emdash',contract:'emdash-base'}),expected[1]);
      assert.equal(await count(),3);
      console.log('verified');
    `
      ],
      {
        cwd: temp,
        env: {
          ...process.env,
          TRACY_DESIGN_ASSET_INDEX: indexFile,
          TRACY_DESIGN_ASSET_ORIGIN: origin,
          TRACY_DESIGN_ASSET_CACHE: path.join(temp, 'cache')
        }
      }
    )
    assert.match(result.stdout, /verified/)
    assert.throws(
      () => designAssets({ indexFile, origin, directory: path.join(temp, 'cache'), fingerprint: 'outdated' }),
      /incompatible/
    )
  } finally {
    await new Promise((resolve) => server.close(resolve))
    await rm(temp, { recursive: true, force: true })
  }
})
