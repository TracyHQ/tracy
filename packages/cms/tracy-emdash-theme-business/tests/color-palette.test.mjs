/**
 * The template's colours are its own tokens, not Tailwind's default palette (ADR 0023, PR 6).
 *
 * Tailwind v4 ships ~240 default colours (`text-red-500`, `bg-slate-100`…); a class naming one
 * compiles to a colour this site's design never chose, and the by-value adherence check then flags
 * it on a customer page. `--color-*: initial` in `@theme` removes them; the two defaults the
 * template really uses (`text-white`, `bg-black/50`) are declared again as its own tokens, same
 * values, so the rendered pages do not change.
 *
 *   node --test tests/color-palette.test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { compile } from 'tailwindcss'

const here = path.dirname(fileURLToPath(import.meta.url))
const styles = path.join(here, '..', 'src', 'styles')
const tailwindDir = path.join(here, '..', 'node_modules', 'tailwindcss')

/** The template's own sheet, compiled the way Vite compiles it: Tailwind first, then the tokens. */
async function build(candidates) {
  const compiler = await compile('@import "tailwindcss";\n@import "./tokens.css";\n', {
    base: styles,
    async loadStylesheet(id, base) {
      const file =
        id === 'tailwindcss'
          ? path.join(tailwindDir, 'index.css')
          : id.startsWith('tailwindcss/')
            ? path.join(tailwindDir, `${id.slice('tailwindcss/'.length)}.css`)
            : path.resolve(base, id)
      return { path: file, base: path.dirname(file), content: readFileSync(file, 'utf8') }
    }
  })
  return compiler.build(candidates)
}

/** The rule a single utility produced, or '' when it produced none. */
const ruleOf = (css, cls) => {
  const escaped = cls.replace(/[/.]/g, (c) => `\\\\${c}`)
  return new RegExp(`\\.${escaped}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? ''
}

test("Tailwind's default palette no longer compiles", async () => {
  const css = await build(['text-red-500', 'bg-slate-100', 'border-blue-600'])
  for (const cls of ['text-red-500', 'bg-slate-100', 'border-blue-600'])
    assert.equal(ruleOf(css, cls), '', `${cls} should produce no rule`)
})

test('the defaults the template uses keep their exact colour, as its own tokens', async () => {
  const css = await build(['text-white', 'bg-black/50'])
  assert.match(ruleOf(css, 'text-white'), /color:\s*var\(--color-white\)/)
  assert.match(css, /--color-white:\s*#fff(fff)?\b/)
  assert.match(ruleOf(css, 'bg-black/50'), /--color-black/)
  assert.match(css, /--color-black:\s*#000(000)?\b/)
})

test("the template's own colours still compile", async () => {
  const css = await build(['text-ink', 'bg-paper', 'text-forest', 'border-line'])
  for (const cls of ['text-ink', 'bg-paper', 'text-forest', 'border-line'])
    assert.notEqual(ruleOf(css, cls), '', `${cls} should still produce a rule`)
})
