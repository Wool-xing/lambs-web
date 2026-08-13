import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/lambs/',
  build: { assetsDir: 'static' },
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
