/**
 * gzip -6 on several cores (`scripts/lib/pgzip.py`), what a backup's database dump is compressed
 * with: one gzip member that gunzip, Python and Node read back byte for byte. No database.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/pgzip.test.mjs
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const TOOL = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'lib', 'pgzip.py')
const MiB = 1 << 20

const pgzip = (input) => {
  const done = spawnSync('python3', [TOOL, '-6'], { input, maxBuffer: 1 << 28 })
  assert.equal(done.status, 0, String(done.stderr))
  return done.stdout
}
const gunzip = (gz) => {
  const done = spawnSync('gzip', ['-dc'], { input: gz, maxBuffer: 1 << 28 })
  assert.equal(done.status, 0, String(done.stderr))
  return done.stdout
}
const text = (n) => {
  const words = "INSERT INTO `wp_posts` VALUES (1,'lorem ipsum'),(2,'dolor sit amet');\n"
  return Buffer.from(words.repeat(Math.ceil(n / words.length)).slice(0, n))
}

test('every size around the blocks comes back byte for byte, as one member gunzip checks', () => {
  for (const n of [0, 1, 100, 32 * 1024, MiB - 1, MiB, MiB + 1, 3 * MiB + 17]) {
    const input = text(n)
    const gz = pgzip(input)
    assert.equal(gz[0], 0x1f)
    assert.equal(gz[1], 0x8b)
    assert.ok(gunzip(gz).equals(input), `gzip -dc of ${n} bytes`)
    assert.ok(gunzipSync(gz).equals(input), `node's gunzip of ${n} bytes`)
    const py = spawnSync(
      'python3',
      ['-c', 'import gzip,sys; sys.stdout.buffer.write(gzip.decompress(sys.stdin.buffer.read()))'],
      {
        input: gz,
        maxBuffer: 1 << 28
      }
    )
    assert.ok(py.stdout.equals(input), `python's gzip of ${n} bytes`)
  }
})

test('bytes that do not compress, and a ratio within a hair of gzip -6', () => {
  const noise = randomBytes(2 * MiB + 5)
  assert.ok(gunzip(pgzip(noise)).equals(noise))
  const input = Buffer.concat(
    Array.from({ length: 6 }, (_, i) => Buffer.concat([text(MiB), randomBytes(i * 1000)]))
  )
  const ours = pgzip(input).length
  const theirs = spawnSync('gzip', ['-6'], { input, maxBuffer: 1 << 28 }).stdout.length
  assert.ok(ours <= theirs * 1.01, `${ours} bytes against gzip's ${theirs}`)
})

test('a damaged byte is caught by gunzip', () => {
  const gz = pgzip(text(2 * MiB))
  gz[Math.floor(gz.length / 2)] ^= 0xff
  assert.notEqual(spawnSync('gzip', ['-dc'], { input: gz, maxBuffer: 1 << 28 }).status, 0)
})
