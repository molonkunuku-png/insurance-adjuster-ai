import 'dotenv/config'

const int = (v, d) => (v === undefined || v === '' ? d : parseInt(v, 10))

// Origins that are always allowed (the app's own deployments + local dev).
// Anything in CLIENT_ORIGIN is added on top of these.
const BUILTIN_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',
  'https://insurance-adjuster-ai.onrender.com',
  'https://insurance-adjuster-ai1.onrender.com',
]

export const config = {
  port: int(process.env.PORT, 8787),
  nodeEnv: process.env.NODE_ENV || 'development',

  openaiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',

  resendKey: process.env.RESEND_API_KEY || '',
  resendFrom: process.env.RESEND_FROM || 'Themis <onboarding@resend.dev>',
  contactEmail: process.env.CONTACT_EMAIL || 'molonkunuku@gmail.com',
  appUrl: process.env.APP_URL || 'https://insurance-adjuster-ai.onrender.com',

  databaseUrl: process.env.DATABASE_URL || '',
  clientOrigins: [...new Set([
    ...BUILTIN_ORIGINS,
    ...(process.env.CLIENT_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean),
  ])],

  dailyAnalysisCap: int(process.env.DAILY_ANALYSIS_CAP, 25),
}

export const isProd = config.nodeEnv === 'production'

export function assertEmailConfig() {
  if (!config.resendKey) {
    throw new Error('RESEND_API_KEY is not set')
  }
}
