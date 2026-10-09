import 'dotenv/config'

const int = (v, d) => (v === undefined || v === '' ? d : parseInt(v, 10))

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
  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:5173,http://localhost:4173')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),

  dailyAnalysisCap: int(process.env.DAILY_ANALYSIS_CAP, 25),
}

export const isProd = config.nodeEnv === 'production'

export function assertEmailConfig() {
  if (!config.resendKey) {
    throw new Error('RESEND_API_KEY is not set')
  }
}
