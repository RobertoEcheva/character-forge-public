import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './sheet.css'
import App from './App.tsx'
import { applyMode, loadMode } from './theme/ThemeProvider'

// Set light or dark before the first paint so the page never flashes the wrong colors.
applyMode(loadMode())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
