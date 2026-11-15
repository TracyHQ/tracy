// The kit declarations of ticket #587 on the invented fixture: the language overrides (closed shape, a true reason),
// the site icon (`look.favicon`), a business fact on a created record (`pages.<type>.record.facts`) and the words a
// template file writes as code (`keptLiterals`). Each is present with its reason, refused with a false or empty
// reason, and refused in an unknown shape.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { checkAiQuickstartContract } from '../domain/ai-quickstart-contract.mjs'

const read = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/ai-quickstart/${name}`, import.meta.url), 'utf8'))
const VALID = {
  blockStore: read('block-store.json'),
  pageRecipes: read('page-recipes.json'),
  mapping: read('mapping.json')
}
const valid = () => structuredClone(VALID)
const problemsOf = (set) => checkAiQuickstartContract(set).problems.map((p) => `${p.at}: ${p.message}`)
const near = (set, prefix) => problemsOf(set).filter((p) => p.startsWith(prefix))

const PAGINATION = {
  key: 'JNEXT',
  extension: 'joomla',
  language: 'en-GB',
  keep: 'the next link of a paged list: printed by the pagination layout of every list view, interface words valid on every site'
}

test('a platform language key is kept with what prints it; an empty, bare or "no page draws it" reason is refused (#587)', () => {
  const set = valid()
  set.mapping.overrides.language.push(structuredClone(PAGINATION))
  assert.deepEqual(near(set, 'overrides.language'), [])
  const lang = set.mapping.overrides.language
  lang[1].keep = ''
  assert.deepEqual(near(set, 'overrides.language'), [
    'overrides.language[1].keep: keep says why the words stay'
  ])
  lang[1].keep = 'kept: JNEXT'
  assert.deepEqual(near(set, 'overrides.language'), [
    'overrides.language[1].keep: keep says why the words stay: what prints them and why they suit every site'
  ])
  lang[1].keep = 'the next link: no page draws it (all pages read)'
  assert.deepEqual(near(set, 'overrides.language'), [
    'overrides.language[1].keep: a platform string is declared because a page prints it: say what prints it, not that no page draws it'
  ])
  // A template string of the content map keeps the class the draft gave it, "not-drawn" among them.
  lang[1] = { ...PAGINATION, key: 'TPL_EXAMPLE_HINT', extension: 'tpl_example', slot: 'languageString-9.0' }
  lang[1].keep = 'not-drawn: TPL_EXAMPLE_HINT: a warning no page draws (all pages read)'
  assert.deepEqual(near(set, 'overrides.language'), [])
})

test('a language override is a closed shape: one source, its extension and language, one entry per key (#587)', () => {
  const set = valid()
  const lang = set.mapping.overrides.language
  lang.push({ ...PAGINATION, value: 'Next', note: 'x' })
  lang.push({ ...PAGINATION, extension: '', language: 'english' })
  lang.push({ key: 'jnext', extension: 'joomla', language: 'en-GB', value: 'Next' })
  assert.deepEqual(near(set, 'overrides.language'), [
    'overrides.language[1].note: "note" is no key of a language override: key, extension, language, slot, value, filledBy, limit, keep, notFact, why',
    'overrides.language[1]: a language override needs its value source: a string value, the fields it is filledBy, or keep with the reason',
    'overrides.language[2].extension: name the extension whose language file holds the key (e.g. com_content, joomla)',
    'overrides.language[2].language: the language tag, such as en-GB',
    'overrides.language[3].key: a language key is upper case: letters, digits, underscores',
    'overrides.language[3].why: say why the key is written with this value'
  ])
  set.mapping.overrides.language = [lang[0], structuredClone(PAGINATION), structuredClone(PAGINATION)]
  assert.deepEqual(near(set, 'overrides.language'), [
    'overrides.language[2]: JNEXT (en-GB) is declared twice: one entry per key'
  ])
})

test('the site icon is made from the logo or the initials and written under the template folder (#587)', () => {
  const set = valid()
  set.mapping.look.favicon = {
    from: 'logo',
    fallback: 'initials',
    path: 'templates/example/favicon.ico',
    why: 'the invented template serves templates/example/favicon.ico as the site icon of every page'
  }
  assert.deepEqual(near(set, 'look.favicon'), [])
  Object.assign(set.mapping.look.favicon, {
    from: 'photo',
    fallback: 'none',
    path: '/favicon.ico',
    why: '',
    size: 32
  })
  assert.deepEqual(near(set, 'look.favicon'), [
    'look.favicon.size: "size" is no key here: from, fallback, path, why',
    'look.favicon.from: from is one of logo',
    'look.favicon.fallback: fallback is one of initials',
    'look.favicon.path: path is the icon file under templates/<template>/, an .ico, .png or .svg',
    'look.favicon.why: say why (what prints it, measured or read where)'
  ])
  set.mapping.look.favicon = 'logo'
  assert.deepEqual(near(set, 'look.favicon'), [
    'look.favicon: favicon is {from: "logo", fallback: "initials", path, why}'
  ])
})

test('a created article names the business fact its author column holds (#587)', () => {
  const set = valid()
  set.mapping.pages.services.record = {
    kind: 'article',
    category: {
      extension: 'com_content',
      parent: 'root',
      title: { from: 'page-title' },
      params: {},
      why: 'invented'
    },
    base: {},
    facts: {
      created_by_alias: { fact: 'name', why: 'the article page prints the author alias as its meta author' }
    },
    why: 'invented'
  }
  assert.deepEqual(near(set, 'pages.services.record.facts'), [])
  set.mapping.pages.services.record.facts = {
    created_by_alias: { fact: 'owner', why: 'x' },
    hits: { fact: 'name', why: 'not drawn on any page' }
  }
  assert.deepEqual(near(set, 'pages.services.record.facts'), [
    'pages.services.record.facts.created_by_alias: a record fact is {fact, why}, fact one of name, phone, address, email, social, logoLight, logoDark',
    'pages.services.record.facts.hits: "hits" holds no business fact of a created article: one of created_by_alias',
    'pages.services.record.facts.hits.why: the words are declared because a page shows them: say what prints them'
  ])
})

test('words a template file writes as code are kept by their file, as words or an anchored pattern (#587)', () => {
  const set = valid()
  set.mapping.keptLiterals = [
    {
      file: 'templates/example/html/article.php',
      values: ['facebook', 'twitter'],
      why: 'the share bar of the invented article layout prints each network name as a tooltip'
    },
    { file: 'templates/example/steps.php', pattern: '^0[1-9]$', why: 'the step list prints each step number' }
  ]
  assert.deepEqual(near(set, 'keptLiterals'), [])
  set.mapping.keptLiterals = [
    { file: '../outside.php', values: [], why: '' },
    { file: 'templates/example/steps.php', pattern: '.*', why: 'the step numbers' },
    { file: 'templates/example/steps.php', pattern: '^.*$', why: 'the step numbers' },
    { file: 'templates/example/steps.php', values: ['01'], pattern: '^0\\d$', why: 'x', code: 1 }
  ]
  assert.deepEqual(near(set, 'keptLiterals'), [
    'keptLiterals[0].file: file is a path inside the template release',
    'keptLiterals[0].values: values lists the words the file writes',
    'keptLiterals[0].why: say why (what prints it, measured or read where)',
    'keptLiterals[1].pattern: pattern is an anchored regular expression: "^...$"',
    'keptLiterals[2].pattern: pattern keeps words of any kind: name only the words the file computes',
    'keptLiterals[3].code: "code" is no key here: file, values, pattern, why',
    'keptLiterals[3]: a kept literal names its words: values (the words) or pattern (the words the file computes)'
  ])
})

test('a kept literal naming a picture file keeps pictures of its folder; a pattern or another folder is refused (#587)', () => {
  const set = valid()
  const icon = 'templates/petal/images/icon/arrow.svg'
  set.mapping.keptLiterals = [
    {
      file: icon,
      values: [icon, 'templates/petal/images/icon/dot.svg'],
      why: 'the list arrows the stylesheet draws'
    }
  ]
  assert.deepEqual(near(set, 'keptLiterals'), [])
  set.mapping.keptLiterals = [
    { file: icon, pattern: '^arrow$', why: 'the list arrow the stylesheet draws' },
    { file: icon, values: ['images/demo/cake.jpg'], why: 'the list arrow the stylesheet draws' }
  ]
  assert.deepEqual(near(set, 'keptLiterals'), [
    'keptLiterals[0].pattern: a kept picture lists its picture files in values',
    'keptLiterals[1].values: values lists picture files of the folder of file'
  ])
})
