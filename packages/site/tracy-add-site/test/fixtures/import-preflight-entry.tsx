/** Mount the real import UI; browser tests control only its read-only HTTP responses. */
import { createRoot } from 'react-dom/client'
import { ImportProgress, ImportWizard } from '../../src/client/import-wizard'
import { ImportProblem } from '../../src/client/import-problems'
import { en } from '../../src/client/strings'

const t = (key: string, params: Record<string, string | number> = {}) =>
  (en[key] ?? key).replace(/\{(\w+)\}/g, (whole, name) => (name in params ? String(params[name]) : whole))

createRoot(document.getElementById('root') as HTMLElement).render(
  <div className="tas-root">
    {new URLSearchParams(location.search).get('fixture') === 'unreadable' ? (
      <>
        <ImportProgress
          t={t}
          platform="joomla"
          run={{
            id: 'permission-fixture',
            state: 'running',
            step: 'reading_files',
            siteKey: 'source.example',
            platform: 'joomla',
            detail: {
              files: 150,
              unreadable: { paths: ['certificates/thumbs/', 'images/private.png'], count: 2 }
            }
          }}
        />
        <ImportProblem
          problem="p56"
          t={t}
          domain="source.example"
          detail={{ folder: 'certificates/thumbs/' }}
        />
      </>
    ) : (
      <ImportWizard t={t} onProvisioned={() => {}} />
    )}
  </div>
)
