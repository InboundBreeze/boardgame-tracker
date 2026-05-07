import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    proxy: {
      // This routes local requests directly to BGG, completely bypassing CORS
      '/bgg-proxy': {
        target: 'https://boardgamegeek.com',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/bgg-proxy/, '')
      }
    }
  }
})