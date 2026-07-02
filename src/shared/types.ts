// Types shared between the main, preload and renderer processes.

export type LlmProviderKind = 'openai' | 'gemini'

export interface AppSettings {
  // Language model used to generate answers.
  llmProvider: LlmProviderKind
  llmBaseUrl: string
  llmApiKey: string
  llmModel: string

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
