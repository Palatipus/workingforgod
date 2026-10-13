import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import ErrorBoundary, { isStaleVersion, reloadForUpdate } from './components/ErrorBoundary'
import { AuthProvider } from './AuthContext'
import './index.css'

// Offline page for the installed app (production only, so development always loads fresh code)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}

// Code loaded on demand outside a page (e.g. the PDF maker) can also hit an old version after an update
window.addEventListener('unhandledrejection', (e) => { if (isStaleVersion(e.reason)) reloadForUpdate() })

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <ErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ErrorBoundary>
  </BrowserRouter>
)
