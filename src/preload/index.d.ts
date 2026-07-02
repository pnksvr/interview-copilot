import { ElectronAPI } from '@electron-toolkit/preload'
import type { CopilotApi } from './index'

declare global {
  interface Window {
    electron: ElectronAPI
    api: CopilotApi
  }
}
