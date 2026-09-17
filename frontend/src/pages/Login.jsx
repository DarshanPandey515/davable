import React, { useState } from 'react'
import { ArrowRight, Github, Google } from '../icons'
import { AuthShell, Button, Divider, LinkButton, SystemAlert, TextField } from '../ui'
import { login, oauthLoginUrl } from '../api'

export default function Login({ onSuccess, onGoToSignup }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!email.trim() || !password || isLoading) return
    setIsLoading(true)
    setError('')
    try {
      await login(email.trim(), password)
      onSuccess()
    } catch (e) {
      setError(e.message || 'Login failed')
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
      title="Sign in to keep weaving."
      subtitle="Pick up where you left off."
      footer={
        <button
          type="button"
          onClick={onGoToSignup}
          className="cursor-pointer font-medium text-neutral-500 transition-colors hover:text-neutral-900"
        >
          No account? Sign up
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
        autoComplete="current-password"
      />

      {error ? <SystemAlert tone="error" description={error} /> : null}

      <Button className="w-full" onClick={submit} disabled={!email.trim() || !password || isLoading}>
        {isLoading ? 'Signing in' : 'Sign in'}
        <ArrowRight className="size-3.5" />
      </Button>

      <Divider />

      <div className="space-y-2">
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
