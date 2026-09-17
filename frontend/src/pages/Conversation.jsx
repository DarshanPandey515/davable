import React, { useEffect, useRef, useState } from 'react'
import {
  ThreadMark,
  ChevronLeft,
  Monitor,
  Smartphone,
  RefreshCw,
  ExternalLink,
  Send,
} from '../icons'
import { Button, SegmentedControl, SpinLoader, SystemAlert, TextField, BuildSteps } from '../ui'

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
  { value: 'desktop', ariaLabel: 'Desktop view', icon: <Monitor className="size-3.5" /> },
  { value: 'mobile', ariaLabel: 'Mobile view', icon: <Smartphone className="size-3.5" /> },
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

function Message({ message }) {
  if (message.role === 'user') {
    return (
      <div className="animate-enter flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-neutral-900 px-3.5 py-2 text-sm leading-relaxed text-white">
          {message.text}
        </div>
      </div>
    )
  }

  const isError = typeof message.text === 'string' && message.text.startsWith('Error:')

  return (
    <div className="animate-enter flex gap-2.5">
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-neutral-100 bg-neutral-50">
        <ThreadMark className="size-3.5 text-neutral-500" />
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        {message.steps ? <BuildSteps steps={message.steps} /> : null}
        {message.text ? (
          isError ? (
            <SystemAlert tone="error" description={message.text.replace(/^Error:\s*/, '')} />
          ) : (
            <p className="text-sm leading-relaxed text-neutral-700">{message.text}</p>
          )
        ) : null}
      </div>
    </div>
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

  const scrollRef = useRef(null)
  const startedRef = useRef(false)
  const abortControllerRef = useRef(null)
  const buildStepsMsgIdRef = useRef(null)

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

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
    scrollToBottom();
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

  const renderClarification = () => {
    if (!showClarification || !clarificationQuestions.length) return null

    return (
      <div className="animate-enter space-y-3 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
        <div>
          <h3 className="text-xs font-semibold tracking-tight text-neutral-900">A few details</h3>
          <p className="mt-0.5 text-xs text-neutral-500">Answer the prompts so the build can continue.</p>
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
      </div>
    )
  }

  const previewFrame = (src, isSrcDoc = false) => {
    const iframeProps = isSrcDoc ? { srcDoc: src } : { src }
    if (device === 'mobile') {
      return (
        <div className="h-full max-h-[560px] w-[268px] overflow-hidden rounded-[2rem] border-[6px] border-neutral-900 bg-white">
          <iframe key={refreshKey} title="Preview" className="h-full w-full" {...iframeProps} />
        </div>
      )
    }
    return (
      <div className="h-full w-full overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <iframe key={refreshKey} title="Preview" className="h-full w-full" {...iframeProps} />
      </div>
    )
  }

  return (
    <div className="flex h-screen w-full flex-col bg-white font-sans text-neutral-900">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-neutral-100 px-3 md:px-4">
        <Button variant="ghost" size="icon" onClick={handleBack} aria-label="Back">
          <ChevronLeft className="size-4" />
        </Button>
        <input
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          aria-label="Project name"
          className="w-40 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm font-medium outline-none transition-colors hover:border-neutral-200 focus:border-neutral-900 md:w-56"
        />
        <div className="flex-1" />
        <div className="hidden md:block">
          <DeviceToggle value={device} onChange={setDevice} />
        </div>
        <Button size="sm" disabled={!previewReady}>
          Publish
        </Button>
      </header>

      <div className="flex shrink-0 border-b border-neutral-100 md:hidden">
        {['chat', 'preview'].map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setMobileTab(tab)}
            className={`flex-1 cursor-pointer py-2.5 text-xs font-medium capitalize transition-colors ${
              mobileTab === tab
                ? 'border-b-2 border-neutral-900 text-neutral-900'
                : 'text-neutral-400'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="flex flex-1 overflow-hidden">
        <section
          className={`${mobileTab === 'chat' ? 'flex' : 'hidden'} w-full shrink-0 flex-col border-neutral-100 bg-white md:flex md:w-[320px] md:border-r lg:w-[380px]`}
        >
          <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto p-4">
            {messages.map((m) => (
              <Message key={m.id} message={m} />
            ))}
            {renderClarification()}
            {isWeaving && !showClarification && (
              <div className="flex items-center gap-2 text-xs text-neutral-400">
                <SpinLoader size="sm" label="Working" />
                <span>Working…</span>
              </div>
            )}
          </div>

          <div className="border-t border-neutral-100 p-3">
            <div className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 transition-colors focus-within:border-neutral-900">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isWeaving || showClarification}
                placeholder={
                  isWeaving ? 'Processing…' : showClarification ? 'Awaiting answers…' : 'Ask for a change…'
                }
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-400 disabled:opacity-50"
              />
              <Button
                size="icon"
                onClick={showClarification ? handleClarificationSubmit : handleSend}
                disabled={(showClarification ? false : !input.trim()) || isWeaving || isSubmittingClarification}
                aria-label="Send"
              >
                <Send className="size-3.5" />
              </Button>
            </div>
          </div>
        </section>

        <section className={`${mobileTab === 'preview' ? 'flex' : 'hidden'} min-w-0 flex-1 flex-col bg-white md:flex`}>
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-neutral-100 px-3">
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
                <div className="min-w-0 flex-1 truncate rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-1 font-mono text-[11px] text-neutral-500">
                  {previewUrl ? previewUrl.replace(/^https?:\/\//, '') : `localhost:8000/${slug}`}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setRefreshKey((k) => k + 1)}
                  disabled={!previewUrl}
                  aria-label="Refresh preview"
                >
                  <RefreshCw className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => previewUrl && window.open(previewUrl, '_blank', 'noopener,noreferrer')}
                  disabled={!previewUrl}
                  aria-label="Open preview in new tab"
                >
                  <ExternalLink className="size-3.5" />
                </Button>
              </>
            ) : (
              <div className="min-w-0 flex-1 truncate font-mono text-[11px] text-neutral-500">
                {selectedFile || 'Project files'}
              </div>
            )}

            <div className="md:hidden">
              <DeviceToggle value={device} onChange={setDevice} />
            </div>
          </div>

          {activeView === 'code' ? (
            <div className="flex flex-1 overflow-hidden">
              <div className="w-40 shrink-0 overflow-y-auto border-r border-neutral-100 bg-neutral-50">
                {filesLoading ? (
                  <p className="p-3 text-xs text-neutral-400">Loading files…</p>
                ) : null}
                {filesError ? (
                  <p className="p-3 text-xs text-rose-600">{filesError}</p>
                ) : null}
                {!filesLoading && !filesError && files.length === 0 ? (
                  <p className="p-3 text-xs text-neutral-400">No files yet.</p>
                ) : null}
                {files.map((f) => (
                  <button
                    key={f.path}
                    type="button"
                    onClick={() => setSelectedFile(f.path)}
                    title={f.path}
                    className={`block w-full cursor-pointer truncate px-3 py-1.5 text-left font-mono text-[11px] transition-colors ${
                      selectedFile === f.path
                        ? 'bg-white font-medium text-neutral-900'
                        : 'text-neutral-500 hover:text-neutral-900'
                    }`}
                  >
                    {f.path}
                  </button>
                ))}
              </div>
              <pre className="flex-1 overflow-auto bg-white p-4 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words text-neutral-700">
                {selectedFileContent || 'Select a file to view its contents.'}
              </pre>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center overflow-hidden bg-neutral-50 p-3 md:p-5">
              {previewReady && previewUrl ? (
                previewFrame(previewUrl)
              ) : previewReady ? (
                previewFrame(fallbackPreviewSrcDoc, true)
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 bg-white p-6 text-center">
                  <ThreadMark className="size-6 text-neutral-300" />
                  <p className="mt-3 max-w-[220px] text-xs leading-relaxed text-neutral-400">
                    {isWeaving ? 'Building preview…' : 'Your app preview will appear here.'}
                  </p>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
