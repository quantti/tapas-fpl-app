import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './App.css'
import { Dashboard } from './components/Dashboard'
import { ManagerLineup } from './components/ManagerLineup'
import { Statistics } from './components/Statistics'
import { Analytics } from './components/Analytics'

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <main className="appMain">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/statistics" element={<Statistics />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/manager/:managerId/:gameweek" element={<ManagerLineup />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
