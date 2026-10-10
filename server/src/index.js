import { createApp } from './app.js'
import { initDb } from './db.js'
import { config, isProd } from './config.js'
import { startWorker } from './queue.js'
import { sendJob } from './send.js'
import { startTelegramPoll } from './telegram.js'
import { cachedProbe } from './mailer.js'

async function main() {
  await initDb()
  const app = createApp()
  // Mail task-automation engine: queue worker + Telegram pairing poll.
  startWorker(sendJob)
  startTelegramPoll()
  // Boot-time SMTP probe (non-blocking): honest egress picture in the logs.
  cachedProbe().then(
    (r) => console.log('[mail] egress probe:', r.map(p => `${p.port}=${p.state}`).join(' ')),
    (e) => console.warn('[mail] egress probe failed:', e.message)
  )
  app.listen(config.port, () => {
    console.log(`[server] Themis API listening on :${config.port} (${config.nodeEnv})`)
    if (config.aiProvider === 'openai' && !config.openaiKey) console.warn('[server] AI_PROVIDER=openai but OPENAI_API_KEY not set — AI endpoints will fail')
    if (!config.resendKey) console.warn('[server] RESEND_API_KEY not set — emails will be skipped')
    if (!isProd) console.warn('[server] development mode — CORS allows localhost')
  })
}

main().catch(err => {
  console.error('[server] fatal:', err)
  process.exit(1)
})
