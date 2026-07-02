import {
  app,
  shell,
  BrowserWindow,
  globalShortcut,
  screen,
  session,
  desktopCapturer
} from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerIpc } from './ipc'
import { loadSettings } from './store'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const settings = loadSettings()
  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize
  const winWidth = 460
  const winHeight = 720

  mainWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x: screenWidth - winWidth - 24,
    y: 24,
    show: false,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // Keep the overlay above full-screen apps (meeting windows).
  mainWindow.setAlwaysOnTop(true, 'screen-saver')
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  // The defining "stealth" feature: exclude the window from screen capture so it
  // stays invisible to Zoom / Meet / Teams screen sharing and recordings.
  mainWindow.setContentProtection(settings.contentProtection)
  mainWindow.setOpacity(settings.opacity)

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function sendHotkey(action: string): void {
  mainWindow?.webContents.send('hotkey', action)
}

function registerShortcuts(): void {
  // Toggle overlay visibility.
  globalShortcut.register('CommandOrControl+\\', () => {
    if (!mainWindow) return
    if (mainWindow.isVisible()) mainWindow.hide()
    else mainWindow.show()
  })
  // Ask the model to answer the latest detected question now.
  globalShortcut.register('CommandOrControl+Enter', () => sendHotkey('answer-now'))
  // Toggle listening on/off.
  globalShortcut.register('CommandOrControl+Shift+L', () => sendHotkey('toggle-listening'))
  // Clear the current transcript and answer.
  globalShortcut.register('CommandOrControl+Shift+K', () => sendHotkey('clear'))
  // Toggle click-through (mouse passes through the overlay).
  globalShortcut.register('CommandOrControl+Shift+M', () => sendHotkey('toggle-clickthrough'))
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.interviewcopilot.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Capture system / meeting audio (the interviewer's voice) via loopback when
  // the renderer calls getDisplayMedia, without prompting for a source.
  session.defaultSession.setDisplayMediaRequestHandler(
    (_request, callback) => {
      desktopCapturer
        .getSources({ types: ['screen'] })
        .then((sources) => {
          callback({ video: sources[0], audio: 'loopback' })
        })
        .catch(() => callback({}))
    },
    { useSystemPicker: false }
  )

  registerIpc(() => mainWindow)
  createWindow()
  registerShortcuts()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
