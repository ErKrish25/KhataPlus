import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          supabase: ['@supabase/supabase-js'],
          zxing: ['@zxing/browser', '@zxing/library']
        }
      }
    },
    chunkSizeWarningLimit: 800
  }
});
