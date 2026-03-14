import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

try {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
} catch (e) {
  document.getElementById('root').innerHTML = '<pre style="color:red;padding:20px">' + e.message + '\n' + e.stack + '</pre>';
}

// Global error handler for uncaught errors
window.addEventListener('error', (e) => {
  const root = document.getElementById('root');
  if (root && (!root.innerHTML || root.innerHTML.trim() === '')) {
    root.innerHTML = '<pre style="color:red;padding:20px">Error: ' + e.message + '\n' + (e.filename || '') + ':' + (e.lineno || '') + '</pre>';
  }
});
