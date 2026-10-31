import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import lookup from './api/lookup.js'

export default defineConfig({
  plugins: [react(), {
    name: 'local-dictionary-api',
    configureServer(server) {
      server.middlewares.use('/api/lookup', (req, res) => {
        req.query = Object.fromEntries(new URL(req.url, 'http://localhost').searchParams)
        res.status = code => { res.statusCode = code; return res }
        res.json = data => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)) }
        lookup(req, res)
      })
    },
  }],
})
