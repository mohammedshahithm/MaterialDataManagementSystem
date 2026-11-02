import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') || id.includes('node_modules/react-router') || id.includes('node_modules/react-router-dom/')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/@supabase/')) {
            return 'vendor-supabase';
          }
          if (id.includes('node_modules/lucide-react/') || id.includes('node_modules/react-hot-toast/')) {
            return 'vendor-ui';
          }
        },
      },
    },
  },
})
