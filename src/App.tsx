import { useEffect, useState } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './App.css'
import { getSession, onAuthStateChange } from './api/auth'
import IntakeForm from './components/IntakeForm'
import Landing from './components/Landing'
import Dashboard from './components/Dashboard'
import CaseDetails from './components/CaseDetails'
import ResetPassword from './components/ResetPassword'
import Navbar from './components/Navbar'
import type { User } from './types'

function AppShell() {
  const [sessionUser, setSessionUser] = useState<User | null>(null)

  useEffect(() => {
    let mounted = true

    getSession().then((user) => {
      if (mounted) setSessionUser(user)
    })
    const unsubscribe = onAuthStateChange(setSessionUser)

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  return (
    <div className="site-shell">
      <Navbar />

      <Routes>
        <Route path="/" element={<Landing user={sessionUser} />} />
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
