import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { cloudflare } from '@cloudflare/vite-plugin';

export default defineConfig(({ mode }) => {
  const isTest = mode === 'test' || Boolean(process.env.VITEST);

  return {
    plugins: [
      react(),
      tailwindcss(),
      ...(isTest ? [] : [cloudflare()]),
    ],
    server: {
      port: 5173,
      host: true,
    },
  };
});
