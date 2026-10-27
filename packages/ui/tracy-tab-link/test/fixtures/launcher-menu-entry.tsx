/**
 * Fixture for `../e2e/launcher-menu-opaque.test.mjs`: the right column's `+` launcher as dsh draws
 * it, over a busy page, with this plugin's opaque-menu rule installed.
 *
 * - the launcher is `ui-sidebar-right`'s own `Launcher` (the fork this repo pins), so its trigger
 *   markers and the portalled `Menu`/`MenuSurface` under test are the ones customers run;
 * - the fork's own token sheets give the menu material its real translucent fill and blur, in light
 *   and under `body[data-ds-dark-theme]`;
 * - a grid of coloured cards behind the menu stands in for the start cards that showed through it;
 * - a second, unrelated dsh menu shows the rule reaches the launcher's menu only.
 */
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../../../../../vendor/tracy/deepseek-harness/packages/client/ui-theme/src/styles/design-platform.css'
import '../../../../../vendor/tracy/deepseek-harness/packages/client/ui-theme/src/styles/gradient-shadow-text.css'
import { Launcher } from '../../../../../vendor/tracy/deepseek-harness/packages/client/ui-sidebar-right/src/client/shell/Launcher'
import { Menu } from '../../../../../vendor/tracy/deepseek-harness/packages/client/ui-primitives/src/Menu'
import { installLauncherMenuOpaque } from '../../src/client/launcher-menu-opaque'

const ENTRIES = [
  ['tracy:add-site', 'Add site'],
  ['tracy:my-sites', 'My Sites'],
  ['tracy:design-inspiration', 'Design templates']
].map(([kind, title]) => ({ kind, title: () => title }))

/** Any other dsh menu on the page, opened by its own button. */
function OtherMenu() {
  const [open, setOpen] = useState(false)
  return (
    <Menu
      open={open}
      portal
      compact
      onClose={() => setOpen(false)}
      items={[{ id: 'rename', label: 'Rename' }]}
      onSelect={() => setOpen(false)}
      anchor={
        <button type="button" id="other" onClick={() => setOpen((v) => !v)}>
          Other
        </button>
      }
    />
  )
}

function Page() {
  return (
    <>
      <div id="cards">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="card" />
        ))}
      </div>
      <div id="strip">
        <Launcher
          {...({
            launcher: { kinds: ENTRIES.map((e) => e.kind), label: 'Open a tab', emptyLabel: 'Empty' },
            entries: ENTRIES,
            paneId: 'pane-1',
            guideId: undefined,
            active: true,
            openTab: () => {}
          } as any)}
        />
        <OtherMenu />
      </div>
    </>
  )
}

installLauncherMenuOpaque(document)
createRoot(document.getElementById('root') as HTMLElement).render(<Page />)
