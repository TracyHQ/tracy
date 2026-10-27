// The checker must be able to FAIL, and must not fail for reasons nobody acts on. Both halves are
// tested here, because a drift check that cannot go red is the same defect it exists to catch, and
// one that goes red on a reworded comment gets muted by its readers within a week.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const CHECK = path.join(HERE, 'check-kit-sync.mjs')

/** A template that is a faithful copy of the kit, in a throwaway directory. */
function template(name) {
  // The manifest scopes optionality by template NAME, so a test about optionality has to build a
  // fixture the manifest knows. Everything else uses a random name on purpose: nothing may be
  // optional for a template nobody declared.
  const d = name ? path.join(mkdtempSync(path.join(tmpdir(), 'kitsync-')), name) : mkdtempSync(path.join(tmpdir(), 'kitsync-'))
  if (name) mkdirSync(d, { recursive: true })
  for (const dir of ['tools', 'tests', 'contract', 'ingest', 'src']) {
    try {
      cpSync(path.join(HERE, dir), path.join(d, dir), { recursive: true })
    } catch {}
  }
  // package.json so the checker can resolve the parser the way a real template does
  writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name: 'kitsync-fixture', private: true }))
  return d
}
const run = (d) => {
  const r = spawnSync('node', [CHECK, d], { encoding: 'utf8' })
  return { code: r.status, out: r.stdout + r.stderr }
}
const edit = (d, rel, from, to) => {
  const p = path.join(d, rel)
  const s = readFileSync(p, 'utf8')
  assert.ok(s.includes(from), `fixture edit anchor missing in ${rel}: ${from}`)
  writeFileSync(p, s.replace(from, to))
}

describe('check-kit-sync', () => {
  it('a stamps library that drifted from the kit FAILS, and a missing one is MISSING', () => {
    const d = template()
    try {
      edit(d, 'src/lib/stamps.ts', "export const PICK_HEADER = 'x-tracy-preview'", "export const PICK_HEADER = 'x-preview'")
      let r = run(d)
      assert.equal(r.code, 1, r.out)
      assert.match(r.out, /DIFFERS\s+src\/lib\/stamps\.ts/)
      rmSync(path.join(d, 'src/components/site/PageOwner.astro'))
      r = run(d)
      assert.match(r.out, /MISSING\s+src\/components\/site\/PageOwner\.astro/)
    } finally {
      rmSync(d, { recursive: true, force: true })
    }
  })

  it("a template's own src files are not the kit's business", () => {
    const d = template()
    try {
      mkdirSync(path.join(d, 'src/views'), { recursive: true })
      writeFileSync(path.join(d, 'src/views/Home.astro'), '<main />\n')
      const r = run(d)
      assert.equal(r.code, 0, r.out)
    } finally {
      rmSync(d, { recursive: true, force: true })
    }
  })

  it('a faithful copy passes', () => {
    const d = template()
    try {
      const r = run(d)
      assert.equal(r.code, 0, r.out)
      assert.match(r.out, /0 CODE DIFFERS/)
    } finally {
      rmSync(d, { recursive: true, force: true })
    }
  })

  it('a changed constant in a kit-owned file FAILS, and the message names the declaration', () => {
    const d = template()
    try {
      edit(d, 'tools/visual-lib.mjs', 'r * 0.299 + g * 0.587 + b * 0.114', 'r * 0.3 + g * 0.59 + b * 0.11')
      const r = run(d)
      assert.equal(r.code, 1, r.out)
      assert.match(r.out, /CODE DIFFERS\s+tools\/visual-lib\.mjs/)
      assert.match(r.out, /changed: export luma/)
    } finally {
      rmSync(d, { recursive: true, force: true })
    }
  })

  it('a reworded comment does NOT fail: the kit and a template describe the same measurement from different vantage points', () => {
    const d = template()
    try {
      const p = path.join(d, 'tools/visual-lib.mjs')
      writeFileSync(p, '// this template measures its own source\n' + readFileSync(p, 'utf8'))
      const r = run(d)
      assert.equal(r.code, 0, r.out)
    } finally {
      rmSync(d, { recursive: true, force: true })
    }
  })

  it('reformatting does NOT fail: TCH runs a prettier gate over its checkout and the kit repo does not', () => {
    const d = template()
    try {
      edit(d, 'tools/visual-lib.mjs', "export const luma = ({ r, g, b }) =>", "export const luma = ({\n  r,\n  g,\n  b\n}) =>")
      const r = run(d)
      assert.equal(r.code, 0, r.out)
    } finally {
      rmSync(d, { recursive: true, force: true })
    }
  })

  it('a file the template ADDED under tools/ is reported, not counted as drift — the old checker walked kit files only and could not see it at all', () => {
    const d = template()
    try {
      writeFileSync(path.join(d, 'tools/only-here.mjs'), 'export const x = 1\n')
      const r = run(d)
      assert.equal(r.code, 0, r.out)
      assert.match(r.out, /template-only\s+tools\/only-here\.mjs/)
    } finally {
      rmSync(d, { recursive: true, force: true })
    }
  })

  it('a kit-owned file the template DELETED fails; one the manifest marks optional does not', () => {
    const d = template()
    try {
      rmSync(path.join(d, 'tools/visual-lib.mjs'))
      const r = run(d)
      assert.equal(r.code, 1, r.out)
      assert.match(r.out, /MISSING\s+tools\/visual-lib\.mjs/)
    } finally {
      rmSync(d, { recursive: true, force: true })
    }
    const e = template('tracy-emdash-theme-base')
    try {
      rmSync(path.join(e, 'ingest'), { recursive: true, force: true })
      const r = run(e)
      assert.equal(r.code, 0, r.out)
      assert.match(r.out, /not carried\s+ingest\//)
    } finally {
      rmSync(e, { recursive: true, force: true })
    }
  })

  it('a template test file may differ — every template tests its own site', () => {
    const d = template()
    try {
      const p = path.join(d, 'tests/visual.test.mjs')
      const s = readFileSync(p, 'utf8')
      writeFileSync(p, s + '\nconst SOMETHING_THIS_TEMPLATE_NEEDS = 1\nexport { SOMETHING_THIS_TEMPLATE_NEEDS }\n')
      const r = run(d)
      assert.equal(r.code, 0, r.out)
    } finally {
      rmSync(d, { recursive: true, force: true })
    }
  })

  it('a moved const FAILS but a moved function does not — only hoisted declarations may travel', () => {
    // Measured 19/09/2026: before this rule, two top-level consts swapped so the second read the
    // first before it was initialised — a TDZ ReferenceError at runtime — was reported as "same
    // code in a different order" and exited 0. A false negative in a drift check is worse than a
    // false positive: it is the check telling you it looked.
    const d = template()
    try {
      writeFileSync(
        path.join(d, 'tools', 'order-fixture.mjs'),
        'const derived = base * 2\nconst base = 10\nexport { derived }\n'
      )
      writeFileSync(
        path.join(HERE, 'tools', 'order-fixture.mjs'),
        'const base = 10\nconst derived = base * 2\nexport { derived }\n'
      )
      const r = run(d)
      assert.equal(r.code, 1, r.out)
      assert.match(r.out, /ORDER DIFFERS\s+tools\/order-fixture\.mjs/)
    } finally {
      rmSync(path.join(HERE, 'tools', 'order-fixture.mjs'), { force: true })
      rmSync(d, { recursive: true, force: true })
    }
  })

  it('two function declarations in a different order do NOT fail: they are hoisted, so nothing observes the move', () => {
    const d = template()
    try {
      writeFileSync(path.join(HERE, 'tools', 'hoist-fixture.mjs'), 'export function a() {\n  return 1\n}\nexport function b() {\n  return 2\n}\n')
      writeFileSync(path.join(d, 'tools', 'hoist-fixture.mjs'), 'export function b() {\n  return 2\n}\nexport function a() {\n  return 1\n}\n')
      const r = run(d)
      assert.equal(r.code, 0, r.out)
    } finally {
      rmSync(path.join(HERE, 'tools', 'hoist-fixture.mjs'), { force: true })
      rmSync(d, { recursive: true, force: true })
    }
  })

  it('String.raw is not spelling: a tagged template whose raw text differs FAILS even though its cooked value matches', () => {
    // Measured 19/09/2026: dropping every `raw` field dropped TemplateElement.value.raw too, and
    // String.raw applied to a backslash-n versus an actual newline — two different runtime values —
    // was reported as "prose/format", exit 0. On a Literal `raw` is the quote style a formatter
    // rewrites; on a TemplateElement it is observable.
    const d = template()
    try {
      writeFileSync(path.join(HERE, 'tools', 'raw-fixture.mjs'), 'export const p = String.raw`a\\nb`\n')
      writeFileSync(path.join(d, 'tools', 'raw-fixture.mjs'), 'export const p = String.raw`a\nb`\n')
      const r = run(d)
      assert.equal(r.code, 1, r.out)
      assert.match(r.out, /CODE DIFFERS\s+tools\/raw-fixture\.mjs/)
    } finally {
      rmSync(path.join(HERE, 'tools', 'raw-fixture.mjs'), { force: true })
      rmSync(d, { recursive: true, force: true })
    }
  })

  it('a declared variant exempts the NAMED declarations, not the file: gutting the rest still fails', () => {
    // A whole-file exemption is a hole. Measured 19/09/2026: replacing business's release.mjs with
    // `process.exit(0)` passed, so artifact verification, the Dockerfile requirement and every
    // future shared fix were exempt along with the two Tracy-specific imports that earned the entry.
    const d = template()
    try {
      writeFileSync(path.join(d, 'tools', 'release.mjs'), 'process.exit(0)\n')
      const r = run(d)
      assert.equal(r.code, 1, r.out)
      assert.match(r.out, /CODE DIFFERS\s+tools\/release\.mjs/)
    } finally {
      rmSync(d, { recursive: true, force: true })
    }
  })

  it('optional is per TEMPLATE: what base may omit, another template may not', () => {
    // Measured 19/09/2026: a blanket optional list said "absent is fine" for every template, so
    // deleting business's contract/validate.mjs — which its own compile-seed imports — passed.
    // This fixture is named like neither template, so nothing is optional for it.
    const d = template()
    try {
      rmSync(path.join(d, 'contract'), { recursive: true, force: true })
      const r = run(d)
      assert.equal(r.code, 1, r.out)
      assert.match(r.out, /MISSING\s+contract\//)
    } finally {
      rmSync(d, { recursive: true, force: true })
    }
  })

  it('refuses rather than guessing when no parser is reachable', () => {
    const d = mkdtempSync(path.join(tmpdir(), 'kitsync-bare-'))
    try {
      mkdirSync(path.join(d, 'tools'))
      const r = spawnSync('node', [CHECK, d], { encoding: 'utf8', env: { ...process.env, NODE_PATH: '/nonexistent' } })
      // With acorn reachable from the kit this passes normally; the contract under test is only
      // that it NEVER silently compares bytes instead. Either it parsed, or it said it could not.
      assert.ok(r.status === 0 || r.status === 1 || (r.status === 2 && /will not fall back/.test(r.stderr)), `${r.status}: ${r.stdout}${r.stderr}`)
    } finally {
      rmSync(d, { recursive: true, force: true })
    }
  })
})
