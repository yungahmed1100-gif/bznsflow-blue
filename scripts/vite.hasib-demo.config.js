// Local development for Hasib: the normal Vite config (hot reload) with /api
// proxied to the real-logic demo backend in scripts/hasib-demo.mjs. Local only.
//   npm run dev:hasib   → http://localhost:5173/layla/dashboard?tab=insights
import { defineConfig, mergeConfig } from 'vite';
import base from '../vite.config.js';

const backend = `http://127.0.0.1:${process.env.HASIB_DEMO_PORT || 5310}`;
export default mergeConfig(base, defineConfig({
  server: { port: 5173, strictPort: true, proxy: { '/api': backend, '/demo': backend } },
}));
