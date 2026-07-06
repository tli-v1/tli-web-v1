import { PASSWORD_MIN_LENGTH } from '../../utils/passwordPolicy'
import './PasswordRequirements.css'

interface PasswordRequirementsProps {
  password: string
}

export default function PasswordRequirements({ password }: PasswordRequirementsProps) {
  const requirements = [
    {
      label: `${PASSWORD_MIN_LENGTH} or more characters`,
      met: password.length >= PASSWORD_MIN_LENGTH,
    },
    { label: 'At least one uppercase letter', met: /[A-Z]/.test(password) },
    { label: 'At least one number', met: /\d/.test(password) },
    {
      label: 'At least one special character (!, @, #, $, or %)',
      met: /[^A-Za-z0-9\s]/.test(password),
    },
  ]

  return (
    <section className="password-requirements" aria-label="Password requirements">
      <p>Password must include:</p>
      <ul>
        {requirements.map((requirement) => (
          <li className={requirement.met ? 'is-met' : ''} key={requirement.label}>
            {requirement.label}
          </li>
        ))}
      </ul>
    </section>
  )
}
