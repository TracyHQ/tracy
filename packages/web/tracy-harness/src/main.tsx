import { TooltipProvider } from '@tracy/ui'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import { loadLanguage } from './i18n/catalog.ts'
import { createOpsLanguage } from './i18n/ops-language.ts'
import { I18nProvider } from './i18n'
import { applyTheme, readThemeChoice } from './shell/theme'
import './style.css'

/**
 * The harness surface.
 *
 * NO SIGN-IN HERE. `workers/harness` refuses every request that has not passed Tracy's own
 * `/login` and holds a seat in the `tracy_admin` workspace — by the time this code runs, the
 * viewer is staff. A login form here would be a second door in front of a door that already
 * closed, and the second one would be the weaker of the two.
 */
// The remembered theme lands on <html> before the first paint, so a dark choice never flashes light.
applyTheme(readThemeChoice())

// The language's dictionary is fetched before the first paint, so a German page never flashes
// English; `<html lang>` is set when it lands. A slow or failed chunk paints English, never nothing.
const language = createOpsLanguage({ win: window, load: loadLanguage })
const FIRST_PAINT_WAIT_MS = 1500

function render() {
  createRoot(document.getElementById('root') as HTMLElement).render(
    <StrictMode>
      <I18nProvider language={language}>
        <TooltipProvider>
          <App />
        </TooltipProvider>
      </I18nProvider>
    </StrictMode>
  )
}

void Promise.race([
  language.store.ready,
  new Promise((resolve) => setTimeout(resolve, FIRST_PAINT_WAIT_MS))
]).then(render)
