import type { AppSettings } from '../shared/types'

/**
 * Transcribes a chunk of audio using an OpenAI-compatible `audio/transcriptions`
 * endpoint (Groq Whisper by default). `audio` is the raw bytes of an audio file
 * (e.g. webm/opus) captured in the renderer.
 */
export async function transcribe(
  settings: AppSettings,
  audio: Uint8Array,
  mimeType: string
): Promise<string> {
  const base = settings.sttBaseUrl.replace(/\/$/, '')
  const ext = mimeType.includes('wav') ? 'wav' : mimeType.includes('mp4') ? 'mp4' : 'webm'

  const form = new FormData()
  form.append('file', new Blob([audio as BlobPart], { type: mimeType }), `audio.${ext}`)
  form.append('model', settings.sttModel)
  form.append('response_format', 'json')
  if (settings.sttLanguage) form.append('language', settings.sttLanguage)

  const headers: Record<string, string> = {}
  if (settings.sttApiKey) headers.Authorization = `Bearer ${settings.sttApiKey}`

  const res = await fetch(`${base}/audio/transcriptions`, {
    method: 'POST',
    headers,
    body: form
  })

  if (!res.ok) {
    let detail = ''
    try {
      detail = (await res.text()).slice(0, 500)
    } catch {
      // ignore
    }
    throw new Error(`Transcription failed (${res.status}): ${detail}`)
  }

  const json = (await res.json()) as { text?: string }
  return (json.text ?? '').trim()
}
