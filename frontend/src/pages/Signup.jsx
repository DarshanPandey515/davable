import React, { useState } from 'react'
import { ArrowRightIcon } from 'lucide-react'
import { Github, Google } from '../icons'
import { AuthShell, Button, Divider, LinkButton, SystemAlert, TextField } from '../ui'
import { signup, oauthLoginUrl } from '../api'

export default function Signup({ onSuccess, onGoToLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!email.trim() || password.length < 8 || isLoading) return
    setIsLoading(true)
    setError('')
    try {
      await signup(email.trim(), password)
      onSuccess()
    } catch (e) {
      setError(e.message || 'Signup failed')
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <AuthShell
      title="Create an account."
      subtitle="Start weaving in under a minute."
      footer={
        <button
          type="button"
          onClick={onGoToLogin}
          className="cursor-pointer font-medium text-ink-muted transition-colors hover:text-ink"
        >
          Already have an account? Sign in
        </button>
      }
    >
      <TextField
        label="Email"
        name="email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isLoading}
        placeholder="you@example.com"
        autoComplete="email"
        autoFocus
      />
      <TextField
        label="Password"
        name="password"
        type="password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isLoading}
        placeholder="••••••••"
        hint="At least 8 characters."
        autoComplete="new-password"
      />

      {error ? <SystemAlert tone="error" description={error} /> : null}

      <Button
        className="w-full"
        onClick={submit}
        disabled={!email.trim() || password.length < 8 || isLoading}
      >
        {isLoading ? 'Creating account' : 'Create account'}
        <ArrowRightIcon data-icon="inline-end" />
      </Button>

      <Divider />

      <div className="flex flex-col gap-2">
        <LinkButton href={oauthLoginUrl('google')} className="w-full">
          <Google className="size-4" />
          Continue with Google
        </LinkButton>
        <LinkButton href={oauthLoginUrl('github')} className="w-full">
          <Github className="size-4" />
          Continue with GitHub
        </LinkButton>
      </div>
    </AuthShell>
  )
}
