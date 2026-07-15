import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import type { AppSettings } from '../shared/types'

export const DEFAULT_SETTINGS: AppSettings = {
  // Groq exposes an OpenAI-compatible API with a generous free tier, so it
  // powers both the language model and the Whisper transcription by default.
  llmProvider: 'openai',
  llmBaseUrl: 'https://api.groq.com/openai/v1',
  llmApiKey: '',
  llmModel: 'llama-3.3-70b-versatile',

  // Secondary providers tried in order when the primary fails (rate-limit, etc.).
  // Configure these to keep the app running for 1-1.5 h straight.
  llmFallbackProviders: [
    {
      label: 'Gemini (fallback 1)',
      provider: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      apiKey: '',
      model: 'gemini-2.0-flash',
      enabled: false
    },
    {
      label: 'OpenRouter (fallback 2)',
      provider: 'openai',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: '',
      model: 'meta-llama/llama-3.3-70b-instruct:free',
      enabled: false
    }
  ],

  sttBaseUrl: 'https://api.groq.com/openai/v1',
  sttApiKey: '',
  sttModel: 'whisper-large-v3-turbo',
  sttLanguage: '',

  resume: '',
  jobDescription: '',
  extraContext: '',

  autoAnswer: true,
  transcribeIntervalMs: 4000,
  // Ignore new auto-answer triggers for 8 seconds after the last one, to
  // suppress follow-up noise ("are you there?", "can you start?").
  questionCooldownMs: 8000,

  contentProtection: true,
  opacity: 1
}

function settingsPath(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'settings.json')
}

export function loadSettings(): AppSettings {
  try {
    const raw = readFileSync(settingsPath(), 'utf-8')
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    return { ...DEFAULT_SETTINGS, ...parsed }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings: AppSettings): AppSettings {
  const merged = { ...DEFAULT_SETTINGS, ...settings }
  writeFileSync(settingsPath(), JSON.stringify(merged, null, 2), 'utf-8')
  return merged
}
