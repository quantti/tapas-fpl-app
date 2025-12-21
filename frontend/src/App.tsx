import './App.css'
import { Dashboard } from './components/Dashboard'

function App() {
  return (
    <div className="app">
      <header className="appHeader">
        <h1>Tapas FPL</h1>
        <p>Fantasy Premier League Dashboard</p>
      </header>
      <main className="appMain">
        <Dashboard />
      </main>
    </div>
  )
}

export default App
