import { useCallback, useRef, useState } from 'react'

export interface CaptureSources {
  system: boolean
  mic: boolean
}

interface StartOptions {
  sources: CaptureSources
  intervalMs: number
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

export function useAudioCapture(): AudioCapture {
  const [listening, setListening] = useState(false)
  const [level, setLevel] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const streamsRef = useRef<MediaStream[]>([])
  const contextRef = useRef<AudioContext | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const activeRef = useRef(false)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const peakRef = useRef(0)
  const rafRef = useRef<number | null>(null)

  const cleanup = useCallback(() => {
    activeRef.current = false
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
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
    analyserRef.current = null
    setLevel(0)
    setListening(false)
  }, [])

  const start = useCallback(
    async ({ sources, intervalMs, onChunk }: StartOptions) => {
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

        // Level metering + lightweight voice-activity detection.
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 512
        ctx.createMediaStreamSource(destination.stream).connect(analyser)
        analyserRef.current = analyser
        const buf = new Uint8Array(analyser.frequencyBinCount)
        const meter = (): void => {
          analyser.getByteTimeDomainData(buf)
          let sum = 0
          for (let i = 0; i < buf.length; i++) {
            const v = (buf[i] - 128) / 128
            sum += v * v
          }
          const rms = Math.sqrt(sum / buf.length)
          peakRef.current = Math.max(peakRef.current, rms)
          setLevel(rms)
          if (activeRef.current) rafRef.current = requestAnimationFrame(meter)
        }

        const mimeType = pickMimeType()
        activeRef.current = true

        const cycle = (): void => {
          if (!activeRef.current) return
          const recorder = new MediaRecorder(destination.stream, { mimeType })
          recorderRef.current = recorder
          const chunks: Blob[] = []
          peakRef.current = 0
          recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data)
          }
          recorder.onstop = async () => {
            const hadVoice = peakRef.current > 0.02
            if (hadVoice && chunks.length) {
              const blob = new Blob(chunks, { type: mimeType })
              onChunk(await blob.arrayBuffer(), mimeType)
            }
            if (activeRef.current) cycle()
          }
          recorder.start()
          window.setTimeout(() => {
            if (recorder.state !== 'inactive') recorder.stop()
          }, intervalMs)
        }

        meter()
        cycle()
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
