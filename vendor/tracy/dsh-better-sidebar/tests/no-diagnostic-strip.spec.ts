import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Tracy: customers (web and the desktop app) must never see the red diagnostic
// strip upstream pins to the page; failures go to the console only (Lee, 08/10/2026).
describe('client failure reporting', () => {
  const source = readFileSync(fileURLToPath(new URL('../src/client/index.tsx', import.meta.url)), 'utf8')
  const fail = source.slice(source.indexOf('const fail = '), source.indexOf('const sidebarStore'))

  it('logs a failure with the plugin prefix', () => {
    expect(fail).toContain('console.error(`[dsh-better-sidebar] ${phase} error:`')
  })

  it('never pins anything to the page', () => {
    expect(fail).not.toMatch(/createElement|appendChild|position:fixed/)
  })
})
