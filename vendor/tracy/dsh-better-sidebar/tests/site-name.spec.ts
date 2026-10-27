/**
 * Tracy (TCH #818): a site's name on screen and which site a page's address names, after a rename.
 */
import { describe, expect, it } from 'vitest'
import { siteNamed, siteNameOf } from '../src/client/site-name.ts'

const renamed = { siteKey: 'jo.test', displayName: 'jo-lee.test', aliases: ['jo.test', 'jo-old.test'] }
const other = { siteKey: 'wp.test' }

describe('siteNameOf', () => {
  it('prints the current name, or the key when the row carries none', () => {
    expect(siteNameOf(renamed)).toBe('jo-lee.test')
    expect(siteNameOf(other)).toBe('wp.test')
    expect(siteNameOf({ siteKey: 'em.test', displayName: '' })).toBe('em.test')
  })
})

describe('siteNamed', () => {
  it('finds a site by its key, its current name or an older name, ignoring case', () => {
    expect(siteNamed([other, renamed], 'jo.test')).toBe(renamed)
    expect(siteNamed([other, renamed], 'JO-LEE.test')).toBe(renamed)
    expect(siteNamed([other, renamed], 'jo-old.test')).toBe(renamed)
    expect(siteNamed([other, renamed], 'wp.test')).toBe(other)
  })
  it("prefers a key over another site's old name, and finds nothing for an unknown or missing name", () => {
    const took = { siteKey: 'jo-old.test' }
    expect(siteNamed([renamed, took], 'jo-old.test')).toBe(took)
    expect(siteNamed([renamed], 'nope.test')).toBeUndefined()
    expect(siteNamed([renamed], undefined)).toBeUndefined()
  })
})
