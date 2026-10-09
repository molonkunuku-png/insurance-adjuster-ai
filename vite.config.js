import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.VITE_OPENAI_KEY': JSON.stringify(process.env.VITE_OPENAI_KEY),
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8787', // Cloudflare Workers dev server
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
