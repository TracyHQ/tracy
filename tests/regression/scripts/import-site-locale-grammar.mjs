import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

// Exercise the shipped locale registration as well as its source dictionaries.
const dictionaries = {}
const ctx = {
  effect: (fn) => fn(),
  locale: {
    addLanguage() {},
    register: (namespace, locale, dictionary) => {
      if (namespace === 'tracy-add-site') dictionaries[locale] = dictionary
    }
  }
}
vm.runInNewContext(fs.readFileSync('packages/locale/tracy-locales/lib/client.js', 'utf8'), {
  window: { __ModuleLoader__: { load: (module) => module.factory(() => {}).apply(ctx) } }
})
const expected = [
  ['es', 'import_problem_p10_what', 'Esta página admin pide primero una contraseña del servidor.'],
  ['es', 'import_problem_pf2_basic_what', 'Esta página admin pide primero una contraseña del servidor.'],
  ['es', 'import_problem_p24_what', 'WordPress pide datos FTP para instalar plugins.'],
  [
    'es',
    'import_problem_p8_fix_2',
    'Si la cuenta pide un código de su teléfono, elija <a data-import-link="manual"><b>Lo instalaré yo</b></a> arriba.'
  ],
  ['it', 'import_problem_pf1_wordfence_what', 'Wordfence ha bloccato la verifica di Tracy.'],
  [
    'it',
    'import_problem_p47_why',
    'Potrebbe essere ancora in corso. Questa pagina continua a verificare (ultima verifica: {checked}).'
  ]
]
for (const [locale, key, value] of expected) {
  const source = JSON.parse(
    fs.readFileSync(`packages/locale/tracy-locales/${locale}/tracy-add-site.json`, 'utf8')
  )
  assert.equal(source[key], value, `source ${locale}/${key}`)
  assert.equal(dictionaries[locale][key], value, `bundle ${locale}/${key}`)
  console.log(`ok - ${locale}/${key} uses the correct grammatical form in source and bundle`)
}
