import { JSX, useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { useAudioCapture } from './hooks/useAudioCapture'
import { AnswerView } from './components/AnswerView'
import { SettingsPanel } from './components/SettingsPanel'
import { detectQuestion } from './lib/questions'
import { uid } from './lib/id'
import type { AppSettings } from '../../shared/types'

interface Segment {
  id: string
  text: string
  isQuestion: boolean
}

// One question and its own streamed answer. Keeping a list (rather than a single
// answer) means a follow-up question never wipes an earlier answer.
interface QA {
  id: string
  question: string
  answer: string
  answering: boolean
  error?: string
}

function App(): JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [transcript, setTranscript] = useState<Segment[]>([])
  const [qas, setQas] = useState<QA[]>([])
  const [error, setError] = useState<string | null>(null)
  const [clickThrough, setClickThrough] = useState(false)
  const [captureSystem, setCaptureSystem] = useState(true)
  const [captureMic, setCaptureMic] = useState(false)
  const [transcriptHeight, setTranscriptHeight] = useState(130)
  const [transcriptCollapsed, setTranscriptCollapsed] = useState(false)

  const capture = useAudioCapture()

  const settingsRef = useRef<AppSettings | null>(null)
  const transcriptRef = useRef<Segment[]>([])
  const lastAnsweredRef = useRef('')
  const transcriptEndRef = useRef<HTMLDivElement>(null)
  const answerBodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    settingsRef.current = settings
  }, [settings])
  useEffect(() => {
    transcriptRef.current = transcript
  }, [transcript])

  // Load persisted settings on start.
  useEffect(() => {
    window.api.getSettings().then((res) => {
      if (res.ok && res.data) setSettings(res.data)
      else setSettings(null)
    })
  }, [])

  const recentContext = useCallback((): string => {
    return transcriptRef.current
      .map((s) => s.text)
      .join(' ')
      .slice(-1500)
  }, [])

  const ask = useCallback(
    (q: string) => {
      if (!q.trim()) return
      const id = uid()
      lastAnsweredRef.current = q
      setQas((prev) => [...prev, { id, question: q, answer: '', answering: true }])
      setError(null)
      window.api.ask(id, q, recentContext()).then((res) => {
        if (!res.ok && res.error) {
          setQas((prev) =>
            prev.map((x) => (x.id === id ? { ...x, answering: false, error: res.error } : x))
          )
        }
      })
    },
    [recentContext]
  )

  // Subscribe to streamed answer tokens, routing each event to its own card.
  useEffect(() => {
    return window.api.onLlmStream((event) => {
      setQas((prev) =>
        prev.map((x) => {
          if (x.id !== event.id) return x
          if (event.type === 'delta') return { ...x, answer: x.answer + event.text }
          if (event.type === 'done') return { ...x, answering: false }
          if (event.type === 'error') return { ...x, answering: false, error: event.message }
          return x
        })
      )
    })
  }, [])

  const handleChunk = useCallback(
    async (audio: ArrayBuffer, mimeType: string) => {
      const res = await window.api.transcribe(audio, mimeType)
      if (!res.ok) {
        if (res.error) setError(res.error)
        return
      }
      const text = (res.data ?? '').trim()
      if (!text) return
      const q = detectQuestion(text)
      setTranscript((prev) => [...prev, { id: uid(), text, isQuestion: Boolean(q) }])
      if (q && settingsRef.current?.autoAnswer && q !== lastAnsweredRef.current) {
        ask(q)
      }
    },
    [ask]
  )

  const startListening = useCallback(() => {
    const s = settingsRef.current
    if (!s) return
    if (!captureSystem && !captureMic) {
      setError('Enable system audio and/or microphone first.')
      return
    }
    capture.start({
      sources: { system: captureSystem, mic: captureMic },
      maxPhraseMs: s.transcribeIntervalMs,
      onChunk: handleChunk
    })
  }, [capture, captureSystem, captureMic, handleChunk])

  const toggleListening = useCallback(() => {
    if (capture.listening) capture.stop()
    else startListening()
  }, [capture, startListening])

  const clearAll = useCallback(() => {
    setTranscript([])
    setQas([])
    lastAnsweredRef.current = ''
  }, [])

  const answerNow = useCallback(() => {
    const fullText = transcriptRef.current.map((s) => s.text).join(' ')
    const q = detectQuestion(fullText) ?? transcriptRef.current.at(-1)?.text ?? ''
    if (q) ask(q)
  }, [ask])

  const toggleClickThrough = useCallback(() => {
    setClickThrough((prev) => {
      const next = !prev
      window.api.setClickThrough(next)
      return next
    })
  }, [])

  const scrollAnswer = useCallback((delta: number) => {
    answerBodyRef.current?.scrollBy({ top: delta, behavior: 'smooth' })
  }, [])

  // Global hotkeys forwarded from the main process.
  useEffect(() => {
    return window.api.onHotkey((action) => {
      if (action === 'answer-now') answerNow()
      else if (action === 'toggle-listening') toggleListening()
      else if (action === 'clear') clearAll()
      else if (action === 'toggle-clickthrough') toggleClickThrough()
      else if (action === 'scroll-answer-down') scrollAnswer(220)
      else if (action === 'scroll-answer-up') scrollAnswer(-220)
    })
  }, [answerNow, toggleListening, clearAll, toggleClickThrough, scrollAnswer])

  // Auto-scroll the transcript, and keep the newest answer in view while it streams.
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcript])
  useEffect(() => {
    const last = qas[qas.length - 1]
    if (last?.answering && answerBodyRef.current) {
      answerBodyRef.current.scrollTop = answerBodyRef.current.scrollHeight
    }
  }, [qas])

  // Drag the divider to resize the transcript pane.
  const startResize = useCallback(
    (e: ReactMouseEvent) => {
      e.preventDefault()
      const startY = e.clientY
      const startH = transcriptHeight
      const onMove = (ev: MouseEvent): void => {
        setTranscriptHeight(Math.max(48, Math.min(480, startH + (ev.clientY - startY))))
      }
      const onUp = (): void => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [transcriptHeight]
  )

  const persist = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      if (!prev) return prev
      const next = { ...prev, ...patch }
      window.api.setSettings(next)
      return next
    })
  }, [])

  if (!settings) {
    return (
      <div className="app">
        <div className="header">
          <span className="title">Iview Protect</span>
        </div>
        <div className="pane-body">Loading…</div>
      </div>
    )
  }

  const hasKey = Boolean(settings.llmApiKey.trim()) || settings.llmBaseUrl.includes('localhost')

  return (
    <div className="app">
      <div className="header">
        <span className="title">
          <span className={`dot ${capture.listening ? 'live' : ''}`} />
          Iview Protect
        </span>
        <span className="spacer" />
        <button
          className={`icon-btn ${clickThrough ? 'active' : ''}`}
          title="Toggle click-through (Ctrl+Shift+M)"
          onClick={toggleClickThrough}
        >
          {clickThrough ? 'Click-through' : 'Interactive'}
        </button>
        <button className="icon-btn" title="Settings" onClick={() => setShowSettings(true)}>
          Settings
        </button>
      </div>

      {!hasKey && (
        <div className="banner info">
          Add a free API key in Settings to start (Groq, Gemini, OpenRouter or local Ollama).
        </div>
      )}
      {error && <div className="banner">{error}</div>}

      <div className="controls">
        <button
          className={`btn-primary ${capture.listening ? 'stop' : ''}`}
          onClick={toggleListening}
          disabled={!hasKey}
        >
          {capture.listening ? 'Stop' : 'Listen'}
        </button>
        <div className="level">
          <span style={{ width: `${Math.min(100, capture.level * 280)}%` }} />
        </div>
        <label className="toggle">
          <input
            type="checkbox"
            checked={captureSystem}
            disabled={capture.listening}
            onChange={(e) => setCaptureSystem(e.target.checked)}
          />
          System
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={captureMic}
            disabled={capture.listening}
            onChange={(e) => setCaptureMic(e.target.checked)}
          />
          Mic
        </label>
      </div>

      <div className="panes">
        <div
          className="pane transcript"
          style={{ flex: `0 0 ${transcriptCollapsed ? 0 : transcriptHeight}px` }}
        >
          <div className="pane-head">
            <span>Live transcript</span>
            <span className="head-actions">
              <button
                className="icon-btn"
                title={transcriptCollapsed ? 'Show transcript' : 'Hide transcript'}
                onClick={() => setTranscriptCollapsed((v) => !v)}
              >
                {transcriptCollapsed ? 'Show' : 'Hide'}
              </button>
              <button className="icon-btn" onClick={clearAll}>
                Clear
              </button>
            </span>
          </div>
          {!transcriptCollapsed && (
            <div className="pane-body">
              {transcript.length === 0 && <div className="empty">Waiting for audio…</div>}
              {transcript.map((s) => (
                <div
                  key={s.id}
                  className={`transcript-seg ${s.isQuestion ? 'q' : ''}`}
                  title={s.isQuestion ? 'Click to answer this question' : undefined}
                  onClick={s.isQuestion ? () => ask(s.text) : undefined}
                >
                  {s.text}
                </div>
              ))}
              <div ref={transcriptEndRef} />
            </div>
          )}
        </div>

        {!transcriptCollapsed && (
          <div className="resizer" onMouseDown={startResize} title="Drag to resize" />
        )}

        <div className="pane answer">
          <div className="pane-head">
            <span>Suggested answers</span>
            <button className="icon-btn" onClick={answerNow} disabled={!hasKey}>
              Answer now
            </button>
          </div>
          <div className="pane-body" ref={answerBodyRef}>
            {qas.length === 0 && (
              <div className="empty">
                Answers appear here. Detected questions are answered automatically.
              </div>
            )}
            {qas.map((qa) => (
              <div className="qa" key={qa.id}>
                <div className="question-chip">{qa.question}</div>
                {qa.error ? (
                  <div className="qa-error">{qa.error}</div>
                ) : (
                  <AnswerView text={qa.answer} streaming={qa.answering} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {showSettings && (
        <SettingsPanel
          settings={settings}
          onChange={persist}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}

export default App
