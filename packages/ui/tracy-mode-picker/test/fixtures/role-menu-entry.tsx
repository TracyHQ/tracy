/**
 * Fixture for `../e2e/role-menu-check-only.test.mjs`: the composer's role chip and its menu, drawn
 * by this plugin's own `PickerButton` with its own stylesheet, over dsh's real colour tokens.
 *
 * - `design-platform.css` is the fork's own token sheet, so `--dsw-alias-*` (the hover and active
 *   tints) carry the values customers see, in light and under `body[data-ds-dark-theme]`;
 * - the four rows are the role menu's shape: an icon, a name, a hint, Designer chosen.
 */
import { createRoot } from 'react-dom/client'
import { Code2, Palette, PenLine, TrendingUp } from 'lucide-react'
import '../../../../../vendor/tracy/deepseek-harness/packages/client/ui-theme/src/styles/design-platform.css'
import { PickerButton, type DropdownItem } from '../../src/client/index'
import { CSS } from '../../src/client/styles'

const style = document.createElement('style')
style.textContent = CSS
document.head.appendChild(style)

const ROWS: Array<[string, string, typeof Palette]> = [
  ['designer', 'Designer', Palette],
  ['developer', 'Developer', Code2],
  ['writer', 'Writer', PenLine],
  ['seo', 'SEO/GEO', TrendingUp]
]

let chosen = 'designer'
const root = createRoot(document.getElementById('root') as HTMLElement)

function render(): void {
  const items: DropdownItem[] = ROWS.map(([id, name, Icon]) => ({
    id,
    icon: <Icon className="tv-seat-icon" />,
    name,
    hint: `${name} preset`,
    selected: id === chosen
  }))
  root.render(
    <PickerButton
      up
      className="tv-role-chip"
      label={ROWS.find(([id]) => id === chosen)?.[1] ?? chosen}
      ariaLabel="Mode"
      items={items}
      onSelect={(id) => {
        chosen = id
        render()
      }}
    />
  )
}

render()
