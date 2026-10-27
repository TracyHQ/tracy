/** Which favicon URLs are a CMS's stock icon (`src/client/default-favicons.ts`). */
import { describe, expect, it } from 'vitest'
import { isStockFavicon } from '../src/client/default-favicons.ts'

describe('isStockFavicon', () => {
  it('knows Joomla\'s system icons, as the local Joomla site javoyara declares them', () => {
    expect(isStockFavicon('http://javoyara.tracy.test:18080/media/system/images/joomla-favicon.svg')).toBe(true)
    expect(isStockFavicon('http://javoyara.tracy.test:18080/media/system/images/favicon.ico')).toBe(true)
    expect(isStockFavicon('http://javoyara.tracy.test:18080/media/system/images/joomla-favicon-pinned.svg')).toBe(true)
  })
  it('knows WordPress\'s W logos in wp-includes', () => {
    expect(isStockFavicon('https://w.test/wp-includes/images/w-logo-blue-white-bg.png')).toBe(true)
    expect(isStockFavicon('https://w.test/wp-includes/images/w-logo-blue.png')).toBe(true)
  })
  it('still knows them for a site in a sub-folder, with a query, or in other letter case', () => {
    expect(isStockFavicon('https://a.test/shop/media/system/images/joomla-favicon.svg?v=5')).toBe(true)
    expect(isStockFavicon('https://a.test/Media/System/Images/Favicon.ico')).toBe(true)
  })
  it('keeps a site\'s own icon', () => {
    expect(isStockFavicon('https://a.test/images/brand/favicon.svg')).toBe(false)
    expect(isStockFavicon('https://a.test/wp-content/uploads/2026/09/cropped-icon-32x32.png')).toBe(false)
    expect(isStockFavicon('https://a.test/favicon.svg')).toBe(false)
    expect(isStockFavicon('https://a.test/templates/ja_trip/favicon.ico')).toBe(false)
    expect(isStockFavicon('https://a.test/media/templates/site/cassiopeia/images/favicon.svg')).toBe(false)
  })
  it('does not match a look-alike file name or a broken URL', () => {
    expect(isStockFavicon('https://a.test/images/my-joomla-favicon.svg')).toBe(false)
    expect(isStockFavicon('not a url')).toBe(false)
  })
})
