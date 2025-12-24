import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './App.css'
import { Dashboard } from './views/Dashboard'
import { Statistics } from './views/Statistics'
import { Analytics } from './views/Analytics'

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <main className="appMain">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/statistics" element={<Statistics />} />
            <Route path="/analytics" element={<Analytics />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
