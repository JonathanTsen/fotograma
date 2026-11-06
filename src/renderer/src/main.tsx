import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { useStore } from './store'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)

if (import.meta.env.DEV) {
  // Facilita testes automatizados e depuração no DevTools.
  ;(window as unknown as { __quadro: unknown }).__quadro = { useStore }
}
