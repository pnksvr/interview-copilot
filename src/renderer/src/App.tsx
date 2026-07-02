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

function App(): JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [transcript, setTranscript] = useState<Segment[]>([])
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
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
  const transcriptEndRef = useRef<HTMLDivElement>(null)
  const answerEndRef = useRef<HTMLDivElement>(null)

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
      askIdRef.current = id
      lastAnsweredRef.current = q
      setQuestion(q)
      setAnswer('')
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
      if (event.type === 'delta') setAnswer((prev) => prev + event.text)
      else if (event.type === 'done') setAnswering(false)
      else if (event.type === 'error') {
        setAnswering(false)
        setError(event.message)
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
    setQuestion('')
    setAnswer('')
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

  // Global hotkeys forwarded from the main process.
  useEffect(() => {
    return window.api.onHotkey((action) => {
      if (action === 'answer-now') answerNow()
      else if (action === 'toggle-listening') toggleListening()
      else if (action === 'clear') clearAll()
      else if (action === 'toggle-clickthrough') toggleClickThrough()
    })
  }, [answerNow, toggleListening, clearAll, toggleClickThrough])

  // Auto-scroll panes.
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcript])
  useEffect(() => {
    answerEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [answer])

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
        <div className="pane transcript">
          <div className="pane-head">
            <span>Live transcript</span>
            <button className="icon-btn" onClick={clearAll}>
              Clear
            </button>
          </div>
          <div className="pane-body">
            {transcript.length === 0 && <div className="empty">Waiting for audio…</div>}
            {transcript.map((s) => (
              <div key={s.id} className={`transcript-seg ${s.isQuestion ? 'q' : ''}`}>
                {s.text}
              </div>
            ))}
            <div ref={transcriptEndRef} />
          </div>
        </div>

        <div className="pane answer">
          <div className="pane-head">
            <span>Suggested answer</span>
            <button className="icon-btn" onClick={answerNow} disabled={!hasKey}>
              Answer now
            </button>
          </div>
          <div className="pane-body">
            {question && <div className="question-chip">{question}</div>}
            {!answer && !answering && (
              <div className="empty">
                Answers appear here. Detected questions are answered automatically.
              </div>
            )}
            <AnswerView text={answer} streaming={answering} />
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
