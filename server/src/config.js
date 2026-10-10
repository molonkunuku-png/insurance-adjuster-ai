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
  appUrl: (process.env.APP_URL || 'https://insurance-adjuster-ai1.onrender.com').replace(/\/$/, ''),
  // Public base URL of the API itself (where the magic-link verify endpoint lives).
  // Defaults to APP_URL for the single-service deploy.
  publicApiUrl: (process.env.PUBLIC_API_URL || process.env.APP_URL || 'https://insurance-adjuster-ai1.onrender.com').replace(/\/$/, ''),

  databaseUrl: process.env.DATABASE_URL || '',
  clientOrigins: [...new Set([
    ...BUILTIN_ORIGINS,
    ...(process.env.CLIENT_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean),
  ])],

  dailyAnalysisCap: int(process.env.DAILY_ANALYSIS_CAP, 25),

  // ---- mail + channel knobs (single source of truth; modules below must
  // read these instead of raw process.env) ----
  mail: {
    provider: (process.env.EMAIL_PROVIDER || 'gmail').toLowerCase(),
    enabled: process.env.EMAIL_ENABLED !== 'false',
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: int(process.env.SMTP_PORT, 587),
    user: process.env.GMAIL_USER || process.env.SMTP_USER || '',
    pass: process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || process.env.GMAIL_USER || '',
    fromName: process.env.MAIL_FROM_NAME || 'Themis Adjuster AI',
    dkimDomain: process.env.DKIM_DOMAIN || '',
    dkimSelector: process.env.DKIM_SELECTOR || 'themis',
    dkimKey: process.env.DKIM_PRIVATE_KEY || '',
    // Test-only plaintext SMTP; forcibly off in production.
    allowPlain: process.env.SMTP_ALLOW_PLAIN === '1' && (process.env.NODE_ENV || 'development') !== 'production',
    breakGlass: process.env.BREAK_GLASS === '1',
    telegramToken: process.env.TELEGRAM_BOT_TOKEN || '',
    telegramEnabled: process.env.TELEGRAM_ENABLED !== 'false',
    telegramBotName: process.env.TELEGRAM_BOT_NAME || '',
    outboxDir: process.env.OUTBOX_DIR || '',
    queueGlobalCap: int(process.env.QUEUE_GLOBAL_CAP, 50),
    queueLeadCap: int(process.env.QUEUE_LEAD_CAP, 3),
    queueDrain: Math.min(Math.max(int(process.env.QUEUE_DRAIN, 3), 1), 10),
  },

  // Beta access
  sessionSecret: process.env.SESSION_SECRET || '',
  adminSecret: process.env.ADMIN_SECRET || '',
  betaLimit: int(process.env.BETA_LIMIT, 10),
  tokenTtlDays: int(process.env.TOKEN_TTL_DAYS, 2),
  sessionTtlDays: int(process.env.SESSION_TTL_DAYS, 7),
  cookieName: process.env.COOKIE_NAME || 'themis_session',
}

export const isProd = config.nodeEnv === 'production'

if (isProd) {
  if (!config.sessionSecret || config.sessionSecret.length < 32) {
    console.warn('[config] SESSION_SECRET missing or short in production — auth will refuse to boot')
  }
  if (!config.adminSecret || config.adminSecret.length < 32) {
    console.warn('[config] ADMIN_SECRET missing or short in production — admin gate is dead')
  }
  if (config.mail.allowPlain) {
    console.warn('[config] SMTP_ALLOW_PLAIN is forcibly ignored in production')
  }
}

export function assertEmailConfig() {
  if (!config.resendKey) {
    throw new Error('RESEND_API_KEY is not set')
  }
}
