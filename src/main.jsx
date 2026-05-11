import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

if (typeof window !== 'undefined' && window.location.hostname === '127.0.0.1') {
  const redirectUrl = `${window.location.protocol}//localhost${window.location.port ? `:${window.location.port}` : ''}${window.location.pathname}${window.location.search}${window.location.hash}`
  window.location.replace(redirectUrl)
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
