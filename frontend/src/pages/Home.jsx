import React, { useEffect, useState } from 'react'
import { ArrowRightIcon, Trash2Icon } from 'lucide-react'

import { ThreadMark } from '../icons'
import { Button, SpinLoader, ThemeToggle } from '../ui'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { listConversations, deleteConversation } from '../api'

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
  const [deletingId, setDeletingId] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [error, setError] = useState('')

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

  const confirmDelete = async () => {
    const session = pendingDelete
    if (!session) return
    setPendingDelete(null)
    setDeletingId(session.id)
    setError('')
    try {
      await deleteConversation(session.id)
      setSessions((prev) => prev.filter((s) => s.id !== session.id))
    } catch (e) {
      setError(e.message || 'Failed to delete project')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="flex h-screen w-full flex-col bg-background font-sans text-foreground">
      <header className="flex shrink-0 items-center justify-between border-b px-4 py-3 md:px-6">
        <div className="flex items-center gap-2">
          <ThreadMark className="size-5 text-foreground" />
          <span className="font-serif text-lg leading-none">Davable</span>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          {onLogout && (
            <Button variant="ghost" size="sm" onClick={onLogout}>
              Log out
            </Button>
          )}
        </div>
      </header>

      <main className="flex flex-1 justify-center overflow-y-auto px-4 py-10 md:px-6 md:py-16">
        <div className="animate-enter flex w-full max-w-xl flex-col gap-8 self-center">
          <div className="flex flex-col gap-3">
            <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
              AI app builder
            </p>
            <h1 className="font-serif text-3xl leading-tight text-balance md:text-4xl">
              Describe the app you want to weave.
            </h1>
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              Give a prompt and the agent plans, builds, and debugs a working React app. Refine it in plain language.
            </p>
          </div>

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <Card>
            <CardContent className="flex flex-col gap-3">
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={3}
                autoFocus
                disabled={isLoading}
                maxLength={500}
                placeholder="e.g. a habit tracker with weekly streaks"
                aria-label="Describe your app"
                className="min-h-20 resize-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
              />
              <div className="flex items-center justify-between gap-3 border-t pt-3">
                <span className="flex items-center gap-2 font-mono text-[10px] tracking-tight text-muted-foreground">
                  {isLoading ? <SpinLoader size="sm" label="Starting" /> : null}
                  {isLoading ? 'Planning' : 'Ready'}
                </span>
                <Button onClick={submit} disabled={!prompt.trim() || isLoading}>
                  {isLoading ? 'Weaving' : 'Weave'}
                  <ArrowRightIcon data-icon="inline-end" />
                </Button>
              </div>
            </CardContent>
          </Card>

          <section className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <h2 className="text-xs font-semibold tracking-tight text-foreground">Past sessions</h2>
              {sessionsLoading ? <SpinLoader size="sm" label="Loading sessions" /> : null}
            </div>

            {sessionsLoading ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-11 w-full" />
                <Skeleton className="h-11 w-full" />
                <Skeleton className="h-11 w-full" />
              </div>
            ) : sessions.length === 0 ? (
              <Empty className="border border-dashed">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <ThreadMark />
                  </EmptyMedia>
                  <EmptyTitle>No sessions yet</EmptyTitle>
                  <EmptyDescription>Your builds will show up here.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ul className="divide-y overflow-hidden rounded-lg border">
                {sessions.map((s) => (
                  <li key={s.id} className="group flex items-center transition-colors hover:bg-muted/50">
                    <button
                      type="button"
                      onClick={() => onResume(s.id)}
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-3.5 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      <Badge variant={s.status === 'complete' ? 'secondary' : 'outline'} className="shrink-0">
                        {s.status === 'complete' ? 'ready' : s.status}
                      </Badge>
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground">{s.original_prompt}</span>
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                        {timeAgo(s.created_at)}
                      </span>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete project"
                      disabled={deletingId === s.id}
                      onClick={() => setPendingDelete(s)}
                      className="mr-2 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    >
                      {deletingId === s.id ? <SpinLoader size="sm" label="Deleting" /> : <Trash2Icon />}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this project?</AlertDialogTitle>
            <AlertDialogDescription>
              Its files and preview will be removed. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
