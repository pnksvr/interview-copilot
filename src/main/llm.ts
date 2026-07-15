import type { AppSettings, FallbackProvider, LlmProviderKind } from '../shared/types'

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

/**
 * Trim a string to at most `maxChars` characters, keeping the tail (most
 * recent content is more relevant than the beginning).
 */
function tail(s: string, maxChars: number): string {
  if (s.length <= maxChars) return s
  return '…' + s.slice(s.length - maxChars + 1)
}

function buildMessages(
  settings: AppSettings,
  question: string,
  context: string,
  overrides?: { apiKey?: string; baseUrl?: string; model?: string; provider?: LlmProviderKind }
): ChatMessage[] {
  void overrides // resolved by caller; included for signature clarity

  const profile: string[] = []
  // Cap each personalisation block to prevent runaway token usage.
  if (settings.resume.trim()) profile.push(`# Candidate resume\n${settings.resume.trim().slice(0, 1200)}`)
  if (settings.jobDescription.trim())
    profile.push(`# Job description\n${settings.jobDescription.trim().slice(0, 800)}`)
  if (settings.extraContext.trim())
    profile.push(`# Additional context\n${settings.extraContext.trim().slice(0, 400)}`)

  const messages: ChatMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }]
  if (profile.length) messages.push({ role: 'system', content: profile.join('\n\n') })

  // Keep only the most recent context to avoid hitting token limits during long
  // interviews (context grows unboundedly if uncapped).
  const trimmedContext = tail(context.trim(), 1200)
  const user = trimmedContext
    ? `Recent interview transcript (for context):\n${trimmedContext}\n\nThe interviewer just asked:\n"${question}"\n\nGive me the best answer to say.`
    : `The interviewer just asked:\n"${question}"\n\nGive me the best answer to say.`
  messages.push({ role: 'user', content: user })
  return messages
}

interface ProviderSlot {
  provider: LlmProviderKind
  baseUrl: string
  apiKey: string
  model: string
}

function primarySlot(settings: AppSettings): ProviderSlot {
  return {
    provider: settings.llmProvider,
    baseUrl: settings.llmBaseUrl,
    apiKey: settings.llmApiKey,
    model: settings.llmModel
  }
}

function fallbackSlots(settings: AppSettings): ProviderSlot[] {
  return (settings.llmFallbackProviders ?? [])
    .filter((fb: FallbackProvider) => fb.enabled && fb.baseUrl.trim() && fb.model.trim())
    .map((fb: FallbackProvider) => ({
      provider: fb.provider,
      baseUrl: fb.baseUrl,
      apiKey: fb.apiKey,
      model: fb.model
    }))
}

/**
 * Streams an answer, automatically falling back through configured secondary
 * providers if the primary fails (rate-limit, network error, etc.).  This
 * allows the app to keep running for 1–1.5 h even when a free-tier provider
 * runs out of credits.
 *
 * `onDelta` is called for each text chunk.  `onProviderSwitch` (optional) lets
 * the renderer notify the user when a fallback is activated.
 */
export async function streamAnswer(
  settings: AppSettings,
  question: string,
  context: string,
  onDelta: (text: string) => void,
  signal: AbortSignal,
  onProviderSwitch?: (label: string) => void
): Promise<void> {
  const chain: ProviderSlot[] = [primarySlot(settings), ...fallbackSlots(settings)]

  let lastError: Error = new Error('No providers configured')
  for (let i = 0; i < chain.length; i++) {
    if (signal.aborted) throw new Error('Aborted')
    const slot = chain[i]
    try {
      if (i > 0 && onProviderSwitch) {
        const fb = settings.llmFallbackProviders[i - 1]
        onProviderSwitch(fb?.label ?? `Fallback ${i}`)
      }
      const effective: AppSettings = {
        ...settings,
        llmProvider: slot.provider,
        llmBaseUrl: slot.baseUrl,
        llmApiKey: slot.apiKey,
        llmModel: slot.model
      }
      const messages = buildMessages(effective, question, context)
      if (slot.provider === 'gemini') {
        await streamGemini(effective, messages, onDelta, signal)
      } else {
        await streamOpenAICompatible(effective, messages, onDelta, signal)
      }
      return // success — stop here
    } catch (err) {
      if (signal.aborted) throw err
      lastError = err instanceof Error ? err : new Error(String(err))
      console.warn(`[llm] Provider ${i} failed, trying next: ${lastError.message}`)
    }
  }
  throw lastError
}

async function streamOpenAICompatible(
  settings: AppSettings,
  messages: ChatMessage[],
  onDelta: (text: string) => void,
  signal: AbortSignal
): Promise<void> {
  const base = settings.llmBaseUrl.replace(/\/$/, '')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (settings.llmApiKey) headers.Authorization = `Bearer ${settings.llmApiKey}`

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers,
    signal,
    body: JSON.stringify({
      model: settings.llmModel,
      messages,
      temperature: 0.4,
      stream: true
    })
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
  settings: AppSettings,
  messages: ChatMessage[],
  onDelta: (text: string) => void,
  signal: AbortSignal
): Promise<void> {
  const base = (settings.llmBaseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(
    /\/$/,
    ''
  )
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content)
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))

  const url = `${base}/models/${settings.llmModel}:streamGenerateContent?alt=sse&key=${settings.llmApiKey}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      contents,
      systemInstruction: system.length ? { parts: [{ text: system.join('\n\n') }] } : undefined,
      generationConfig: { temperature: 0.4 }
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
