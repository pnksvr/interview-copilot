import type { AppSettings } from '../shared/types'

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

function buildMessages(settings: AppSettings, question: string, context: string): ChatMessage[] {
  const profile: string[] = []
  if (settings.resume.trim()) profile.push(`# Candidate resume\n${settings.resume.trim()}`)
  if (settings.jobDescription.trim())
    profile.push(`# Job description\n${settings.jobDescription.trim()}`)
  if (settings.extraContext.trim())
    profile.push(`# Additional context\n${settings.extraContext.trim()}`)

  const messages: ChatMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }]
  if (profile.length) messages.push({ role: 'system', content: profile.join('\n\n') })
  const user = context.trim()
    ? `Recent interview transcript (for context):\n${context.trim()}\n\nThe interviewer just asked:\n"${question}"\n\nGive me the best answer to say.`
    : `The interviewer just asked:\n"${question}"\n\nGive me the best answer to say.`
  messages.push({ role: 'user', content: user })
  return messages
}

/**
 * Streams an answer from the configured provider, invoking `onDelta` for each
 * text chunk. Resolves when the stream completes. Throws on transport errors.
 */
export async function streamAnswer(
  settings: AppSettings,
  question: string,
  context: string,
  onDelta: (text: string) => void,
  signal: AbortSignal
): Promise<void> {
  const messages = buildMessages(settings, question, context)
  if (settings.llmProvider === 'gemini') {
    await streamGemini(settings, messages, onDelta, signal)
  } else {
    await streamOpenAICompatible(settings, messages, onDelta, signal)
  }
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
