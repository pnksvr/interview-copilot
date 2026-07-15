import { JSX } from 'react'
import type { AppSettings, FallbackProvider, LlmProviderKind } from '../../../shared/types'

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

function patchFallback(
  providers: FallbackProvider[],
  index: number,
  patch: Partial<FallbackProvider>
): FallbackProvider[] {
  return providers.map((p, i) => (i === index ? { ...p, ...patch } : p))
}

function applyFallbackPreset(
  providers: FallbackProvider[],
  index: number,
  key: string
): FallbackProvider[] {
  const p = PRESETS[key]
  if (!p) return providers
  return patchFallback(providers, index, { provider: p.provider, baseUrl: p.baseUrl, model: p.model })
}

export function SettingsPanel({ settings, onChange, onClose }: Props): JSX.Element {
  const applyPreset = (key: string): void => {
    const p = PRESETS[key]
    if (!p) return
    onChange({ llmProvider: p.provider, llmBaseUrl: p.baseUrl, llmModel: p.model })
  }

  const fallbacks = settings.llmFallbackProviders ?? []

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

        {/* ─── Primary LLM ─── */}
        <div className="section-label">Primary language model</div>
        <div className="field">
          <label>Provider preset</label>
          <select
            value={Object.keys(PRESETS).find((k) => PRESETS[k].baseUrl === settings.llmBaseUrl) ?? ''}
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

        {/* ─── Fallback providers ─── */}
        <div className="section-label">
          Fallback providers{' '}
          <span className="hint-inline">
            — tried in order when the primary fails (keeps working 1–1.5 h)
          </span>
        </div>

        {fallbacks.map((fb, i) => (
          <div key={i} className="fallback-slot">
            <div className="fallback-slot-head">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={fb.enabled}
                  onChange={(e) =>
                    onChange({
                      llmFallbackProviders: patchFallback(fallbacks, i, { enabled: e.target.checked })
                    })
                  }
                />
                <span>{fb.label}</span>
              </label>
              <input
                className="fb-label-input"
                value={fb.label}
                placeholder="Label"
                onChange={(e) =>
                  onChange({
                    llmFallbackProviders: patchFallback(fallbacks, i, { label: e.target.value })
                  })
                }
              />
            </div>
            {fb.enabled && (
              <>
                <div className="row">
                  <div className="field">
                    <label>Preset</label>
                    <select
                      value={Object.keys(PRESETS).find((k) => PRESETS[k].baseUrl === fb.baseUrl) ?? ''}
                      onChange={(e) =>
                        onChange({
                          llmFallbackProviders: applyFallbackPreset(fallbacks, i, e.target.value)
                        })
                      }
                    >
                      <option value="">— custom —</option>
                      {Object.entries(PRESETS).map(([k, p]) => (
                        <option key={k} value={k}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Provider type</label>
                    <select
                      value={fb.provider}
                      onChange={(e) =>
                        onChange({
                          llmFallbackProviders: patchFallback(fallbacks, i, {
                            provider: e.target.value as LlmProviderKind
                          })
                        })
                      }
                    >
                      <option value="openai">OpenAI-compatible</option>
                      <option value="gemini">Google Gemini</option>
                    </select>
                  </div>
                </div>
                <div className="row">
                  <div className="field">
                    <label>Base URL</label>
                    <input
                      value={fb.baseUrl}
                      onChange={(e) =>
                        onChange({
                          llmFallbackProviders: patchFallback(fallbacks, i, { baseUrl: e.target.value })
                        })
                      }
                    />
                  </div>
                  <div className="field">
                    <label>Model</label>
                    <input
                      value={fb.model}
                      onChange={(e) =>
                        onChange({
                          llmFallbackProviders: patchFallback(fallbacks, i, { model: e.target.value })
                        })
                      }
                    />
                  </div>
                </div>
                <div className="field">
                  <label>API key</label>
                  <input
                    type="password"
                    value={fb.apiKey}
                    placeholder="paste key for this provider"
                    onChange={(e) =>
                      onChange({
                        llmFallbackProviders: patchFallback(fallbacks, i, { apiKey: e.target.value })
                      })
                    }
                  />
                </div>
              </>
            )}
          </div>
        ))}

        {/* ─── STT ─── */}
        <div className="section-label">Speech-to-text (Whisper)</div>
        <div className="field">
          <label>Endpoint &amp; model</label>
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

        {/* ─── Context ─── */}
        <div className="section-label">Your profile</div>
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

        {/* ─── Behaviour ─── */}
        <div className="section-label">Behaviour</div>
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
            <label>Transcribe every (ms)</label>
            <input
              type="number"
              min={2000}
              step={500}
              value={settings.transcribeIntervalMs}
              onChange={(e) => onChange({ transcribeIntervalMs: Number(e.target.value) })}
            />
          </div>
        </div>

        <div className="row">
          <div className="field">
            <label>Follow-up noise cooldown (ms)</label>
            <input
              type="number"
              min={0}
              step={1000}
              value={settings.questionCooldownMs}
              onChange={(e) => onChange({ questionCooldownMs: Number(e.target.value) })}
            />
            <div className="hint">
              Short follow-ups ("are you there?", "go ahead") within this window are ignored.
            </div>
          </div>
        </div>

        {/* ─── Stealth ─── */}
        <div className="section-label">Stealth &amp; window</div>
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
          <label>Mouse activity during screen share</label>
          <div className="hint" style={{ marginTop: 4 }}>
            Enable <strong>Click-through</strong> mode (Ctrl+Shift+M) so the overlay never
            receives mouse events. The overlay itself is already hidden from the interviewer's
            screen share via content protection — enabling click-through means your mouse
            movements inside the overlay area also pass through to whatever app is behind it,
            so they look natural.
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
            <span>Clear transcript &amp; answer</span>
            <span className="kbd">Ctrl + Shift + M</span>
            <span>Toggle click-through (hides mouse from overlay)</span>
          </div>
        </div>
      </div>
    </div>
  )
}
