import React, { useEffect, useRef, useState } from 'react'
import {
  ThreadMark,
  ThreadField,
  ChevronLeft,
  Monitor,
  Smartphone,
  RefreshCw,
  ExternalLink,
  Check,
  ArrowRight,
} from './Icons'

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
    color: #1F2430;
    background: #FFFFFF;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 20px;
    border-bottom: 1px solid #ECEAE6;
  }
  .brand { font-weight: 700; font-size: 14px; letter-spacing: -0.01em; }
  nav a { color: #6B7280; text-decoration: none; font-size: 12px; margin-left: 14px; }
  .cta {
    background: #1F2430; color: #fff; border: none; border-radius: 6px;
    padding: 6px 12px; font-size: 12px; cursor: pointer;
  }
  main { padding: 40px 20px; text-align: center; max-width: 600px; margin: 0 auto; }
  .eyebrow { font-size: 10px; letter-spacing: 0.15em; text-transform: uppercase; color: #C2884B; font-weight: 600; }
  h1 { font-size: 28px; line-height: 1.2; margin: 12px 0; letter-spacing: -0.01em; }
  p.sub { color: #6B7280; font-size: 14px; line-height: 1.5; margin: 0 auto 20px; max-width: 440px; }
  .btn-row { display: flex; gap: 8px; justify-content: center; }
  .primary { background: #1F2430; color: #fff; border: none; border-radius: 6px; padding: 10px 16px; font-size: 13px; cursor: pointer; }
  .secondary { background: #fff; color: #1F2430; border: 1px solid #ECEAE6; border-radius: 6px; padding: 10px 16px; font-size: 13px; cursor: pointer; }
  .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 40px; }
  .card { border: 1px solid #ECEAE6; border-radius: 8px; padding: 14px; text-align: left; }
  .card .num { font-size: 10px; color: #C2884B; font-weight: 700; }
  .card h3 { font-size: 13px; margin: 6px 0 2px; }
  .card p { font-size: 12px; color: #6B7280; margin: 0; line-height: 1.4; }
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

function BuildSteps({ steps }) {
  return (
    <div className="space-y-0.5 font-mono text-[10px] tracking-tight leading-none text-(--text-secondary) my-1">
      {steps.map((step, i) => {
        const isActive = !step.done && steps.slice(0, i).every((s) => s.done)
        return (
          <div
            key={step.label}
            className="flex items-center gap-1.5"
            style={{
              animation: 'fadeIn 0.1s ease-out backwards',
              animationDelay: `${i * 20}ms`
            }}
          >
            <span className={step.done ? 'text-(--accent-teal)' : isActive ? 'text-(--accent-gold) animate-pulse' : 'text-(--text-secondary)/40'}>
              {step.done ? '[done]' : isActive ? '[busy]' : '[wait]'}
            </span>
            <span className="text-(--text-secondary)/30">::</span>
            <span className={step.done ? 'text-(--text-secondary)/60 line-through' : isActive ? 'text-(--text-primary) font-medium' : 'text-(--text-secondary)'}>
              {step.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function ChatBubble({ message }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end animate-fade-in">
        <div className="max-w-[95%] bg-(--bg-surface-2) text-(--text-primary) text-[11px] font-mono px-2 py-1 border border-(--border-hairline) rounded-sm">
          &gt; {message.text}
        </div>
      </div>
    )
  }
  return (
    <div className="animate-fade-in space-y-1 py-0.5">
      {message.steps && <BuildSteps steps={message.steps} />}
      {message.text && (
        <p className="text-[11px] font-mono text-(--text-primary) leading-normal">{message.text}</p>
      )}
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

  const DeviceToggle = () => (
    <div className="flex items-center bg-(--bg-surface-2) rounded p-0.5 border border-(--border-hairline)">
      <button
        onClick={() => setDevice('desktop')}
        aria-label="Desktop view"
        className={`p-1 rounded-sm transition-colors ${device === 'desktop' ? 'bg-(--bg-base) text-(--accent-gold)' : 'text-(--text-secondary) hover:text-(--text-primary)'}`}
      >
        <Monitor className="w-3 h-3" />
      </button>
      <button
        onClick={() => setDevice('mobile')}
        aria-label="Mobile view"
        className={`p-1 rounded-sm transition-colors ${device === 'mobile' ? 'bg-(--bg-base) text-(--accent-gold)' : 'text-(--text-secondary) hover:text-(--text-primary)'}`}
      >
        <Smartphone className="w-3 h-3" />
      </button>
    </div>
  )

  const renderClarification = () => {
    if (!showClarification || !clarificationQuestions.length) return null

    return (
      <div className="bg-(--bg-surface) border border-(--accent-gold)/40 rounded p-2.5 space-y-2 font-mono">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-(--text-primary)">Clarify specs:</h3>
        {clarificationQuestions.map((q, idx) => (
          <div key={idx} className="space-y-1">
            <label className="text-[10px] text-(--text-secondary) block truncate">&gt; {q}</label>
            <input
              type="text"
              value={clarificationAnswers[idx] || ''}
              onChange={(e) => setClarificationAnswers({
                ...clarificationAnswers,
                [idx]: e.target.value
              })}
              className="w-full bg-(--bg-base) border border-(--border-hairline) rounded px-2 py-0.5 text-xs font-mono focus:outline-none focus:border-(--accent-gold) text-(--text-primary)"
              placeholder="Type response..."
              disabled={isSubmittingClarification}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleClarificationSubmit()
                }
              }}
            />
          </div>
        ))}
        <button
          onClick={handleClarificationSubmit}
          disabled={isSubmittingClarification}
          className="w-full bg-(--accent-gold) text-[#1B1918] py-1 rounded text-[10px] font-bold uppercase tracking-wider hover:opacity-90 transition disabled:opacity-40"
        >
          {isSubmittingClarification ? 'Sending...' : 'Apply settings'}
        </button>
      </div>
    )
  }

  return (
    <div className="h-screen w-full bg-(--bg-base) text-(--text-primary) font-mono flex flex-col overflow-hidden text-xs">
      <header className="flex items-center gap-2 px-3 h-10 border-b border-(--border-hairline) shrink-0 bg-(--bg-base)">
        <button
          onClick={handleBack}
          aria-label="Back"
          className="p-1 rounded text-(--text-secondary) hover:text-(--text-primary) transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <input
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          className="font-mono text-xs bg-transparent outline-none text-(--text-primary) w-36 focus:border-b border-(--accent-gold) px-0.5"
        />
        <div className="flex-1" />
        <div className="hidden sm:block">
          <DeviceToggle />
        </div>
        <button
          disabled={!previewReady}
          className="font-bold text-[10px] px-2.5 h-6 rounded bg-(--accent-gold) text-[#1B1918] disabled:opacity-30 disabled:cursor-not-allowed uppercase tracking-wider transition"
        >
          Publish
        </button>
      </header>

      <div className="flex sm:hidden border-b border-(--border-hairline) shrink-0 bg-(--bg-base)">
        {['chat', 'preview'].map((tab) => (
          <button
            key={tab}
            onClick={() => setMobileTab(tab)}
            className={`flex-1 text-center py-1.5 text-[10px] uppercase tracking-wider transition-colors ${mobileTab === tab ? 'text-(--accent-gold) font-bold border-b border-(--accent-gold)' : 'text-(--text-secondary)'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="flex-1 flex overflow-hidden">
        <section className={`${mobileTab === 'chat' ? 'flex' : 'hidden'} sm:flex flex-col w-full sm:w-[260px] md:w-[300px] border-r border-(--border-hairline) shrink-0 bg-(--bg-base)`}>
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-none">
            {messages.map((m) => (
              <ChatBubble key={m.id} message={m} />
            ))}
            {renderClarification()}
            {isWeaving && !showClarification && (
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-(--text-secondary) opacity-70">
                <span className="w-1 h-1 rounded-full bg-(--accent-teal) animate-ping" />
                <span>Loading updates...</span>
              </div>
            )}
          </div>

          <div className="p-2 border-t border-(--border-hairline) bg-(--bg-base)">
            <div className="flex items-center gap-1.5 bg-(--bg-surface) border border-(--border-hairline) rounded px-2 py-1">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isWeaving || showClarification}
                placeholder={isWeaving ? 'Processing...' : showClarification ? 'Awaiting response...' : 'Type a message...'}
                className="flex-1 bg-transparent outline-none text-[11px] font-mono placeholder:text-(--text-secondary)/60 disabled:opacity-40"
              />
              <button
                onClick={showClarification ? handleClarificationSubmit : handleSend}
                disabled={(showClarification ? false : !input.trim()) || isWeaving || isSubmittingClarification}
                aria-label="Execute"
                className="p-0.5 rounded text-(--accent-gold) disabled:text-(--text-secondary)/30 transition"
              >
                <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>
            </div>
          </div>
        </section>

        <section className={`${mobileTab === 'preview' ? 'flex' : 'hidden'} sm:flex flex-1 flex-col bg-(--bg-base) min-w-0`}>
          <div className="flex items-center gap-2 px-3 border-b border-(--border-hairline) shrink-0 h-8 bg-(--bg-base)">
            <div className="flex items-center bg-(--bg-surface-2) rounded p-0.5 border border-(--border-hairline) shrink-0">
              {['preview', 'code'].map((v) => (
                <button
                  key={v}
                  onClick={() => handleViewChange(v)}
                  className={`px-2 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-wider transition-colors ${activeView === v ? 'bg-(--bg-base) text-(--accent-gold)' : 'text-(--text-secondary) hover:text-(--text-primary)'}`}
                >
                  {v}
                </button>
              ))}
            </div>

            {activeView === 'preview' ? (
              <>
                <div className="flex-1 bg-(--bg-surface) rounded px-2 py-0.5 font-mono text-[10px] text-(--text-secondary) truncate border border-(--border-hairline)">
                  {previewUrl ? previewUrl.replace(/^https?:\/\//, '') : `localhost:8000/${slug}`}
                </div>
                <button
                  onClick={() => setRefreshKey((k) => k + 1)}
                  disabled={!previewUrl}
                  aria-label="Refresh"
                  className="p-1 text-(--text-secondary) hover:text-(--text-primary) transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
                <button
                  onClick={() => previewUrl && window.open(previewUrl, '_blank', 'noopener,noreferrer')}
                  disabled={!previewUrl}
                  aria-label="Open tab"
                  className="p-1 text-(--text-secondary) hover:text-(--text-primary) transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ExternalLink className="w-3 h-3" />
                </button>
              </>
            ) : (
              <div className="flex-1 font-mono text-[10px] text-(--text-secondary) truncate">
                {selectedFile || 'Project files'}
              </div>
            )}

            <div className="sm:hidden">
              <DeviceToggle />
            </div>
          </div>

          {activeView === 'code' ? (
            <div className="flex-1 flex overflow-hidden bg-(--bg-surface-2)">
              <div className="w-32 shrink-0 border-r border-(--border-hairline) overflow-y-auto bg-(--bg-base)">
                {filesLoading && (
                  <p className="p-2 text-[10px] font-mono text-(--text-secondary)">Loading files...</p>
                )}
                {filesError && (
                  <p className="p-2 text-[10px] font-mono text-red-400">{filesError}</p>
                )}
                {!filesLoading && !filesError && files.length === 0 && (
                  <p className="p-2 text-[10px] font-mono text-(--text-secondary)">No files yet.</p>
                )}
                {files.map((f) => (
                  <button
                    key={f.path}
                    onClick={() => setSelectedFile(f.path)}
                    title={f.path}
                    className={`block w-full text-left px-2 py-1 text-[10px] font-mono truncate transition-colors ${
                      selectedFile === f.path
                        ? 'bg-(--bg-surface-2) text-(--accent-gold)'
                        : 'text-(--text-secondary) hover:text-(--text-primary)'
                    }`}
                  >
                    {f.path}
                  </button>
                ))}
              </div>
              <pre className="flex-1 overflow-auto p-3 text-[10px] font-mono text-(--text-primary) leading-normal whitespace-pre-wrap break-words">
                {selectedFileContent || 'Select a file to view its contents.'}
              </pre>
            </div>
          ) : (
            <div className="flex-1 p-2.5 bg-(--bg-surface-2) flex items-center justify-center overflow-hidden">
              {previewReady && previewUrl ? (
                device === 'mobile' ? (
                  <div className="border-[4px] border-(--bg-surface) rounded-lg overflow-hidden h-full max-h-[500px] w-[260px] shadow-md bg-white">
                    <iframe key={refreshKey} title="Preview" src={previewUrl} className="w-full h-full" />
                  </div>
                ) : (
                  <div className="w-full h-full rounded overflow-hidden border border-(--border-hairline) bg-white shadow-sm">
                    <iframe key={refreshKey} title="Preview" src={previewUrl} className="w-full h-full" />
                  </div>
                )
              ) : previewReady ? (
                device === 'mobile' ? (
                  <div className="border-[4px] border-(--bg-surface) rounded-lg overflow-hidden h-full max-h-[500px] w-[260px] shadow-md bg-white">
                    <iframe title="Preview" srcDoc={fallbackPreviewSrcDoc} className="w-full h-full" />
                  </div>
                ) : (
                  <div className="w-full h-full rounded overflow-hidden border border-(--border-hairline) bg-white shadow-sm">
                    <iframe title="Preview" srcDoc={fallbackPreviewSrcDoc} className="w-full h-full" />
                  </div>
                )
              ) : (
                <div className="w-full h-full rounded border border-dashed border-(--border-hairline) flex flex-col items-center justify-center p-4 text-center bg-(--bg-base)">
                  <ThreadField className="opacity-5 w-6 h-6 mb-1.5" />
                  <p className="text-[10px] font-mono text-(--text-secondary) tracking-tight max-w-[180px] leading-normal">
                    {isWeaving ? 'Building preview...' : 'Ready. Type a response to generate.'}
                  </p>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(2px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in { animation: fadeIn 0.1s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .scrollbar-none::-webkit-scrollbar { display: none; }
        .scrollbar-none { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  )
}