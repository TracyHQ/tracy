import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'
import { syntheticZip } from './_invitations-real-zip.mjs'
import { defaultRegistry } from '../src/invitations/real-fields.js'
import { readTemplateZip } from '../src/invitations/real-zip.js'
const registry = defaultRegistry([])
const read = (entries) => readTemplateZip({ bytes: syntheticZip(entries), registry })
test('ZIP root and single wrapper import one HTML, optional text and signature-validated images without filesystem extraction', async () => {
  const image = await sharp({ create: { width: 3, height: 2, channels: 3, background: '#fff' } })
    .png()
    .toBuffer()
  for (const root of ['', 'export/']) {
    const r = await read([
      {
        path: `${root}index.html`,
        bytes: '<p>Hello {{first_name}}</p><img src="images/logo.png" alt="Logo">'
      },
      { path: `${root}images/logo.png`, bytes: image },
      { path: `${root}text.txt`, bytes: 'Hello {{first_name}}' },
      { path: '__MACOSX/._index.html', bytes: 'metadata' }
    ])
    assert.equal(r.images.length, 1)
    assert.equal(r.images[0].path, 'images/logo.png')
    assert.equal(r.images[0].width, 3)
    assert.equal(r.text, 'Hello {{first_name}}')
    assert.ok(r.warnings.includes('ZIP_METADATA_IGNORED'))
  }
})
test('traversal, absolute/backslash, symlink, encrypted, normalized duplicates and unsupported content are rejected', async () => {
  for (const e of [
    { path: '../x' },
    { path: '/x' },
    { path: 'C:/x' },
    { path: 'images\\x.png' },
    { path: 'link.png', mode: 0o120777 },
    { path: 'secret.png', flags: 0x801 },
    { path: 'nested.zip' },
    { path: 'style.css' },
    { path: 'font.woff' },
    { path: 'vector.svg' }
  ])
    await assert.rejects(() =>
      read([
        { path: 'index.html', bytes: '<p>Hi</p>' },
        { ...e, bytes: 'x' }
      ])
    )
  for (const names of [
    ['a.png', 'A.png'],
    ['é.png', 'e\u0301.png'],
    ['index.html', 'index.html'],
    ['one/index.html', 'two/index.html']
  ])
    await assert.rejects(() => read(names.map((path) => ({ path, bytes: 'x' }))))
})
test('actual CRC/size mismatches, malformed archives and compressed expansion budgets refuse the entire upload', async () => {
  await assert.rejects(() => read([{ path: 'index.html', bytes: '<p>Hi</p>', crc: 1 }]))
  await assert.rejects(() => read([{ path: 'index.html', bytes: '<p>Hi</p>', size: 1, deflate: true }]))
  await assert.rejects(() => readTemplateZip({ bytes: Buffer.from('broken ZIP'), registry }))
  await assert.rejects(() => readTemplateZip({ bytes: Buffer.alloc(10 * 1024 * 1024 + 1), registry }))
  await assert.rejects(() =>
    read([
      { path: 'index.html', bytes: '<p>Hi</p>' },
      { path: '__MACOSX/bomb', bytes: Buffer.alloc(20 * 1024 * 1024 + 1), deflate: true }
    ])
  )
})
test('entry and HTML exact limits are accepted; over-limit or missing/external-image templates are rejected', async () => {
  const exact = [
    { path: 'index.html', bytes: 'x'.repeat(256 * 1024) },
    ...Array.from({ length: 49 }, (_, i) => ({ path: `__MACOSX/m${i}`, bytes: '' }))
  ]
  assert.ok((await read(exact)).html.length >= 256 * 1024)
  await assert.rejects(() => read([...exact, { path: '__MACOSX/overflow', bytes: '' }]))
  await assert.rejects(() => read([{ path: 'index.html', bytes: 'x'.repeat(256 * 1024 + 1) }]))
  for (const src of ['missing.png', 'https://example.test/pixel'])
    await assert.rejects(() => read([{ path: 'index.html', bytes: `<img src="${src}">` }]))
  await assert.rejects(() => read([{ path: 'text.txt', bytes: 'No index' }]))
})
test('actual expanded bytes and archive byte boundaries allow equality including ignored metadata', async () => {
  const html = '<p>Hi</p>',
    meta = Buffer.alloc(20 * 1024 * 1024 - Buffer.byteLength(html))
  const exact = await read([
    { path: 'index.html', bytes: html },
    { path: '__MACOSX/padding', bytes: meta, deflate: true }
  ])
  assert.ok(exact.html.includes('Hi'))
  const over = Buffer.concat([meta, Buffer.alloc(1)])
  await assert.rejects(() =>
    read([
      { path: 'index.html', bytes: html },
      { path: '__MACOSX/padding', bytes: over, deflate: true }
    ])
  )
  const entries = [
    { path: 'index.html', bytes: html },
    { path: '__MACOSX/padding', bytes: '' }
  ]
  const archive = syntheticZip([
    entries[0],
    { ...entries[1], bytes: Buffer.alloc(10 * 1024 * 1024 - syntheticZip(entries).length) }
  ])
  assert.equal(archive.length, 10 * 1024 * 1024)
  assert.ok((await readTemplateZip({ bytes: archive, registry })).html.includes('Hi'))
})
