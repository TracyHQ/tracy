// Canonical contracts for the quickstart tests: a design contract validateDesign accepts and a
// visual contract validateContract accepts, both carrying the bindings they are given. The cycle
// and release gates (release.mjs contractProblems) hold the run-root's contracts to that structure.
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { bindingsFrom, CANONICAL } from '../lib/canonical.mjs'
import { SCHEMA_VERSION, STAGES, VARIANTS } from '../visual/contract.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))

/** A valid design contract (the visual-prepass fixture) with `bindings`. */
export function designContract(bindings) {
  return { ...JSON.parse(readFileSync(path.join(HERE, 'fixtures', 'visual-prepass', 'design-contract.json'), 'utf8')), bindings }
}

/** A valid visual contract of one page, `home` at `/`, on every variant, with `bindings`. */
export function visualContract(bindings, { id = 'v', exceptions = null, source = null, sourceSite = 'http://source.test' } = {}) {
  const template = 'templates/page.html'
  return {
    schemaVersion: SCHEMA_VERSION,
    id,
    revision: 1,
    pending: [],
    locales: ['en'],
    defaultLocale: 'en',
    variants: VARIANTS,
    visual: { stages: STAGES },
    source: { site: sourceSite, ...(source ?? {}) },
    design: { theme: { attribute: 'data-theme', values: { light: 'light', dark: 'dark' } }, coverage: [{ selector: 'body', properties: ['color'] }], containers: { none: 'the fixture has no container grid' }, ...(exceptions ? { exceptions } : {}) },
    layouts: [{ id: 'page', template, templateFrom: 'declared', templateChecked: true, pages: ['home'], representative: 'home' }],
    pages: [{ id: 'home', locale: 'en', path: '/', layout: 'page', template, templateFrom: 'declared', identity: { body: 'home' }, states: ['default'], variants: VARIANTS.map((v) => v.id), source: ['/'] }],
    bindings
  }
}

/** Write both canonical contracts into `runRoot`, bound to `specDir` (and `artifactPath` when given); `exceptions` go to the visual contract's design. Returns them. */
export function writeContracts({ runRoot, specDir, artifactPath = null, id = 'v', exceptions = null, source = null, sourceSite = 'http://source.test' }) {
  const bindings = bindingsFrom({ specDir, artifactPath })
  const design = designContract(bindings)
  const visual = visualContract(bindings, { id, exceptions, source, sourceSite })
  writeFileSync(path.join(runRoot, CANONICAL.design), JSON.stringify(design))
  writeFileSync(path.join(runRoot, CANONICAL.visual), JSON.stringify(visual))
  return { design, visual }
}
