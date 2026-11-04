// F8: the contract validator must be able to FAIL. A complete contract for the mini-html fixture
// passes; every rule the gate claims to enforce is proven by one mutation that must be rejected with
// the named error. `init` builds a skeleton whose source inventory is correct and whose pages are
// deliberately unauthored, so it cannot pass until the agent fills it in.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, cpSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { describe, it } from 'node:test'
import { validateContract, casesFor, contractHash } from '../tools/qa-contract.mjs'
import { miniContract, SOURCE } from './fixtures/mini/qa-contract.mjs'
const execFileP = promisify(execFile)
const TOOL = path.resolve(new URL('.', import.meta.url).pathname, '../tools/qa-contract.mjs')
const run = async (args) => {
  try {
    const r = await execFileP(process.execPath, [TOOL, ...args])
    return { code: 0, ...r }
  } catch (e) {
    return { code: e.code, stdout: e.stdout, stderr: e.stderr }
  }
}
const mutate = (fn) => {
  const c = miniContract()
  fn(c)
  return validateContract(c, SOURCE)
}
const rejects = (errors, re) =>
  assert.ok(
    errors.some((e) => re.test(e)),
    `expected ${re} in ${JSON.stringify(errors)}`
  )

describe('F8 — qa.contract validation', () => {
  it('visual criteria: coverage needs selector + properties, parity pairs must resolve, exceptions need a cited decision', () => {
    rejects(
      mutate((c) => {
        c.design.coverage = [{ selector: 'main h1' }]
      }),
      /design\.coverage\[0\]: properties required/
    )
    rejects(
      mutate((c) => {
        c.design.parity = { selectors: {}, properties: ['color'] }
      }),
      /parity\.selectors must name/
    )
    rejects(
      mutate((c) => {
        c.design.parity = { selectors: { h1: { content: 'nope' } }, properties: ['color'] }
      }),
      /parity\.selectors\.h1/
    )
    rejects(
      mutate((c) => {
        c.design.parity = { selectors: { h1: 'main h1' }, properties: [] }
      }),
      /parity\.properties required/
    )
    rejects(
      mutate((c) => {
        c.design.exceptions = [{ kind: 'scan:contrast', match: '(', reason: 'x', decision: 'y' }]
      }),
      /exceptions\[0\]: match must be a valid regex/
    )
    rejects(
      mutate((c) => {
        c.design.exceptions = [{ kind: 'scan:contrast', match: 'p', reason: 'x' }]
      }),
      /reason and a cited decision/
    )
    rejects(
      mutate((c) => {
        c.pages[0].images = 'count'
      }),
      /images must be 'placeholders' or absent/
    )
    assert.deepEqual(
      mutate((c) => {
        c.design.coverage = [{ selector: 'main h1', properties: ['color'] }]
        c.design.parity = {
          selectors: {
            h1: { content: 'title' },
            lede: 'main p',
            logo: { site: 'header img', source: { css: 'header img' } }
          },
          properties: ['color']
        }
        c.design.exceptions = [
          {
            kind: 'scan:contrast',
            match: '^p\\.meta',
            reason: 'source design',
            decision: 'visual-contract.md §meta'
          }
        ]
      }),
      []
    )
  })
  it('source kind and parity basis: what the source PROVIDES is declared apart from what the output must meet; frames are references, not converted pages', () => {
    // the mini contract declares neither → html + two-sided by default, still valid
    assert.deepEqual(
      mutate(() => {}),
      []
    )
    rejects(
      mutate((c) => {
        c.source.kind = 'figma-live'
      }),
      /source\.kind must be one of html, canvas, url, frames/
    )
    rejects(
      mutate((c) => {
        c.source.parity = 'eyeballed'
      }),
      /source\.parity must be one of two-sided, declared, none/
    )
    // frames cannot be rendered: two-sided parity has nothing to read
    rejects(
      mutate((c) => {
        c.source.kind = 'frames'
        c.source.parity = 'two-sided'
      }),
      /source\.kind frames requires source\.parity declared/
    )
    // design.parity pairs read a rendered source: declared/none contradicts them
    rejects(
      mutate((c) => {
        c.source.parity = 'declared'
        c.design.parity = { selectors: { h1: 'main h1' }, properties: ['color'] }
      }),
      /design\.parity needs source\.parity two-sided/
    )
    // a reference (frame, spec sheet) is cited by pages but never "converted"; unlike converted files it may stay unmapped
    const withFrame = miniContract()
    withFrame.source.files.push({
      path: 'frames/home-390.png',
      sha256: 'sha256:' + 'c'.repeat(64),
      disposition: 'reference'
    })
    assert.deepEqual(
      validateContract(withFrame),
      [],
      'shape only; against --source the frame must exist on disk like any file'
    )
    rejects(validateContract(withFrame, SOURCE), /source file inventory changed/)
    rejects(
      mutate((c) => {
        c.source.kind = 'frames'
        c.source.parity = 'declared'
        delete c.design.parity
      }),
      /source\.kind frames needs at least one reference file/
    )
  })
  it('fast gate overrides and layout families are explicit: ids must exist, a reason is required, a family is a string', () => {
    const withLayouts = (c) => {
      c.visual = { stages: [{ id: 'all', variants: c.variants.map((v) => v.id) }] }
      c.layouts = [
        {
          id: 'Page',
          view: 'src/views/Page.astro',
          representative: 'de-home',
          pages: c.pages.map((p) => p.id),
          states: ['default'],
          family: 'page'
        }
      ]
    }
    assert.deepEqual(mutate(withLayouts), [])
    rejects(
      mutate((c) => {
        withLayouts(c)
        c.layouts[0].family = 3
      }),
      /layouts\[Page\]\.family must be a non-empty string/
    )
    rejects(
      mutate((c) => {
        withLayouts(c)
        c.visual.fastGate = { add: [{ layout: 'Nope', reason: 'x' }] }
      }),
      /visual\.fastGate\.add\[0\]: unknown page or layout Nope/
    )
    rejects(
      mutate((c) => {
        withLayouts(c)
        c.visual.fastGate = { drop: [{ layout: 'Page' }] }
      }),
      /visual\.fastGate\.drop\[0\]: reason required/
    )
    rejects(
      mutate((c) => {
        withLayouts(c)
        c.visual.fastGate = { add: [{ page: 'de-home' }] }
      }),
      /visual\.fastGate\.add\[0\]: reason required/
    )
    assert.deepEqual(
      mutate((c) => {
        withLayouts(c)
        c.visual.fastGate = { add: [{ page: 'de-home', reason: 'the form page' }], drop: [] }
      }),
      []
    )
  })
  it('the complete mini contract passes against its source and enumerates pages × variants × states', () => {
    assert.deepEqual(validateContract(miniContract(), SOURCE), [])
    assert.equal(casesFor(miniContract()).length, 4 * 2 + 2 * 2)
    assert.match(contractHash(miniContract()), /^sha256:[a-f0-9]{64}$/)
  })
  it('a source file added, removed or changed after the contract was written is rejected', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'qa-src-'))
    cpSync(SOURCE, dir, { recursive: true })
    assert.deepEqual(validateContract(miniContract(), dir), [])
    writeFileSync(path.join(dir, 'style.css'), 'body{font-family:sans-serif}')
    rejects(validateContract(miniContract(), dir), /source hash changed: style.css/)
    writeFileSync(path.join(dir, 'extra.html'), '<html></html>')
    rejects(validateContract(miniContract(), dir), /source file inventory changed/)
  })
  it('unresolved decisions, unmapped converted pages and missing locales are rejected', () => {
    rejects(
      mutate((c) => c.pending.push('font licence')),
      /pending decisions/
    )
    rejects(
      mutate((c) => c.pages.splice(1, 1)),
      /unmapped source: de\/kontakt.html/
    )
    rejects(
      mutate((c) => {
        c.locales.push('it')
      }),
      /locale has no pages: it/
    )
    rejects(
      mutate((c) => {
        c.source.files[4].disposition = 'excluded'
      }),
      /excluded source needs reason/
    )
  })
  it('a page without a default state, content mapping, design rule or a known interaction is rejected', () => {
    rejects(
      mutate((c) => {
        c.pages[0].states = ['menu-open']
      }),
      /default state required: de-home/
    )
    rejects(
      mutate((c) => {
        c.pages[0].states.push('drawer')
      }),
      /unknown state de-home\/drawer/
    )
    rejects(
      mutate((c) => {
        c.pages[0].content = []
      }),
      /content mappings required: de-home/
    )
    rejects(
      mutate((c) => {
        c.pages[0].rules = []
      }),
      /design rules required: de-home/
    )
    rejects(
      mutate((c) => {
        c.pages[0].content[0].owner = 'guess'
      }),
      /content owner required: de-home\/title/
    )
    rejects(
      mutate((c) => {
        delete c.pages[0].content[0].expected
      }),
      /expected content required/
    )
    rejects(
      mutate((c) => {
        c.pages[1].path = '/'
      }),
      /page paths: duplicate/
    )
  })
  it('theme observations may be an absent attribute (null) but never undefined; styles are required per used variant', () => {
    assert.deepEqual(
      mutate((c) => {
        c.design.theme.values.light = null
      }),
      []
    )
    rejects(
      mutate((c) => {
        delete c.design.theme.values.dark
      }),
      /every theme needs an observed value/
    )
    rejects(
      mutate((c) => {
        delete c.design.rules[0].styles['mobile-dark']
      }),
      /measured styles missing: body-font\/mobile-dark/
    )
    rejects(
      mutate((c) => {
        c.interactions['menu-open'].maxInnerWidth = 'wide'
      }),
      /maxInnerWidth/
    )
  })
  it('every review gate needs a policy; only forms may be not-applicable, and only without the capability', () => {
    rejects(
      mutate((c) => {
        delete c.reviews.independent
      }),
      /review policy required: independent/
    )
    rejects(
      mutate((c) => {
        c.reviews.recovery = { mode: 'not-applicable', reason: 'x' }
      }),
      /only absent forms can be not-applicable: recovery/
    )
    rejects(
      mutate((c) => {
        c.reviews.forms = { mode: 'not-applicable', reason: 'none' }
      }),
      /forms cannot be excluded when capability is enabled/
    )
    assert.deepEqual(
      mutate((c) => {
        c.reviews.forms = { mode: 'not-applicable', reason: 'none' }
        c.capabilities = ['i18n']
      }),
      []
    )
  })
  it('CLI: exit 1 with the errors listed, exit 0 with the case count and contract hash', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'qa-cli-'))
    const good = path.join(dir, 'good.json'),
      bad = path.join(dir, 'bad.json')
    writeFileSync(good, JSON.stringify(miniContract()))
    const c = miniContract()
    c.pending.push('x')
    writeFileSync(bad, JSON.stringify(c))
    const ok = await run([good, '--source', SOURCE])
    assert.equal(ok.code, 0)
    assert.equal(JSON.parse(ok.stdout).cases, 12)
    const ko = await run([bad, '--source', SOURCE])
    assert.equal(ko.code, 1)
    assert.match(JSON.parse(ko.stdout).errors.join(), /pending/)
  })
  it('init: a skeleton with the hashed source inventory, config identity and no pages — which the validator rejects until authored', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'qa-init-'))
    const out = path.join(dir, 'qa.contract.json')
    const r = await run([
      'init',
      SOURCE,
      out,
      '--config',
      path.resolve(new URL('.', import.meta.url).pathname, 'fixtures/mini/template.config.json')
    ])
    assert.equal(r.code, 0, r.stderr)
    const c = JSON.parse(readFileSync(out, 'utf8'))
    assert.equal(c.id, 'mini-atelier')
    assert.deepEqual(c.locales, ['de', 'fr'])
    assert.deepEqual(
      c.source.files.map((f) => f.path),
      miniContract().source.files.map((f) => f.path)
    )
    assert.deepEqual(
      c.source.files.map((f) => f.sha256),
      miniContract().source.files.map((f) => f.sha256)
    )
    assert.deepEqual(
      c.source.files.map((f) => f.disposition),
      ['converted', 'converted', 'converted', 'converted', 'asset', 'asset']
    )
    assert.equal(c.design.theme.storageKey, 'mini-theme')
    assert.equal(c.reviews.forms.mode, 'required')
    const errors = validateContract(c, SOURCE)
    rejects(errors, /pending decisions/)
    rejects(errors, /pages and design rules must be nonempty/)
    const again = await run(['init', SOURCE, out])
    assert.equal(again.code, 1, 'must not overwrite an authored contract')
  })
})
