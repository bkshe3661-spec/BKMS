import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initStorage } from './services/extinguisherService'

// 앱 시작 시 1회 실행 — localStorage에 키가 없을 때만 빈 배열 [] 로 초기화
// 키가 이미 있으면(데이터가 있어도, 빈 배열이어도) 절대 덮어쓰지 않음
initStorage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
