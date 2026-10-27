import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const locales = new URL('../../../locale/tracy-locales/', import.meta.url)
const cases = {
  es: {
    import_problem_p15_why: 'prolongar la pausa',
    import_problem_p28_fix_0: 'Si vuelve a ocurrir',
    import_problem_p31_why: 'no se ve afectado',
    import_problem_p39_fix_1: 'Tracy vuelve a copiar',
    import_problem_p46_fix_0: 'Si vuelve a fallar',
    import_problem_p49_fix_0: 'Si vuelve a fallar',
    import_problem_p51_fix_1: 'Si no se abre nada'
  },
  it: {
    import_problem_p40_why: 'Tracy riprova automaticamente'
  }
}

test('import problem guidance uses correct Spanish and Italian grammar', () => {
  for (const [language, expected] of Object.entries(cases)) {
    const file = new URL(`${language}/tracy-add-site.json`, locales)
    const dictionary = JSON.parse(readFileSync(file, 'utf8'))
    for (const [key, phrase] of Object.entries(expected)) {
      assert.ok(dictionary[key]?.includes(phrase), `${language}.${key}: ${phrase}`)
    }
  }
})
