import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BROWSER_SCHEMA, REPORT_FILE, REPORT_SCHEMA } from '../ingest/source-font.mjs'
import { domStaticFingerprint } from '../ingest/dom-source-font.mjs'

export function addPassingDomBrowserFixture(packDir) {
  const file = join(packDir, REPORT_FILE)
  const report = JSON.parse(readFileSync(file, 'utf8'))
  const staticReport = report.static
  const site = report.siteUrl ?? 'http://fixture.invalid'
  for (const page of staticReport.pages) {
    const sourceFile = String(page.file ?? 'missing-page.html')
    page.referenceUrl = new URL(`/${sourceFile.replace(/^pages\//, '').split('/').map(encodeURIComponent).join('/')}`, `${site}/`).href
  }
  staticReport.fingerprint = domStaticFingerprint(staticReport)
  report.browser = {
    schema: BROWSER_SCHEMA, site, static: { fingerprint: staticReport.fingerprint }, widths: [1440, 390],
    measuredAt: '2026-01-01T00:00:00.000Z', unresolved: [],
    pages: staticReport.pages.map(({ route, file: sourceFile, width, htmlSha256, referenceUrl }) => ({
      file: sourceFile, htmlSha256,
      route, kind: route === '/' ? 'home' : 'extra', styleId: null, template: null, width,
      url: referenceUrl, finalUrl: referenceUrl, status: 200, absent: [],
      roles: Object.fromEntries(['body', 'h1', 'h2', 'h3', 'nav'].map((role) => [role, { requested: 'Arial, sans-serif', drawn: [{ name: 'Arial', glyphs: 20, custom: false }], size: role === 'body' ? '16px' : '30px', chars: 40, text: 'Fixture text' }])), faces: [], failedRequests: []
    }))
  }
  report.schema = REPORT_SCHEMA
  writeFileSync(file, JSON.stringify(report, null, 2) + '\n')
}
