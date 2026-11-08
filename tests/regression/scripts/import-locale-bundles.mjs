import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const root = fileURLToPath(new URL('../../../', import.meta.url))
for (const [name, languages] of [
  ['tracy-locale-vi', ['vi']],
  ['tracy-locales', ['de', 'es', 'fr', 'it', 'nl', 'zh']]
]) {
  test(`generated ${name} registers every dictionary with its exact localized values`, () => {
    const dir = path.join(root, 'packages/locale', name)
    const registrations = new Map()
    const added = []
    const context = {
      window: {
        __ModuleLoader__: {
          load({ factory }) {
            const plugin = factory(() => {
              throw new Error('unexpected bundle dependency')
            })
            plugin.apply({
              effect(fn) {
                fn()
              },
              locale: {
                register(ns, lang, dictionary) {
                  const key = `${lang}/${ns}`
                  assert.equal(registrations.has(key), false, `duplicate dictionary: ${key}`)
                  registrations.set(key, JSON.parse(JSON.stringify(dictionary)))
                },
                addLanguage(row) {
                  added.push(JSON.parse(JSON.stringify(row)))
                }
              }
            })
          }
        }
      }
    }
    vm.runInNewContext(readFileSync(path.join(dir, 'lib/client.js'), 'utf8'), context)
    let expected = 0
    for (const lang of languages) {
      for (const file of readdirSync(path.join(dir, lang)).filter((file) => file.endsWith('.json'))) {
        expected++
        const key = `${lang}/${file.slice(0, -5)}`
        assert.deepEqual(
          registrations.get(key),
          JSON.parse(readFileSync(path.join(dir, lang, file), 'utf8')),
          key
        )
      }
    }
    assert.equal(registrations.size, expected)
    if (name === 'tracy-locales')
      assert.deepEqual(added, JSON.parse(readFileSync(path.join(dir, 'languages.json'), 'utf8')))
    else assert.deepEqual(added, [])
  })
}
