import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/Lambs/',
  build: { assetsDir: 'static' },
  server: {
    proxy: {
      // App requests /lambs/api/* (BASE_URL=/lambs/) — strip the base path.
      '/lambs/api': {
        target: 'http://localhost:8000',
        rewrite: (p) => p.replace(/^\/lambs/, ''),
      },
      '/api': 'http://localhost:8000',
    },
  },
})
