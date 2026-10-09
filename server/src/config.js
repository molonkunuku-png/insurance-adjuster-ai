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
  // The local deterministic engine is the default and runs with zero AI bills.
  // Set AI_PROVIDER=openai to opt into the OpenAI path (requires a funded key).
  aiProvider: process.env.AI_PROVIDER || 'local',
  usesOpenAI: () => config.aiProvider === 'openai' && Boolean(config.openaiKey),

  resendKey: process.env.RESEND_API_KEY || '',
  resendFrom: process.env.RESEND_FROM || 'Themis <onboarding@resend.dev>',
  contactEmail: process.env.CONTACT_EMAIL || 'molonkunuku@gmail.com',
  appUrl: (process.env.APP_URL || 'https://insurance-adjuster-ai.onrender.com').replace(/\/$/, ''),
  // Public base URL of the API itself (where the magic-link verify endpoint lives).
  // Defaults to APP_URL for the single-service deploy.
  publicApiUrl: (process.env.PUBLIC_API_URL || process.env.APP_URL || 'https://insurance-adjuster-ai.onrender.com').replace(/\/$/, ''),

  databaseUrl: process.env.DATABASE_URL || '',
  clientOrigins: [...new Set([
    ...BUILTIN_ORIGINS,
    ...(process.env.CLIENT_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean),
  ])],

  dailyAnalysisCap: int(process.env.DAILY_ANALYSIS_CAP, 25),

  // Beta access
  sessionSecret: process.env.SESSION_SECRET || '',
  adminSecret: process.env.ADMIN_SECRET || '',
  betaLimit: int(process.env.BETA_LIMIT, 10),
  tokenTtlDays: int(process.env.TOKEN_TTL_DAYS, 7),
  sessionTtlDays: int(process.env.SESSION_TTL_DAYS, 7),
  cookieName: process.env.COOKIE_NAME || 'themis_session',
}

export const isProd = config.nodeEnv === 'production'

export function assertEmailConfig() {
  if (!config.resendKey) {
    throw new Error('RESEND_API_KEY is not set')
  }
}
