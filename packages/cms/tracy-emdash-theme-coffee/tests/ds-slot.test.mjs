// The design-system slot reader (src/lib/ds-slot.ts): no file = no slot; a file is read per request
// so a switch needs no rebuild; nothing but a Google Fonts stylesheet can be linked from it.
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const dir = mkdtempSync(join(tmpdir(), 'ds-slot-'))
process.env.SITE_DATA_DIR = dir
const { readDsSlot } = await import('../src/lib/ds-slot.ts')
const file = join(dir, 'ds-slot.css')
const write = (text, t) => {
  writeFileSync(file, text)
  utimesSync(file, t, t)
}

test('no file: no slot, the template is untouched', async () => {
  assert.equal(await readDsSlot(), null)
})

test('a slot is read, and a newer file replaces it without a restart', async () => {
  write('/* tracy-ds-slot: od:apple (Apple) — generated */\n:root { --color-bg: #ffffff; }\n', 1000)
  assert.equal((await readDsSlot())?.id, 'od:apple')
  write(
    '/* tracy-ds-slot: refero:x (X) — generated */\n/* fonts: https://fonts.googleapis.com/css2?family=Inter:wght@400&display=swap */\n:root{}\n',
    2000
  )
  const s = await readDsSlot()
  assert.equal(s?.id, 'refero:x')
  assert.equal(s?.fontsHref, 'https://fonts.googleapis.com/css2?family=Inter:wght@400&display=swap')
})

test('only a Google Fonts stylesheet can be linked, and a file that could close the style tag is refused', async () => {
  write('/* tracy-ds-slot: a (A) */\n/* fonts: https://evil.example/x.css */\n:root{}\n', 3000)
  assert.equal((await readDsSlot())?.fontsHref, null)
  write('/* tracy-ds-slot: b (B) */\n</style><script>alert(1)</script>\n', 4000)
  assert.equal(await readDsSlot(), null)
})

test('a file without the generated header is not a worn system', async () => {
  write(':root { --color-bg: #000; }\n', 5000)
  assert.equal(await readDsSlot(), null)
})

test('a rewrite that keeps the mtime is still read (cp -p, rsync -t)', async () => {
  write('/* tracy-ds-slot: one (One) */\n:root{}\n', 6000)
  assert.equal((await readDsSlot())?.id, 'one')
  write('/* tracy-ds-slot: two-longer (Two) */\n:root{}\n', 6000)
  assert.equal((await readDsSlot())?.id, 'two-longer')
})

test('removing the file clears the slot', async () => {
  rmSync(file)
  assert.equal(await readDsSlot(), null)
  rmSync(dir, { recursive: true, force: true })
})
