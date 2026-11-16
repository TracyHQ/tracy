// The build chat's cards in the language of the conversation (#609, decided rule: the build chat asks in the language
// the person is chatting in): a card whose value names Vietnamese reads Vietnamese while the interface language is
// English, the session remembers it for the pieces that read no value of their own, a language without a table falls
// back to the interface language, and an English chat reads as before. Rendered with `react-dom/server`; the template
// and its business are invented.
//
//   node --test --test-concurrency=1 packages/ui/tracy-build-chat/test/chat-language-cards.test.mjs
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const corePkg = path.resolve(root, '..', '..', 'core', 'tracy-core')
const vi = JSON.parse(
  readFileSync(path.resolve(root, '../../locale/tracy-locale-vi/vi/tracy-build-chat.json'), 'utf8')
)
let out
let lib
before(async () => {
  const esbuild = require('esbuild')
  out = mkdtempSync(path.join(tmpdir(), 'chat-language-cards-'))
  const outfile = path.join(out, 'cards.cjs')
  await esbuild.build({
    stdin: {
      contents: `
        import { createElement } from 'react'
        import { renderToStaticMarkup } from 'react-dom/server'
        import { TemplateCard } from './TemplateCard'
        export { english } from './strings'
        export { createChatLanguages } from './chat-language'
        export const card = (props) => renderToStaticMarkup(createElement(TemplateCard, props))`,
      resolveDir: path.join(root, 'src', 'client'),
      loader: 'tsx'
    },
    absWorkingDir: root,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    nodePaths: [path.join(corePkg, 'node_modules')],
    plugins: [
      {
        name: 'icons-only',
        setup(b) {
          b.onResolve({ filter: /^@deepseek-ai\/dsh-client-ui-primitives$/ }, () => ({
            path: 'icons',
            namespace: 'stub'
          }))
          b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
            contents: 'export const IconCheckOutlineRegular = () => null',
            loader: 'js'
          }))
        }
      }
    ],
    outfile,
    logLevel: 'silent'
  })
  lib = require(outfile)
})
after(() => rmSync(out, { recursive: true, force: true }))

const SESSION = 'session-build-5e4d3c2b-1a0f-4e9d-8c7b-6a5f4e3d2c1b'
const TEMPLATES = [
  {
    slug: 'ja_sample_bakery',
    name: 'JA Sample Bakery',
    version: '1.0.0',
    picture: '',
    reason: 'Warm pages for a small bakery.',
    quickstart: 'released',
    fits: true,
    recommended: true
  }
]

test('a Vietnamese chat reads Vietnamese words on an English interface', () => {
  const languages = lib.createChatLanguages(() => lib.english)
  const t = languages.t(SESSION, 'vi')
  assert.equal(
    t('template.picked', { name: 'JA Sample Bakery' }),
    vi['template.picked'].replace('{name}', 'JA Sample Bakery')
  )
  assert.notEqual(t('template.picked', { name: 'X' }), lib.english('template.picked', { name: 'X' }))
  const html = lib.card({ templates: TEMPLATES, t, chosen: 'ja_sample_bakery', onChoose: () => {} })
  assert.ok(html.includes(vi['template.chosen'].replace('{name}', 'JA Sample Bakery')))
  assert.ok(html.includes(vi['template.recommended']))
  assert.ok(!html.includes('Chosen:'))
  // A piece that reads no value of its own (the review bar, Try again) follows the session's language.
  assert.equal(languages.t(SESSION)('review.approve'), vi['review.approve'])
  assert.equal(languages.languageOf(SESSION), 'vi')
})

test('a language without a table falls back to the interface language', () => {
  const languages = lib.createChatLanguages(() => lib.english)
  const t = languages.t(SESSION, 'sw')
  assert.equal(t('template.picked', { name: 'JA Sample Bakery' }), 'I picked JA Sample Bakery.')
  assert.equal(languages.languageOf(SESSION), null)
})

test('an English chat reads exactly as before, even on a Vietnamese interface', () => {
  const bound = (key, vars) => `vi:${key}:${JSON.stringify(vars ?? {})}`
  const languages = lib.createChatLanguages(() => bound)
  const t = languages.t(SESSION, 'en')
  const html = lib.card({ templates: TEMPLATES, t, chosen: 'ja_sample_bakery', onChoose: () => {} })
  assert.ok(html.includes('Chosen: JA Sample Bakery'))
  assert.equal(t('template.picked', { name: 'JA Sample Bakery' }), 'I picked JA Sample Bakery.')
  // With no language known yet, the interface language as dsh binds it.
  assert.equal(languages.t('session-build-other')('review.approve'), 'vi:review.approve:{}')
})
