import './style.css'

import { TooltipProvider } from '@tracy/ui'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'

import { App } from './app/App'
import { ShellProvider } from './app/app-context'
import { Gallery } from './pages/Gallery'
import { views } from './views'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TooltipProvider>
      <ShellProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Gallery />} />
            {views.map((v) => (
              <Route
                key={v.path}
                path={v.path}
                element={<App bare={v.standalone === true}>{v.element}</App>}
              />
            ))}
          </Routes>
        </BrowserRouter>
      </ShellProvider>
    </TooltipProvider>
  </StrictMode>
)
