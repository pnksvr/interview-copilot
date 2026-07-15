import { JSX, useCallback, useEffect, useRef, useState } from 'react'
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

/** A question/answer pair stored in history so the user can click back. */
interface QuestionRecord {
  id: string
  question: string
  answer: string
  done: boolean
  timestamp: number
}

const MAX_HISTORY = 10

/**
 * Returns true when a freshly-detected question looks like interviewer follow-up
 * noise ("are you there?", "ok go ahead", etc.) that should NOT trigger a new
 * answer.  We suppress it when it arrives within `cooldownMs` of the last
 * auto-answer trigger.
 */
function isFollowUpNoise(question: string, lastAnsweredAt: number, cooldownMs: number): boolean {
  const elapsed = Date.now() - lastAnsweredAt
  if (elapsed >= cooldownMs) return false // outside cooldown window — treat as real

  const words = question.trim().split(/\s+/).length
  // Short phrases within the cooldown window are almost certainly noise.
  if (words <= 5) return true

  const lower = question.toLowerCase().replace(/[?.,!]+$/, '').trim()
  const noisePatterns = [
    'are you there',
    'can you hear me',
    'hello',
    'hi',
    'okay',
    'ok',
    'can you start',
    'please go ahead',
    'go ahead',
    'yes please',
    'take your time',
    'sure',
    'alright',
    'okay go ahead',
    'can you begin',
    'you can start',
    'whenever you are ready',
    'whenever you\'re ready'
  ]
  return noisePatterns.some((p) => lower.includes(p))
}

function App(): JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [transcript, setTranscript] = useState<Segment[]>([])
  const [transcriptCollapsed, setTranscriptCollapsed] = useState(true)
  const [questionHistory, setQuestionHistory] = useState<QuestionRecord[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [answering, setAnswering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [clickThrough, setClickThrough] = useState(false)
  const [captureSystem, setCaptureSystem] = useState(true)
  const [captureMic, setCaptureMic] = useState(false)

  const capture = useAudioCapture()

  const settingsRef = useRef<AppSettings | null>(null)
  const transcriptRef = useRef<Segment[]>([])
  const askIdRef = useRef<string | null>(null)
  const lastAnsweredRef = useRef('')
  const lastAnsweredAtRef = useRef(0)
  const transcriptEndRef = useRef<HTMLDivElement>(null)
  const answerEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => { settingsRef.current = settings }, [settings])
  useEffect(() => { transcriptRef.current = transcript }, [transcript])

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

  // Derived: currently visible question/answer from history
  const activeRecord = questionHistory.find((r) => r.id === selectedId) ?? questionHistory[questionHistory.length - 1] ?? null

  const ask = useCallback(
    (q: string) => {
      if (!q.trim()) return
      const id = uid()
      askIdRef.current = id
      lastAnsweredRef.current = q
      lastAnsweredAtRef.current = Date.now()

      const record: QuestionRecord = {
        id,
        question: q,
        answer: '',
        done: false,
        timestamp: Date.now()
      }
      setQuestionHistory((prev) => {
        const next = [...prev, record]
        // Keep only the most recent MAX_HISTORY records.
        return next.slice(-MAX_HISTORY)
      })
      setSelectedId(id)
      setAnswering(true)
      setError(null)
      window.api.ask(id, q, recentContext()).then((res) => {
        if (!res.ok && res.error) setError(res.error)
      })
    },
    [recentContext]
  )

  // Subscribe to streamed answer tokens.
  useEffect(() => {
    return window.api.onLlmStream((event) => {
      if (event.id !== askIdRef.current) return
      if (event.type === 'delta') {
        setQuestionHistory((prev) =>
          prev.map((r) =>
            r.id === event.id ? { ...r, answer: r.answer + event.text } : r
          )
        )
      } else if (event.type === 'done') {
        setAnswering(false)
        setQuestionHistory((prev) =>
          prev.map((r) => (r.id === event.id ? { ...r, done: true } : r))
        )
      } else if (event.type === 'error') {
        setAnswering(false)
        setError(event.message)
        setQuestionHistory((prev) =>
          prev.map((r) => (r.id === event.id ? { ...r, done: true } : r))
        )
      }
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
      if (
        q &&
        settingsRef.current?.autoAnswer &&
        q !== lastAnsweredRef.current &&
        !isFollowUpNoise(q, lastAnsweredAtRef.current, settingsRef.current.questionCooldownMs ?? 8000)
      ) {
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
      intervalMs: s.transcribeIntervalMs,
      onChunk: handleChunk
    })
  }, [capture, captureSystem, captureMic, handleChunk])

  const toggleListening = useCallback(() => {
    if (capture.listening) capture.stop()
    else startListening()
  }, [capture, startListening])

  const clearAll = useCallback(() => {
    setTranscript([])
    setQuestionHistory([])
    setSelectedId(null)
    lastAnsweredRef.current = ''
    lastAnsweredAtRef.current = 0
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

  // Global hotkeys forwarded from the main process.
  useEffect(() => {
    return window.api.onHotkey((action) => {
      if (action === 'answer-now') answerNow()
      else if (action === 'toggle-listening') toggleListening()
      else if (action === 'clear') clearAll()
      else if (action === 'toggle-clickthrough') toggleClickThrough()
    })
  }, [answerNow, toggleListening, clearAll, toggleClickThrough])

  // Auto-scroll transcript.
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcript])
  // Auto-scroll answer only when we're on the latest (active streaming) record.
  useEffect(() => {
    if (selectedId === null || selectedId === questionHistory[questionHistory.length - 1]?.id) {
      answerEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [activeRecord?.answer, selectedId, questionHistory])

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
        {/* ── Transcript pane (collapsible) ── */}
        <div className={`pane transcript ${transcriptCollapsed ? 'collapsed' : ''}`}>
          <div className="pane-head">
            <button
              className="icon-btn collapse-btn"
              title={transcriptCollapsed ? 'Expand transcript' : 'Collapse transcript'}
              onClick={() => setTranscriptCollapsed((v) => !v)}
            >
              {transcriptCollapsed ? '▶ Transcript' : '▼ Transcript'}
            </button>
            {!transcriptCollapsed && (
              <button className="icon-btn" onClick={clearAll}>
                Clear
              </button>
            )}
          </div>
          {!transcriptCollapsed && (
            <div className="pane-body">
              {transcript.length === 0 && <div className="empty">Waiting for audio…</div>}
              {transcript.map((s) => (
                <div key={s.id} className={`transcript-seg ${s.isQuestion ? 'q' : ''}`}>
                  {s.text}
                </div>
              ))}
              <div ref={transcriptEndRef} />
            </div>
          )}
        </div>

        {/* ── Answer pane ── */}
        <div className="pane answer">
          <div className="pane-head">
            <span>Suggested answer</span>
            <div className="pane-head-actions">
              <button className="icon-btn" onClick={answerNow} disabled={!hasKey}>
                Answer now
              </button>
              {transcriptCollapsed && (
                <button className="icon-btn" onClick={clearAll}>
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Question history chips — click any to view its answer */}
          {questionHistory.length > 0 && (
            <div className="q-history">
              {questionHistory.map((r) => (
                <button
                  key={r.id}
                  className={`q-hist-chip ${r.id === (selectedId ?? questionHistory[questionHistory.length - 1]?.id) ? 'active' : ''}`}
                  title={r.question}
                  onClick={() => setSelectedId(r.id)}
                >
                  {r.question.length > 42 ? r.question.slice(0, 42) + '…' : r.question}
                </button>
              ))}
            </div>
          )}

          <div className="pane-body">
            {activeRecord ? (
              <>
                <div className="question-chip">{activeRecord.question}</div>
                <AnswerView
                  text={activeRecord.answer}
                  streaming={answering && activeRecord.id === askIdRef.current}
                />
              </>
            ) : (
              <div className="empty">
                Answers appear here. Detected questions are answered automatically.
              </div>
            )}
            <div ref={answerEndRef} />
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
