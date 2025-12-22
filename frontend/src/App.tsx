import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './App.css'
import { Dashboard } from './components/Dashboard'
import { ManagerLineup } from './components/ManagerLineup'

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <main className="appMain">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/manager/:managerId/:gameweek" element={<ManagerLineup />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
