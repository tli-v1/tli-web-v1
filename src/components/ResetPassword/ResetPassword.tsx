import { useState } from 'react'
import { updatePassword } from '../../api/auth'
import {
  getPasswordPolicyError,
  PASSWORD_MIN_LENGTH,
} from '../../utils/passwordPolicy'
import PasswordRequirements from '../PasswordRequirements/PasswordRequirements'
import './ResetPassword.css'

function ResetPassword() {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleReset = async () => {
    setError('')
    setMessage('')
    const passwordError = getPasswordPolicyError(newPassword)
    if (passwordError) {
      setError(passwordError)
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setSubmitting(true)
    const { error: updateError } = await updatePassword(newPassword)
    if (updateError) {
      setError(updateError.message)
    } else {
      setMessage('Password updated. You can now sign in with your new password.')
      setNewPassword('')
      setConfirmPassword('')
    }
    setSubmitting(false)
  }

  return (
    <main className="dashboard">
      <section className="card dashboard-card auth-gate reset-password-card">
        <div className="dashboard-head">
          <div>
            <p className="eyebrow">Reset password</p>
            <h1>Set a new password</h1>
            <p className="helper-text">
              Enter a new password for your account. This link was sent to your email.
            </p>
          </div>
        </div>

        <div className="password-field-with-requirements">
          <label className="field">
            <span>New password</span>
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="Create a strong password"
              minLength={PASSWORD_MIN_LENGTH}
              autoComplete="new-password"
            />
          </label>
          <PasswordRequirements password={newPassword} />
        </div>

        <label className="field">
          <span>Confirm password</span>
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Retype your password"
            minLength={PASSWORD_MIN_LENGTH}
            autoComplete="new-password"
          />
        </label>

        {error && <p className="error">{error}</p>}
        {message && <p className="notice">{message}</p>}

        <button type="button" className="btn accent" onClick={handleReset} disabled={submitting}>
          {submitting ? 'Updating…' : 'Update password'}
        </button>
      </section>
    </main>
  )
}

export default ResetPassword
