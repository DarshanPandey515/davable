import React, { useEffect, useState } from 'react'
import Home from './pages/Home'
import Conversation from './pages/Conversation'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Signup from './pages/Signup'
import { consumeOAuthTokensFromUrl, isLoggedIn, logout } from './api'



function App() {
  // OAuth redirects land here with ?access=&refresh= on the URL - resolve
  // that synchronously on first render, before deciding which page to show.
  const [oauthResult] = useState(() => consumeOAuthTokensFromUrl())
  const [page, setPage] = useState(() => (isLoggedIn() ? 'home' : 'landing'))
  const [initialPrompt, setInitialPrompt] = useState('')
  const [resumeConversationId, setResumeConversationId] = useState(null)

  useEffect(() => {
    if (oauthResult.success) setPage('home')
  }, [oauthResult])

  const startWeaving = (prompt) => {
    setInitialPrompt(prompt)
    setResumeConversationId(null)
    setPage('conversation')
  }

  const resumeSession = (conversationId) => {
    setInitialPrompt('')
    setResumeConversationId(conversationId)
    setPage('conversation')
  }

  const goHome = () => {
    setPage('home')
    setInitialPrompt('')
    setResumeConversationId(null)
  }

  const handleLogout = () => {
    logout()
    setPage('landing')
  }

  // Passed down to Conversation so an expired/invalid token bounces back
  // to login instead of the chat silently failing forever.
  const handleAuthError = () => {
    logout()
    setPage('login')
  }

  return (
    <>
      {page === 'landing' && (
        <Landing onSignIn={() => setPage('login')} onSignUp={() => setPage('signup')} />
      )}
      {page === 'login' && (
        <Login onSuccess={() => setPage('home')} onGoToSignup={() => setPage('signup')} />
      )}
      {page === 'signup' && (
        <Signup onSuccess={() => setPage('home')} onGoToLogin={() => setPage('login')} />
      )}
      {page === 'home' && <Home onStart={startWeaving} onResume={resumeSession} onLogout={handleLogout} />}
      {page === 'conversation' && (
        <Conversation
          initialPrompt={initialPrompt}
          resumeConversationId={resumeConversationId}
          onBack={goHome}
          onAuthError={handleAuthError}
        />
      )}
    </>
  )
}

export default App