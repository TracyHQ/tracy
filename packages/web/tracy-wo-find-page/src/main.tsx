import { TooltipProvider } from '@tracy/ui'
import {
  LAYOUT_CSS,
  PublicFind,
  SIGNED_IN_FIND,
  buildSignedInFindUrl
} from '@tracy/dsh-website-opportunities/find'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { htmlLang, pageLanguage, translatorFor } from './locale'
import { createPublicApi } from './public-api'
import './style.css'

const lang = pageLanguage()
const t = translatorFor(lang)
document.documentElement.lang = htmlLang(lang)
document.title = `${t('public.title')} · Tracy`

// Light or dark follows the device: this page has no theme setting of its own.
const dark = window.matchMedia('(prefers-color-scheme: dark)')
const paint = () => document.documentElement.classList.toggle('dark', dark.matches)
paint()
dark.addEventListener('change', paint)

// The Find view's layout rules, the same string the plugin injects into dsh's page.
const layout = document.createElement('style')
layout.textContent = LAYOUT_CSS
document.head.appendChild(layout)

const api = createPublicApi()
const signIn = `/login?next=${encodeURIComponent(SIGNED_IN_FIND)}`

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TooltipProvider>
      <main className="find-page">
        <header className="find-page-head">
          <h1>{t('public.title')}</h1>
          <p>{t('public.lead')}</p>
          <a href={signIn}>{t('public.signIn')}</a>
        </header>
        <PublicFind
          t={t}
          api={api}
          onContinue={(next) =>
            window.location.assign(buildSignedInFindUrl({ ...next, search: window.location.search }))
          }
        />
      </main>
    </TooltipProvider>
  </StrictMode>
)
