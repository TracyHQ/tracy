// Every word a section prints from its entry carries a provenance stamp (`src/lib/stamps.ts`), so
// Tracy's comment picker can name the record and field behind it. Measured 29/09/2026 on 1.2.0: the
// sections stamped only eyebrow/title/sub, so the home page carried 26 stamps and no hero h1, repeater
// row, header, footer or blog word could be located. This reads the section sources against the
// schema in `seed/seed.json`: a field printed as `{data.<field>}` needs `s('<field>')`, and a repeater
// subfield printed as `{<row>.<subfield>}` needs `s('<repeater>.<subfield>')` plus `s.block('<repeater>')`.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')
const seed = JSON.parse(read('seed/seed.json'))
const registry = read('src/components/sections/registry.ts')
const components = [...registry.matchAll(/^\s+(\w+): (\w+),?$/gm)].map(([, collection, name]) => ({
  collection,
  file: `src/components/sections/${name}.astro`
}))

// Fields a section uses as settings (layout, links, flags), never as printed words.
const SETTINGS =
  /(^|_)(link|url|span|icon|variant|layout|columns|align|style|form_id|bright|size|show_signin)$/

/** The markup of a component: everything after its frontmatter, without its <style>/<script>. */
const markup = (src) =>
  src
    .split(/^---$/m)
    .slice(2)
    .join('---')
    .replace(/<(style|script)[\s\S]*?<\/\1>/g, '')

test('every section collection has a component', () => {
  assert.ok(components.length >= 15, `registry lists ${components.length} components`)
})

for (const { collection, file } of components) {
  test(`${collection}: printed fields and repeater rows carry stamps`, () => {
    const def = seed.collections.find((c) => c.slug === collection)
    assert.ok(def, `seed has no collection ${collection}`)
    const src = read(file)
    const body = markup(src)
    const missing = []
    for (const field of def.fields) {
      if (field.type === 'repeater') {
        const subs = (field.validation?.subFields ?? []).map((f) => f.slug)
        const printed = subs.filter(
          (sub) => !SETTINGS.test(sub) && new RegExp(`\\{\\w+\\.${sub}\\}`).test(body)
        )
        if (printed.length === 0) continue
        if (!src.includes(`s.block('${field.slug}')`)) missing.push(`s.block('${field.slug}')`)
        for (const sub of printed)
          if (!src.includes(`'${field.slug}.${sub}'`)) missing.push(`s('${field.slug}.${sub}')`)
      } else if (!SETTINGS.test(field.slug) && body.includes(`{data.${field.slug}}`)) {
        if (!src.includes(`s('${field.slug}')`)) missing.push(`s('${field.slug}')`)
      }
    }
    assert.deepEqual(missing, [], `${file} prints entry words without a stamp`)
  })
}
