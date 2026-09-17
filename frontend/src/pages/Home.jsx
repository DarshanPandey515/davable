import React, { useEffect, useRef, useState } from 'react'
import { ThreadMark, ArrowRight } from '../icons'
import { Button, SpinLoader } from '../ui'
import { listConversations } from '../api'

function timeAgo(isoString) {
  const seconds = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function Home({ onStart, onResume, onLogout }) {
  const [prompt, setPrompt] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [sessions, setSessions] = useState([])
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const textareaRef = useRef(null)

  useEffect(() => {
    listConversations()
      .then(setSessions)
      .catch(() => setSessions([]))
      .finally(() => setSessionsLoading(false))
  }, [])

  const submit = () => {
    const value = prompt.trim()
    if (!value || isLoading) return
    setIsLoading(true)
    onStart(value)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="flex h-screen w-full flex-col bg-white font-sans text-neutral-900">
      <header className="flex shrink-0 items-center justify-between border-b border-neutral-100 px-4 py-3 md:px-6">
        <div className="flex items-center gap-2">
          <ThreadMark className="size-5 text-neutral-900" />
          <span className="font-serif text-lg leading-none">Davable</span>
        </div>
        {onLogout && (
          <Button variant="ghost" size="sm" onClick={onLogout}>
            Log out
          </Button>
        )}
      </header>

      <main className="flex flex-1 justify-center overflow-y-auto px-4 py-10 md:px-6 md:py-16">
        <div className="animate-enter w-full max-w-xl space-y-8 self-center">
          <div className="space-y-3">
            <p className="font-mono text-[10px] tracking-[0.18em] text-neutral-400 uppercase">
              AI app builder
            </p>
            <h1 className="font-serif text-3xl leading-tight text-balance md:text-4xl">
              Describe the app you want to weave.
            </h1>
            <p className="max-w-md text-sm leading-relaxed text-neutral-500">
              Give a prompt and the agent plans, builds, and debugs a working React app. Refine it in plain language.
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-100 bg-white p-4">
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={3}
              autoFocus
              disabled={isLoading}
              maxLength={500}
              placeholder="e.g. a habit tracker with weekly streaks"
              aria-label="Describe your app"
              className="w-full resize-none bg-transparent text-sm leading-relaxed text-neutral-900 outline-none placeholder:text-neutral-400 disabled:opacity-50"
            />
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-neutral-100 pt-3">
              <span className="flex items-center gap-2 font-mono text-[10px] tracking-tight text-neutral-400">
                {isLoading ? <SpinLoader size="sm" label="Starting" /> : null}
                {isLoading ? 'Planning' : 'Ready'}
              </span>
              <Button size="md" onClick={submit} disabled={!prompt.trim() || isLoading}>
                {isLoading ? 'Weaving' : 'Weave'}
                <ArrowRight className="size-3.5" />
              </Button>
            </div>
          </div>

          <section className="space-y-2">
            <div className="flex items-baseline justify-between">
              <h2 className="text-xs font-semibold tracking-tight text-neutral-900">Past sessions</h2>
              {sessionsLoading ? <SpinLoader size="sm" label="Loading sessions" /> : null}
            </div>

            {!sessionsLoading && sessions.length === 0 ? (
              <p className="rounded-lg border border-dashed border-neutral-200 px-4 py-6 text-center text-xs text-neutral-400">
                No sessions yet. Your builds will show up here.
              </p>
            ) : (
              <ul className="divide-y divide-neutral-100 overflow-hidden rounded-lg border border-neutral-100">
                {sessions.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => onResume(s.id)}
                      className="flex w-full cursor-pointer items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-neutral-900"
                    >
                      <span
                        className={`size-1.5 shrink-0 rounded-full ${
                          s.status === 'complete' ? 'bg-emerald-500' : 'bg-amber-400'
                        }`}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-neutral-700">
                        {s.original_prompt}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-neutral-400">{timeAgo(s.created_at)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}
