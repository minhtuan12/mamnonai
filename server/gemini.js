const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

const ALLOWED_MODELS = new Set([
  'gemini-3-flash-preview',
  'gemini-3.1-flash-image',
  'gemini-2.5-flash-preview-tts',
])

export async function generateGeminiContent({ model, payload }, apiKey) {
  if (!apiKey) {
    const error = new Error('GEMINI_API_KEY is not configured on the server.')
    error.statusCode = 500
    throw error
  }

  if (!ALLOWED_MODELS.has(model)) {
    const error = new Error('Unsupported Gemini model.')
    error.statusCode = 400
    throw error
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    const error = new Error('A valid Gemini payload is required.')
    error.statusCode = 400
    throw error
  }

  const upstreamResponse = await fetch(
    `${GEMINI_API_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  )

  const data = await upstreamResponse.json().catch(() => null)

  if (!upstreamResponse.ok) {
    const error = new Error(data?.error?.message || 'Gemini request failed.')
    error.statusCode = upstreamResponse.status
    throw error
  }

  return data
}
