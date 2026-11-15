// The words of every language string a kit keeps, read from the blank site archive's own language files, reach the
// demo scan through its existing input `interfaceTexts` (ticket #587 triage of run 4: "Page 1 of 2", the search tips).
// An invented bakery archive: a kept core string with two number placeholders, a kept component string, a site
// override that wins over its original, and a string the kit does not keep.
import assert from 'node:assert/strict'
import test from 'node:test'
import { keptLanguageTextsOf } from '../ai-quickstart/gate/kept-language-texts.mjs'
import { corpusInputOf, demoCorpus } from '../ai-quickstart/rendered-scan.mjs'
import { demoWordsIn } from '../ai-quickstart/rendered-scan/match.mjs'

const files = new Map([
  ['language/en-GB/joomla.ini', 'JLIB_HTML_PAGE_CURRENT_OF_TOTAL="Page %1$s of %2$s"\nJNEXT="Next"\n'],
  ['language/en-GB/com_finder.ini', 'COM_FINDER_TIP="Join two words with AND to find both of them here."\n'],
  ['language/en-GB/com_users.ini', 'COM_USERS_LOGIN_REMIND="Forgot your username?"\n'],
  ['language/overrides/en-GB.override.ini', 'COM_USERS_LOGIN_REMIND="Lost your bakery login name?"\n']
])
const mapping = {
  overrides: {
    language: [
      { key: 'JLIB_HTML_PAGE_CURRENT_OF_TOTAL', keep: 'the pagination of a list' },
      { key: 'COM_FINDER_TIP', keep: 'the search tips' },
      { key: 'COM_USERS_LOGIN_REMIND', keep: 'the login form' }
    ]
  }
}

test('kept language texts: each kept key gives its words, the override winning, a number placeholder filled', () => {
  const texts = keptLanguageTextsOf(mapping, files)
  assert.ok(texts.includes('Join two words with AND to find both of them here.'))
  assert.ok(texts.includes('Lost your bakery login name?'))
  assert.ok(!texts.includes('Forgot your username?'))
  assert.ok(texts.includes('Page 1 of 2') && texts.includes('Page 12 of 20'))
  assert.ok(!texts.includes('Next'))
})

test('kept language texts: through interfaceTexts the demo scan reads them as interface, not demo', () => {
  const demo = { sentences: ['Page 1 of 2', 'Join two words with AND to find both of them here.'] }
  const input = corpusInputOf({ fixedTexts: demo.sentences }, { released: () => ({}) })
  const before = demoCorpus(input)
  input.interfaceTexts = [...(input.interfaceTexts ?? []), ...keptLanguageTextsOf(mapping, files)]
  const after = demoCorpus(input)
  for (const words of demo.sentences) assert.deepEqual(demoWordsIn(words, after), [], words)
  // The baseline is what makes them demo without the kit's keys (the control of this test).
  assert.ok(demoWordsIn('Page 1 of 2', before).length + demoWordsIn(demo.sentences[1], before).length > 0)
})

// Review 5 Z7: a page prints the site's language files; an administrator file is read only for a plugin's own strings
// (as the source resolver reads them), and after every site file, so an administrator screen's words never stand for a
// page's.
test('Z7: a site file wins over an administrator one, and only a plugin file of the administrator is read', () => {
  const both = new Map([
    ['administrator/language/en-GB/com_contact.ini', 'COM_CONTACT_DETAILS="Contact Information"\n'],
    ['language/en-GB/com_contact.ini', 'COM_CONTACT_DETAILS="Contact"\n'],
    ['administrator/language/en-GB/com_users.ini', 'COM_USERS_ADMIN_ONLY="Manage the accounts"\n'],
    ['administrator/language/en-GB/plg_content_bakery.ini', 'PLG_CONTENT_BAKERY_NOTE="Fresh today"\n']
  ])
  const keep = (key) => ({ key, keep: 'kept for the test' })
  const texts = keptLanguageTextsOf(
    {
      overrides: {
        language: [keep('COM_CONTACT_DETAILS'), keep('COM_USERS_ADMIN_ONLY'), keep('PLG_CONTENT_BAKERY_NOTE')]
      }
    },
    both
  )
  assert.deepEqual(texts.sort(), ['Contact', 'Fresh today'])
})
