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
  llmFallbacks: [],

  sttBaseUrl: 'https://api.groq.com/openai/v1',
  sttApiKey: '',
  sttModel: 'whisper-large-v3-turbo',
  // Pin transcription to English by default: interviews here are in English and
  // a fixed language stops Whisper from hallucinating foreign text on silence.
  sttLanguage: 'en',

  resume: '',
  jobDescription: '',
  extraContext: '',

  autoAnswer: true,
  // Safety cap: flush an utterance for transcription if the speaker never pauses.
  // Normal segmentation happens on the pause between questions.
  transcribeIntervalMs: 15000,

  // Keep answers tight (interview replies are short) to save output tokens,
  // and cap each context field so a huge paste doesn't burn the daily quota.
  maxAnswerTokens: 700,
  maxContextChars: 6000,

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
