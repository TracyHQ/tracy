/**
 * Fixture for `../e2e/preset-picker-switch.test.mjs`: the two preset choosers this plugin draws —
 * the hero `Seat` (Mode / Platform pills) and the composer's `RoleChip` — mounted with a fixed
 * controller, so the only thing deciding whether they paint is the `preset-picker` switch the page
 * reads from `/api/ui` (the test server answers that door).
 */
import { createRoot } from 'react-dom/client'
import { RoleChip, Seat } from '../../src/client/index'
import { CSS } from '../../src/client/styles'

const style = document.createElement('style')
style.textContent = CSS
document.head.appendChild(style)

const snapshot = {
  options: ['designer', 'developer', 'writer', 'seo'].map((role) => ({
    id: `${role}-wordpress`,
    name: role
  })),
  current: 'designer-wordpress',
  busy: false,
  error: null,
  locked: false,
  sitePlatform: 'wordpress'
}
const controller = {
  subscribe: () => () => {},
  getSnapshot: () => snapshot,
  load: () => Promise.resolve(),
  select: () => Promise.resolve(),
  sessionChanged: () => {}
} as never

createRoot(document.getElementById('root') as HTMLElement).render(
  <>
    <div data-fixture="seat">
      <Seat controller={controller} />
    </div>
    <div data-fixture="role-chip">
      <RoleChip controller={controller} />
    </div>
  </>
)
