// Types shared between the main, preload and renderer processes.

export type LlmProviderKind = 'openai' | 'gemini'

// A single language-model endpoint. The primary model lives in the flat
// llm* fields of AppSettings; additional profiles act as automatic fallbacks.
export interface LlmProfile {
  provider: LlmProviderKind
  baseUrl: string
  apiKey: string
  model: string
}

export interface AppSettings {
  // Language model used to generate answers.
  llmProvider: LlmProviderKind
  llmBaseUrl: string
  llmApiKey: string
  llmModel: string

  // Ordered fallback providers. If the primary model errors (e.g. a 429 rate
  // limit) before any answer text streams, the next profile is tried.
  llmFallbacks: LlmProfile[]

  // Speech-to-text engine (OpenAI-compatible audio transcription endpoint).
  sttBaseUrl: string
  sttApiKey: string
  sttModel: string
  sttLanguage: string // ISO-639-1 code or '' for auto-detect

  // Personalisation context fed to the model with every question.
  resume: string
  jobDescription: string
  extraContext: string

  // Behaviour.
  autoAnswer: boolean // automatically answer detected questions
  transcribeIntervalMs: number // how often captured audio is flushed to the STT engine

  // Token-budget controls to stretch free-tier daily limits.
  maxAnswerTokens: number // cap the model's answer length (0 = provider default)
  maxContextChars: number // truncate each of resume/JD/extra context (0 = no limit)

  // Stealth / window behaviour.
  contentProtection: boolean // hide the window from screen capture
  opacity: number // 0.2 - 1
}

export interface AnswerRequest {
  question: string
  // Recent transcript context preceding the question.
  context: string
}

export type LlmStreamEvent =
  | { type: 'delta'; id: string; text: string }
  | { type: 'done'; id: string }
  | { type: 'error'; id: string; message: string }

export interface TranscriptionResult {
  text: string
}

export interface IpcResult<T> {
  ok: boolean
  data?: T
  error?: string
}
