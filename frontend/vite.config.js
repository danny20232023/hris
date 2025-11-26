import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: [
      'dalaguete.dtrsystem',
      'localhost',
      '127.0.0.1',
      'hris.dalaguete.gov.ph',
      '192.168.8.18',  // Explicit network IP
      /^192\.168\.[0-9]{1,3}\.[0-9]{1,3}$/  // All 192.168.x.x IPs
    ],
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:5000',
        changeOrigin: true,
        secure: false
      }
    }
  }
});
