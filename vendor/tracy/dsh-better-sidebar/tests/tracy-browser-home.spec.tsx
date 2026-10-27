// @vitest-environment jsdom
/**
 * Tracy (rc2 stand, 04/10/2026): the bottom workbench's "+" opens a Browser tab with no address,
 * which showed an empty start screen that still said "(sandbox mode)". In a site workspace the
 * empty tab now starts on the site itself, read from the page's `/api/sites`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetSiteHomeMemo, siteHomeOf } from '../src/client/BrowserView.tsx'

const rows = (sites: unknown[]) => (async () => new Response(JSON.stringify({ sites }), { status: 200 })) as unknown as typeof fetch

describe('siteHomeOf', () => {
  beforeEach(() => { resetSiteHomeMemo() })
  afterEach(() => { resetSiteHomeMemo(); vi.unstubAllGlobals() })

  it('answers the accepted site by key or alias, case-insensitively', async () => {
    const read = rows([
      { siteKey: 'rc2wp01.rc2.tracy.test', aliases: ['rc2wp01'], status: 'accepted', copyUrl: 'http://rc2wp01.rc2.tracy.test:31080/' },
      { siteKey: 'other.tracy.test', status: 'accepted', copyUrl: 'http://other/' },
    ])
    expect(await siteHomeOf('RC2WP01.rc2.tracy.test', read)).toBe('http://rc2wp01.rc2.tracy.test:31080/')
    resetSiteHomeMemo()
    expect(await siteHomeOf('rc2wp01', read)).toBe('http://rc2wp01.rc2.tracy.test:31080/')
  })

  it('answers null for a site the door does not list as accepted, and for a failed read', async () => {
    expect(await siteHomeOf('gone.tracy.test', rows([{ siteKey: 'gone.tracy.test', status: 'pending', copyUrl: 'http://gone/' }]))).toBe(null)
    resetSiteHomeMemo()
    expect(await siteHomeOf('x', (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch)).toBe(null)
    resetSiteHomeMemo()
    expect(await siteHomeOf('x', (async () => { throw new Error('offline') }) as unknown as typeof fetch)).toBe(null)
  })

  it('asks the door once per page', async () => {
    const read = vi.fn(rows([{ siteKey: 'a.test', status: 'accepted', copyUrl: 'http://a/' }]))
    await siteHomeOf('a.test', read as unknown as typeof fetch)
    await siteHomeOf('b.test', read as unknown as typeof fetch)
    expect(read).toHaveBeenCalledTimes(1)
  })
})
