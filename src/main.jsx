import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { reloadForNewVersion, isChunkError } from './lib/safeImport'

// Saiu versão nova enquanto o app estava aberto: recarrega sozinho em vez de quebrar
window.addEventListener('vite:preloadError', (e) => { if (reloadForNewVersion()) e.preventDefault() })
window.addEventListener('unhandledrejection', (e) => { if (isChunkError(e.reason)) reloadForNewVersion() })

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
