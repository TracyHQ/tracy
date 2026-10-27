// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openExternally } from '../src/client/open-externally.ts'

// Tracy: the Browser tab's "Open externally" and "Open in browser" say outright that the person wants
// the system browser. In the Tracy desktop app the window routes the links it is asked to open
// (a site's page opens in this very tab), so these two buttons go through the app's bridge instead
// of `window.open`; on the web nothing changes (TCH tasks/todo-desktop-window-shell.md).
describe('openExternally', () => {
  afterEach(() => {
    delete (globalThis as { tracyDesktop?: unknown }).tracyDesktop
    vi.restoreAllMocks()
  })

  it('opens a new browser tab on the web, as before', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    openExternally('https://r1.example/about/')
    expect(open).toHaveBeenCalledWith('https://r1.example/about/', '_blank', 'noopener')
  })

  it("asks the desktop app's bridge for the system browser, and opens no window itself", () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const openExternal = vi.fn()
    ;(globalThis as { tracyDesktop?: unknown }).tracyDesktop = { links: { openExternal } }
    openExternally('https://r1.example/about/')
    expect(openExternal).toHaveBeenCalledWith('https://r1.example/about/')
    expect(open).not.toHaveBeenCalled()
  })
})
