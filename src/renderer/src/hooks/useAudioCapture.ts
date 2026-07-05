import { useCallback, useRef, useState } from 'react'

export interface CaptureSources {
  system: boolean
  mic: boolean
}

interface StartOptions {
  sources: CaptureSources
  /** Hard cap on a single utterance before it is flushed for transcription. */
  maxPhraseMs: number
  onChunk: (audio: ArrayBuffer, mimeType: string) => void
}

function pickMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c
  }
  return 'audio/webm'
}

export interface AudioCapture {
  listening: boolean
  level: number
  error: string | null
  start: (opts: StartOptions) => Promise<void>
  stop: () => void
}

// Voice-activity thresholds (RMS of the normalised waveform, 0..1).
const START_RMS = 0.035 // must exceed this to begin capturing an utterance
const SILENCE_RMS = 0.02 // below this counts as silence
const SILENCE_HANGOVER_MS = 900 // trailing silence that ends an utterance
const MIN_VOICED_MS = 350 // ignore blips shorter than this
const TICK_MS = 50 // VAD sampling interval

export function useAudioCapture(): AudioCapture {
  const [listening, setListening] = useState(false)
  const [level, setLevel] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const streamsRef = useRef<MediaStream[]>([])
  const contextRef = useRef<AudioContext | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const activeRef = useRef(false)
  const timerRef = useRef<number | null>(null)

  const cleanup = useCallback(() => {
    activeRef.current = false
    if (timerRef.current) window.clearInterval(timerRef.current)
    timerRef.current = null
    try {
      recorderRef.current?.stop()
    } catch {
      // already stopped
    }
    recorderRef.current = null
    streamsRef.current.forEach((s) => s.getTracks().forEach((t) => t.stop()))
    streamsRef.current = []
    contextRef.current?.close().catch(() => {})
    contextRef.current = null
    setLevel(0)
    setListening(false)
  }, [])

  const start = useCallback(
    async ({ sources, maxPhraseMs, onChunk }: StartOptions) => {
      setError(null)
      try {
        const ctx = new AudioContext()
        contextRef.current = ctx
        const destination = ctx.createMediaStreamDestination()
        let trackCount = 0

        if (sources.system) {
          const sys = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
          streamsRef.current.push(sys)
          sys.getVideoTracks().forEach((t) => t.stop())
          if (sys.getAudioTracks().length) {
            ctx.createMediaStreamSource(new MediaStream(sys.getAudioTracks())).connect(destination)
            trackCount++
          }
        }

        if (sources.mic) {
          const mic = await navigator.mediaDevices.getUserMedia({ audio: true })
          streamsRef.current.push(mic)
          ctx.createMediaStreamSource(mic).connect(destination)
          trackCount++
        }

        if (trackCount === 0) {
          throw new Error('No audio captured. Enable system audio sharing or the microphone.')
        }

        const analyser = ctx.createAnalyser()
        analyser.fftSize = 512
        ctx.createMediaStreamSource(destination.stream).connect(analyser)
        const buf = new Uint8Array(analyser.frequencyBinCount)

        const mimeType = pickMimeType()
        // Never flush faster than this, so a long question is not cut mid-sentence
        // even if an older saved setting still has a short interval.
        const capMs = Math.max(maxPhraseMs, 10000)
        activeRef.current = true

        // Utterance state machine driven by voice activity.
        let recording = false
        let chunks: Blob[] = []
        let voicedMs = 0
        let silenceMs = 0
        let utteranceMs = 0
        let last = performance.now()

        const flush = (): void => {
          const rec = recorderRef.current
          if (!rec) return
          recording = false
          // onstop reads the captured flags below, so snapshot them.
          const enoughVoice = voicedMs >= MIN_VOICED_MS
          const collected = chunks
          rec.onstop = async (): Promise<void> => {
            if (enoughVoice && collected.length) {
              const blob = new Blob(collected, { type: mimeType })
              onChunk(await blob.arrayBuffer(), mimeType)
            }
          }
          try {
            if (rec.state !== 'inactive') rec.stop()
          } catch {
            // ignore
          }
          recorderRef.current = null
        }

        const beginUtterance = (): void => {
          const recorder = new MediaRecorder(destination.stream, { mimeType })
          recorderRef.current = recorder
          chunks = []
          voicedMs = 0
          silenceMs = 0
          utteranceMs = 0
          recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data)
          }
          recorder.start()
          recording = true
        }

        const tick = (): void => {
          if (!activeRef.current) return
          analyser.getByteTimeDomainData(buf)
          let sum = 0
          for (let i = 0; i < buf.length; i++) {
            const v = (buf[i] - 128) / 128
            sum += v * v
          }
          const rms = Math.sqrt(sum / buf.length)
          setLevel(rms)

          const now = performance.now()
          const dt = now - last
          last = now

          if (!recording) {
            if (rms > START_RMS) beginUtterance()
            return
          }

          utteranceMs += dt
          if (rms > SILENCE_RMS) {
            voicedMs += dt
            silenceMs = 0
          } else {
            silenceMs += dt
          }

          const endedByPause = silenceMs >= SILENCE_HANGOVER_MS && voicedMs >= MIN_VOICED_MS
          const endedByCap = utteranceMs >= capMs
          if (endedByPause || endedByCap) flush()
        }

        timerRef.current = window.setInterval(tick, TICK_MS)
        setListening(true)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        cleanup()
      }
    },
    [cleanup]
  )

  const stop = useCallback(() => {
    cleanup()
  }, [cleanup])

  return { listening, level, error, start, stop }
}
