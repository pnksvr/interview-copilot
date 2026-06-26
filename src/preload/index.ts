import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { AppSettings, IpcResult, LlmStreamEvent } from '../shared/types'

const api = {
  getSettings: (): Promise<IpcResult<AppSettings>> => ipcRenderer.invoke('settings:get'),
  setSettings: (settings: AppSettings): Promise<IpcResult<AppSettings>> =>
    ipcRenderer.invoke('settings:set', settings),

  transcribe: (audio: ArrayBuffer, mimeType: string): Promise<IpcResult<string>> =>
    ipcRenderer.invoke('stt:transcribe', { audio, mimeType }),

  ask: (id: string, question: string, context: string): Promise<IpcResult<null>> =>
    ipcRenderer.invoke('llm:ask', { id, question, context }),
  cancel: (id: string): Promise<IpcResult<null>> => ipcRenderer.invoke('llm:cancel', id),

  setClickThrough: (value: boolean): Promise<IpcResult<boolean>> =>
    ipcRenderer.invoke('window:setClickThrough', value),

  onLlmStream: (cb: (event: LlmStreamEvent) => void): (() => void) => {
    const listener = (_e: unknown, event: LlmStreamEvent): void => cb(event)
    ipcRenderer.on('llm:stream', listener)
    return () => ipcRenderer.removeListener('llm:stream', listener)
  },
  onHotkey: (cb: (action: string) => void): (() => void) => {
    const listener = (_e: unknown, action: string): void => cb(action)
    ipcRenderer.on('hotkey', listener)
    return () => ipcRenderer.removeListener('hotkey', listener)
  }
}

export type CopilotApi = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
