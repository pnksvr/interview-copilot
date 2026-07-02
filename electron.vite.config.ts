import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Inject a strict Content-Security-Policy into the production HTML only. In dev,
// the Vite dev server injects an inline react-refresh preamble and uses a HMR
// websocket, both of which a strict `script-src 'self'` policy would block,
// leaving the renderer blank. The renderer never talks to the network directly
// (all LLM/STT calls happen in the main process over IPC), so 'self' is enough.
function productionCsp(): Plugin {
  const csp =
    "default-src 'self'; " +
    "script-src 'self'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data:; " +
    "media-src 'self' blob:; " +
    "connect-src 'self'"
  return {
    name: 'inject-production-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '</title>',
        `</title>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`
      )
    }
  }
}

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react(), productionCsp()]
  }
})
