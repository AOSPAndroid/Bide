import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
const headers = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' };
export default defineConfig({ base: './', plugins: [react()], build: { target: 'esnext' }, worker: { format: 'es' }, server: { headers }, preview: { headers } });
