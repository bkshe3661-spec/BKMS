import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { initFirebaseSync } from './firebaseSync'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

initFirebaseSync();
