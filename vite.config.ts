import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' },
  build: {
    rollupOptions: { output: { manualChunks: { flow: ['@xyflow/react'], storage: ['dexie'] } } },
  },
  server: {
    host: '127.0.0.1',
    proxy: { '/api/live': { target: 'http://127.0.0.1:5175', changeOrigin: true } },
    watch: { ignored: ['**/*.cmd', '**/.tools/**', '**/test-results/**'] },
  },
});
