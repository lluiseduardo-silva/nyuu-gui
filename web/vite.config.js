import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Em dev, o Vite roda em :5173 e faz proxy de /api e /events pro backend (:8787).
// Em produção, o backend serve os arquivos buildados de web/dist diretamente.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8787', changeOrigin: true },
      '/events': { target: 'http://localhost:8787', changeOrigin: true, ws: false },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
