import type { AppSettings, LlmProfile } from '../shared/types'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

const SYSTEM_PROMPT = `You are an expert interview copilot helping the user answer questions in a live job interview in real time.

Rules:
- Reply with the answer the user should say, written in the first person as if they are speaking.
- Be concise and structured. Lead with the direct answer, then 2-4 short supporting points or a brief example.
- For coding/technical questions, give the approach first, then a compact code snippet if useful.
- Use the user's resume and the job description to personalise answers and weave in relevant experience.
- Never mention that you are an AI or that the user is using an assistant.
- Answer in the same language the question was asked in.`

/** Trims a context field to at most `max` characters (0 = no limit). */
function clip(text: string, max: number): string {
  const t = text.trim()
  if (max > 0 && t.length > max) return t.slice(0, max)
  return t
}

function buildMessages(settings: AppSettings, question: string, context: string): ChatMessage[] {
  const max = settings.maxContextChars ?? 0
  const profile: string[] = []
  if (settings.resume.trim()) profile.push(`# Candidate resume\n${clip(settings.resume, max)}`)
  if (settings.jobDescription.trim())
    profile.push(`# Job description\n${clip(settings.jobDescription, max)}`)
  if (settings.extraContext.trim())
    profile.push(`# Additional context\n${clip(settings.extraContext, max)}`)

  const ctxMax = max > 0 ? Math.min(1500, max) : 1500
  const ctx = context.trim().slice(-ctxMax)

  const messages: ChatMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }]
  if (profile.length) messages.push({ role: 'system', content: profile.join('\n\n') })
  const user = ctx
    ? `Recent interview transcript (for context):\n${ctx}\n\nThe interviewer just asked:\n"${question}"\n\nGive me the best answer to say.`
    : `The interviewer just asked:\n"${question}"\n\nGive me the best answer to say.`
  messages.push({ role: 'user', content: user })
  return messages
}

/** The primary model plus any configured fallbacks, in priority order. */
function collectProfiles(settings: AppSettings): LlmProfile[] {
  const primary: LlmProfile = {
    provider: settings.llmProvider,
    baseUrl: settings.llmBaseUrl,
    apiKey: settings.llmApiKey,
    model: settings.llmModel
  }
  const all = [primary, ...(settings.llmFallbacks ?? [])]
  // A usable profile needs an endpoint and model, plus a key unless it is local.
  return all.filter(
    (p) => p.baseUrl && p.model && (p.apiKey || p.baseUrl.includes('localhost') || p.baseUrl.includes('127.0.0.1'))
  )
}

/**
 * Streams an answer, automatically failing over to the next configured provider
 * if one errors (e.g. a rate limit) before any answer text has been emitted.
 * Once tokens start streaming we stay on that provider so the answer is coherent.
 */
export async function streamAnswer(
  settings: AppSettings,
  question: string,
  context: string,
  onDelta: (text: string) => void,
  signal: AbortSignal
): Promise<void> {
  const messages = buildMessages(settings, question, context)
  const profiles = collectProfiles(settings)
  if (!profiles.length) throw new Error('No language model is configured. Add an API key in Settings.')

  const maxTokens = settings.maxAnswerTokens ?? 0
  let emitted = false
  const emit = (text: string): void => {
    emitted = true
    onDelta(text)
  }

  let lastErr: unknown
  for (const p of profiles) {
    try {
      if (p.provider === 'gemini') await streamGemini(p, messages, maxTokens, emit, signal)
      else await streamOpenAICompatible(p, messages, maxTokens, emit, signal)
      return
    } catch (err) {
      if (signal.aborted) throw err
      lastErr = err
      // Only fail over if nothing has streamed yet; otherwise surface the error.
      if (emitted) throw err
    }
  }
  throw lastErr ?? new Error('All language model providers failed.')
}

async function streamOpenAICompatible(
  profile: LlmProfile,
  messages: ChatMessage[],
  maxTokens: number,
  onDelta: (text: string) => void,
  signal: AbortSignal
): Promise<void> {
  const base = profile.baseUrl.replace(/\/$/, '')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (profile.apiKey) headers.Authorization = `Bearer ${profile.apiKey}`

  const body: Record<string, unknown> = {
    model: profile.model,
    messages,
    temperature: 0.4,
    stream: true
  }
  if (maxTokens > 0) body.max_tokens = maxTokens

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers,
    signal,
    body: JSON.stringify(body)
  })

  if (!res.ok || !res.body) {
    throw new Error(`LLM request failed (${res.status}): ${await safeText(res)}`)
  }

  await readSse(res.body, (data) => {
    if (data === '[DONE]') return
    try {
      const json = JSON.parse(data)
      const delta = json?.choices?.[0]?.delta?.content
      if (typeof delta === 'string' && delta) onDelta(delta)
    } catch {
      // ignore keep-alive / partial frames
    }
  })
}

async function streamGemini(
  profile: LlmProfile,
  messages: ChatMessage[],
  maxTokens: number,
  onDelta: (text: string) => void,
  signal: AbortSignal
): Promise<void> {
  const base = (profile.baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(
    /\/$/,
    ''
  )
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content)
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))

  const generationConfig: Record<string, unknown> = { temperature: 0.4 }
  if (maxTokens > 0) generationConfig.maxOutputTokens = maxTokens

  const url = `${base}/models/${profile.model}:streamGenerateContent?alt=sse&key=${profile.apiKey}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      contents,
      systemInstruction: system.length ? { parts: [{ text: system.join('\n\n') }] } : undefined,
      generationConfig
    })
  })

  if (!res.ok || !res.body) {
    throw new Error(`Gemini request failed (${res.status}): ${await safeText(res)}`)
  }

  await readSse(res.body, (data) => {
    try {
      const json = JSON.parse(data)
      const text = json?.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text ?? '')
        .join('')
      if (typeof text === 'string' && text) onDelta(text)
    } catch {
      // ignore
    }
  })
}

/** Reads a server-sent-events stream and invokes `onData` for each `data:` payload. */
async function readSse(
  body: ReadableStream<Uint8Array>,
  onData: (data: string) => void
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''
    for (const part of parts) {
      for (const line of part.split('\n')) {
        const trimmed = line.trim()
        if (trimmed.startsWith('data:')) onData(trimmed.slice(5).trim())
      }
    }
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500)
  } catch {
    return ''
  }
}
