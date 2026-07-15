// Types shared between the main, preload and renderer processes.

export type LlmProviderKind = 'openai' | 'gemini'

/** A secondary (fallback) LLM provider tried automatically when the primary fails. */
export interface FallbackProvider {
  label: string
  provider: LlmProviderKind
  baseUrl: string
  apiKey: string
  model: string
  enabled: boolean
}

export interface AppSettings {
  // Language model used to generate answers.
  llmProvider: LlmProviderKind
  llmBaseUrl: string
  llmApiKey: string
  llmModel: string

  /**
   * Secondary providers tried in order when the primary fails.
   * Allows the app to keep running for long interviews even when one free-tier
   * provider hits a rate-limit.
   */
  llmFallbackProviders: FallbackProvider[]

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
  /**
   * Minimum milliseconds between auto-answer triggers.  If a new question is
   * detected within this window (e.g. "are you there?" right after the main
   * question) it is silently ignored.
   */
  questionCooldownMs: number

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
