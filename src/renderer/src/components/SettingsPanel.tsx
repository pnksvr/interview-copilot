import { JSX } from 'react'
import type { AppSettings, LlmProfile } from '../../../shared/types'

interface Props {
  settings: AppSettings
  onChange: (patch: Partial<AppSettings>) => void
  onClose: () => void
}

interface Preset {
  label: string
  provider: AppSettings['llmProvider']
  baseUrl: string
  model: string
  keyHint: string
}

const PRESETS: Record<string, Preset> = {
  groq: {
    label: 'Groq (free, fast)',
    provider: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
    keyHint: 'console.groq.com/keys'
  },
  gemini: {
    label: 'Google Gemini (free tier)',
    provider: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-2.0-flash',
    keyHint: 'aistudio.google.com/apikey'
  },
  openrouter: {
    label: 'OpenRouter (free models)',
    provider: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'meta-llama/llama-3.3-70b-instruct:free',
    keyHint: 'openrouter.ai/keys'
  },
  ollama: {
    label: 'Ollama (local, offline)',
    provider: 'openai',
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3.1',
    keyHint: 'no key needed'
  }
}

const presetKeyFor = (baseUrl: string): string =>
  Object.keys(PRESETS).find((k) => PRESETS[k].baseUrl === baseUrl) ?? 'groq'

export function SettingsPanel({ settings, onChange, onClose }: Props): JSX.Element {
  const applyPreset = (key: string): void => {
    const p = PRESETS[key]
    if (!p) return
    onChange({ llmProvider: p.provider, llmBaseUrl: p.baseUrl, llmModel: p.model })
  }

  const fallbacks = settings.llmFallbacks ?? []
  const updateFallback = (i: number, patch: Partial<LlmProfile>): void => {
    onChange({ llmFallbacks: fallbacks.map((f, idx) => (idx === i ? { ...f, ...patch } : f)) })
  }
  const addFallback = (): void => {
    const p = PRESETS.openrouter
    onChange({
      llmFallbacks: [
        ...fallbacks,
        { provider: p.provider, baseUrl: p.baseUrl, model: p.model, apiKey: '' }
      ]
    })
  }
  const removeFallback = (i: number): void => {
    onChange({ llmFallbacks: fallbacks.filter((_, idx) => idx !== i) })
  }
  const applyFallbackPreset = (i: number, key: string): void => {
    const p = PRESETS[key]
    if (p) updateFallback(i, { provider: p.provider, baseUrl: p.baseUrl, model: p.model })
  }

  return (
    <div className="settings">
      <div className="header">
        <span className="title">Settings</span>
        <span className="spacer" />
        <button className="icon-btn" onClick={onClose}>
          Done
        </button>
      </div>
      <div className="pane-body">
        <div className="field">
          <label>Language model provider</label>
          <select
            value={presetKeyFor(settings.llmBaseUrl)}
            onChange={(e) => applyPreset(e.target.value)}
          >
            {Object.entries(PRESETS).map(([k, p]) => (
              <option key={k} value={k}>
                {p.label}
              </option>
            ))}
          </select>
          <div className="hint">Switch to any OpenAI-compatible or Gemini endpoint.</div>
        </div>

        <div className="row">
          <div className="field">
            <label>Model</label>
            <input
              value={settings.llmModel}
              onChange={(e) => onChange({ llmModel: e.target.value })}
            />
          </div>
          <div className="field">
            <label>API base URL</label>
            <input
              value={settings.llmBaseUrl}
              onChange={(e) => onChange({ llmBaseUrl: e.target.value })}
            />
          </div>
        </div>

        <div className="field">
          <label>LLM API key</label>
          <input
            type="password"
            value={settings.llmApiKey}
            placeholder="paste your key"
            onChange={(e) => onChange({ llmApiKey: e.target.value })}
          />
          <div className="hint">Stored locally on this machine only.</div>
        </div>

        <div className="field">
          <label>Fallback providers</label>
          <div className="hint">
            If the main model is rate-limited (429), the app automatically retries these in order —
            so answers keep coming for a full interview. Tip: add OpenRouter and/or Gemini with their
            own keys.
          </div>
          {fallbacks.map((f, i) => (
            <div key={i} className="fallback">
              <div className="row">
                <select
                  value={presetKeyFor(f.baseUrl)}
                  onChange={(e) => applyFallbackPreset(i, e.target.value)}
                >
                  {Object.entries(PRESETS).map(([k, p]) => (
                    <option key={k} value={k}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <button className="icon-btn" onClick={() => removeFallback(i)}>
                  Remove
                </button>
              </div>
              <div className="row">
                <input
                  value={f.model}
                  placeholder="model"
                  onChange={(e) => updateFallback(i, { model: e.target.value })}
                />
                <input
                  type="password"
                  value={f.apiKey}
                  placeholder="API key for this provider"
                  onChange={(e) => updateFallback(i, { apiKey: e.target.value })}
                />
              </div>
              <input
                value={f.baseUrl}
                placeholder="API base URL"
                onChange={(e) => updateFallback(i, { baseUrl: e.target.value })}
              />
            </div>
          ))}
          <button className="icon-btn add-fallback" onClick={addFallback}>
            + Add fallback provider
          </button>
        </div>

        <div className="row">
          <div className="field">
            <label>Answer length (max tokens)</label>
            <input
              type="number"
              min={0}
              step={100}
              value={settings.maxAnswerTokens}
              onChange={(e) => onChange({ maxAnswerTokens: Number(e.target.value) })}
            />
            <div className="hint">Shorter answers use fewer tokens. 0 = provider default.</div>
          </div>
          <div className="field">
            <label>Max context chars</label>
            <input
              type="number"
              min={0}
              step={500}
              value={settings.maxContextChars}
              onChange={(e) => onChange({ maxContextChars: Number(e.target.value) })}
            />
            <div className="hint">Caps resume/JD/extra sent per question. 0 = no limit.</div>
          </div>
        </div>

        <div className="field">
          <label>Speech-to-text (Whisper) endpoint</label>
          <div className="row">
            <input
              value={settings.sttBaseUrl}
              onChange={(e) => onChange({ sttBaseUrl: e.target.value })}
            />
            <input
              value={settings.sttModel}
              onChange={(e) => onChange({ sttModel: e.target.value })}
            />
          </div>
          <div className="hint">Defaults to Groq Whisper. Uses the LLM key if left blank.</div>
        </div>

        <div className="row">
          <div className="field">
            <label>STT API key (optional)</label>
            <input
              type="password"
              value={settings.sttApiKey}
              placeholder="defaults to LLM key"
              onChange={(e) => onChange({ sttApiKey: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Language</label>
            <input
              value={settings.sttLanguage}
              placeholder="auto"
              onChange={(e) => onChange({ sttLanguage: e.target.value })}
            />
          </div>
        </div>

        <div className="field">
          <label>Your resume</label>
          <textarea
            value={settings.resume}
            placeholder="Paste your resume so answers use your real experience"
            onChange={(e) => onChange({ resume: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Job description</label>
          <textarea
            value={settings.jobDescription}
            placeholder="Paste the role / job description"
            onChange={(e) => onChange({ jobDescription: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Extra context</label>
          <textarea
            value={settings.extraContext}
            placeholder="Anything else the assistant should know"
            onChange={(e) => onChange({ extraContext: e.target.value })}
          />
        </div>

        <div className="row">
          <div className="field">
            <label>Auto-answer detected questions</label>
            <select
              value={settings.autoAnswer ? 'on' : 'off'}
              onChange={(e) => onChange({ autoAnswer: e.target.value === 'on' })}
            >
              <option value="on">On</option>
              <option value="off">Off</option>
            </select>
          </div>
          <div className="field">
            <label>Max phrase length (ms)</label>
            <input
              type="number"
              min={10000}
              step={1000}
              value={settings.transcribeIntervalMs}
              onChange={(e) => onChange({ transcribeIntervalMs: Number(e.target.value) })}
            />
          </div>
        </div>

        <div className="row">
          <div className="field">
            <label>Hide from screen share</label>
            <select
              value={settings.contentProtection ? 'on' : 'off'}
              onChange={(e) => onChange({ contentProtection: e.target.value === 'on' })}
            >
              <option value="on">On (stealth)</option>
              <option value="off">Off</option>
            </select>
          </div>
          <div className="field">
            <label>Opacity</label>
            <input
              type="range"
              min={0.3}
              max={1}
              step={0.05}
              value={settings.opacity}
              onChange={(e) => onChange({ opacity: Number(e.target.value) })}
            />
          </div>
        </div>

        <div className="field">
          <label>Global hotkeys</label>
          <div className="hotkeys">
            <span className="kbd">Ctrl + \</span>
            <span>Show / hide overlay</span>
            <span className="kbd">Ctrl + Enter</span>
            <span>Answer the latest question now</span>
            <span className="kbd">Ctrl + Shift + L</span>
            <span>Start / stop listening</span>
            <span className="kbd">Ctrl + Shift + K</span>
            <span>Clear transcript & answer</span>
            <span className="kbd">Ctrl + Shift + M</span>
            <span>Toggle click-through</span>
            <span className="kbd">Ctrl + Shift + ↓ / ↑</span>
            <span>Scroll answers (no mouse needed)</span>
          </div>
        </div>
      </div>
    </div>
  )
}
