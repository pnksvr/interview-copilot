# Interview Copilot

A stealth, real-time interview assistant — an open clone of [parakeet-ai.com](https://parakeet-ai.com).

It listens to your interview audio, transcribes it live, detects questions, and streams
suggested answers into an always-on-top overlay that is **hidden from screen sharing and
recording** (Zoom, Google Meet, Microsoft Teams, OBS). Powered by **free** LLM + speech
engines — bring your own free API key (Groq, Google Gemini, OpenRouter) or run fully
offline with [Ollama](https://ollama.com).

> Built with Electron + React + TypeScript (electron-vite).

## Features

- **Real-time transcription** of meeting/system audio (the interviewer) and optionally your mic, via OpenAI-compatible Whisper (Groq by default).
- **Streaming AI answers** — detected questions are answered automatically, in the first person, personalised with your resume and the job description.
- **Stealth overlay** — `setContentProtection` excludes the window from screen capture, so it stays invisible while you screen-share. Always-on-top, frameless, draggable, adjustable opacity.
- **Free engine, swappable** — Groq, Gemini, OpenRouter, Ollama (local) or any OpenAI-compatible endpoint.
- **Global hotkeys** and **click-through** mode so you can see answers without the overlay stealing focus.
- All settings and keys are stored **locally** on your machine.

## Free engine options

| Provider                          | Cost                      | Get a key                                |
| --------------------------------- | ------------------------- | ---------------------------------------- |
| **Groq** (default, LLM + Whisper) | Free tier                 | https://console.groq.com/keys            |
| Google Gemini                     | Free tier                 | https://aistudio.google.com/apikey       |
| OpenRouter (free models)          | Free models               | https://openrouter.ai/keys               |
| Ollama                            | Free, fully local/offline | install from https://ollama.com (no key) |

Groq is recommended because a single free key powers **both** the language model and Whisper
transcription, and it is fast enough for live use.

## Getting started

```bash
npm install
npm run dev        # launch the app in development
```

1. Click **Settings**, pick a provider and paste your free API key.
2. Add your **resume** and the **job description** for personalised answers (optional but recommended).
3. Close settings, choose audio sources (**System** = interviewer, **Mic** = you), and click **Listen**.
4. When prompted to share for system audio, pick your screen and enable "share system audio".
5. Detected questions are answered automatically; or press **Answer now** / `Ctrl+Enter`.

### Global hotkeys

| Shortcut           | Action                                      |
| ------------------ | ------------------------------------------- |
| `Ctrl + \`         | Show / hide the overlay                     |
| `Ctrl + Enter`     | Answer the latest question now              |
| `Ctrl + Shift + L` | Start / stop listening                      |
| `Ctrl + Shift + K` | Clear transcript & answer                   |
| `Ctrl + Shift + M` | Toggle click-through (mouse passes through) |

## Scripts

```bash
npm run dev          # dev with HMR
npm run typecheck    # type-check main + renderer
npm run lint         # eslint
npm run build        # typecheck + production build
npm run build:win    # package a Windows installer
npm run build:mac    # package a macOS app
npm run build:linux  # package a Linux app
```

## How the stealth works

The overlay calls Electron's [`setContentProtection(true)`](https://www.electronjs.org/docs/latest/api/browser-window#winsetcontentprotectionenable),
which sets the OS-level "exclude from capture" flag (`WDA_EXCLUDEFROMCAPTURE` on Windows,
`NSWindowSharingNone` on macOS). The window remains fully visible to you locally but is
omitted from screen-share streams and recordings. You can toggle this off in Settings.

System ("loopback") audio — the interviewer's voice coming out of your speakers — is captured
via `getDisplayMedia` with Electron's loopback audio handler, so the assistant hears the
other side of the call, not just your microphone.

## Architecture

```
src/
  main/        Electron main process
    index.ts   stealth window, global hotkeys, loopback-audio handler
    ipc.ts     IPC handlers (settings, transcribe, ask, click-through)
    llm.ts     streaming chat (OpenAI-compatible + Gemini)
    stt.ts     Whisper transcription (OpenAI-compatible audio)
    store.ts   local settings persistence
  preload/     typed contextBridge API
  renderer/    React overlay UI
    hooks/useAudioCapture.ts   mic + system audio capture, chunking, VAD
    lib/questions.ts           question detection
    components/                AnswerView, SettingsPanel
  shared/types.ts              types shared across processes
```

## Notes & limitations

- Network calls to the LLM/STT providers happen in the **main process**, so your API key
  never lives in the renderer and there are no CORS issues.
- Transcription is near-real-time: audio is flushed to Whisper on a fixed interval
  (default 4s, configurable). Lower it for snappier results, raise it to reduce API calls.
- Content protection is OS-dependent; verify it against your specific meeting app before
  relying on it.

## Disclaimer

This project is provided for educational and accessibility purposes (e.g. interview practice,
note-taking, candidates who need assistance). Using an undisclosed assistant during an
assessment may violate the policies or terms of the interviewing organisation. Use responsibly
and at your own risk.
