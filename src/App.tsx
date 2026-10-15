import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './App.css'
import IntakeForm from './components/IntakeForm'
import Landing from './components/Landing'
import Dashboard from './components/Dashboard'
import CaseDetails from './components/CaseDetails'
import ResetPassword from './components/ResetPassword'
import Navbar from './components/Navbar'

function AppShell() {
  return (
    <div className="site-shell">
      <Navbar />

      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/base/intake" element={<IntakeForm />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/dashboard/cases/:caseId" element={<CaseDetails />} />
        <Route path="/reset-password" element={<ResetPassword />} />
      </Routes>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  )
}

export default App
