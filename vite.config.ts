import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Tauri expects a fixed port and ignores vite's fallback behaviour.
const host = process.env.TAURI_DEV_HOST

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 5183 } : undefined,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  // WKWebView on macOS is the only target.
  build: {
    target: ['es2021', 'safari14'],
    sourcemap: !!process.env.TAURI_DEBUG,
    rollupOptions: {
      // The writing app is the only page; Tauri loads app.html.
      input: {
        app: fileURLToPath(new URL('./app.html', import.meta.url)),
      },
    },
  },
})
