import process from 'node:process'
import { generateGeminiContent } from '../server/gemini.js'

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json({ error: 'Method not allowed.' })
  }

  try {
    const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body
    const data = await generateGeminiContent(body || {}, process.env.GEMINI_API_KEY)
    return response.status(200).json(data)
  } catch (error) {
    console.error('Gemini API error:', error)
    return response.status(error.statusCode || 500).json({ error: error.message })
  }
}
