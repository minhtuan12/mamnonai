import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import process from 'node:process'
import { defineConfig, loadEnv } from 'vite'
import { generateGeminiContent } from './server/gemini.js'

function geminiDevApi(apiKey) {
  return {
    name: 'gemini-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/gemini', (request, response, next) => {
        if (request.method !== 'POST') {
          response.statusCode = 405
          response.setHeader('Allow', 'POST')
          response.setHeader('Content-Type', 'application/json')
          response.end(JSON.stringify({ error: 'Method not allowed.' }))
          return
        }

        let rawBody = ''
        request.on('data', (chunk) => {
          rawBody += chunk
        })
        request.on('end', async () => {
          try {
            const body = JSON.parse(rawBody || '{}')
            const data = await generateGeminiContent(body, apiKey)
            response.statusCode = 200
            response.setHeader('Content-Type', 'application/json')
            response.end(JSON.stringify(data))
          } catch (error) {
            console.error('Gemini development API error:', error)
            response.statusCode = error.statusCode || 500
            response.setHeader('Content-Type', 'application/json')
            response.end(JSON.stringify({ error: error.message }))
          }
        })
        request.on('error', next)
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), tailwindcss(), geminiDevApi(env.GEMINI_API_KEY)],
  }
})
