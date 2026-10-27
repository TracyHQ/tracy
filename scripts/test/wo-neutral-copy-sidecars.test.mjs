import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { neutralFor } from '../../packages/wo/website-opportunities/domain/neutral-copy.mjs'
import { forbiddenFillerText } from '../../packages/wo/website-opportunities/domain/slot-fill-manifest.mjs'

const sidecars = [
  'packages/cms/tracy-joomla-quickstart/contracts/tracy-base/j6/1.0.5/slot-roles.json',
  'packages/cms/tracy-wordpress-quickstart/contracts/ja-restaurant/wp7/1.0.1/slot-roles.json',
  'packages/cms/tracy-emdash-theme-base/contracts/0.5.6/slot-roles.json'
]

for (const path of sidecars) {
  test(`all neutral keys resolve in ten languages: ${path}`, () => {
    const sidecar = JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'))
    for (const locale of ['en', 'vi', 'de', 'it', 'fr', 'nl', 'zh', 'es', 'ja', 'ar']) {
      const words = JSON.parse(
        readFileSync(
          new URL(
            `../../packages/wo/website-opportunities/domain/neutral-copy/${locale}.json`,
            import.meta.url
          ),
          'utf8'
        )
      )
      for (const group of sidecar.groups) {
        for (const [role, policy] of Object.entries(group.neutral)) {
          const keys = policy.key ? [[undefined, policy.key]] : Object.entries(policy.keysByKind ?? {})
          for (const [kind, key] of keys) {
            assert.ok(typeof words[key] === 'string' && words[key].trim(), `${locale}: ${key}`)
            const fill = neutralFor({
              role,
              policy,
              kind,
              locale,
              index: group.itemIndex,
              business: { email: 'hello@example.test' }
            })
            assert.deepEqual(fill, { state: 'neutral', text: words[key], neutralKey: key })
            assert.equal(forbiddenFillerText(fill.text), false)
          }
          if (policy.policy === 'empty')
            assert.deepEqual(neutralFor({ role, policy, locale }), { state: 'empty', text: '' })
          if (policy.policy === 'index_padded')
            assert.equal(
              neutralFor({ role, policy, locale, index: group.itemIndex }).text,
              String(group.itemIndex + 1).padStart(2, '0')
            )
        }
      }
    }
  })
}
