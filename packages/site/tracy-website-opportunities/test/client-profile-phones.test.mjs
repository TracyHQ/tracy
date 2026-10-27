/**
 * "Phone" and "Other phones" on the Details Profile card: the main number with a Main chip when the business lists
 * other numbers, and each other number with who states it. Bundles the real component with React 18 (the one dsh's
 * page runs) and renders it to static markup.
 *
 *   node --test packages/site/tracy-website-opportunities/test/client-profile-phones.test.mjs
 */
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..', '..', '..', '..')
const store = path.join(repo, 'node_modules', '.pnpm')
const require = createRequire(import.meta.url)

function fromStore(prefix, name) {
  const hit = existsSync(store) ? readdirSync(store).find((d) => d.startsWith(prefix)) : undefined
  const dir = hit && path.join(store, hit, 'node_modules', name)
  if (!dir || !existsSync(dir)) throw new Error(`${prefix}* is not in ${store}; run pnpm install`)
  return dir
}

let outDir = ''
let lib
before(async () => {
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'wo-profile-phones-'))
  const outfile = path.join(outDir, 'profile-phones.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement } from 'react'
        export { renderToStaticMarkup } from 'react-dom/server'
        export { ProfilePhonesRows } from './profile-phones-rows.tsx'
        export { phonesView } from './profile-phones-model.ts'
      `,
      resolveDir: path.join(here, '..', 'src', 'client'),
      loader: 'tsx'
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    alias: {
      react: fromStore('react@18.3.1', 'react'),
      'react-dom': fromStore('react-dom@18.2.0_react@18.3.1', 'react-dom')
    },
    loader: { '.css': 'empty' },
    define: { 'process.env.NODE_ENV': '"development"' },
    outfile,
    logLevel: 'silent'
  })
  lib = require(outfile)
})
after(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

const t = (key, params) => `[${key}${params ? JSON.stringify(params) : ''}]`
// The server's decision for Harbour Sport Club (dev, 26/10/2026): Google's number first, the bio's other one after.
const DUBAI = {
  phone: '+971 50 000 1234',
  phoneSources: ['google', 'instagram'],
  otherPhones: [{ phone: '+971 50 000 5678', sources: ['instagram'] }]
}
const draw = (view) => lib.renderToStaticMarkup(lib.createElement(lib.ProfilePhonesRows, { t, view }))

test('Dubai case: Phone with Main, Other phones with who states each, the Contact note', () => {
  const view = lib.phonesView(DUBAI)
  assert.deepEqual(view, {
    main: '+971 50 000 1234',
    mainWhatsapp: false,
    others: [{ phone: '+971 50 000 5678', sources: ['instagram'], whatsapp: false }]
  })
  const html = draw(view)
  assert.match(html, /\[field\.phone\][\s\S]*\+971 50 000 1234[\s\S]*\[phone\.main\]/)
  assert.match(html, /\[field\.otherPhones\][\s\S]*\+971 50 000 5678[\s\S]*Instagram/)
  assert.match(html, /\[phone\.othersNote\]/)
})

test('a WhatsApp number says so; a website and a listing site are named in the reader’s words', () => {
  const html = draw(
    lib.phonesView({
      phone: '+971 4 123 4567',
      phoneWhatsapp: true,
      otherPhones: [{ phone: '+971 50 000 5678', sources: ['website', 'listing'], whatsapp: true }]
    })
  )
  assert.equal((html.match(/WhatsApp/g) ?? []).length, 2)
  assert.match(html, /\[name\.source\.website\], \[name\.source\.listing\]/)
})

test('one number: no Main chip and no Other phones row; no number, no view', () => {
  const view = lib.phonesView({ phone: '+971 50 000 1234' })
  assert.deepEqual(view.others, [])
  const html = draw(view)
  assert.doesNotMatch(html, /\[phone\.main\]|\[field\.otherPhones\]/)
  assert.equal(lib.phonesView({}), null)
  // The main number listed again among the others is not shown twice.
  assert.deepEqual(lib.phonesView({ ...DUBAI, otherPhones: [{ phone: '+971 50 000 1234' }] }).others, [])
})
