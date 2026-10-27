/**
 * Browser fixture for the Need help? pill beside dsh's scroll-to-bottom chevron.
 *
 * Mounts the REAL `HelpButton` and the real stylesheet (`styles.ts`) into a page that draws the
 * parts of dsh's conversation column the pill depends on: the scroll body, the sticky composer
 * seat, and the chat frame the chevron mounts into (`window.__harness.setChevron`, defined by the
 * test's page so a chevron can exist before this bundle mounts the pill; `unmount` and `mount` are
 * added here). Only that layout is copied, by hand, from dsh's CSS modules; a change in dsh's own
 * rules is outside what this fixture can see.
 */
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { HelpButton } from '../../src/client/community'
import { en } from '../../src/client/strings'
import { CSS } from '../../src/client/styles'

const style = document.createElement('style')
style.textContent = CSS
document.head.appendChild(style)

const t = (key: keyof typeof en): string => en[key] ?? key
const root = createRoot(document.getElementById('dock-slot') as HTMLElement)
root.render(<HelpButton t={t} />)
// Take the pill off the page and put it back, each committed before returning, so a test can check
// that the unmounted pill's observers no longer write and the new one places itself.
const harness = (window as unknown as { __harness: Record<string, () => void> }).__harness
harness.unmount = () => flushSync(() => root.render(null))
harness.mount = () => flushSync(() => root.render(<HelpButton t={t} />))

// The seat's height rides --dsh-composer-height on the scroller, as ConversationContent publishes it.
const seat = document.getElementById('seat') as HTMLElement
const scroller = seat.parentElement as HTMLElement
new ResizeObserver(() =>
  scroller.style.setProperty('--dsh-composer-height', `${seat.offsetHeight}px`)
).observe(seat)
