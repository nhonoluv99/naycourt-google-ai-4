import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        '/api/pvna-proxy': {
          target: 'https://pvna.vn',
          changeOrigin: true,
          secure: false,
          rewrite: (path: string) => path.replace(/^\/api\/pvna-proxy/, '/api/webPlayers'),
        },
        '/api/dupr-proxy': {
          target: 'https://api.dupr.com',
          changeOrigin: true,
          secure: false,
          rewrite: (path: string) => path.replace(/^\/api\/dupr-proxy/, ''),
        },
      },
    },
  };
});
