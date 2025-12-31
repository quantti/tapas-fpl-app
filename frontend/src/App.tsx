import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './App.css'
import { CookieConsentBanner } from './components/CookieConsent'
import { Footer } from './components/Footer'
import { Dashboard } from './views/Dashboard'
import { Statistics } from './views/Statistics'
import { Analytics } from './views/Analytics'
import { Roadmap } from './views/Roadmap'
import { Changelog } from './views/Changelog'

function App() {
  return (
    <BrowserRouter>
      <CookieConsentBanner />
      <div className="app">
        <main className="appMain">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/statistics" element={<Statistics />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/roadmap" element={<Roadmap />} />
            <Route path="/changelog" element={<Changelog />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </BrowserRouter>
  )
}

export default App
