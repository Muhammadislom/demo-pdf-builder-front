import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Plain SPA. Talks to backend-accounting GraphQL at POST <endpoint>/query with a
// Bearer JWT pasted into the header bar. The backend must allow this dev origin
// via HTTP_ALLOWED_ORIGINS (CORS) — no proxy here on purpose, so the builder can
// point at any environment (local / staging) just by changing the endpoint field.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: true },
})
