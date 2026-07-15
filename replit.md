# Interview Copilot (Iview Protect)

A stealth, real-time interview assistant — listens to interview audio, transcribes it live, detects questions, and streams AI-suggested answers into an always-on-top overlay **hidden from screen sharing** (Zoom, Google Meet, Teams, OBS).

Built with **Electron + React + TypeScript** (electron-vite).

## Stack

- **Electron 39** — frameless, transparent, always-on-top window; `setContentProtection` for screen-share stealth
- **React 19 + TypeScript** — renderer UI
- **electron-vite** — dev server with HMR, production bundler
- **Groq / Gemini / OpenRouter / Ollama** — pluggable LLM + Whisper STT providers

## Running locally (dev)

```bash
npm install
npm run dev        # Electron + Vite HMR
```

> Electron is a desktop framework — it cannot run inside Replit's browser preview. Use `npm run dev` locally or build a distributable.

## Build a distributable

```bash
npm run build           # typecheck + bundle (all platforms)
npm run build:win       # Windows NSIS installer
npm run build:mac       # macOS DMG
npm run build:linux     # Linux AppImage
```

## Branches

| Branch | Purpose |
|---|---|
| `main` | Stable baseline (original import) |
| `feature/v2-improvements` | V2 with multi-provider fallback, question history, collapsed transcript, follow-up noise filter |

## V2 features (feature/v2-improvements)

### Multi-provider auto-fallback
Configure up to 2 fallback LLM providers in Settings (e.g. primary = Groq, fallback 1 = Gemini, fallback 2 = OpenRouter). When the primary hits a rate-limit or network error the app silently switches to the next provider and notifies you inline. Context is trimmed automatically to prevent token-limit failures during long interviews.

### Collapsible transcript pane
The transcript pane starts collapsed so the answer pane fills the window. Click the **▶ Transcript** toggle to expand when needed. No more scrolling to read answers.

### Question history + clickback
Up to 10 Q&A pairs are kept as scrollable chips above the answer. Click any chip to bring back an earlier answer — even while a new question is streaming.

### Follow-up noise filter
When the interviewer asks "are you there?" or "go ahead" right after the main question, the app suppresses the new auto-answer trigger for a configurable cooldown (default 8 s). Short phrases matching known follow-up patterns are also filtered.

### Mouse activity during screen share
Enable **Click-through** mode (Ctrl+Shift+M or the button in the header) so mouse events pass through the overlay to whatever app is behind it. Combined with content protection (overlay hidden from screen share), your mouse movements look completely natural to the interviewer.

## Architecture

```
src/
  main/        Electron main process
    index.ts   stealth window, global hotkeys, loopback-audio handler
    ipc.ts     IPC handlers (settings, transcribe, ask, cancel, click-through)
    llm.ts     streaming chat with multi-provider fallback chain
    stt.ts     Whisper transcription (OpenAI-compatible)
    store.ts   local settings persistence (userData/settings.json)
  preload/     typed contextBridge API
  renderer/    React overlay UI
    hooks/useAudioCapture.ts   mic + system audio capture, chunking, VAD
    lib/questions.ts           question detection + follow-up noise filter
    components/AnswerView.tsx  answer renderer (paragraphs + code blocks)
    components/SettingsPanel.tsx  all settings including fallback providers
  shared/types.ts   types shared across all processes
```

## User preferences

- Keep all changes on a feature branch; let the user test before merging to main.
- Do not restructure the Electron/Vite stack — keep the existing architecture.
