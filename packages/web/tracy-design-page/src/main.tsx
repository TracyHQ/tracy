import { TooltipProvider } from '@tracy/ui'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { setDoor } from '../../../design/tracy-design-inspiration/src/client/api'
import { App } from './App'
import { BASE, publicDoor } from './doors'
import { htmlLang, pageLanguage } from './locale'
import './style.css'

// `<html lang>` names the language the page speaks; the shared components format dates by it.
document.documentElement.lang = htmlLang(pageLanguage())

// The shared components knock on the public doors here (ADR 0011 §A4).
setDoor(publicDoor)

// `/design-inspiration/<id>` is the address of one look: the gallery opens a `#<id>` deep link, so
// the path form becomes the hash form once, and the address bar keeps the pretty one.
const rest = location.pathname.startsWith(`${BASE}/`) ? location.pathname.slice(BASE.length + 1) : ''
if (rest !== '' && !location.hash && /^(?:brand:)?[a-z0-9][a-z0-9.:-]*$/.test(rest)) {
  location.hash = `#${rest}`
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TooltipProvider>
      <App />
    </TooltipProvider>
  </StrictMode>
)
