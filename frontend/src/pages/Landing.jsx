import React from 'react'
import { ArrowRightIcon } from 'lucide-react'

import { ThreadMark } from '../icons'
import { Button, ThemeToggle } from '../ui'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const FEATURES = [
  {
    title: 'Prompt to app',
    body: 'Describe what you want; the agent plans, builds, and debugs a working React app.',
  },
  {
    title: 'Live preview',
    body: 'Watch the app take shape in a sandbox and refine it in plain language.',
  },
  {
    title: 'Yours to keep',
    body: 'Every change is real code you can review, edit, and export.',
  },
]

export default function Landing({ onSignIn, onSignUp }) {
  return (
    <div className="flex min-h-screen flex-col bg-background font-sans text-foreground">
      <header className="flex items-center justify-between border-b px-4 py-3 md:px-6">
        <div className="flex items-center gap-2">
          <ThreadMark className="size-5 text-foreground" />
          <span className="font-serif text-lg leading-none">Davable</span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button variant="ghost" size="sm" onClick={onSignIn}>
            Sign in
          </Button>
          <Button size="sm" onClick={onSignUp}>
            Get started
          </Button>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-16 px-4 py-16 text-center md:py-24">
        <div className="animate-enter flex w-full max-w-2xl flex-col items-center gap-6">
          <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">AI app builder</p>
          <h1 className="font-serif text-4xl leading-tight text-balance md:text-6xl">
            Describe an app. Watch it get built.
          </h1>
          <p className="mx-auto max-w-lg text-sm leading-relaxed text-muted-foreground md:text-base">
            Davable turns plain-language ideas into real React applications. Plan, generate, build, and fix — all from
            one prompt.
          </p>
          <div className="flex flex-col items-center justify-center gap-2 md:flex-row">
            <Button size="lg" onClick={onSignUp}>
              Start building
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
            <Button variant="secondary" size="lg" onClick={onSignIn}>
              Sign in
            </Button>
          </div>
        </div>

        <div className="grid w-full max-w-3xl gap-4 md:grid-cols-3">
          {FEATURES.map((feature) => (
            <Card key={feature.title} className="text-left">
              <CardHeader>
                <CardTitle className="text-sm">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs leading-relaxed text-muted-foreground">{feature.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  )
}
