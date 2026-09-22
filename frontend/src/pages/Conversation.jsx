import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronLeftIcon,
  ExternalLinkIcon,
  MonitorIcon,
  RefreshCwIcon,
  SendHorizontalIcon,
  SmartphoneIcon,
} from 'lucide-react'

import { ThreadMark } from '../icons'
import { Button, SegmentedControl, SpinLoader, TextField, ThemeToggle, BuildSteps } from '../ui'
import { Tree } from '../file-tree'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { FieldGroup } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Message, MessageAvatar, MessageContent } from '@/components/ui/message'
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@/components/ui/message-scroller'
import { Bubble, BubbleContent } from '@/components/ui/bubble'

import { API_BASE, getToken, getConversation } from '../api'

let idCounter = 0
const uid = () => `m${Date.now()}_${idCounter++}`

async function parseSSEStream(response, onEvent) {
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const blocks = buffer.split('\n\n')
    buffer = blocks.pop() || ''

    for (const block of blocks) {
      const eventLine = block.split('\n').find((l) => l.startsWith('event: '))
      const dataLine = block.split('\n').find((l) => l.startsWith('data: '))
      if (!eventLine || !dataLine) continue

      const eventType = eventLine.slice(7).trim()
      const dataRaw = dataLine.slice(6).trim()
      if (!dataRaw) continue

      try {
        onEvent(eventType, JSON.parse(dataRaw))
      } catch (e) {
        console.error('Failed to parse SSE data:', e)
      }
    }
  }
}

function deriveProjectName(prompt) {
  if (!prompt) return 'Untitled Project'
  const words = prompt.trim().split(/\s+/).slice(0, 4).join(' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function buildFileTree(files) {
  const nodes = []
  const folders = new Map()
  const folderIds = []
  const filePaths = new Set()

  const sorted = [...files].sort((a, b) =>
    a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }),
  )

  for (const file of sorted) {
    const parts = file.path.split('/')
    let level = nodes
    let prefix = ''

    parts.forEach((part, index) => {
      prefix = prefix ? `${prefix}/${part}` : part
      if (index === parts.length - 1) {
        level.push({ id: file.path, name: part, type: 'file' })
        filePaths.add(file.path)
        return
      }
      let folder = folders.get(prefix)
      if (!folder) {
        folder = { id: prefix, name: part, type: 'folder', children: [] }
        folders.set(prefix, folder)
        folderIds.push(prefix)
        level.push(folder)
      }
      level = folder.children
    })
  }

  return { nodes, folderIds, filePaths }
}

function buildPreviewHtml(projectName, prompt) {
  const safeName = (projectName || 'Your app').replace(/</g, '&lt;')
  const safePrompt = (prompt || 'a new idea').replace(/</g, '&lt;')
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif;
    color: #171717;
    background: #FFFFFF;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 20px;
    border-bottom: 1px solid #E5E5E5;
  }
  .brand { font-weight: 600; font-size: 14px; letter-spacing: -0.01em; }
  nav a { color: #737373; text-decoration: none; font-size: 12px; margin-left: 14px; }
  .cta {
    background: #262626; color: #fff; border: none; border-radius: 6px;
    padding: 6px 12px; font-size: 12px; cursor: pointer;
  }
  main { padding: 40px 20px; text-align: center; max-width: 600px; margin: 0 auto; }
  .eyebrow { font-size: 10px; letter-spacing: 0.15em; text-transform: uppercase; color: #0891B2; font-weight: 600; }
  h1 { font-size: 28px; line-height: 1.2; margin: 12px 0; letter-spacing: -0.01em; }
  p.sub { color: #737373; font-size: 14px; line-height: 1.5; margin: 0 auto 20px; max-width: 440px; }
  .btn-row { display: flex; gap: 8px; justify-content: center; }
  .primary { background: #262626; color: #fff; border: none; border-radius: 6px; padding: 10px 16px; font-size: 13px; cursor: pointer; }
  .secondary { background: #fff; color: #171717; border: 1px solid #E5E5E5; border-radius: 6px; padding: 10px 16px; font-size: 13px; cursor: pointer; }
  .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 40px; }
  .card { border: 1px solid #E5E5E5; border-radius: 8px; padding: 14px; text-align: left; }
  .card .num { font-size: 10px; color: #0891B2; font-weight: 700; }
  .card h3 { font-size: 13px; margin: 6px 0 2px; }
  .card p { font-size: 12px; color: #737373; margin: 0; line-height: 1.4; }
  @media (max-width: 480px) { .cards { grid-template-columns: 1fr; } h1 { font-size: 22px; } }
</style>
</head>
<body>
  <header>
    <div class="brand">${safeName}</div>
    <nav>
      <a href="#">Product</a>
      <a href="#">Pricing</a>
      <button class="cta">Get started</button>
    </nav>
  </header>
  <main>
    <div class="eyebrow">Generated preview</div>
    <h1>${safeName}</h1>
    <p class="sub">Built from: "${safePrompt}". This is a live preview — ask Davable for changes and it updates here.</p>
    <div class="btn-row">
      <button class="primary">Get started</button>
      <button class="secondary">Learn more</button>
    </div>
    <div class="cards">
      <div class="card"><div class="num">01</div><h3>Fast setup</h3><p>Goes from prompt to working app in minutes.</p></div>
      <div class="card"><div class="num">02</div><h3>Editable</h3><p>Tell Davable what to change, in plain language.</p></div>
      <div class="card"><div class="num">03</div><h3>Yours to keep</h3><p>Export the code whenever you're ready.</p></div>
    </div>
  </main>
</body>
</html>`
}

const DEVICE_OPTIONS = [
  { value: 'desktop', ariaLabel: 'Desktop view', icon: <MonitorIcon /> },
  { value: 'mobile', ariaLabel: 'Mobile view', icon: <SmartphoneIcon /> },
]

function DeviceToggle({ value, onChange }) {
  return (
    <SegmentedControl
      ariaLabel="Preview device"
      size="sm"
      options={DEVICE_OPTIONS}
      value={value}
      onChange={onChange}
    />
  )
}

function ChatMessage({ message }) {
  if (message.role === 'user') {
    return (
      <Message align="end">
        <MessageContent>
          <Bubble variant="default">
            <BubbleContent>{message.text}</BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
    )
  }

  const isError = typeof message.text === 'string' && message.text.startsWith('Error:')

  return (
    <Message>
      <MessageAvatar>
        <ThreadMark className="size-4 text-muted-foreground" />
      </MessageAvatar>
      <MessageContent>
        {message.steps ? <BuildSteps steps={message.steps} /> : null}
        {message.text ? (
          isError ? (
            <Alert variant="destructive">
              <AlertDescription>{message.text.replace(/^Error:\s*/, '')}</AlertDescription>
            </Alert>
          ) : (
            <Bubble variant="muted">
              <BubbleContent>{message.text}</BubbleContent>
            </Bubble>
          )
        ) : null}
      </MessageContent>
    </Message>
  )
}

export default function Conversation({ initialPrompt, resumeConversationId, onBack, onAuthError }) {
  const [projectName, setProjectName] = useState(() => deriveProjectName(initialPrompt))
  const [resumedPrompt, setResumedPrompt] = useState('')
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isWeaving, setIsWeaving] = useState(false)
  const [previewReady, setPreviewReady] = useState(false)
  const [device, setDevice] = useState('desktop')
  const [mobileTab, setMobileTab] = useState('chat')
  const [conversationId, setConversationId] = useState(null)
  const [clarificationQuestions, setClarificationQuestions] = useState([])
  const [showClarification, setShowClarification] = useState(false)
  const [clarificationAnswers, setClarificationAnswers] = useState({})
  const [isSubmittingClarification, setIsSubmittingClarification] = useState(false)

  const [previewUrl, setPreviewUrl] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [activeView, setActiveView] = useState('preview') // 'preview' | 'code'
  const [files, setFiles] = useState([])
  const [selectedFile, setSelectedFile] = useState(null)
  const [filesLoading, setFilesLoading] = useState(false)
  const [filesError, setFilesError] = useState(null)

  const startedRef = useRef(false)
  const abortControllerRef = useRef(null)
  const buildStepsMsgIdRef = useRef(null)

  const addMessage = (role, text, steps = null) => {
    setMessages(prev => [...prev, {
      id: uid(),
      role,
      text,
      steps
    }])
  }

  const handleSSEEvent = (eventType, data) => {
    switch (eventType) {
      case 'status':
        if (data.type === 'started') {
          addMessage('assistant', 'Starting setup...');
        } else if (data.type === 'planning') {
          addMessage('assistant', 'Planning view layout...');
        } else if (data.type === 'project_created') {
          addMessage('assistant', data.message);
        } else if (data.type === 'executing') {
          addMessage('assistant', data.message || 'Updating files...');
        } else if (data.message) {
          addMessage('assistant', data.message);
        }
        break;

      case 'clarification':
        setClarificationQuestions(data.questions);
        setConversationId(data.conversation_id);
        setShowClarification(true);
        setClarificationAnswers({});
        setIsWeaving(false);
        addMessage('assistant', 'Please clarify:');
        if (Array.isArray(data.questions)) {
          data.questions.forEach((q, i) => {
            addMessage('assistant', `[${i + 1}] ${q}`);
          });
        }
        break;

      case 'todos':
        if (Array.isArray(data.todos) && data.todos.length) {
          const id = uid();
          buildStepsMsgIdRef.current = id;
          setMessages((prev) => [...prev, {
            id,
            role: 'assistant',
            text: data.brief ? `Tasks: ${data.brief}` : null,
            steps: data.todos.map((label) => ({ label, done: false }))
          }]);
        }
        break;

      case 'complete':
        setPreviewReady(true);
        setIsWeaving(false);
        setShowClarification(false);
        if (data.conversation_id) setConversationId(data.conversation_id);
        if (data.preview_url) {
          setPreviewUrl(data.preview_url);
          setRefreshKey((k) => k + 1);
          // The file list may have changed (new/edited files) - drop the
          // cached one so the Code tab refetches next time it's opened.
          setFiles([]);
        }
        if (buildStepsMsgIdRef.current) {
          const doneId = buildStepsMsgIdRef.current;
          setMessages((prev) => prev.map((m) =>
            m.id === doneId ? { ...m, steps: m.steps.map((s) => ({ ...s, done: true })) } : m
          ));
          buildStepsMsgIdRef.current = null;
        }
        addMessage('assistant', data.message || 'Finished. App ready.');
        break;

      case 'error':
        setIsWeaving(false);
        setShowClarification(false);
        addMessage('assistant', `Error: ${data.error || 'Connection failed'}`);
        break;

      default:
        console.log('Unknown event:', eventType, data);
    }
  };

  const startConversation = async () => {
    if (!initialPrompt) return
    setIsWeaving(true)

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const response = await fetch(`${API_BASE}/chat/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ prompt: initialPrompt }),
        signal: controller.signal
      })

      if (response.status === 401) {
        onAuthError?.()
        return
      }

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`HTTP error! status: ${response.status}, body: ${text}`)
      }

      await parseSSEStream(response, handleSSEEvent)
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Error starting conversation:', error)
        addMessage('assistant', `Error: ${error.message || 'Failed to start configuration'}`)
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsWeaving(false)
      }
    }
  }

  useEffect(() => {
    if (!initialPrompt || startedRef.current) return
    startedRef.current = true
    startConversation()
  }, [initialPrompt])

  useEffect(() => {
    if (!resumeConversationId || startedRef.current) return
    startedRef.current = true

    getConversation(resumeConversationId)
      .then((data) => {
        setConversationId(data.id)
        setResumedPrompt(data.original_prompt)
        setProjectName(deriveProjectName(data.original_prompt))
        setPreviewReady(!!data.project_id)
        if (data.preview_url) {
          setPreviewUrl(data.preview_url)
          setRefreshKey((k) => k + 1)
        }

        // Hidden messages (individual read/write/edit/bash tool-call steps)
        // were never shown in the live chat either - same filter here keeps
        // a resumed conversation looking like the original session.
        const restored = (data.messages || [])
          .filter((m) => !m.hidden)
          .map((m) => ({ id: uid(), role: m.role === 'user' ? 'user' : 'assistant', text: m.content }))
        setMessages(restored)
      })
      .catch((error) => {
        addMessage('assistant', `Couldn't load that session: ${error.message}`)
      })
  }, [resumeConversationId])

  const handleBack = () => {
    if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
      abortControllerRef.current.abort()
    }
    onBack()
  }

  const handleClarificationSubmit = async () => {
    const allAnswered = clarificationQuestions.every((_, idx) =>
      clarificationAnswers[idx] && clarificationAnswers[idx].trim()
    )

    if (!allAnswered) {
      addMessage('assistant', 'Please complete all items.')
      return
    }

    setIsSubmittingClarification(true)
    setIsWeaving(true)
    setShowClarification(false)

    clarificationQuestions.forEach((q, idx) => {
      addMessage('user', `Response [${idx}]: ${clarificationAnswers[idx]}`)
    })

    try {
      const response = await fetch(`${API_BASE}/questions/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          conversation_id: conversationId,
          answers: clarificationAnswers
        })
      })

      if (response.status === 401) {
        onAuthError?.()
        return
      }

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      await parseSSEStream(response, handleSSEEvent)
    } catch (error) {
      console.error('Error submitting clarification:', error)
      setIsWeaving(false)
      addMessage('assistant', `Error: ${error.message || 'Failed to apply items'}`)
    } finally {
      setIsSubmittingClarification(false)
    }
  }

  const handleSend = async () => {
    const value = input.trim()
    if (!value || isWeaving) return
    if (!conversationId) {
      addMessage('assistant', "Can't send that yet - the initial build hasn't finished.")
      return
    }

    setInput('')
    addMessage('user', value)
    setIsWeaving(true)

    try {
      const response = await fetch(`${API_BASE}/followup/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ conversation_id: conversationId, message: value }),
      })

      if (response.status === 401) {
        onAuthError?.()
        return
      }

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`HTTP error! status: ${response.status}, body: ${text}`)
      }

      await parseSSEStream(response, handleSSEEvent)
    } catch (error) {
      console.error('Error sending follow-up:', error)
      addMessage('assistant', `Error: ${error.message || 'Failed to apply that change'}`)
      setIsWeaving(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (showClarification) {
        handleClarificationSubmit()
      } else {
        handleSend()
      }
    }
  }

  const loadFiles = async () => {
    if (!conversationId || filesLoading) return
    setFilesLoading(true)
    setFilesError(null)
    try {
      const response = await fetch(`${API_BASE}/conversations/${conversationId}/files/`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })

      if (response.status === 401) {
        onAuthError?.()
        return
      }
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      const fileList = data.files || []
      setFiles(fileList)
      setSelectedFile((prev) =>
        fileList.some((f) => f.path === prev) ? prev : fileList[0]?.path || null
      )
    } catch (error) {
      console.error('Error loading files:', error)
      setFilesError(error.message || 'Failed to load files')
    } finally {
      setFilesLoading(false)
    }
  }

  const handleViewChange = (view) => {
    setActiveView(view)
    if (view === 'code' && files.length === 0 && !filesLoading) {
      loadFiles()
    }
  }

  const displayPrompt = initialPrompt || resumedPrompt
  const fallbackPreviewSrcDoc = buildPreviewHtml(projectName, displayPrompt)
  const slug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'untitled'
  const selectedFileContent = files.find((f) => f.path === selectedFile)?.content || ''
  const { nodes: fileTree, folderIds, filePaths } = useMemo(() => buildFileTree(files), [files])

  const renderClarification = () => {
    if (!showClarification || !clarificationQuestions.length) return null

    return (
      <div className="animate-enter rounded-xl border bg-muted/50 p-4">
        <FieldGroup className="gap-3">
          <div>
            <h3 className="text-xs font-semibold tracking-tight text-foreground">A few details</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Answer the prompts so the build can continue.</p>
          </div>
          {clarificationQuestions.map((q, idx) => (
            <TextField
              key={idx}
              label={q}
              required
              value={clarificationAnswers[idx] || ''}
              onChange={(e) => setClarificationAnswers({
                ...clarificationAnswers,
                [idx]: e.target.value
              })}
              placeholder="Your answer"
              disabled={isSubmittingClarification}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleClarificationSubmit()
                }
              }}
            />
          ))}
          <Button
            className="w-full"
            onClick={handleClarificationSubmit}
            disabled={isSubmittingClarification}
          >
            {isSubmittingClarification ? 'Sending' : 'Apply answers'}
          </Button>
        </FieldGroup>
      </div>
    )
  }

  const previewFrame = (src, isSrcDoc = false) => {
    const iframeProps = isSrcDoc ? { srcDoc: src } : { src }
    if (device === 'mobile') {
      return (
        <div className="h-full max-h-[560px] w-[268px] overflow-hidden rounded-[2rem] border-[6px] border-neutral-700 bg-background">
          <iframe key={refreshKey} title="Preview" className="h-full w-full" {...iframeProps} />
        </div>
      )
    }
    return (
      <div className="h-full w-full overflow-hidden rounded-xl border bg-background">
        <iframe key={refreshKey} title="Preview" className="h-full w-full" {...iframeProps} />
      </div>
    )
  }

  return (
    <div className="flex h-screen w-full flex-col bg-background font-sans text-foreground">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3 md:px-4">
        <Button variant="ghost" size="icon" onClick={handleBack} aria-label="Back">
          <ChevronLeftIcon />
        </Button>
        <Input
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          aria-label="Project name"
          className="w-40 border-transparent bg-transparent px-1.5 font-medium shadow-none focus-visible:border-ring md:w-56"
        />
        <div className="flex-1" />
        <div className="hidden md:block">
          <DeviceToggle value={device} onChange={setDevice} />
        </div>
        <ThemeToggle />
        <Button size="sm" disabled={!previewReady}>
          Publish
        </Button>
      </header>

      <div className="flex shrink-0 border-b md:hidden">
        {['chat', 'preview'].map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setMobileTab(tab)}
            className={`flex-1 cursor-pointer py-2.5 text-xs font-medium capitalize transition-colors ${
              mobileTab === tab
                ? 'border-b-2 border-foreground text-foreground'
                : 'text-muted-foreground'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="flex flex-1 overflow-hidden">
        <section
          className={`${mobileTab === 'chat' ? 'flex' : 'hidden'} w-full shrink-0 flex-col border-border bg-background md:flex md:w-[320px] md:border-r lg:w-[380px]`}
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <MessageScrollerProvider autoScroll defaultScrollPosition="end">
              <MessageScroller>
                <MessageScrollerViewport>
                  <MessageScrollerContent className="p-4">
                    {messages.map((m) => (
                      <MessageScrollerItem key={m.id} messageId={m.id}>
                        <ChatMessage message={m} />
                      </MessageScrollerItem>
                    ))}
                    {showClarification ? (
                      <MessageScrollerItem>{renderClarification()}</MessageScrollerItem>
                    ) : null}
                    {isWeaving && !showClarification ? (
                      <MessageScrollerItem>
                        <Message>
                          <MessageContent>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <SpinLoader size="sm" label="Working" />
                              <span>Working…</span>
                            </div>
                          </MessageContent>
                        </Message>
                      </MessageScrollerItem>
                    ) : null}
                  </MessageScrollerContent>
                </MessageScrollerViewport>
                <MessageScrollerButton />
              </MessageScroller>
            </MessageScrollerProvider>
          </div>

          <div className="border-t p-3">
            <InputGroup>
              <InputGroupInput
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isWeaving || showClarification}
                placeholder={
                  isWeaving ? 'Processing…' : showClarification ? 'Awaiting answers…' : 'Ask for a change…'
                }
                aria-label="Ask for a change"
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  size="icon-sm"
                  onClick={showClarification ? handleClarificationSubmit : handleSend}
                  disabled={(showClarification ? false : !input.trim()) || isWeaving || isSubmittingClarification}
                  aria-label="Send"
                >
                  <SendHorizontalIcon />
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </div>
        </section>

        <section className={`${mobileTab === 'preview' ? 'flex' : 'hidden'} min-w-0 flex-1 flex-col bg-background md:flex`}>
          <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
            <SegmentedControl
              ariaLabel="View mode"
              size="sm"
              options={[
                { value: 'preview', label: 'Preview' },
                { value: 'code', label: 'Code' },
              ]}
              value={activeView}
              onChange={handleViewChange}
            />

            {activeView === 'preview' ? (
              <>
                <div className="min-w-0 flex-1 truncate rounded-md border bg-muted px-2.5 py-1 font-mono text-[11px] text-muted-foreground">
                  {previewUrl ? previewUrl.replace(/^https?:\/\//, '') : `localhost:8000/${slug}`}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setRefreshKey((k) => k + 1)}
                  disabled={!previewUrl}
                  aria-label="Refresh preview"
                >
                  <RefreshCwIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => previewUrl && window.open(previewUrl, '_blank', 'noopener,noreferrer')}
                  disabled={!previewUrl}
                  aria-label="Open preview in new tab"
                >
                  <ExternalLinkIcon />
                </Button>
              </>
            ) : (
              <div className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
                {selectedFile || 'Project files'}
              </div>
            )}

            <div className="md:hidden">
              <DeviceToggle value={device} onChange={setDevice} />
            </div>
          </div>

          {activeView === 'code' ? (
            <div className="flex flex-1 overflow-hidden">
              <ScrollArea className="w-52 shrink-0 border-r bg-muted/40">
                <div className="p-1.5">
                  {filesLoading ? (
                    <p className="p-2 text-xs text-muted-foreground">Loading files…</p>
                  ) : null}
                  {filesError ? (
                    <p className="p-2 text-xs text-destructive">{filesError}</p>
                  ) : null}
                  {!filesLoading && !filesError && files.length === 0 ? (
                    <p className="p-2 text-xs text-muted-foreground">No files yet.</p>
                  ) : null}
                  {files.length > 0 ? (
                    <Tree
                      key={files.length}
                      elements={fileTree}
                      initialSelectedId={selectedFile || undefined}
                      initialExpandedItems={folderIds}
                      onSelect={(id) => {
                        if (filePaths.has(id)) setSelectedFile(id)
                      }}
                    />
                  ) : null}
                </div>
              </ScrollArea>
              <ScrollArea className="min-h-0 flex-1 bg-background">
                <pre className="p-4 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words text-foreground">
                  {selectedFileContent || 'Select a file to view its contents.'}
                </pre>
              </ScrollArea>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center overflow-hidden bg-muted/40 p-3 md:p-5">
              {previewReady && previewUrl ? (
                previewFrame(previewUrl)
              ) : previewReady ? (
                previewFrame(fallbackPreviewSrcDoc, true)
              ) : (
                <Empty className="h-full w-full border border-dashed bg-background">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <ThreadMark />
                    </EmptyMedia>
                    <EmptyTitle>{isWeaving ? 'Building preview…' : 'Preview'}</EmptyTitle>
                    <EmptyDescription>
                      {isWeaving ? 'Your app is being generated.' : 'Your app preview will appear here.'}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
