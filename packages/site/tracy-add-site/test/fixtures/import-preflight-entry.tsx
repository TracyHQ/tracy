/** Mount the real import UI; browser tests control only its read-only HTTP responses. */
import { createRoot } from 'react-dom/client'
import { ImportWizard } from '../../src/client/import-wizard'
import { en } from '../../src/client/strings'

const t = (key: string, params: Record<string, string | number> = {}) =>
  (en[key] ?? key).replace(/\{(\w+)\}/g, (whole, name) => (name in params ? String(params[name]) : whole))

createRoot(document.getElementById('root') as HTMLElement).render(
  <div className="tas-root">
    <ImportWizard t={t} onProvisioned={() => {}} />
  </div>
)
