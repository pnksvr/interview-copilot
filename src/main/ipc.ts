import { ipcMain, BrowserWindow } from 'electron'
import { loadSettings, saveSettings } from './store'
import { streamAnswer } from './llm'
import { transcribe } from './stt'
import type { AppSettings, IpcResult, LlmStreamEvent } from '../shared/types'

const inFlight = new Map<string, AbortController>()

function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data }
}

function fail(error: unknown): IpcResult<never> {
  return { ok: false, error: error instanceof Error ? error.message : String(error) }
}

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('settings:get', () => ok(loadSettings()))

  ipcMain.handle('settings:set', (_e, settings: AppSettings) => {
    try {
      const saved = saveSettings(settings)
      const win = getWindow()
      if (win) {
        win.setContentProtection(saved.contentProtection)
        win.setOpacity(saved.opacity)
      }
      return ok(saved)
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(
    'stt:transcribe',
    async (_e, payload: { audio: ArrayBuffer; mimeType: string }) => {
      try {
        const settings = loadSettings()
        // Fall back to the LLM credentials when STT ones are left blank.
        const effective = {
          ...settings,
          sttBaseUrl: settings.sttBaseUrl || settings.llmBaseUrl,
          sttApiKey: settings.sttApiKey || settings.llmApiKey
        }
        const text = await transcribe(effective, new Uint8Array(payload.audio), payload.mimeType)
        return ok(text)
      } catch (err) {
        return fail(err)
      }
    }
  )

  ipcMain.handle(
    'llm:ask',
    async (_e, payload: { id: string; question: string; context: string }) => {
      const controller = new AbortController()
      inFlight.set(payload.id, controller)
      const send = (event: LlmStreamEvent): void => {
        getWindow()?.webContents.send('llm:stream', event)
      }
      try {
        const settings = loadSettings()
        await streamAnswer(
          settings,
          payload.question,
          payload.context,
          (text) => send({ type: 'delta', id: payload.id, text }),
          controller.signal,
          // Notify the renderer whenever we switch to a fallback provider.
          (label) =>
            getWindow()?.webContents.send('llm:stream', {
              type: 'delta',
              id: payload.id,
              text: `\n\n⚠️ Primary provider unavailable — switched to ${label}.\n\n`
            })
        )
        send({ type: 'done', id: payload.id })
        return ok(null)
      } catch (err) {
        if (controller.signal.aborted) {
          send({ type: 'done', id: payload.id })
          return ok(null)
        }
        const message = err instanceof Error ? err.message : String(err)
        send({ type: 'error', id: payload.id, message })
        return fail(err)
      } finally {
        inFlight.delete(payload.id)
      }
    }
  )

  ipcMain.handle('llm:cancel', (_e, id: string) => {
    inFlight.get(id)?.abort()
    inFlight.delete(id)
    return ok(null)
  })

  ipcMain.handle('window:setClickThrough', (_e, value: boolean) => {
    getWindow()?.setIgnoreMouseEvents(value, { forward: true })
    return ok(value)
  })
}
